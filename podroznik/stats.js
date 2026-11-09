/* Podróżnik – etap 8 (pkt 36): statystyki podróży i mapa.
   Trasa: #/statystyki?rok=2026&plan=1
   Położenie miejsc:
     1) kod lotniska w nazwie (np. „Warszawa WAW”) → wbudowana lista lotnisk lib/airports.js (offline),
     2) pozostałe miejsca (dworce, miasta, noclegi, cele podróży) → wyszukiwarka Open-Meteo (wymaga internetu,
        tylko po kliknięciu „Uzupełnij”), wyniki zapamiętane w ustawieniu "geoCache".
   Kilometry liczone w linii prostej między miejscami (po ziemi wychodzi więcej). Mapa: lib/world.js. */
(function () {
  const { esc, plural } = App;
  const KM_TYPES = { lot: "✈️ Loty", pociag: "🚆 Pociągi", autobus: "🚌 Autobusy", prom: "⛴️ Promy", auto: "🚗 Auto", taxi: "🚕 Taxi", metro: "🚇 Metro / tramwaj", inny: "🧭 Inne" };
  const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const flag = cc => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🏳️";
  let regionName = cc => cc;
  try { const dn = new Intl.DisplayNames(["pl"], { type: "region" }); regionName = cc => { try { return dn.of(cc); } catch (e) { return cc; } }; } catch (e) { /* stara przeglądarka */ }

  /* ---------- lotniska (offline) ---------- */
  let AIR = null;
  async function airports() {
    if (AIR) return AIR;
    await App.loadScript("lib/airports.js");
    AIR = new Map();
    for (const l of self.AIRPORT_DATA.split("\n")) {
      const [c, la, lo, cc, tz, city] = l.split("|");
      AIR.set(c, { lat: +la, lon: +lo, cc, tz: tz === "" ? null : self.AIRPORT_TZ[+tz], name: city });
    }
    return AIR;
  }
  // ostatni kod IATA (3 wielkie litery) w tekście, który jest na liście lotnisk
  function iataIn(text, air) {
    const m = String(text || "").match(/\b[A-Z]{3}\b/g);
    if (!m) return null;
    for (let i = m.length - 1; i >= 0; i--) if (air.has(m[i])) return { ...air.get(m[i]), code: m[i] };
    return null;
  }

  /* ---------- wyszukiwanie miejsc (online, na żądanie) ---------- */
  function candidates(text) {
    const clean = String(text || "").replace(/\b[A-Z]{3}\b/g, "").replace(/\s+/g, " ").trim();
    const first = clean.split(",")[0].trim();
    const words = first.split(" ");
    // adres noclegu („ulica 1, Miasto”): najpierw miasto po przecinku, potem coraz krótsze początki nazwy („Kraków Główny” → „Kraków”)
    const parts = clean.split(",").map(x => x.trim()).filter(Boolean);
    const out = [clean, ...(parts.length > 1 ? [parts[parts.length - 1], parts[parts.length - 2]] : []), first];
    for (let k = words.length - 1; k >= 1; k--) out.push(words.slice(0, k).join(" "));
    return [...new Set(out.filter(x => x && x.length >= 2))];
  }
  async function geocode(names, progress) {
    const cache = await DB.getSetting("geoCache", {});
    let done = 0, found = 0;
    for (const n of names) {
      const key = norm(n);
      let hit = null;
      for (const q of candidates(n)) {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=pl&format=json`);
        if (!r.ok) throw new Error(`serwer odpowiedział ${r.status}`);
        const j = await r.json();
        if (j.results && j.results[0]) { const x = j.results[0]; hit = { lat: x.latitude, lon: x.longitude, cc: x.country_code, name: x.name }; break; }
      }
      cache[key] = hit || { none: true };
      if (hit) found++;
      progress(++done, names.length);
    }
    await DB.setSetting("geoCache", cache);
    return found;
  }

  const rad = d => d * Math.PI / 180;
  function km(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  const fmtKm = n => `${Math.round(n).toLocaleString("pl-PL")} km`;

  /* ---------- liczenie ---------- */
  async function compute({ year, withPlanned }) {
    const [trips, segs, air, cache] = await Promise.all([DB.all("trips"), DB.all("segments"), airports(), DB.getSetting("geoCache", {})]);
    const today = App.todayStr();
    const chosen = trips.filter(t => (!year || t.start.slice(0, 4) === String(year) || t.end.slice(0, 4) === String(year)) && (withPlanned || t.start <= today));
    const ids = new Set(chosen.map(t => t.id));
    const where = text => {
      if (!text) return null;
      const a = iataIn(text, air);
      if (a) return a;
      const c = cache[norm(text)];
      return c && !c.none ? c : null;
    };
    const missing = new Set();
    const need = text => { if (text && !where(text) && !(cache[norm(text)] || {}).none) missing.add(text.trim()); };

    const s = { trips: chosen.length, days: 0, nights: 0, count: {}, km: {}, total: 0, countries: new Map(), cities: new Map(),
      longest: null, longestTrip: null, routes: [], points: [], missing, unresolved: 0, years: [...new Set(trips.map(t => t.start.slice(0, 4)))].sort().reverse() };
    for (const t of chosen) {
      const d = App.dayDiff(t.start, t.end) + 1;
      s.days += d;
      if (!s.longestTrip || d > s.longestTrip.days) s.longestTrip = { name: t.name, days: d };
      const p = where(t.destination); need(t.destination);
      if (p) { s.countries.set(p.cc, (s.countries.get(p.cc) || 0)); s.points.push(p); }
    }
    for (const g of segs) {
      if (!ids.has(g.tripId) || !g.depart) continue;
      if (g.type === "nocleg") {
        if (g.arrive) s.nights += Math.max(0, App.dayDiff(g.depart, g.arrive));
        const p = where(g.address) || where(g.name);
        if (!p) { need(g.address || g.name); } else { s.countries.set(p.cc, s.countries.get(p.cc) || 0); s.points.push(p); }
        continue;
      }
      s.count[g.type] = (s.count[g.type] || 0) + 1;
      const a = where(g.from), b = where(g.to);
      need(g.from); need(g.to);
      for (const p of [a, b]) if (p) { s.countries.set(p.cc, (s.countries.get(p.cc) || 0) + 1); s.cities.set(norm(p.name), p.name); s.points.push(p); }
      if (a && b) {
        const k = km(a, b);
        s.km[g.type] = (s.km[g.type] || 0) + k;
        s.total += k;
        s.routes.push({ a, b, type: g.type });
        if (g.type === "lot" && (!s.longest || k > s.longest.km)) s.longest = { km: k, from: g.from, to: g.to };
      } else s.unresolved++;
    }
    return s;
  }

  /* ---------- mapa ---------- */
  async function mapSvg(s) {
    if (!s.points.length) return "";
    await App.loadScript("lib/world.js");
    const xs = s.points.map(p => p.lon + 180), ys = s.points.map(p => 90 - p.lat);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // margines i minimalny wycinek (żeby jedna podróż po Polsce nie była „na cały ekran”)
    const w = Math.max(24, (x1 - x0) * 1.3), h = Math.max(14, (y1 - y0) * 1.4, w / 2);
    const W = Math.max(w, h * 2), H = W / 2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const vx = Math.max(0, Math.min(360 - W, cx - W / 2)), vy = Math.max(0, Math.min(180 - H, cy - H / 2));
    const r = W / 120;
    const seen = new Set();
    const lines = s.routes.filter(({ a, b }) => Math.abs(a.lon - b.lon) < 180).map(({ a, b, type }) =>
      `<line x1="${a.lon + 180}" y1="${90 - a.lat}" x2="${b.lon + 180}" y2="${90 - b.lat}" class="rt rt-${type}"/>`).join("");
    const dots = s.points.filter(p => { const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(p => `<circle cx="${p.lon + 180}" cy="${90 - p.lat}" r="${r}"><title>${esc(p.name || "")}</title></circle>`).join("");
    return `
      <svg class="st-map" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="Mapa odwiedzonych miejsc">
        <rect x="0" y="0" width="360" height="180" class="sea"/>
        <path d="${self.WORLD_PATH}" class="land"/>
        <g class="rts" style="stroke-width:${(W / 300).toFixed(3)}">${lines}</g>
        <g class="dots">${dots}</g>
      </svg>`;
  }

  /* ================= EKRAN ================= */
  App.route(/^\/statystyki$/, async (_, q) => {
    const year = q.rok || "";
    const withPlanned = q.plan === "1";
    const s = await compute({ year, withPlanned });
    const link = (y, p) => `#/statystyki?${new URLSearchParams({ ...(y ? { rok: y } : {}), ...(p ? { plan: "1" } : {}) })}`;
    const chips = [["", "Wszystkie"], ...s.years.map(y => [y, y])].map(([y, n]) =>
      `<a class="st-chip${y === year ? " on" : ""}" href="${link(y, withPlanned)}" ${y === year ? 'aria-current="true"' : ""}>${n}</a>`).join("");

    if (!s.trips) return {
      title: "Statystyki", back: "#/podroze",
      html: `<div class="st-chips">${chips}</div>` + App.empty("📊", "Brak podróży do policzenia",
        withPlanned ? "Dodaj podróże, a tu pojawią się kilometry, kraje i mapa." : "Liczone są podróże, które już się zaczęły.",
        withPlanned ? "" : `<a class="btn" href="${link(year, true)}">Pokaż z zaplanowanymi</a>`),
    };

    const tile = (v, label) => `<div class="st-tile"><b>${v}</b><span>${label}</span></div>`;
    const flights = s.count.lot || 0;
    const countries = [...s.countries.keys()].filter(Boolean).sort((a, b) => regionName(a).localeCompare(regionName(b), "pl"));
    const kmRows = Object.entries(KM_TYPES).filter(([k]) => s.count[k]).map(([k, n]) => `
      <div class="row"><span>${n} <span class="muted">× ${s.count[k]}</span></span><b>${s.km[k] ? fmtKm(s.km[k]) : "–"}</b></div>`).join("");
    const map = await mapSvg(s);
    const earth = s.total / 40075;

    return {
      title: "Statystyki",
      back: "#/podroze",
      html: `
        <div class="st-chips">${chips}</div>
        <label class="pk-toggle st-plan"><input type="checkbox" id="st-plan" ${withPlanned ? "checked" : ""}> Licz też zaplanowane podróże</label>
        <div class="st-tiles">
          ${tile(s.trips, plural(s.trips, "podróż", "podróże", "podróży"))}
          ${tile(s.days, plural(s.days, "dzień w drodze", "dni w drodze", "dni w drodze"))}
          ${tile(fmtKm(s.total).replace(" km", ""), "km (w linii prostej)")}
          ${tile(countries.length, plural(countries.length, "kraj", "kraje", "krajów"))}
          ${tile(flights, plural(flights, "lot", "loty", "lotów"))}
          ${tile(s.nights, plural(s.nights, "noc w hotelach", "noce w hotelach", "nocy w hotelach"))}
        </div>
        ${earth >= 0.05 ? `<p class="st-fun">🌍 To ${earth >= 1 ? `${earth.toFixed(1).replace(".", ",")} × dookoła Ziemi` : `${Math.round(earth * 100)}% drogi dookoła Ziemi`}</p>` : ""}
        ${map ? `<div class="card st-map-card">${map}</div>` : ""}
        ${s.missing.size ? `
          <div class="card st-missing">
            <b>📍 ${s.missing.size} ${plural(s.missing.size, "miejsce", "miejsca", "miejsc")} bez położenia</b>
            <p class="small muted">${[...s.missing].slice(0, 6).map(esc).join(" · ")}${s.missing.size > 6 ? " …" : ""}</p>
            <p class="small muted">Kody lotnisk (np. WAW, LIS) działają bez internetu. Dworce, miasta i noclegi aplikacja może wyszukać w internecie (Open-Meteo).</p>
            <button type="button" class="btn primary wide" id="st-geo">🔎 Uzupełnij położenie (internet)</button>
          </div>` : ""}
        ${kmRows ? `<h3 class="section">Transport</h3><div class="card">${kmRows}</div>` : ""}
        ${countries.length ? `<h3 class="section">Kraje</h3><div class="card st-countries">${countries.map(c => `<span>${flag(c)} ${esc(regionName(c))}</span>`).join("")}</div>` : ""}
        ${s.longest || s.longestTrip ? `<h3 class="section">Rekordy</h3><div class="card">
          ${s.longestTrip ? `<div class="row"><span class="muted">Najdłuższa podróż</span><b>${esc(s.longestTrip.name)} · ${s.longestTrip.days} ${plural(s.longestTrip.days, "dzień", "dni", "dni")}</b></div>` : ""}
          ${s.longest ? `<div class="row"><span class="muted">Najdłuższy lot</span><b>${esc(s.longest.from)} → ${esc(s.longest.to)} · ${fmtKm(s.longest.km)}</b></div>` : ""}
          ${s.cities.size ? `<div class="row"><span class="muted">Miejsca (stacje, lotniska)</span><b>${s.cities.size}</b></div>` : ""}
        </div>` : ""}`,
      after(view) {
        view.querySelector("#st-plan").onchange = e => location.replace(link(year, e.target.checked));
        const geo = view.querySelector("#st-geo");
        if (geo) geo.onclick = async () => {
          geo.disabled = true;
          try {
            const found = await geocode([...s.missing], (d, n) => { geo.textContent = `Szukam… ${d}/${n}`; });
            App.toast(found ? `Znaleziono ${found} z ${s.missing.size}` : "Nie znaleziono – spróbuj wpisać nazwę miasta");
            App.render();
          } catch (e) {
            geo.disabled = false; geo.textContent = "🔎 Uzupełnij położenie (internet)";
            App.toast("Brak internetu albo wyszukiwarka nie odpowiada");
          }
        };
      },
    };
  });

  // położenie jednego miejsca: kod lotniska → zapamiętane → (gdy online=true) wyszukiwarka; używane przez pogodę
  async function locate(text, { online = false } = {}) {
    if (!text) return null;
    const air = await airports();
    const a = iataIn(text, air);
    if (a) return a;
    const cache = await DB.getSetting("geoCache", {});
    const c = cache[norm(text)];
    if (c && !c.none) return c;
    if (!online || (c && c.none)) return null;
    try { await geocode([text], () => {}); } catch (e) { return null; } // brak sieci – spróbujemy innym razem
    const c2 = (await DB.getSetting("geoCache", {}))[norm(text)];
    return c2 && !c2.none ? c2 : null;
  }

  App.Stats = { compute, airports, km, iataIn, locate };
})();
