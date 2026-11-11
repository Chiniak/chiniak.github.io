/* Podróżnik – zdjęcia miejsc w planie i pomysłach (jak w Wanderlog).
   Skąd: 1) zdjęcie z Odkrywaj (photoUrl), 2) artykuł Wikipedii o tym miejscu – w pobliżu punktu (geosearch)
   albo po nazwie, 3) zapas: zdjęcie z Wikimedia Commons zrobione tuż obok (do 60 m, „okolica”).
   Zdjęcie jest zmniejszane (do 360 px) i zapisywane w punkcie planu jako `photo: { data, page, credit, auto }`
   – działa offline, jest w kopii zapasowej i we „wspólnej podróży”. Własne zdjęcie: formularz punktu.
   Bez trafienia: `photoTry` (znacznik czasu) – kolejna próba za 7 dni; `photoOff` – użytkownik usunął zdjęcie. */
(function () {
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);
  const RETRY = 7 * 86400000;

  /* ---------- dopasowanie nazwy ---------- */
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
    .replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const STOP = new Set(["the", "of", "and", "de", "da", "do", "la", "le", "w", "i", "na", "z", "im", "der", "die", "das"]);
  const words = s => norm(s).split(" ").filter(w => w.length >= 3 && !STOP.has(w));
  function similar(a, b) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb || (Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na)))) return true;
    const wa = new Set(words(a)), wb = words(b);
    if (!wa.size || !wb.length) return false;
    const common = wb.filter(w => wa.has(w)).length;
    return common / Math.min(wa.size, wb.length) >= 0.6;
  }
  const langs = () => (self.I18N && I18N.lang === "en") ? ["en", "pl"] : ["pl", "en"];

  async function api(host, params) {
    const r = await fetch(`https://${host}/w/api.php?` + new URLSearchParams({ action: "query", format: "json", origin: "*", ...params }));
    if (!r.ok) throw new Error(`Wikipedia odpowiedziała ${r.status}`);
    const j = await r.json();
    return Object.values((j.query && j.query.pages) || {});
  }
  const pageUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const IMG = { prop: "pageimages|coordinates", piprop: "thumbnail", pithumbsize: "400", pilimit: "50", colimit: "50" };

  // znajdź adres zdjęcia dla punktu: { src, page, credit } albo null
  async function find(it) {
    const name = it.title || "";
    // Wikipedia: artykuły w pobliżu punktu o podobnej nazwie (najpewniejsze)
    if (hasXY(it)) for (const lang of langs()) {
      const pages = await api(`${lang}.wikipedia.org`, { generator: "geosearch", ggscoord: `${it.lat}|${it.lon}`, ggsradius: "2000", ggslimit: "40", ...IMG });
      const hit = pages.filter(p => p.thumbnail && similar(p.title, name))
        .map(p => ({ p, d: p.coordinates ? App.Places.km(it, p.coordinates[0]) : 9 })).sort((a, b) => a.d - b.d)[0];
      if (hit) return { src: hit.p.thumbnail.source, page: pageUrl(lang, hit.p.title), credit: `Wikipedia: ${hit.p.title}` };
    }
    // Wikipedia: wyszukanie po nazwie (bez położenia albo artykuł bez współrzędnych)
    if (name.trim().length >= 3) for (const lang of langs()) {
      const pages = await api(`${lang}.wikipedia.org`, { generator: "search", gsrsearch: name, gsrlimit: "5", ...IMG });
      const hit = pages.sort((a, b) => (a.index || 0) - (b.index || 0)).find(p => p.thumbnail && similar(p.title, name)
        && (!hasXY(it) || !p.coordinates || App.Places.km(it, p.coordinates[0]) < 5));
      if (hit) return { src: hit.thumbnail.source, page: pageUrl(lang, hit.title), credit: `Wikipedia: ${hit.title}` };
    }
    // Wikimedia Commons: zdjęcie zrobione w tym miejscu (nazwa pliku podobna albo najbliższe do 60 m)
    if (hasXY(it)) {
      const files = await api("commons.wikimedia.org", { generator: "geosearch", ggsnamespace: "6", ggscoord: `${it.lat}|${it.lon}`, ggsradius: "150", ggslimit: "30",
        prop: "imageinfo|coordinates", iiprop: "url|extmetadata", iiurlwidth: "400", iiextmetadatafilter: "Artist|LicenseShortName", colimit: "50" });
      const list = files.filter(f => f.imageinfo && f.imageinfo[0].thumburl && /\.(jpe?g|png|webp)$/i.test(f.title))
        .map(f => ({ f, d: f.coordinates ? App.Places.km(it, f.coordinates[0]) : 1, named: similar(f.title.replace(/^File:|\.\w+$/g, ""), name) }))
        .sort((a, b) => (b.named - a.named) || a.d - b.d);
      const hit = list.find(x => x.named) || list.find(x => x.d <= 0.06);
      if (hit) {
        const ii = hit.f.imageinfo[0], m = ii.extmetadata || {};
        const strip = h => String(h || "").replace(/<[^>]*>/g, "").trim();
        const by = [strip(m.Artist && m.Artist.value), strip(m.LicenseShortName && m.LicenseShortName.value)].filter(Boolean).join(", ");
        return { src: ii.thumburl, page: ii.descriptionurl, credit: `Wikimedia Commons${hit.named ? "" : " (okolica)"}${by ? ` · ${by}` : ""}` };
      }
    }
    return null;
  }

  // pobranie i zmniejszenie obrazka → data URL (JPEG)
  async function toData(src, max = 360) {
    const r = await fetch(src, { mode: "cors" });
    if (!r.ok) throw new Error(`zdjęcie: ${r.status}`);
    const blob = await App.resizeImage(await r.blob(), max, 0.8);
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  }

  // znajdź i zapisz zdjęcie punktu; zwraca photo albo null
  async function fetchFor(it, { force = false } = {}) {
    let hit = null;
    if (it.photoUrl && !force) hit = { src: it.photoUrl, page: it.wikiUrl || "", credit: "Wikipedia" };
    if (!hit) hit = await find(it);
    const cur = await DB.get("planItems", it.id);
    if (!cur) return null;
    if (!hit) { await DB.putRaw("planItems", { ...cur, photoTry: Date.now() }); return null; }
    const photo = { data: await toData(hit.src), page: hit.page, credit: hit.credit, auto: true };
    await DB.putRaw("planItems", { ...cur, photo, photoTry: Date.now() });
    return photo;
  }

  const needs = it => !it.photo && !it.photoOff && it.title && (it.photoUrl || !it.photoTry || Date.now() - it.photoTry > RETRY);

  // uzupełnij zdjęcia punktów podróży po kolei (w tle, tylko z internetem); onPhoto(item, photo) – do odświeżenia ekranu
  let running = null;
  function fill(items, onPhoto) {
    if (!navigator.onLine || running) return running;
    const todo = items.filter(needs).slice(0, 40);
    if (!todo.length) return null;
    running = (async () => {
      let bad = 0;
      for (const it of todo) {
        if (!navigator.onLine || bad >= 3) break; // Wikipedia nie odpowiada – spróbuj przy następnym otwarciu
        try { const ph = await fetchFor(it); bad = 0; if (ph && onPhoto) onPhoto(it, ph); }
        catch (e) { bad++; }
      }
    })().finally(() => { running = null; });
    return running;
  }

  // miniatura do listy (plan, pomysły, mapa)
  const thumb = (it, cls = "pl-photo") => it.photo && it.photo.data ? `<img class="${cls}" src="${it.photo.data}" alt="" loading="lazy" decoding="async">` : "";
  // wstaw miniaturę do wiersza, który już jest na ekranie
  function paint(root, it, photo) {
    root.querySelectorAll(`[data-pid="${it.id}"]`).forEach(el => {
      if (el.querySelector(".pl-photo")) return;
      el.classList.add("has-ph");
      el.insertAdjacentHTML("afterbegin", thumb({ photo }));
    });
  }

  App.Photos = { find, toData, fetchFor, fill, needs, thumb, paint, similar };
})();
