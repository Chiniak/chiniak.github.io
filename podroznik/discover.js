/* Podróżnik – etap 10: odkrywanie miejsc w okolicy (jak „Explore” w Wanderlog).
   Trasa: #/odkrywaj/:tripId?t=atrakcje|jedzenie|szukaj&lat=..&lon=..&gdzie=nazwa
   Źródła (bez klucza, wymagają internetu):
     – atrakcje i jedzenie: OpenStreetMap przez Overpass API (muzea, zabytki, punkty widokowe, restauracje, kawiarnie…),
     – opis i zdjęcie atrakcji: Wikipedia (jeśli obiekt ma w OSM link do artykułu),
     – szukaj: wyszukiwarka OpenStreetMap (Nominatim).
   „💡 Do pomysłów” zapisuje miejsce jako punkt planu bez dnia (z położeniem) – potem jednym ruchem trafia do wybranego dnia. */
(function () {
  const { esc, plural } = App;
  const P = () => App.Places;
  const norm = s => String(s || "").trim().toLowerCase();
  const cache = new Map();
  const EN_FIRST = () => (self.I18N && I18N.lang === "en"); // wyniki w pamięci – powrót na ekran nie pobiera ich od nowa

  // Amap szuka po chińsku
  const AMAP_WORD = { "atrakcje turystyczne": "景点", muzea: "博物馆", parki: "公园", restauracje: "餐厅", kawiarnie: "咖啡", bary: "酒吧" };
  const TABS = { atrakcje: "🏛️ Atrakcje", jedzenie: "🍽️ Jedzenie", szukaj: "🔎 Szukaj" };
  const KIND = {
    museum: "muzeum", attraction: "atrakcja", viewpoint: "punkt widokowy", gallery: "galeria", zoo: "zoo", theme_park: "park rozrywki",
    aquarium: "akwarium", monument: "pomnik", castle: "zamek", memorial: "miejsce pamięci", ruins: "ruiny", archaeological_site: "stanowisko archeologiczne",
    fort: "fort", palace: "pałac", park: "park", garden: "ogród", restaurant: "restauracja", cafe: "kawiarnia", bar: "bar", pub: "pub",
    ice_cream: "lody", fast_food: "szybkie jedzenie", church: "kościół", cathedral: "katedra",
  };
  const CUISINE = { pizza: "pizza", italian: "włoska", portuguese: "portugalska", polish: "polska", seafood: "owoce morza", sushi: "sushi",
    japanese: "japońska", chinese: "chińska", indian: "indyjska", burger: "burgery", coffee_shop: "kawa", vegetarian: "wegetariańska",
    vegan: "wegańska", spanish: "hiszpańska", french: "francuska", greek: "grecka", mexican: "meksykańska", thai: "tajska",
    turkish: "turecka", kebab: "kebab", regional: "regionalna", ice_cream: "lody", cake: "ciasta", bakery: "piekarnia", local: "lokalna" };

  /* ---------- Overpass (OpenStreetMap) ---------- */
  // kilka serwerów Overpass – główny bywa przeciążony (429 / 504). Pytane „wyścigiem”: kolejny rusza po 2 s
  // (albo od razu po błędzie poprzedniego), pierwsza dobra odpowiedź wygrywa, reszta jest przerywana; najwyżej 15 s.
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"];
  let lastErr = "";
  function overpass(query, { limit = 15000, stagger = 2000 } = {}) {
    return new Promise((resolve, reject) => {
      const errs = [], ctls = [];
      let started = 0, finished = 0, done = false, timer = null;
      const end = (ok, val) => {
        if (done) return; done = true;
        clearTimeout(timer); clearTimeout(all);
        ctls.forEach(c => c.abort());
        if (ok) resolve(val); else { lastErr = errs.join(", "); reject(new Error(`serwery map nie odpowiadają (${lastErr})`)); }
      };
      const start = () => {
        if (done || started >= OVERPASS.length) return;
        const url = OVERPASS[started++], ctl = new AbortController();
        ctls.push(ctl);
        clearTimeout(timer); timer = setTimeout(start, stagger);
        fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), signal: ctl.signal,
          headers: { "Content-Type": "application/x-www-form-urlencoded" } })
          .then(async r => {
            if (!r.ok) throw new Error(String(r.status));
            const j = await r.json();
            if (j.remark && /runtime error|timed out/i.test(j.remark) && !(j.elements || []).length) throw new Error("limit czasu");
            end(true, j.elements || []);
          })
          .catch(e => {
            if (done) return;
            errs.push(e.name === "AbortError" ? "brak odpowiedzi" : /^\d+$|limit/.test(e.message) ? e.message : "błąd sieci");
            if (++finished >= OVERPASS.length) end(false); else start(); // błąd – od razu następny serwer
          });
      };
      const all = setTimeout(() => { errs.push("brak odpowiedzi"); end(false); }, limit);
      start();
    });
  }
  function toPlace(el, c) {
    const t = el.tags || {};
    const lat = el.lat ?? (el.center && el.center.lat), lon = el.lon ?? (el.center && el.center.lon);
    if (lat == null || !t.name) return null;
    const type = t.tourism || t.historic || t.amenity || t.leisure || "";
    const addr = [t["addr:street"] && `${t["addr:street"]}${t["addr:housenumber"] ? " " + t["addr:housenumber"] : ""}`, t["addr:city"]].filter(Boolean).join(", ");
    const cuisine = (t.cuisine || "").split(";").map(x => CUISINE[x.trim()] || x.trim().replace(/_/g, " ")).filter(Boolean).slice(0, 2).join(", ");
    const score = (t.wikidata ? 3 : 0) + (t.wikipedia ? 3 : 0) + (/museum|attraction|castle/.test(type) ? 1 : 0) + (t.website ? 1 : 0)
      + (t.opening_hours ? 1 : 0) + (t.cuisine ? 1 : 0) + (t.image ? 1 : 0);
    return {
      id: `${el.type}/${el.id}`, name: (EN_FIRST() ? t["name:en"] || t["name:pl"] : t["name:pl"] || t["name:en"]) || t.name,
      local: (t["name:pl"] || t["name:en"]) && t.name !== (t["name:pl"] || t["name:en"]) && t.name !== t["name:en"] ? t.name : "", lat, lon, type, kind: KIND[type] || type.replace(/_/g, " "),
      cuisine, hours: t.opening_hours || "", website: t.website || t["contact:website"] || "", wikipedia: t.wikipedia || "",
      address: addr, dist: c ? P().km(c, { lat, lon }) : 0, score,
      cat: t.amenity ? "jedzenie" : /park|garden/.test(type) ? "natura" : "zwiedzanie",
    };
  }
  // atrakcje: Wikipedia (szybka, ze zdjęciami) i OpenStreetMap (pełniejsza) równolegle;
  // onPartial(lista) – pierwsze wyniki od razu, zanim odpowie wolniejszy serwer map
  async function attractions(c, onPartial) {
    const wikiP = wikiNearby(c).catch(() => []);
    const osmP = overpassAttractions(c).then(els => wikiInfo(dedupe(els.map(e => toPlace(e, c)).filter(Boolean))
      .sort((x, y) => y.score - x.score || x.dist - y.dist).slice(0, 40)));
    let first = null;
    wikiP.then(w => { if (w.length && !first && onPartial) { first = w; onPartial(w); } });
    let osm;
    try { osm = await osmP; } catch (e) {
      const w = await wikiP; // zapas: artykuły z Wikipedii o miejscach w pobliżu
      if (w.length) return w;
      throw e;
    }
    // połącz: OSM + artykuły z Wikipedii, których w OSM nie ma (ze zdjęciem)
    const w = await Promise.race([wikiP, new Promise(r => setTimeout(() => r([]), 1500))]);
    const names = new Set(osm.map(p => norm(p.name)));
    return osm.concat(w.filter(p => p.thumb && !names.has(norm(p.name)))).slice(0, 50);
  }
  function overpassAttractions(c) {
    const a = `(around:2500,${c.lat},${c.lon})`;
    return overpass(`[out:json][timeout:15];(
      nw["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"]${a};
      nw["historic"~"^(monument|castle|memorial|ruins|archaeological_site|fort|palace)$"]["name"]["wikidata"]${a};
      nw["leisure"~"^(park|garden)$"]["name"]["wikidata"]${a};
      nw["amenity"="place_of_worship"]["name"]["wikipedia"]${a};
    );out center tags 150;`);
  }
  async function food(c) {
    let els;
    try {
      els = await overpass(`[out:json][timeout:15];
        nw["amenity"~"^(restaurant|cafe|bar|pub|ice_cream)$"]["name"](around:1000,${c.lat},${c.lon});out center tags 150;`);
    } catch (e) {
      // zapas: wyszukiwarka OpenStreetMap (Nominatim) – restauracje i kawiarnie w okolicy
      const out = [];
      for (const [q, type] of [["restaurant", "restaurant"], ["cafe", "cafe"]]) {
        try {
          for (const r of await App.Places.search(q, c, { bounded: true, limit: 20 }))
            out.push({ id: `${r.lat},${r.lon}`, name: r.name, lat: r.lat, lon: r.lon, type, kind: KIND[type], cuisine: "", hours: "",
              website: "", wikipedia: "", address: r.address.replace(r.name + ", ", ""), dist: P().km(c, r), score: 0, cat: "jedzenie" });
        } catch (x) { /* dalej */ }
      }
      if (out.length) return dedupe(out).sort((x, y) => x.dist - y.dist).slice(0, 40);
      throw e;
    }
    // najpierw miejsca z pełniejszym opisem (kuchnia, godziny, strona), potem najbliższe
    return dedupe(els.map(e => toPlace(e, c)).filter(Boolean))
      .sort((x, y) => Math.min(y.score, 3) - Math.min(x.score, 3) || x.dist - y.dist).slice(0, 40);
  }
  function dedupe(list) {
    const seen = new Set();
    return list.filter(p => { const k = norm(p.name); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* ---------- Wikipedia: artykuły o miejscach w pobliżu (zapas, gdy serwery map nie odpowiadają) ---------- */
  const NOT_SIGHT = /ulica|aleja|plac(?! zabaw)|stacja|przystanek|dzielnica|osiedle|gmina|parafia|freguesia|street|avenue|station|district|neighbourhood|szkoła|school|hotel|bank|firma|company|przedsiębiorstwo/i;
  async function wikiNearby(c) {
    for (const lang of (self.I18N && I18N.lang === "en") ? ["en", "pl"] : ["pl", "en"]) {
      try {
        const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
          action: "query", format: "json", origin: "*", generator: "geosearch", ggscoord: `${c.lat}|${c.lon}`, ggsradius: "3000",
          ggslimit: "50", prop: "coordinates|pageimages|description", piprop: "thumbnail", pithumbsize: "200" }));
        if (!r.ok) continue;
        const pages = Object.values(((await r.json()).query || {}).pages || {});
        const list = pages.filter(pg => pg.coordinates && !NOT_SIGHT.test(`${pg.title} ${pg.description || ""}`)).map(pg => ({
          id: `wiki/${lang}/${pg.pageid}`, name: pg.title, lat: pg.coordinates[0].lat, lon: pg.coordinates[0].lon, type: "", kind: "",
          cuisine: "", hours: "", website: "", wikipedia: "", address: "", desc: pg.description || "", thumb: pg.thumbnail ? pg.thumbnail.source : "",
          wikiUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, "_"))}`,
          dist: P().km(c, pg.coordinates[0]), score: pg.thumbnail ? 1 : 0, cat: "zwiedzanie" }));
        if (list.length) return list.sort((x, y) => y.score - x.score || x.dist - y.dist).slice(0, 40);
      } catch (e) { /* następny język */ }
    }
    return [];
  }

  /* ---------- Wikipedia: krótki opis i miniatura dla atrakcji z linkiem do artykułu ---------- */
  async function wikiInfo(list) {
    const byLang = {};
    for (const p of list) {
      const m = /^([a-z-]{2,12}):(.+)$/.exec(p.wikipedia);
      if (m) (byLang[m[1]] = byLang[m[1]] || []).push([m[2], p]);
    }
    for (const [lang, pairs] of Object.entries(byLang)) {
      try {
        const titles = pairs.map(x => x[0]).slice(0, 50).join("|");
        const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
          action: "query", format: "json", origin: "*", redirects: "1", prop: "pageimages|description",
          piprop: "thumbnail", pithumbsize: "200", titles }));
        if (!r.ok) continue;
        const j = await r.json();
        const map = {};
        (j.query.normalized || []).concat(j.query.redirects || []).forEach(n => { map[n.from] = n.to; });
        const pages = Object.values(j.query.pages || {});
        for (const [title, p] of pairs) {
          let t = title; for (let k = 0; k < 3 && map[t]; k++) t = map[t];
          const pg = pages.find(x => x.title === t);
          if (!pg) continue;
          p.desc = pg.description || "";
          p.thumb = pg.thumbnail ? pg.thumbnail.source : "";
          p.wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
        }
      } catch (e) { /* bez opisu */ }
    }
    return list;
  }

  /* ================= EKRAN ================= */
  App.route(/^\/odkrywaj\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/podroze"); return ""; }
    const tab = TABS[q.t] ? q.t : "atrakcje";
    const segs = await DB.byIndex("segments", "tripId", id);
    const hotels = segs.filter(s => s.type === "nocleg" && P().hasXY(s));
    let c = q.lat && q.lon ? { lat: +q.lat, lon: +q.lon, label: q.gdzie || "wybrane miejsce" } : await P().center(trip);
    const link = extra => `#/odkrywaj/${id}?${new URLSearchParams({ t: tab, ...(q.lat ? { lat: q.lat, lon: q.lon, gdzie: q.gdzie || "" } : {}), ...extra })}`;
    const tabs = Object.entries(TABS).map(([k, n]) => `<a class="st-chip${k === tab ? " on" : ""}" href="${link({ t: k })}" ${k === tab ? 'aria-current="true"' : ""}>${n}</a>`).join("");
    // „w pobliżu czego”: cel podróży, noclegi z położeniem, telefon (GPS)
    const near = [`<button type="button" class="st-chip${q.gdzie === "tutaj" ? " on" : ""}" id="dc-gps">📍 Tutaj</button>`, `<a class="st-chip${!q.lat ? " on" : ""}" href="#/odkrywaj/${id}?t=${tab}">🎯 ${esc(trip.destination || "cel podróży")}</a>`]
      .concat(hotels.map(h => `<a class="st-chip${q.lat == h.lat && q.lon == h.lon ? " on" : ""}" href="#/odkrywaj/${id}?${new URLSearchParams({ t: tab, lat: h.lat, lon: h.lon, gdzie: h.name || "nocleg" })}">🏨 ${esc(h.name || "Nocleg")}</a>`))
      .join("");
    const items = await DB.byIndex("planItems", "tripId", id);
    const have = new Map(items.map(i => [norm(i.title), i])); // nazwa → punkt planu (do odznaczania)

    const needCenter = !c && tab !== "szukaj";
    return {
      title: `Odkrywaj · ${trip.name}`,
      back: `#/plan/${id}`,
      html: `
        <div class="st-chips">${tabs}</div>
        ${tab !== "szukaj" ? `<div class="st-chips dc-near"><span class="muted small dc-near-label">W pobliżu:</span>${near}</div>` : ""}
        ${tab === "szukaj" ? `
          <form class="pl-search dc-search" id="dc-form"><input name="q" placeholder="np. Pastéis de Belém, plaża, muzeum azulejos" value="${esc(q.q || "")}" autocomplete="off" aria-label="Szukaj miejsca">
            <button class="btn primary" type="submit">Szukaj</button></form>` : ""}
        ${needCenter ? App.empty("🧭", "Gdzie szukać?", trip.destination
            ? `Nie udało się ustalić położenia „${esc(trip.destination)}”${navigator.onLine ? "" : " – brak internetu"}. Wybierz „📍 Tutaj” albo wpisz miejsce w zakładce Szukaj.`
            : "Wpisz cel podróży (np. „Lizbona”) w ustawieniach podróży albo wybierz „📍 Tutaj”.",
            `<a class="btn" href="#/podroze/${id}/edytuj">Ustaw cel podróży</a>`) : ""}
        ${c && tab !== "szukaj" ? `<div class="dc-google"><span class="muted small">${App.navApp === "amap" ? "Amap:" : App.navApp === "geo" ? "W aplikacji map:" : "Mapy Google:"}</span>${(tab === "jedzenie" ? [["🍽️", "restauracje"], ["☕", "kawiarnie"], ["🍺", "bary"]] : [["🏛️", "atrakcje turystyczne"], ["🖼️", "muzea"], ["🌳", "parki"]])
          .map(([i, w]) => `<a class="st-chip" href="${esc(App.mapsSearchUrl(App.navApp === "amap" ? AMAP_WORD[w] || w : w, c.lat, c.lon))}" target="_blank" rel="noopener">${i} ${w.split(" ")[0]}</a>`).join("")}</div>` : ""}
        <div id="dc-list" class="dc-list">${needCenter || tab === "szukaj" && !q.q ? "" : `<p class="muted small">Szukam w okolicy${c ? ` „${esc(c.label)}”` : ""}…</p>`}</div>
        <p class="muted small dc-src">Dane: © OpenStreetMap, opisy: Wikipedia. Wymaga internetu.</p>`,
      after(view) {
        const box = view.querySelector("#dc-list");
        const gps = view.querySelector("#dc-gps");
        // położenie: najpierw ostatnie znane (od razu), potem dokładny GPS; własny limit czasu – nie wisi na „Ustalam…”
        if (gps) gps.onclick = () => {
          if (!navigator.geolocation) { App.toast("Telefon nie udostępnia położenia"); return; }
          if (gps.disabled) return;
          gps.disabled = true; gps.textContent = "📍 Ustalam…";
          let done = false;
          const ok = pos => { if (done) return; done = true; clearTimeout(watchdog);
            location.replace(link({ lat: pos.coords.latitude.toFixed(5), lon: pos.coords.longitude.toFixed(5), gdzie: "tutaj" })); };
          const fail = msg => { if (done) return; done = true; clearTimeout(watchdog);
            gps.disabled = false; gps.textContent = "📍 Tutaj"; App.toast(msg); };
          const watchdog = setTimeout(() => fail("Telefon nie podał położenia – włącz lokalizację (GPS) i spróbuj jeszcze raz"), 18000);
          navigator.geolocation.getCurrentPosition(ok, err => {
            if (err.code === 1) return fail("Brak zgody na lokalizację – zezwól w ustawieniach telefonu (Chrome → Uprawnienia → Lokalizacja)");
            gps.textContent = "📍 Ustalam (GPS)…";
            navigator.geolocation.getCurrentPosition(ok,
              e2 => fail(e2.code === 1 ? "Brak zgody na lokalizację" : "Nie udało się ustalić położenia – włącz GPS albo wyjdź bliżej okna"),
              { enableHighAccuracy: true, timeout: 13000, maximumAge: 5 * 60000 });
          }, { enableHighAccuracy: false, timeout: 4000, maximumAge: 30 * 60000 }); // do szukania atrakcji wystarczy przybliżone
        };

        const render = list => {
          if (!list.length) { box.innerHTML = `<p class="muted small">Nic nie znaleziono w okolicy.</p>`; return; }
          box.innerHTML = list.map((p, i) => `
            <div class="dc-card">
              ${p.thumb ? `<img class="dc-img" src="${esc(p.thumb)}" alt="" loading="lazy">` : `<div class="dc-img dc-ico" aria-hidden="true">${(App.Plan.CATS[p.cat] || App.Plan.CATS.inne).icon}</div>`}
              <div class="dc-main">
                <b>${esc(p.name)}</b>${p.local ? `<span class="small dc-local" lang="und">${esc(p.local)}</span>` : ""}
                <span class="muted small">${[p.kind, p.cuisine, p.dist ? `${P().fmtDist(p.dist)} stąd` : ""].filter(Boolean).map(esc).join(" · ")}</span>
                ${p.desc ? `<span class="small">${esc(p.desc)}</span>` : ""}
                ${p.hours ? `<span class="muted small">🕒 ${esc(p.hours.slice(0, 60))}</span>` : ""}
                <span class="dc-links">${p.wikiUrl ? `<a href="${esc(p.wikiUrl)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""}
                  ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">Strona ↗</a>` : ""}
                  <a href="${esc(App.mapsUrl(`${p.lat},${p.lon}`))}" target="_blank" rel="noopener">Nawiguj ↗</a></span>
              </div>
              <button type="button" class="btn dc-add${have.has(norm(p.name)) ? " done" : ""}" data-i="${i}" aria-pressed="${have.has(norm(p.name))}">${have.has(norm(p.name)) ? "✓ w planie" : "💡 Do pomysłów"}</button>
            </div>`).join("");
          const setBtn = (b, on) => { b.textContent = on ? "✓ w planie" : "💡 Do pomysłów"; b.classList.toggle("done", on); b.setAttribute("aria-pressed", on); };
          box.querySelectorAll(".dc-add").forEach(b => b.onclick = async () => {
            const p = list[+b.dataset.i];
            const k = norm(p.name);
            // drugie kliknięcie: odznacz (pomysł znika; punkt przypisany już do dnia – po potwierdzeniu)
            if (have.has(k)) {
              const it = await DB.get("planItems", have.get(k).id);
              if (it && it.date && !confirm(`„${it.title}” jest już w planie na ${App.fmtDay(it.date)}. Usunąć z planu?`)) return;
              if (it) await DB.del("planItems", it.id);
              have.delete(k);
              setBtn(b, false);
              App.toast(it && it.date ? "Usunięto z planu" : "Usunięto z pomysłów");
              return;
            }
            const rec = await DB.put("planItems", { tripId: id, date: "", time: "", title: p.name.slice(0, 100), cat: p.cat,
              place: p.address ? `${p.name}, ${p.address}` : p.name, lat: p.lat, lon: p.lon,
              note: [p.kind, p.cuisine, p.desc].filter(Boolean).join(" · ").slice(0, 300), cost: "", currency: "PLN", order: 1e6,
              photoUrl: p.thumb || "", wikiUrl: p.wikiUrl || "" }); // zdjęcie zapisze plan (photos.js)
            have.set(k, rec);
            setBtn(b, true);
            if (navigator.vibrate) navigator.vibrate(15);
            App.toast("Dodano do pomysłów – wybierzesz dzień w planie");
          });
        };

        const run = async (key, fn) => {
          if (cache.has(key)) return render(cache.get(key));
          const partial = list => { if (box.isConnected && !cache.has(key)) { render(list); box.insertAdjacentHTML("afterbegin", `<p class="muted small dc-more">⏳ Uzupełniam z OpenStreetMap…</p>`); } };
          try {
            const list = await fn(partial);
            cache.set(key, list);
            if (box.isConnected) render(list);
          } catch (e) {
            if (box.isConnected) box.innerHTML = `<p class="muted small">⚠️ ${navigator.onLine ? `Serwery map nie odpowiadają – spróbuj za chwilę albo użyj zakładki „🔎 Szukaj”.${lastErr ? ` <span class="dc-err">(${esc(lastErr)})</span>` : ""}` : "Brak internetu – odkrywanie działa tylko online."}</p>`;
          }
        };
        if (tab === "szukaj") {
          const f = view.querySelector("#dc-form");
          f.onsubmit = e => { e.preventDefault(); const v = f.q.value.trim(); if (v.length >= 2) location.replace(link({ q: v })); };
          if (!q.q) { f.q.focus(); return; }
          run(`s|${q.q}|${c ? c.lat : ""}`, async () => (await P().search(q.q, c)).map(r => ({
            id: `${r.lat},${r.lon}`, name: r.name, lat: r.lat, lon: r.lon, kind: KIND[r.kind] || "", address: r.address.replace(r.name + ", ", ""),
            dist: c ? P().km(c, r) : 0, cat: /restaurant|cafe|bar|pub/.test(r.kind) ? "jedzenie" : "zwiedzanie" })));
          return;
        }
        if (!c) return;
        // „Tutaj”: zaokrąglenie do ~1 km – powrót na ekran w tej samej okolicy nie szuka od nowa
        const dp = q.gdzie === "tutaj" ? 2 : 3;
        const key = `${tab}|${c.lat.toFixed(dp)}|${c.lon.toFixed(dp)}`;
        run(key, async partial => tab === "jedzenie" ? food(c) : attractions(c, partial));
      },
    };
  });

  App.Discover = { attractions, food, wikiInfo };
})();
