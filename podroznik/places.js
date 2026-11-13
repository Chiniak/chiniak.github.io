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
  // kolejka: zapytania czekają jedno na drugie (także z kart dla kierowcy – phrases.js)
  let lastCall = 0, queue = Promise.resolve();
  function osm(path, params) {
    const run = async () => {
      const wait = lastCall + 1100 - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      const r = await fetch(`https://nominatim.openstreetmap.org/${path}?` +
        new URLSearchParams({ format: "jsonv2", "accept-language": (self.I18N && I18N.lang === "en") ? "en,pl" : "pl,en", ...params }));
      if (!r.ok) throw new Error(`wyszukiwarka odpowiedziała ${r.status}`);
      return r.json();
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  }
  const nominatim = params => osm("search", { limit: "6", ...params });
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
    const x = await osm("reverse", { lat, lon, zoom: "18" });
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

  /* ---------- podkład mapy ----------
     „latin”: CARTO Voyager – nazwy alfabetem łacińskim (Chiny, Laos, Wietnam, Tajlandia czytelne bez znajomości pisma),
     „osm”: OpenStreetMap – nazwy w lokalnym języku. Kafelki obejrzane online zostają w telefonie (sw.js) i działają offline. */
  const LAYERS = {
    latin: { name: "Napisy łacińskie", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      attr: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' },
    osm: { name: "Nazwy lokalne", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attr: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
  };
  // kraje, gdzie lokalne pismo nie jest łacińskie (z grubsza: Azja, Bliski Wschód, Rosja, Grecja, Bałkany wsch.)
  const nonLatin = (lat, lon) => (lon > 25 && lon < 180 && lat > -11 && lat < 78) && !(lon < 45 && lat > 35 && lat < 42 && lon < 30);
  async function baseLayer(map, at) {
    let pick = await DB.getSetting("mapLayer", "auto");
    if (!LAYERS[pick]) pick = at && !nonLatin(at[0], at[1]) ? "osm" : "latin";
    // bez internetu: mapy pobrane na offline (offline.js) są w wersji „Napisy łacińskie”, do zoomu 16 (dalej powiększone)
    const off = !navigator.onLine;
    if (off && pick !== "latin" && App.Offline && await App.Offline.any()) pick = "latin";
    const layers = {};
    for (const [k, L0] of Object.entries(LAYERS)) layers[k] = L.tileLayer(L0.url, { maxZoom: 19, ...(off ? { maxNativeZoom: 16 } : {}), subdomains: "abcd", crossOrigin: true, _k: k });
    layers[pick].addTo(map);
    const ctl = L.control.layers(Object.fromEntries(Object.entries(layers).map(([k, l]) => [LAYERS[k].name, l])), null, { position: "bottomleft" }).addTo(map);
    const attr = document.querySelector("#mp-attr-src");
    const setAttr = k => { if (attr) attr.innerHTML = LAYERS[k].attr; };
    setAttr(pick);
    map.on("baselayerchange", e => { const k = e.layer.options._k; setAttr(k); DB.setSetting("mapLayer", k); });
    // serwer kafelków nie odpowiada (np. w Chinach) – przełącz na drugi
    let bad = 0, good = 0;
    for (const [k, l] of Object.entries(layers)) {
      l.on("tileload", () => { good++; });
      l.on("tileerror", () => {
        if (++bad >= 6 && !good && navigator.onLine && map.hasLayer(l)) {
          const other = Object.keys(layers).find(x => x !== k);
          map.removeLayer(l); layers[other].addTo(map); setAttr(other); bad = 0;
        }
      });
    }
    return ctl;
  }

  /* ================= EKRAN MAPY ================= */
  // po dodaniu punktu z mapy ekran odświeża się w tym samym miejscu (bez przeskoku do wszystkich punktów)
  let lastView = null, keepNext = false;
  // atrakcje na mapie (przycisk 🏛️): ostatnie wyniki – po odświeżeniu ekranu pokazywane bez ponownego szukania
  let pois = null; // { tripId, c, list }
  const normName = s => String(s || "").trim().toLowerCase();
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
        list += `<a class="mp-row" href="#/punkt/${it.id}"><span class="mp-num" style="--pc:${p.color}">${p.label}</span>${App.Photos ? App.Photos.thumb(it, "mp-thumb") : ""}
          <span class="mp-name">${esc(it.title)}${it.time ? ` <span class="muted">· ${it.time}</span>` : ""}<span class="muted small">${hasXY(it) ? esc(it.place && !/^https?:/i.test(it.place) ? it.place : "") : it.place ? "📍 bez położenia" : "bez miejsca"}</span></span></a>`;
        if (hasXY(it)) prev = it;
      });
      if (!pts.length) list = `<p class="muted small">${sel === "pomysly" ? "Brak pomysłów." : "Na ten dzień nie ma jeszcze punktów."}</p>`;
    }
    const routePts = (hasXY(hotel) ? [hotel] : []).concat(located.map(p => p.it));
    const gmaps = App.navApp === "google" && sel !== "pomysly" && sel !== "wszystko" && routePts.length >= 2 ? (() => {
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
          <div class="mp-attr"><span class="mp-hint">Dotknij mapy, by zaznaczyć miejsce · pinezkę dwa razy, by otworzyć punkt · 🏛️ = atrakcje w okolicy.</span> ${navigator.onLine ? "" : "Offline: widać fragmenty mapy oglądane lub pobrane wcześniej. "}<span id="mp-attr-src"></span></div></div>
        <button type="button" class="plan-link" id="mp-off"><span aria-hidden="true">⬇️</span> Mapa offline <span class="muted">– zapisz ten fragment i miejsca podróży</span><b aria-hidden="true">›</b></button>
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
        const bounds = [];
        // dotknięcie pinezki → okienko ze zdjęciem, „Otwórz” i „Nawiguj”
        const infoFor = (p, title, sub, href) => {
          const box = L.DomUtil.create("div", "mp-pop-box");
          const img = p.photo && p.photo.data ? `<a href="${href}" tabindex="-1"><img class="mp-pop-img" src="${p.photo.data}" alt=""></a>` : "";
          box.innerHTML = `${img}<a class="mp-pop-name mp-pop-link" href="${href}">${esc(title)}</a>
            <span class="muted small mp-pop-sub">${esc(sub)}</span>
            <div class="mp-pop-btns"><a class="btn primary" href="${href}">Otwórz</a>
              <a class="btn" href="${esc(App.mapsUrl(`${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}`))}" target="_blank" rel="noopener">🧭 Nawiguj</a></div>`;
          L.DomEvent.disableClickPropagation(box);
          return box;
        };
        let openPin = null;
        const add = (p, html, title, href, sub = "") => {
          const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ html, className: "mp-icon", iconSize: [30, 30], iconAnchor: [15, 15] }), title }).addTo(map);
          // pierwsze dotknięcie – okienko; drugie dotknięcie tej samej pinezki (okienko otwarte) – od razu do punktu
          if (href) m.on("click", ev => {
            L.DomEvent.stop(ev);
            if (openPin && openPin.m === m && map.hasLayer(openPin.pop)) { location.hash = href; return; }
            // closeOnClick: false – inaczej Leaflet zamyka okienko jeszcze przed tym dotknięciem pinezki (preclick)
            const pop = L.popup({ className: "mp-pop", autoPanPadding: [20, 60], closeOnClick: false }).setLatLng([p.lat, p.lon]).setContent(infoFor(p, title, sub, href)).openOn(map);
            openPin = { m, pop };
          });
          bounds.push([p.lat, p.lon]);
        };
        hotels.filter(hasXY).forEach(h => add(h, pinHtml("🏨", "#444", "mp-hotel"), h.name || "Nocleg", `#/odcinek/${h.id}`, h.address || ""));
        pts.filter(p => hasXY(p.it)).forEach(p => add(p.it, pinHtml(p.label, p.color), p.it.title, `#/punkt/${p.it.id}`,
          [p.it.date ? App.fmtDay(p.it.date) : "pomysł", p.it.time].filter(Boolean).join(" · ")));
        // linie trasy: dla każdego dnia osobno, w kolejności planu (od noclegu)
        const lines = sel === "wszystko" ? days.map(d => [d, (hasXY(hotelFor(segs, d)) ? [hotelFor(segs, d)] : []).concat(items.filter(i => i.date === d && hasXY(i)).sort(byOrder))])
          : sel === "pomysly" ? [] : [[sel, routePts]];
        for (const [d, line] of lines) if (line.length >= 2) L.polyline(line.map(p => [p.lat, p.lon]), { color: colorOf(d), weight: 3, opacity: .8, dashArray: "6 6" }).addTo(map);
        // widok: punkty dnia → wszystkie punkty i noclegi podróży → cel podróży → Polska
        const others = items.filter(hasXY).concat(segs.filter(s => s.type === "nocleg" && hasXY(s))).map(p => [p.lat, p.lon]);
        const firstAt = bounds[0] || others[0] || (trip.geo && !trip.geo.none ? [trip.geo.lat, trip.geo.lon] : null);
        await baseLayer(map, firstAt);
        if (!map) return;
        const keep = keepNext && lastView && lastView.id === id && lastView.sel === sel;
        keepNext = false;
        if (keep) map.setView(lastView.center, lastView.zoom);
        else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
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

        map.on("moveend", () => { if (map) lastView = { id, sel, center: map.getCenter(), zoom: map.getZoom() }; });
        const dayParam = sel === "pomysly" || sel === "wszystko" ? "pomysl" : sel;
        const isDay = dayParam !== "pomysl";
        const have = new Map(items.map(i => [normName(i.title), i]));

        // zapis miejsca jednym dotknięciem: do pomysłów albo do wybranego dnia (na koniec dnia)
        const save = async (p, toDay) => {
          const date = toDay ? sel : "";
          const order = date ? items.filter(i => i.date === date).length : 1e6;
          await DB.put("planItems", { tripId: id, date, time: "", title: String(p.name || "Punkt na mapie").slice(0, 100), cat: p.cat || "zwiedzanie",
            place: p.address ? `${p.name}, ${p.address}` : p.place || `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, lat: p.lat, lon: p.lon,
            note: [p.kind, p.cuisine, p.desc].filter(Boolean).join(" · ").slice(0, 300), cost: "", currency: "PLN", order,
            photoUrl: p.thumb || "", wikiUrl: p.wikiUrl || "" });
          if (navigator.vibrate) navigator.vibrate(15);
          App.toast(date ? `Dodano: ${App.fmtDay(date)}` : "Dodano do pomysłów");
          keepNext = true;
          App.render();
        };
        // okienko z przyciskami (DOM, bez linków – działa jednym dotknięciem)
        const popupFor = (p, latlng, { local = false } = {}) => {
          const box = L.DomUtil.create("div", "mp-pop-box");
          const inPlan = have.get(normName(p.name));
          box.innerHTML = `${p.thumb ? `<img class="mp-pop-img" src="${esc(p.thumb)}" alt="">` : ""}
            <b class="mp-pop-name">${esc(p.name || "Szukam nazwy…")}</b>
            <span class="muted small mp-pop-sub">${esc([p.kind, p.address].filter(Boolean).join(" · "))}</span>
            <div class="mp-pop-btns">${inPlan ? `<a class="btn" href="#/punkt/${inPlan.id}">✓ w planie – otwórz</a>` : `
              <button type="button" class="btn primary" data-act="idea">💡 Do pomysłów</button>
              ${isDay ? `<button type="button" class="btn" data-act="day">📅 ${esc(App.fmtDay(sel))}</button>` : ""}
              ${local ? `<a class="btn" data-act="more" href="#/plan/${id}/nowy?${new URLSearchParams({ d: dayParam, lat: latlng.lat.toFixed(6), lon: latlng.lng.toFixed(6) })}">✏️ Więcej…</a>` : ""}`}</div>`;
          L.DomEvent.disableClickPropagation(box);
          box.querySelectorAll("button[data-act]").forEach(b => b.onclick = () => { b.disabled = true; save(p, b.dataset.act === "day"); });
          return box;
        };

        // dotknięcie mapy → pinezka od razu, nazwa miejsca z wyszukiwarki, zapis jednym dotknięciem
        let temp = null;
        map.on("click", e => {
          const { lat, lng } = e.latlng;
          if (temp) temp.remove();
          const p = { name: "", lat, lon: lng };
          temp = L.marker(e.latlng, { icon: L.divIcon({ html: pinHtml("＋", "#c2453a", "mp-new"), className: "mp-icon", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
          const pop = L.popup({ closeButton: true, className: "mp-pop", autoPanPadding: [20, 60] }).setLatLng(e.latlng).setContent(popupFor(p, e.latlng, { local: true })).openOn(map);
          pop.on("remove", () => { if (temp) { temp.remove(); temp = null; } });
          reverse(lat, lng).then(r => {
            p.name = r && r.name ? r.name : "Punkt na mapie"; p.address = r && r.address && r.address !== r.name ? r.address.replace(`${r.name}, `, "") : "";
          }).catch(() => { p.name = "Punkt na mapie"; }).then(() => {
            if (map && map.hasLayer(pop)) pop.setContent(popupFor(p, e.latlng, { local: true }));
          });
        });

        // 🏛️ atrakcje na mapie (Wikipedia + OpenStreetMap, jak w Odkrywaj) – dotknij, by dodać
        let poiLayer = null;
        const showPois = list => {
          if (poiLayer) poiLayer.remove();
          poiLayer = L.layerGroup().addTo(map);
          list.forEach(p => {
            const inPlan = have.has(normName(p.name));
            L.marker([p.lat, p.lon], { icon: L.divIcon({ html: `<div class="mp-poi${inPlan ? " on" : ""}">${p.cat === "jedzenie" ? "🍽️" : p.cat === "natura" ? "🌳" : "⭐"}</div>`, className: "mp-icon", iconSize: [26, 26], iconAnchor: [13, 13] }), title: p.name })
              .addTo(poiLayer).on("click", ev => { L.DomEvent.stop(ev); L.popup({ className: "mp-pop", autoPanPadding: [20, 60] }).setLatLng([p.lat, p.lon]).setContent(popupFor(p)).openOn(map); });
          });
        };
        const Poi = L.Control.extend({ options: { position: "topright" }, onAdd() {
          const b = L.DomUtil.create("button", "mp-locate mp-poi-btn");
          b.type = "button"; b.title = "Atrakcje w okolicy"; b.setAttribute("aria-label", "Pokaż atrakcje w okolicy na mapie"); b.textContent = "🏛️";
          L.DomEvent.disableClickPropagation(b);
          b.onclick = async () => {
            const c = map.getCenter(), here = { lat: c.lat, lon: c.lng };
            const fresh = pois && pois.tripId === id && km(pois.c, here) < 1.5;
            if (fresh && poiLayer && map.hasLayer(poiLayer)) { poiLayer.remove(); poiLayer = null; pois = null; b.classList.remove("on"); return; } // drugi raz – ukryj
            if (fresh) { showPois(pois.list); b.classList.add("on"); return; }
            if (!navigator.onLine) { App.toast("Brak internetu"); return; }
            b.classList.add("busy"); App.toast("Szukam atrakcji w okolicy…");
            try {
              const list = await App.Discover.attractions(here, part => { if (map) { showPois(part); b.classList.add("on"); } });
              if (!map) return;
              pois = { tripId: id, c: here, list };
              showPois(list); b.classList.add("on");
              App.toast(list.length ? `${list.length} ${plural(list.length, "miejsce", "miejsca", "miejsc")} – dotknij, by dodać` : "Nic tu nie znaleziono – przesuń mapę");
            } catch (e) { App.toast("Serwery map nie odpowiadają – spróbuj za chwilę"); }
            if (b.isConnected) b.classList.remove("busy");
          };
          if (pois && pois.tripId === id) setTimeout(() => { if (map) { showPois(pois.list); b.classList.add("on"); } });
          return b;
        } });
        new Poi().addTo(map);
        view.querySelector("#mp-search").onsubmit = ev => {
          ev.preventDefault();
          const v = ev.target.q.value.trim();
          if (v.length >= 2) location.hash = `#/plan/${id}/nowy?${new URLSearchParams({ d: dayParam, q: v })}`;
        };

        view.querySelector("#mp-off").onclick = () => {
          const b = map ? map.getBounds() : null;
          location.hash = `#/mapa-offline/${id}` + (b ? `?v=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(x => x.toFixed(4)).join(",")}` : "");
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

  App.Places = { osm, LAYERS, search, reverse, center, km, leg, fmtDist, hasXY, coordsIn, shortestOrder, optimizeDay, locateMissing, hotelFor, searchBox, bindSearch, DAY_COLORS };
})();
