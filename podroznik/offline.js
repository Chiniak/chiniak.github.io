/* Podróżnik – mapy offline: pobranie kafelków mapy dla miejsc podróży przed wyjazdem (np. Azja bez roamingu).
   Trasa:
     #/mapa-offline/:tripId            obszary podróży (noclegi, punkty planu, cel) – pobierz / usuń
     #/mapa-offline/:tripId?v=S,W,N,E  dodatkowo „widoczny fragment mapy” (z ekranu mapy)
   Kafelki: CARTO Voyager (napisy łacińskie) – w pamięci podręcznej „mapa-offline-<id podróży>”, której nie kasuje
   ani nowa wersja aplikacji, ani limit kafelków oglądanych (sw.js szuka kafelka we wszystkich pamięciach).
   Klucz kafelka bez poddomeny (a/b/c/d) – patrz canon() i sw.js. OpenStreetMap nie pozwala pobierać masowo,
   dlatego pobieramy tylko podkład CARTO i z umiarem: najwyżej ok. 6000 kafelków na podróż, 4 naraz. */
(function () {
  const { esc, plural } = App;
  const TILE_URL = (z, x, y, s = "a") => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
  const KB_PER_TILE = 18; // średnio – do szacowania rozmiaru
  const MAX_TILES = 6000;
  const cacheName = tripId => `mapa-offline-${tripId}`;
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);

  /* ---------- kafelki ---------- */
  const tx = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const ty = (lat, z) => {
    const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
  };
  const clampT = (v, z) => Math.max(0, Math.min(2 ** z - 1, v));
  function tilesOf(b, zMin, zMax) {
    const out = [];
    for (let z = zMin; z <= zMax; z++) {
      const x0 = clampT(tx(b.w, z), z), x1 = clampT(tx(b.e, z), z), y0 = clampT(ty(b.n, z), z), y1 = clampT(ty(b.s, z), z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${z}/${x}/${y}`);
    }
    return out;
  }
  const countOf = (b, zMin, zMax) => {
    let n = 0;
    for (let z = zMin; z <= zMax; z++) n += (clampT(tx(b.e, z), z) - clampT(tx(b.w, z), z) + 1) * (clampT(ty(b.s, z), z) - clampT(ty(b.n, z), z) + 1);
    return n;
  };
  const pad = (b, km) => {
    const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((b.s + b.n) / 2 * Math.PI / 180)));
    return { s: b.s - dLat, n: b.n + dLat, w: b.w - dLon, e: b.e + dLon };
  };
  const bboxOf = pts => ({ s: Math.min(...pts.map(p => p.lat)), n: Math.max(...pts.map(p => p.lat)), w: Math.min(...pts.map(p => p.lon)), e: Math.max(...pts.map(p => p.lon)) });

  /* ---------- obszary podróży: miejsca w promieniu ~20 km łączone w jeden obszar ---------- */
  async function areasOf(trip, view) {
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", trip.id), DB.byIndex("segments", "tripId", trip.id)]);
    const pts = [];
    segs.filter(s => s.type === "nocleg" && hasXY(s)).forEach(s => pts.push({ lat: s.lat, lon: s.lon, name: s.name || "Nocleg", hotel: true }));
    items.filter(hasXY).forEach(i => pts.push({ lat: i.lat, lon: i.lon, name: i.title }));
    if (trip.geo && !trip.geo.none && hasXY(trip.geo)) pts.push({ lat: trip.geo.lat, lon: trip.geo.lon, name: trip.destination, dest: true });
    const clusters = [];
    for (const p of pts) {
      const c = clusters.find(c => App.Places.km(c.c, p) < 20);
      if (c) { c.pts.push(p); c.c = { lat: c.pts.reduce((a, q) => a + q.lat, 0) / c.pts.length, lon: c.pts.reduce((a, q) => a + q.lon, 0) / c.pts.length }; }
      else clusters.push({ c: { lat: p.lat, lon: p.lon }, pts: [p] });
    }
    const areas = clusters.map((c, i) => {
      const only = c.pts.length === 1 && c.pts[0].dest; // sam cel podróży (miasto) – szerszy obszar
      let box = pad(bboxOf(c.pts), only ? 5 : 1.5);
      let zMax = 16;
      while (zMax > 13 && countOf(box, 11, zMax) > 2500) zMax--; // bardzo rozległy obszar – mniej szczegółów
      const named = c.pts.find(p => p.hotel) || c.pts.find(p => p.dest) || c.pts[0];
      const n = c.pts.filter(p => !p.dest).length;
      return { key: `a${i}`, name: named.name, sub: n ? `${n} ${plural(n, "miejsce", "miejsca", "miejsc")}` : "cel podróży", box, zMin: 11, zMax };
    });
    if (view) {
      const [s, w, n, e] = view.split(",").map(Number);
      if ([s, w, n, e].every(isFinite) && n > s && e > w) {
        const box = { s, w, n, e };
        let zMin = 11, zMax = 16;
        while (zMax > zMin && countOf(box, zMin, zMax) > 2500) zMax--;
        while (zMin > 5 && countOf(box, zMin, zMin) > 4) zMin--; // też ogólny widok tego fragmentu
        areas.unshift({ key: "view", name: "Widoczny fragment mapy", sub: "z ekranu mapy", box, zMin: Math.min(zMin, 11), zMax });
      }
    }
    // przegląd całej podróży: małe przybliżenia (kraje, drogi między miastami)
    if (clusters.length) {
      const all = pad(bboxOf(clusters.map(c => c.c)), 30);
      let zMax = 10;
      while (zMax > 6 && countOf(all, 4, zMax) > 600) zMax--;
      areas.push({ key: "overview", name: "Przegląd całej podróży", sub: "drogi i miasta, bez szczegółów", box: all, zMin: 4, zMax });
    }
    return areas.map(a => ({ ...a, tiles: tilesOf(a.box, a.zMin, a.zMax) }));
  }

  /* ---------- pobieranie ---------- */
  let job = null; // trwające pobieranie (jedno naraz)
  async function download(tripId, tiles, onProgress) {
    const c = await caches.open(cacheName(tripId));
    const have = new Set((await c.keys()).map(r => r.url));
    const todo = tiles.filter(t => !have.has(TILE_URL(...t.split("/"))));
    const state = { done: tiles.length - todo.length, total: tiles.length, failed: 0, stopped: false };
    job = { tripId, state };
    let i = 0;
    const worker = async w => {
      while (i < todo.length && !state.stopped) {
        const t = todo[i++].split("/");
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok && !state.stopped; attempt++) {
          try {
            // poddomena dla szybkości; „podroznik-off” – sw.js przepuszcza bez zapisu w pamięci oglądanych kafelków
            const res = await fetch(TILE_URL(...t, "abcd"[(+t[1] + +t[2]) % 4]) + "?podroznik-off=1", { mode: "cors" });
            if (res.ok) { await c.put(TILE_URL(...t), res); ok = true; }
          } catch (e) { await new Promise(r => setTimeout(r, 800)); }
        }
        if (!ok && !state.stopped) state.failed++;
        state.done++;
        onProgress && onProgress(state);
      }
    };
    await Promise.all([0, 1, 2, 3].map(worker));
    job = null;
    const cur = await DB.get("trips", tripId);
    const count = (await c.keys()).length;
    if (cur) await DB.putRaw("trips", { ...cur, offlineMap: { at: new Date().toISOString(), tiles: count } });
    return state;
  }

  const any = async () => {
    try { return (await caches.keys()).some(k => k.startsWith("mapa-offline-")); } catch (e) { return false; }
  };
  // stan pobranych kafelków podróży: { tiles: wszystkie obszary (bez fragmentu z ekranu), have: Set adresów }
  async function haveOf(tripId) {
    try { if ((await caches.keys()).includes(cacheName(tripId))) return new Set((await (await caches.open(cacheName(tripId))).keys()).map(r => r.url)); }
    catch (e) { /* brak pamięci podręcznej */ }
    return new Set();
  }
  const busy = () => job;
  App.Offline = { any, tilesOf, countOf, areasOf, download, haveOf, busy, tileUrl: TILE_URL, MAX_TILES, KB_PER_TILE };

  const mb = n => `${Math.max(1, Math.round(n * KB_PER_TILE / 1024))} MB`;

  App.route(/^\/mapa-offline\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    if (!trip.geo && trip.destination && App.Places) await App.Places.center(trip).catch(() => null);
    const areas = await areasOf(trip, q.v);
    let have = new Set();
    try { if ((await caches.keys()).includes(cacheName(id))) have = new Set((await (await caches.open(cacheName(id))).keys()).map(r => r.url)); } catch (e) { /* brak pamięci podręcznej */ }
    const isHave = t => have.has(TILE_URL(...t.split("/")));
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const free = est && est.quota ? est.quota - (est.usage || 0) : null;

    const rows = areas.map(a => {
      const got = a.tiles.filter(isHave).length;
      const full = got === a.tiles.length;
      return `<label class="of-row">
          <input type="checkbox" name="a" value="${a.key}" ${full ? "disabled checked" : a.tiles.length > MAX_TILES ? "" : "checked"}>
          <span class="of-name"><b>${esc(a.name)}</b><span class="muted small">${esc(a.sub)} · ${a.tiles.length} ${plural(a.tiles.length, "kafelek", "kafelki", "kafelków")} · ok. ${mb(a.tiles.length)}</span></span>
          <span class="of-state ${full ? "ok" : ""}">${full ? "✅ pobrana" : got ? `${Math.round(got / a.tiles.length * 100)}%` : ""}</span>
        </label>`;
    }).join("");
    const meta = trip.offlineMap;

    return {
      title: `Mapa offline · ${trip.name}`,
      back: `#/mapa/${id}`,
      html: `
        <p class="muted small">Pobierz mapę przed wyjazdem (najlepiej przez Wi-Fi) – mapa planu, noclegi i punkty będą widoczne bez internetu. Pobierana jest wersja z napisami łacińskimi, do zbliżenia ulic (zoom 16).</p>
        ${areas.length ? `<form id="of-form" class="card of-list">${rows}</form>
          <button type="button" class="btn primary wide" id="of-go">⬇️ Pobierz zaznaczone</button>
          <div class="of-prog" id="of-prog" hidden><div class="bar"><i id="of-bar" style="width:0"></i></div><p class="muted small" id="of-txt"></p>
            <button type="button" class="btn wide" id="of-stop">Zatrzymaj</button></div>`
        : App.empty("🗺️", "Brak miejsc do pobrania", "Dodaj noclegi lub punkty planu z położeniem (albo cel podróży), potem wróć tutaj. Możesz też otworzyć mapę, ustawić widok i wybrać „Mapa offline”.")}
        <div class="card of-info">
          <div class="row"><span class="muted">Pobrane dla tej podróży</span><b id="of-have">${have.size ? `${have.size} ${plural(have.size, "kafelek", "kafelki", "kafelków")} · ok. ${mb(have.size)}` : "nic"}</b></div>
          ${meta && meta.at ? `<div class="row"><span class="muted">Ostatnio</span><b>${App.fmtDay(meta.at.slice(0, 10))}</b></div>` : ""}
          ${free != null ? `<div class="row"><span class="muted">Wolne miejsce dla aplikacji</span><b>${free > 2 ** 30 ? `${(free / 2 ** 30).toFixed(1).replace(".", ",")} GB` : `${Math.round(free / 2 ** 20)} MB`}</b></div>` : ""}
        </div>
        ${have.size ? `<button type="button" class="btn danger wide" id="of-del">Usuń mapę offline tej podróży</button>` : ""}
        <p class="muted small">Mapa: © OpenStreetMap, © CARTO. Pobrane mapy zostają w telefonie do usunięcia (także po aktualizacji aplikacji). Jeśli telefon ma mało miejsca, przeglądarka może je usunąć – włącz „Ochronę przed usunięciem” (Ustawienia).</p>`,
      after(view) {
        const go = view.querySelector("#of-go");
        if (go) go.onclick = async () => {
          if (job) { App.toast("Pobieranie już trwa"); return; }
          if (!navigator.onLine) { App.toast("Brak internetu"); return; }
          const keys = [...view.querySelectorAll('#of-form input[name="a"]:checked:not(:disabled)')].map(x => x.value);
          const tiles = [...new Set(areas.filter(a => keys.includes(a.key)).flatMap(a => a.tiles))].filter(t => !isHave(t));
          if (!tiles.length) { App.toast(keys.length ? "Już pobrane" : "Zaznacz obszar"); return; }
          if (tiles.length > MAX_TILES) { App.toast(`Za dużo naraz (${tiles.length}) – zaznacz mniej obszarów`); return; }
          if (free != null && tiles.length * KB_PER_TILE * 1024 * 1.5 > free) { App.toast("Za mało miejsca w telefonie"); return; }
          if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
          const prog = view.querySelector("#of-prog"), bar = view.querySelector("#of-bar"), txt = view.querySelector("#of-txt");
          go.disabled = true; prog.hidden = false;
          view.querySelector("#of-stop").onclick = () => { if (job) job.state.stopped = true; };
          const show = st => {
            if (!bar.isConnected) return;
            bar.style.width = `${Math.round(st.done / st.total * 100)}%`;
            txt.textContent = `Pobieram… ${st.done}/${st.total}${st.failed ? ` · błędy: ${st.failed}` : ""}`;
          };
          const st = await download(id, tiles, show);
          App.toast(st.stopped ? "Zatrzymano – pobrane kafelki zostają" : st.failed ? `Pobrano · nie udało się ${st.failed} – spróbuj ponownie` : "Mapa offline gotowa ✅");
          if (location.hash.startsWith(`#/mapa-offline/${id}`)) App.render();
        };
        const del = view.querySelector("#of-del");
        if (del) del.onclick = async () => {
          if (!confirm("Usunąć pobraną mapę offline tej podróży?")) return;
          if (job && job.tripId === id) job.state.stopped = true;
          await caches.delete(cacheName(id));
          const cur = await DB.get("trips", id);
          if (cur) { const { offlineMap, ...rest } = cur; await DB.putRaw("trips", rest); }
          App.toast("Usunięto");
          App.render();
        };
      },
      // wyjście z ekranu nie przerywa pobierania (działa dalej w tle aplikacji)
    };
  });
})();
