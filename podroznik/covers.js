/* Podróżnik – automatyczne zdjęcia celu podróży (redesign „Premium Light”, karta podróży na ekranie głównym).
   Dla podróży bez własnej okładki szuka zdjęcia celu (pole „Cel podróży”, a bez niego nazwa):
     1) zdjęcie z artykułu Wikipedii o tym miejscu (pl, potem en),
     2) zapas: wyróżnione / dobre zdjęcia z Wikimedia Commons z nazwą miejsca.
   Tylko krajobrazy i widoki miast – BEZ motywów religijnych (właściciel, PR #10): ten sam filtr co tło ze zdjęć
   (App.Backdrop.BAD), sprawdzany na nazwie pliku, opisie i widocznych kategoriach Commons; odrzucane też mapy, flagi i kolaże.
   Zapis w podróży: `coverAuto: { data (JPEG data URL ~900 px), credit, page, q }` przez DB.putRaw (nie unieważnia kopii),
   `coverTry` – ostatnia nieudana próba (kolejna za 7 dni), `coverOff` – użytkownik usunął zdjęcie (nie szukamy więcej).
   Własna okładka (files, segmentId "cover") zawsze ma pierwszeństwo. Bez internetu i przy oszczędzaniu danych nic nie pobiera. */
(function () {
  const RETRY = 7 * 86400000, WIDTH = 1000, KEEP = 900;
  const EXCLUDE = "-church -cathedral -chapel -temple -mosque -monastery -shrine -pagoda -jesus -christ -madonna -saint -painting -statue -interior -map -flag";
  const EXTRA_BAD = /\b(montage|collage|mosaic|locator|location|orthographic|projection|coat of arms|emblem|seal|logo|skyline at night of a church)\b/i;

  const query = t => String(t.destination || t.name || "").trim();
  const place = q => q.split(/[,(–-]/)[0].trim();
  const bad = text => (App.Backdrop && App.Backdrop.BAD ? App.Backdrop.BAD.test(text) : /church|cathedral|temple|mosque|shrine|monaster|jesus|christ/i.test(text)) || EXTRA_BAD.test(text);
  const strip = h => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const canFetch = () => navigator.onLine && !(navigator.connection && navigator.connection.saveData);

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }

  // 1) zdjęcie artykułu Wikipedii → nazwa pliku do sprawdzenia na Commons
  async function wikiImage(lang, title) {
    const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: "query", format: "json", origin: "*", redirects: "1", titles: title,
      prop: "pageimages|pageprops", piprop: "name", ppprop: "disambiguation" }));
    const p = Object.values((j.query && j.query.pages) || {})[0];
    if (!p || "missing" in p || (p.pageprops && "disambiguation" in p.pageprops)) return null;
    return { title: p.title, file: p.pageimage || null, page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` };
  }

  // opis pliku z Commons: adres miniatury, autor i licencja, czy wolno go pokazać
  function fromCommonsPage(p) {
    const ii = p && p.imageinfo && p.imageinfo[0];
    if (!ii || !ii.thumburl) return null;
    const m = ii.extmetadata || {};
    const cats = (p.categories || []).map(c => c.title).join(" ");
    const text = [p.title, strip(m.ObjectName && m.ObjectName.value), strip(m.ImageDescription && m.ImageDescription.value), cats].join(" | ");
    if (bad(text)) return null;
    if (ii.mime && ii.mime !== "image/jpeg") return null;
    if (ii.width < 900 || ii.width < ii.height * 0.9) return null; // poziome i dość duże – karta jest szeroka
    const by = [strip(m.Artist && m.Artist.value), strip(m.LicenseShortName && m.LicenseShortName.value)].filter(Boolean).join(", ");
    return { src: ii.thumburl, page: ii.descriptionurl || "", credit: `Wikimedia Commons${by ? ` · ${by}` : ""}` };
  }
  const COMMONS = { action: "query", format: "json", origin: "*", prop: "imageinfo|categories", clshow: "!hidden", cllimit: "max",
    iiprop: "url|size|mime|extmetadata", iiurlwidth: String(WIDTH), iiextmetadatafilter: "Artist|LicenseShortName|ObjectName|ImageDescription" };

  async function checkFile(file) {
    const j = await getJson("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ ...COMMONS, titles: `File:${file}` }));
    const p = Object.values((j.query && j.query.pages) || {})[0];
    return p && !("missing" in p) ? fromCommonsPage(p) : null; // plik tylko w lokalnej Wikipedii – nie da się sprawdzić, pomijamy
  }

  // 2) zapas: wyróżnione, potem „dobre” zdjęcia Commons z nazwą miejsca
  async function commonsSearch(name) {
    for (const cat of ["Featured_pictures_on_Wikimedia_Commons", "Quality_images"]) {
      const j = await getJson("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ ...COMMONS,
        generator: "search", gsrnamespace: "6", gsrlimit: "20", gsrsearch: `incategory:${cat} filemime:image/jpeg intitle:"${name}" ${EXCLUDE}` }));
      const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      for (const p of pages) { const hit = fromCommonsPage(p); if (hit) return hit; }
    }
    return null;
  }

  async function find(q) {
    const name = place(q), titles = [...new Set([name, q])];
    let enTitle = null;
    for (const lang of ["pl", "en"]) {
      for (const t of titles) {
        const w = await wikiImage(lang, t).catch(() => null);
        if (!w) continue;
        if (lang === "en") enTitle = w.title;
        if (w.file) { const hit = await checkFile(w.file).catch(() => null); if (hit) return { ...hit, page: hit.page || w.page }; }
        break; // artykuł jest, ale bez dobrego zdjęcia – następny język
      }
    }
    return commonsSearch(enTitle || name).catch(() => null);
  }

  async function toData(src) {
    const r = await fetch(src, { mode: "cors" });
    if (!r.ok) throw new Error(`zdjęcie: ${r.status}`);
    const blob = await App.resizeImage(await r.blob(), KEEP, 0.78);
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  }

  const has = t => !!(t.coverAuto && t.coverAuto.data && t.coverAuto.q === query(t));
  const off = t => !!t.coverOff && t.coverOff === query(t); // usunięte dla tego celu; po zmianie celu szukamy znowu
  const needs = t => !off(t) && query(t) && !has(t) && (!t.coverTry || Date.now() - t.coverTry > RETRY || (t.coverTryQ && t.coverTryQ !== query(t)));

  // znajdź i zapisz zdjęcie jednej podróży; zwraca coverAuto albo null
  async function fetchFor(trip) {
    const q = query(trip);
    const hit = await find(q);
    const cur = await DB.get("trips", trip.id);
    if (!cur || off(cur) || query(cur) !== q) return null;
    if (!hit) { await DB.putRaw("trips", { ...cur, coverTry: Date.now(), coverTryQ: q }); return null; }
    const data = await toData(hit.src);
    const coverAuto = { data, credit: hit.credit, page: hit.page, q };
    await DB.putRaw("trips", { ...cur, coverAuto, coverTry: null, coverTryQ: null });
    return coverAuto;
  }

  /* uzupełnij zdjęcia w tle, po kolei (najwyżej 6 naraz); skip – id podróży z własną okładką; onCover(trip, coverAuto) – odświeżenie ekranu */
  let running = null;
  function fill(trips, skip, onCover) {
    if (running || !canFetch()) return running;
    const todo = trips.filter(t => !skip.has(t.id) && needs(t)).slice(0, 6);
    if (!todo.length) return null;
    running = (async () => {
      let bad = 0;
      for (const t of todo) {
        if (!canFetch() || bad >= 2) break; // Wikipedia nie odpowiada – spróbuj przy następnym otwarciu
        try { const c = await fetchFor(t); bad = 0; if (c && onCover) onCover(t, c); }
        catch (e) { bad++; }
      }
    })().finally(() => { running = null; });
    return running;
  }

  // użytkownik usunął zdjęcie celu – nie szukamy więcej (do zmiany celu podróży albo ponownego włączenia)
  async function remove(tripId) {
    const cur = await DB.get("trips", tripId);
    if (cur) await DB.putRaw("trips", { ...cur, coverAuto: null, coverOff: query(cur) });
  }
  async function allow(tripId) {
    const cur = await DB.get("trips", tripId);
    if (cur) await DB.putRaw("trips", { ...cur, coverOff: null, coverTry: null });
  }
  // zdjęcie do pokazania (bez sprawdzania własnej okładki)
  const of = t => (has(t) && !off(t) ? t.coverAuto : null);

  App.Covers = { toData, canFetch, find, fetchFor, fill, needs, remove, allow, of, query };
})();
