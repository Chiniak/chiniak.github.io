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
  const cache = new Map(); // wyniki w pamięci – powrót na ekran nie pobiera ich od nowa

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
  async function overpass(query) {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!r.ok) throw new Error(`serwer map odpowiedział ${r.status}`);
    return (await r.json()).elements || [];
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
      id: `${el.type}/${el.id}`, name: t["name:pl"] || t.name, lat, lon, type, kind: KIND[type] || type.replace(/_/g, " "),
      cuisine, hours: t.opening_hours || "", website: t.website || t["contact:website"] || "", wikipedia: t.wikipedia || "",
      address: addr, dist: c ? P().km(c, { lat, lon }) : 0, score,
      cat: t.amenity ? "jedzenie" : /park|garden/.test(type) ? "natura" : "zwiedzanie",
    };
  }
  async function attractions(c) {
    const a = `(around:6000,${c.lat},${c.lon})`;
    const els = await overpass(`[out:json][timeout:25];(
      nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"]${a};
      nwr["historic"~"^(monument|castle|memorial|ruins|archaeological_site|fort|palace)$"]["name"]["wikidata"]${a};
      nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"]${a};
      nwr["amenity"="place_of_worship"]["name"]["wikipedia"]${a};
    );out center tags 300;`);
    return dedupe(els.map(e => toPlace(e, c)).filter(Boolean))
      .sort((x, y) => y.score - x.score || x.dist - y.dist).slice(0, 40);
  }
  async function food(c) {
    const els = await overpass(`[out:json][timeout:25];
      nwr["amenity"~"^(restaurant|cafe|bar|pub|ice_cream)$"]["name"](around:1500,${c.lat},${c.lon});out center tags 300;`);
    // najpierw miejsca z pełniejszym opisem (kuchnia, godziny, strona), potem najbliższe
    return dedupe(els.map(e => toPlace(e, c)).filter(Boolean))
      .sort((x, y) => Math.min(y.score, 3) - Math.min(x.score, 3) || x.dist - y.dist).slice(0, 40);
  }
  function dedupe(list) {
    const seen = new Set();
    return list.filter(p => { const k = norm(p.name); if (seen.has(k)) return false; seen.add(k); return true; });
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
    const have = new Set(items.map(i => norm(i.title)));

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
        <div id="dc-list" class="dc-list">${needCenter || tab === "szukaj" && !q.q ? "" : `<p class="muted small">Szukam w okolicy${c ? ` „${esc(c.label)}”` : ""}…</p>`}</div>
        <p class="muted small dc-src">Dane: © OpenStreetMap, opisy: Wikipedia. Wymaga internetu.</p>`,
      after(view) {
        const box = view.querySelector("#dc-list");
        const gps = view.querySelector("#dc-gps");
        if (gps) gps.onclick = () => {
          if (!navigator.geolocation) { App.toast("Telefon nie udostępnia położenia"); return; }
          gps.textContent = "📍 Ustalam…";
          navigator.geolocation.getCurrentPosition(
            pos => location.replace(link({ lat: pos.coords.latitude.toFixed(5), lon: pos.coords.longitude.toFixed(5), gdzie: "tutaj" })),
            () => { gps.textContent = "📍 Tutaj"; App.toast("Brak zgody na położenie albo GPS wyłączony"); },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
        };

        const render = list => {
          if (!list.length) { box.innerHTML = `<p class="muted small">Nic nie znaleziono w okolicy.</p>`; return; }
          box.innerHTML = list.map((p, i) => `
            <div class="dc-card">
              ${p.thumb ? `<img class="dc-img" src="${esc(p.thumb)}" alt="" loading="lazy">` : `<div class="dc-img dc-ico" aria-hidden="true">${(App.Plan.CATS[p.cat] || App.Plan.CATS.inne).icon}</div>`}
              <div class="dc-main">
                <b>${esc(p.name)}</b>
                <span class="muted small">${[p.kind, p.cuisine, p.dist ? `${P().fmtDist(p.dist)} stąd` : ""].filter(Boolean).map(esc).join(" · ")}</span>
                ${p.desc ? `<span class="small">${esc(p.desc)}</span>` : ""}
                ${p.hours ? `<span class="muted small">🕒 ${esc(p.hours.slice(0, 60))}</span>` : ""}
                <span class="dc-links">${p.wikiUrl ? `<a href="${esc(p.wikiUrl)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""}
                  ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">Strona ↗</a>` : ""}
                  <a href="${esc(App.mapsUrl(`${p.lat},${p.lon}`))}" target="_blank" rel="noopener">Nawiguj ↗</a></span>
              </div>
              <button type="button" class="btn dc-add${have.has(norm(p.name)) ? " done" : ""}" data-i="${i}" ${have.has(norm(p.name)) ? "disabled" : ""}>${have.has(norm(p.name)) ? "✓ w planie" : "💡 Do pomysłów"}</button>
            </div>`).join("");
          box.querySelectorAll(".dc-add").forEach(b => b.onclick = async () => {
            const p = list[+b.dataset.i];
            await DB.put("planItems", { tripId: id, date: "", time: "", title: p.name.slice(0, 100), cat: p.cat,
              place: p.address ? `${p.name}, ${p.address}` : p.name, lat: p.lat, lon: p.lon,
              note: [p.kind, p.cuisine, p.desc].filter(Boolean).join(" · ").slice(0, 300), cost: "", currency: "PLN", order: 1e6 });
            have.add(norm(p.name));
            b.textContent = "✓ w planie"; b.disabled = true; b.classList.add("done");
            if (navigator.vibrate) navigator.vibrate(15);
            App.toast("Dodano do pomysłów – wybierzesz dzień w planie");
          });
        };

        const run = async (key, fn) => {
          if (cache.has(key)) return render(cache.get(key));
          try {
            const list = await fn();
            cache.set(key, list);
            if (box.isConnected) render(list);
          } catch (e) {
            if (box.isConnected) box.innerHTML = `<p class="muted small">⚠️ ${navigator.onLine ? "Serwer map nie odpowiada – spróbuj za chwilę." : "Brak internetu – odkrywanie działa tylko online."}</p>`;
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
        const key = `${tab}|${c.lat.toFixed(3)}|${c.lon.toFixed(3)}`;
        run(key, async () => tab === "jedzenie" ? food(c) : wikiInfo(await attractions(c)));
      },
    };
  });

  App.Discover = { attractions, food, wikiInfo };
})();
