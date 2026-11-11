/* Podróżnik – etap 10: miejsca na mapie, trasa dnia i jej układanie (jak w Wanderlog).
   Trasy:
     #/mapa/:tripId?d=RRRR-MM-DD   mapa planu: punkty dnia w kolejności, nocleg, odległości, „ułóż najkrótszą trasę”
     #/mapa/:tripId?d=pomysly      pomysły (punkty bez dnia) na mapie
   Położenie punktu planu: { lat, lon } zapisane w punkcie – z wyszukiwarki w formularzu, z odkrywania (discover.js)
   albo znalezione później przyciskiem „Znajdź położenie” (wyszukiwarka OpenStreetMap / Nominatim, wymaga internetu).
   Nocleg: { lat, lon } zapisane w odcinku po wyszukaniu jego adresu.
   Mapa: Leaflet (lib/leaflet.js, działa offline) + podkład OpenStreetMap (tylko z internetem – bez niego widać same punkty).
   Odległości w linii prostej × 1,3 (ulice nie są proste); pieszo 4,8 km/h, dalej niż 2,5 km – komunikacją/autem ~25 km/h. */
(function () {
  const { esc, plural } = App;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DAY_COLORS = ["#0f6e6e", "#2f6fd6", "#c2453a", "#d08a17", "#7b4fd1", "#2e8b57", "#b8457f", "#5a6f2b"];

  /* ---------- wyszukiwarka miejsc (Nominatim, OpenStreetMap) – najwyżej 1 zapytanie na sekundę ---------- */
  let lastCall = 0;
  async function nominatim(params) {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch("https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({ format: "jsonv2", limit: "6", "accept-language": "pl", ...params }));
    if (!r.ok) throw new Error(`wyszukiwarka odpowiedziała ${r.status}`);
    return r.json();
  }
  // krótki adres: „Oceanário, Esplanada D. Carlos I, Lizbona” zamiast pełnego z gminą i kodem
  const shortAddr = (name, display) => {
    const parts = String(display || "").split(",").map(x => x.trim()).filter(Boolean);
    const rest = parts.filter(p => p !== name && !/^\d{2,}[-\s]?\d*$/.test(p)).slice(0, 2);
    return [name, ...rest].filter(Boolean).join(", ");
  };
  async function search(q, near, { bounded = false, limit = 6 } = {}) {
    const p = { q, limit: String(limit) };
    if (near) {
      const d = bounded ? 0.015 : 0.35; // bounded: tylko okolica (ok. 1,5 km), np. restauracje w pobliżu
      p.viewbox = `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`;
      if (bounded) p.bounded = "1";
    }
    const res = await nominatim(p);
    return res.map(x => {
      const name = x.name || String(x.display_name).split(",")[0];
      return { name, address: shortAddr(name, x.display_name), lat: +x.lat, lon: +x.lon, kind: x.type || "" };
    });
  }
  // nazwa miejsca ze współrzędnych (dotknięcie mapy)
  async function reverse(lat, lon) {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?" + new URLSearchParams({ format: "jsonv2", lat, lon, zoom: "18", "accept-language": "pl" }));
    if (!r.ok) throw new Error(`wyszukiwarka odpowiedziała ${r.status}`);
    const x = await r.json();
    if (!x || x.error) return null;
    const name = x.name || String(x.display_name || "").split(",")[0];
    return { name, address: shortAddr(name, x.display_name) };
  }
  // współrzędne wpisane wprost albo w linku do Google Maps („@38.76,-9.09” / „q=38.76,-9.09”)
  function coordsIn(text) {
    const m = String(text || "").match(/(?:@|[?&](?:q|query|destination|ll)=|^\s*)(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (!m) return null;
    const lat = +m[1], lon = +m[2];
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }

  // środek podróży: cel podróży (lotnisko / zapamiętane / wyszukiwarka), a gdy go brak – pierwszy nocleg z położeniem
  // cel podróży szukany wyszukiwarką OpenStreetMap (rozumie wyspy, regiony, polskie nazwy); wynik zapisany w podróży (trip.geo)
  async function center(trip, { online = navigator.onLine } = {}) {
    if (trip.destination) {
      const g = trip.geo;
      if (g && g.text === trip.destination && !g.none) return { lat: g.lat, lon: g.lon, label: trip.destination };
      const retry = !g || g.text !== trip.destination || Date.now() - (g.at || 0) > 86400000;
      if (online && retry) {
        let geo = null;
        try {
          const r = await search(trip.destination.replace(/\b[A-Z]{3}\b/g, "").trim() || trip.destination);
          geo = r[0] ? { text: trip.destination, lat: r[0].lat, lon: r[0].lon, name: r[0].address } : { text: trip.destination, none: true, at: Date.now() };
        } catch (e) { /* brak sieci – spróbuj innym razem */ }
        if (geo) {
          const cur = await DB.get("trips", trip.id);
          if (cur) await DB.putRaw("trips", { ...cur, geo });
          trip.geo = geo;
          if (!geo.none) return { lat: geo.lat, lon: geo.lon, label: trip.destination };
        }
      }
      // bez internetu: kod lotniska w celu (np. „Lizbona LIS”) albo zapamiętane miasto
      if (App.Stats) {
        const p = await App.Stats.locate(trip.destination, { online: false });
        if (p) return { lat: p.lat, lon: p.lon, label: trip.destination };
      }
    }
    const segs = await DB.byIndex("segments", "tripId", trip.id);
    const h = segs.find(s => s.type === "nocleg" && s.lat != null);
    return h ? { lat: h.lat, lon: h.lon, label: h.name } : null;
  }

  /* ---------- odległości ---------- */
  const rad = d => d * Math.PI / 180;
  function km(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  const fmtDist = k => k < 1 ? `${Math.max(50, Math.round(k * 1.3 * 1000 / 50) * 50)} m` : `${(k * 1.3).toFixed(1).replace(".", ",")} km`;
  // opis odcinka między punktami: 🚶 12 min · 900 m
  function leg(a, b) {
    const k = km(a, b);
    if (k < 0.03) return { k, txt: "to samo miejsce", icon: "📍" };
    const road = k * 1.3;
    if (road <= 2.5) return { k, icon: "🚶", txt: `${Math.max(1, Math.round(road / 4.8 * 60))} min · ${fmtDist(k)}` };
    return { k, icon: "🚕", txt: `ok. ${App.duration(Math.max(5, Math.round(road / 25 * 60)))} · ${fmtDist(k)}` };
  }
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);

  /* ---------- najkrótsza trasa: najbliższy sąsiad + poprawki 2-opt (ścieżka otwarta, opcjonalny start) ---------- */
  function shortestOrder(points, start) {
    const n = points.length;
    if (n < 2) return points.map((_, i) => i);
    const d = (i, j) => km(points[i], points[j]);
    const fromStart = i => start ? km(start, points[i]) : 0;
    const length = ord => ord.reduce((s, x, i) => s + (i ? d(ord[i - 1], x) : fromStart(x)), 0);
    let best = null;
    // bez noclegu: spróbuj zacząć od każdego punktu
    for (const first of start ? [-1] : points.map((_, i) => i)) {
      const left = new Set(points.map((_, i) => i));
      const ord = [];
      let cur = first;
      if (first >= 0) { ord.push(first); left.delete(first); }
      while (left.size) {
        let pick = null, pd = Infinity;
        for (const j of left) { const v = cur < 0 ? fromStart(j) : d(cur, j); if (v < pd) { pd = v; pick = j; } }
        ord.push(pick); left.delete(pick); cur = pick;
      }
      // 2-opt: odwracanie fragmentów, dopóki trasa się skraca
      let improved = true, guard = 0;
      while (improved && guard++ < 200) {
        improved = false;
        for (let i = 0; i < n - 1; i++) for (let k = i + 1; k < n; k++) {
          const cand = ord.slice(0, i).concat(ord.slice(i, k + 1).reverse(), ord.slice(k + 1));
          if (length(cand) + 1e-9 < length(ord)) { ord.splice(0, n, ...cand); improved = true; }
        }
      }
      if (!best || length(ord) < length(best)) best = ord.slice();
    }
    return best;
  }

  // nocleg na noc z danego dnia (albo wymeldowanie tego dnia) – start i koniec trasy dnia
  function hotelFor(segs, day) {
    const stays = segs.filter(s => s.type === "nocleg" && s.depart);
    return stays.find(s => s.depart.slice(0, 10) <= day && day < (s.arrive || s.depart).slice(0, 10))
      || stays.find(s => (s.arrive || "").slice(0, 10) === day) || null;
  }

  // ułóż punkty dnia: przestawiane są tylko punkty bez godziny i z położeniem (punkty z godziną zostają na miejscu)
  async function optimizeDay(tripId, day) {
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", tripId), DB.byIndex("segments", "tripId", tripId)]);
    const list = items.filter(i => i.date === day).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const slots = [], movable = [];
    list.forEach((it, i) => { if (!it.time && hasXY(it)) { slots.push(i); movable.push(it); } });
    if (movable.length < 2) return { moved: 0, reason: movable.length ? "za mało punktów bez godziny" : "brak punktów bez godziny z położeniem" };
    const h = hotelFor(segs, day);
    const before = movable.map((p, i) => (i ? km(movable[i - 1], p) : 0)).reduce((a, b) => a + b, 0) + (hasXY(h) ? km(h, movable[0]) : 0);
    const ord = shortestOrder(movable, hasXY(h) ? h : null);
    const sorted = ord.map(i => movable[i]);
    const after = sorted.map((p, i) => (i ? km(sorted[i - 1], p) : 0)).reduce((a, b) => a + b, 0) + (hasXY(h) ? km(h, sorted[0]) : 0);
    slots.forEach((pos, k) => { list[pos] = sorted[k]; });
    let moved = 0;
    for (let i = 0; i < list.length; i++) if (list[i].order !== i) { await DB.put("planItems", { ...list[i], order: i }); moved++; }
    return { moved, saved: Math.max(0, before - after) * 1.3 };
  }

  /* ---------- znajdowanie położenia punktów i noclegów (internet) ---------- */
  async function locateMissing(tripId, day, progress) {
    const [items, segs, trip] = await Promise.all([DB.byIndex("planItems", "tripId", tripId), DB.byIndex("segments", "tripId", tripId), DB.get("trips", tripId)]);
    const near = await center(trip);
    const todo = items.filter(i => (day == null || i.date === day) && i.place && !hasXY(i) && !i.geoNone)
      .map(i => ({ store: "planItems", rec: i, q: i.place }))
      .concat(segs.filter(s => s.type === "nocleg" && (s.address || s.name) && !hasXY(s) && !s.geoNone)
        .map(s => ({ store: "segments", rec: s, q: s.address || s.name })));
    let found = 0, done = 0;
    for (const t of todo) {
      let hit = coordsIn(t.q);
      if (!hit && !/^https?:/i.test(t.q)) {
        const r = await search(t.q, near);
        if (r[0]) hit = r[0];
        else if (t.q.includes(",")) { const r2 = await search(t.q.split(",").slice(-2).join(","), near); hit = r2[0] || null; }
      }
      const cur = await DB.get(t.store, t.rec.id);
      if (cur) await DB.putRaw(t.store, hit ? { ...cur, lat: hit.lat, lon: hit.lon, geoNone: false } : { ...cur, geoNone: true });
      if (hit) found++;
      progress && progress(++done, todo.length);
    }
    return { found, total: todo.length };
  }

  /* ---------- wyszukiwarka w formularzu punktu planu ---------- */
  // pole „Miejsce” + przycisk 🔎; wybór wyniku zapisuje lat/lon w ukrytych polach; ręczna zmiana tekstu je kasuje
  function searchBox(v) {
    return `
      <div class="field"><span>Miejsce – nazwa, adres lub link do mapy</span>
        <div class="pl-search">
          <input name="place" maxlength="500" placeholder="np. Oceanarium Lizbona" value="${esc(v.place)}" autocomplete="off">
          <button type="button" class="btn" id="pl-find" aria-label="Szukaj miejsca na mapie">🔎</button>
        </div>
        <input type="hidden" name="lat" value="${v.lat ?? ""}"><input type="hidden" name="lon" value="${v.lon ?? ""}">
        <div class="pl-geo muted small" id="pl-geo">${hasXY(v) ? "📍 położenie zapisane – punkt będzie na mapie" : ""}</div>
        <div class="pl-results" id="pl-results"></div>
      </div>`;
  }
  function bindSearch(form, trip) {
    const box = form.querySelector("#pl-results"), info = form.querySelector("#pl-geo"), btn = form.querySelector("#pl-find");
    form.place.addEventListener("input", () => {
      if (form.lat.value) { form.lat.value = ""; form.lon.value = ""; info.textContent = ""; }
    });
    form.place.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
    btn.onclick = async () => {
      const q = form.place.value.trim();
      if (q.length < 2) { App.toast("Wpisz nazwę miejsca"); form.place.focus(); return; }
      const xy = coordsIn(q);
      if (xy) { form.lat.value = xy.lat; form.lon.value = xy.lon; info.textContent = "📍 położenie odczytane z linku"; return; }
      btn.disabled = true; box.innerHTML = `<p class="muted small">Szukam…</p>`;
      try {
        const res = await search(q, await center(trip));
        box.innerHTML = res.length ? res.map((r, i) => `
          <button type="button" class="pl-hit" data-i="${i}"><b>${esc(r.name)}</b><span class="muted small">${esc(r.address)}</span></button>`).join("")
          : `<p class="muted small">Nic nie znaleziono – spróbuj dopisać miasto.</p>`;
        box.querySelectorAll(".pl-hit").forEach(b => b.onclick = () => {
          const r = res[+b.dataset.i];
          form.place.value = r.address; form.lat.value = r.lat; form.lon.value = r.lon;
          if (form.title && !form.title.value.trim()) form.title.value = r.name;
          info.textContent = "📍 położenie zapisane – punkt będzie na mapie";
          box.innerHTML = "";
        });
      } catch (e) {
        box.innerHTML = `<p class="muted small">Brak internetu albo wyszukiwarka nie odpowiada. Miejsce zapisze się jako tekst.</p>`;
      }
      btn.disabled = false;
    };
  }

  /* ================= EKRAN MAPY ================= */
  const pinHtml = (label, color, cls = "") => `<div class="mp-pin ${cls}" style="--pc:${color}"><span>${esc(label)}</span></div>`;

  App.route(/^\/mapa\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", id), DB.byIndex("segments", "tripId", id)]);
    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
    const days = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) days.push(d);
    items.forEach(i => { if (i.date && !days.includes(i.date)) days.push(i.date); });
    days.sort();
    const ideas = items.filter(i => !i.date);
    const today = App.todayStr();
    const sel = q.d === "pomysly" ? "pomysly" : q.d === "wszystko" ? "wszystko" : days.includes(q.d) ? q.d
      : days.includes(today) ? today : (days.find(d => items.some(i => i.date === d)) || days[0]);
    const colorOf = day => DAY_COLORS[Math.max(0, days.indexOf(day)) % DAY_COLORS.length];

    // punkty do pokazania
    let pts = [];
    if (sel === "pomysly") pts = ideas.map(i => ({ it: i, label: "💡", color: "#d08a17" }));
    else if (sel === "wszystko") days.forEach(d => items.filter(i => i.date === d).sort(byOrder).forEach((i, k) => pts.push({ it: i, label: String(k + 1), color: colorOf(d) })));
    else pts = items.filter(i => i.date === sel).sort(byOrder).map((i, k) => ({ it: i, label: String(k + 1), color: colorOf(sel) }));
    const hotel = sel !== "pomysly" && sel !== "wszystko" ? hotelFor(segs, sel) : null;
    const hotels = sel === "wszystko" ? segs.filter(s => s.type === "nocleg") : hotel ? [hotel] : [];
    const missing = pts.filter(p => p.it.place && !hasXY(p.it) && !p.it.geoNone).length + hotels.filter(h => !hasXY(h) && (h.address || h.name) && !h.geoNone).length;
    const noPlace = pts.filter(p => !p.it.place && !hasXY(p.it)).length;
    const located = pts.filter(p => hasXY(p.it));

    const chip = (v, label) => `<a class="st-chip${v === sel ? " on" : ""}" href="#/mapa/${id}?d=${v}" ${v === sel ? 'aria-current="true"' : ""}>${label}</a>`;
    const chips = chip("wszystko", "Wszystkie") + days.filter(d => items.some(i => i.date === d) || d === sel)
      .map(d => chip(d, `<i class="mp-dot" style="background:${colorOf(d)}"></i>${App.fmtDay(d)}`)).join("") +
      (ideas.length ? chip("pomysly", `💡 Pomysły (${ideas.length})`) : "");

    // lista punktów z odległościami między nimi
    let list = "";
    if (sel !== "wszystko") {
      let prev = hasXY(hotel) ? hotel : null;
      if (hotel) list += `<div class="mp-row"><span class="mp-num" style="--pc:#555">🏨</span><span class="mp-name">${esc(hotel.name || "Nocleg")}<span class="muted small">${esc(hotel.address || "")}</span></span></div>`;
      pts.forEach(p => {
        const it = p.it;
        if (sel !== "pomysly" && prev && hasXY(it)) { const l = leg(prev, it); list += `<div class="mp-leg">${l.icon} ${l.txt}</div>`; }
        list += `<a class="mp-row" href="#/punkt/${it.id}"><span class="mp-num" style="--pc:${p.color}">${p.label}</span>
          <span class="mp-name">${esc(it.title)}${it.time ? ` <span class="muted">· ${it.time}</span>` : ""}<span class="muted small">${hasXY(it) ? esc(it.place && !/^https?:/i.test(it.place) ? it.place : "") : it.place ? "📍 bez położenia" : "bez miejsca"}</span></span></a>`;
        if (hasXY(it)) prev = it;
      });
      if (!pts.length) list = `<p class="muted small">${sel === "pomysly" ? "Brak pomysłów." : "Na ten dzień nie ma jeszcze punktów."}</p>`;
    }
    const routePts = (hasXY(hotel) ? [hotel] : []).concat(located.map(p => p.it));
    const gmaps = sel !== "pomysly" && sel !== "wszystko" && routePts.length >= 2 ? (() => {
      const ll = p => `${p.lat},${p.lon}`;
      const wp = routePts.slice(1, -1).slice(0, 8).map(ll).join("|");
      return `https://www.google.com/maps/dir/?api=1&origin=${ll(routePts[0])}&destination=${ll(routePts[routePts.length - 1])}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ""}&travelmode=walking`;
    })() : "";
    const canOpt = sel !== "pomysly" && sel !== "wszystko" && pts.filter(p => !p.it.time && hasXY(p.it)).length >= 2;

    let map = null;
    return {
      title: `Mapa · ${trip.name}`,
      back: `#/plan/${id}`,
      html: `
        <div class="st-chips mp-chips">${chips}</div>
        <form class="pl-search mp-search" id="mp-search"><input name="q" placeholder="Szukaj miejsca, np. Oceanarium" autocomplete="off" aria-label="Szukaj miejsca">
          <button class="btn" type="submit" aria-label="Szukaj">🔎</button></form>
        <div class="card mp-card"><div id="mp-map" class="mp-map" role="application" aria-label="Mapa punktów planu"></div>
          <div class="mp-attr"><span class="mp-hint">Dotknij mapy, by dodać tam punkt.</span> ${navigator.onLine ? "" : "Bez internetu podkład mapy się nie wczyta – punkty i trasa są widoczne. "}© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div></div>
        ${missing ? `<button type="button" class="btn wide" id="mp-geo">📍 Znajdź położenie ${missing} ${plural(missing, "miejsca", "miejsc", "miejsc")} (internet)</button>` : ""}
        ${noPlace ? `<p class="muted small">${noPlace} ${plural(noPlace, "punkt nie ma", "punkty nie mają", "punktów nie ma")} wpisanego miejsca – dodaj je w punkcie, by pojawił się na mapie.</p>` : ""}
        ${canOpt || gmaps ? `<div class="add-row">
          ${canOpt ? `<button type="button" class="btn primary" id="mp-opt">✨ Ułóż najkrótszą trasę</button>` : ""}
          ${gmaps ? `<a class="btn" href="${esc(gmaps)}" target="_blank" rel="noopener">🧭 Trasa w Mapach Google</a>` : ""}</div>` : ""}
        ${canOpt ? `<p class="muted small">Układane są punkty bez godziny${hasXY(hotel) ? `, start z noclegu „${esc(hotel.name || "")}”` : ""}. Punkty z godziną zostają na swoim miejscu.</p>` : ""}
        ${list ? `<div class="card mp-list">${list}</div>` : ""}`,
      async after(view) {
        const el = view.querySelector("#mp-map");
        try {
          await App.loadScript("lib/leaflet.js");
          if (!document.querySelector('link[href="lib/leaflet.css"]')) {
            const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "lib/leaflet.css"; document.head.appendChild(l);
          }
        } catch (e) { el.innerHTML = `<p class="muted small" style="padding:12px">Nie udało się wczytać mapy.</p>`; return; }
        if (!el.isConnected) return;
        map = L.map(el, { zoomControl: true, attributionControl: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
        const bounds = [];
        const add = (p, html, title, href) => {
          const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ html, className: "mp-icon", iconSize: [30, 30], iconAnchor: [15, 15] }), title }).addTo(map);
          if (href) m.on("click", () => { location.hash = href; });
          bounds.push([p.lat, p.lon]);
        };
        hotels.filter(hasXY).forEach(h => add(h, pinHtml("🏨", "#444", "mp-hotel"), h.name || "Nocleg", `#/odcinek/${h.id}`));
        pts.filter(p => hasXY(p.it)).forEach(p => add(p.it, pinHtml(p.label, p.color), p.it.title, `#/punkt/${p.it.id}`));
        // linie trasy: dla każdego dnia osobno, w kolejności planu (od noclegu)
        const lines = sel === "wszystko" ? days.map(d => [d, (hasXY(hotelFor(segs, d)) ? [hotelFor(segs, d)] : []).concat(items.filter(i => i.date === d && hasXY(i)).sort(byOrder))])
          : sel === "pomysly" ? [] : [[sel, routePts]];
        for (const [d, line] of lines) if (line.length >= 2) L.polyline(line.map(p => [p.lat, p.lon]), { color: colorOf(d), weight: 3, opacity: .8, dashArray: "6 6" }).addTo(map);
        // widok: punkty dnia → wszystkie punkty i noclegi podróży → cel podróży → Polska
        const others = items.filter(hasXY).concat(segs.filter(s => s.type === "nocleg" && hasXY(s))).map(p => [p.lat, p.lon]);
        if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        else if (others.length) map.fitBounds(others, { padding: [30, 30], maxZoom: 14 });
        else {
          map.setView([52.1, 19.4], 5);
          center(trip).then(c => { if (c && map) map.setView([c.lat, c.lon], 13); });
        }

        // 📍 gdzie jestem
        let me = null;
        const Locate = L.Control.extend({ options: { position: "topright" }, onAdd() {
          const b = L.DomUtil.create("button", "mp-locate");
          b.type = "button"; b.title = "Gdzie jestem"; b.setAttribute("aria-label", "Pokaż, gdzie jestem"); b.textContent = "📍";
          L.DomEvent.disableClickPropagation(b);
          b.onclick = () => {
            if (!navigator.geolocation) { App.toast("Telefon nie udostępnia położenia"); return; }
            b.classList.add("busy");
            const ok = pos => {
              b.classList.remove("busy");
              if (!map) return;
              const ll = [pos.coords.latitude, pos.coords.longitude];
              if (me) me.setLatLng(ll); else me = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#2f6fd6", fillOpacity: 1 }).addTo(map);
              map.setView(ll, Math.max(map.getZoom(), 15));
            };
            const fail = e => { b.classList.remove("busy"); App.toast(e && e.code === 1 ? "Brak zgody na lokalizację" : "Nie udało się ustalić położenia – włącz GPS"); };
            navigator.geolocation.getCurrentPosition(ok, e => e.code === 1 ? fail(e)
              : navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }),
              { enableHighAccuracy: false, timeout: 6000, maximumAge: 30 * 60000 });
          };
          return b;
        } });
        new Locate().addTo(map);

        // dotknięcie mapy → dodaj tu punkt (do wybranego dnia albo do pomysłów)
        const dayParam = sel === "pomysly" || sel === "wszystko" ? "pomysl" : sel;
        map.on("click", e => {
          const { lat, lng } = e.latlng;
          const href = `#/plan/${id}/nowy?${new URLSearchParams({ d: dayParam, lat: lat.toFixed(6), lon: lng.toFixed(6) })}`;
          L.popup({ closeButton: false, className: "mp-pop" }).setLatLng(e.latlng)
            .setContent(`<a class="btn primary" href="${href}">➕ Dodaj tu ${dayParam === "pomysl" ? "pomysł" : "punkt"}</a>`).openOn(map);
        });
        view.querySelector("#mp-search").onsubmit = ev => {
          ev.preventDefault();
          const v = ev.target.q.value.trim();
          if (v.length >= 2) location.hash = `#/plan/${id}/nowy?${new URLSearchParams({ d: dayParam, q: v })}`;
        };

        const geo = view.querySelector("#mp-geo");
        if (geo) geo.onclick = async () => {
          geo.disabled = true;
          try {
            const r = await locateMissing(id, sel === "wszystko" || sel === "pomysly" ? null : sel, (d, n) => { geo.textContent = `Szukam… ${d}/${n}`; });
            App.toast(r.found ? `Znaleziono ${r.found} z ${r.total}` : "Nie znaleziono – dopisz w punkcie miasto albo wybierz miejsce z wyszukiwarki");
            App.render();
          } catch (e) {
            geo.disabled = false; geo.textContent = "📍 Znajdź położenie (internet)";
            App.toast("Brak internetu albo wyszukiwarka nie odpowiada");
          }
        };
        const opt = view.querySelector("#mp-opt");
        if (opt) opt.onclick = async () => {
          const r = await optimizeDay(id, sel);
          App.toast(r.moved ? `Ułożono${r.saved >= 0.1 ? ` · trasa krótsza o ok. ${r.saved.toFixed(1).replace(".", ",")} km` : ""}` : r.reason || "Ta kolejność jest już najkrótsza");
          App.render();
        };
      },
      cleanup() { if (map) { map.remove(); map = null; } },
    };
  });

  App.Places = { search, reverse, center, km, leg, fmtDist, hasXY, coordsIn, shortestOrder, optimizeDay, locateMissing, hotelFor, searchBox, bindSearch, DAY_COLORS };
})();
