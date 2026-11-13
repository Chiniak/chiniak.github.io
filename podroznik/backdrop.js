/* Podróżnik – tło ze zdjęć: przy każdym przejściu na inny ekran losowe zdjęcie z podróży (krajobrazy, miasta, Azja…).
   Zdjęcia: „Featured pictures” z Wikimedia Commons (wolne licencje, autor widoczny w Ustawieniach → Tło).
   Lista kandydatów (ustawienie `bgPool`) pobierana raz na 30 dni; same zdjęcia (~1000 px) pobierane po jednym
   przy kolejnych przejściach, aż będzie ich 100 – w pamięci „tla-zdjecia” (działa offline, nie kasuje jej nowa wersja aplikacji).
   Ustawienie `bgPhotos` (domyślnie włączone; `localStorage podroznik-bg` – żeby nie mignęło przy starcie). */
(function () {
  const CACHE = "tla-zdjecia", MAX = 100, WIDTH = 1000, POOL_AGE = 30 * 86400000;
  // v2: tylko natura i miasta (v1 wciągała też obrazy religijne) – starsze zdjęcia są kasowane
  // v3: filtr BAD bez ukrytych kategorii Commons (np. „Pages with maps” odrzucało prawie wszystko → czarne tło), krótsze zapytanie
  const POOL_V = 3;
  const RETRY = 10 * 60000; // za mało zdjęć na liście – kolejna próba najwcześniej po 10 min (nie przy każdym ekranie)
  // tylko natura i widoki miast – bez świątyń, kościołów, zamków (tam trafiały obrazy i wnętrza)
  const TERMS = ["landscape", "mountains", "mountain lake", "beach", "lake", "waterfall", "sunset landscape", "island", "rice terraces",
    "desert", "canyon", "forest", "coast", "cliffs", "glacier", "volcano", "national park", "river valley", "sea", "fjord", "meadow",
    "skyline", "cityscape", "city panorama", "aerial view city", "harbour", "bridge river", "night city", "street view city"];
  // w wyszukiwaniu Commons: bez tych słów (zapytanie Commons może mieć najwyżej 300 znaków – resztę odsiewa BAD)
  const EXCLUDE = "-church -cathedral -chapel -temple -mosque -monastery -shrine -jesus -christ -madonna -saint -painting -statue -interior";
  // odrzucane po tytule, nazwie, opisie i widocznych kategoriach (religia, sztuka, ludzie, zwierzęta z bliska, mapy i schematy).
  // NIE po ukrytych kategoriach (extmetadata Categories): „Pages with maps”, „Media with locations”… ma prawie każde zdjęcie.
  const BAD = new RegExp("\\b(map|maps|chart|logo|flag|flags|wat|god|gods|art|arts|cross|crosses|icon|icons|mary|saint|saints|st\\.|angel|angels|grave|graves|tomb|tombs|bird|birds|animal|animals|people|person|insect|insects|spider|nun|nuns|monk|monks|priest|pope)\\b" +
    "|\\b(diagram|portrait|nude|microscop|x-ray|anatomy|skull|church|cathedral|chapel|basilica|monaster|abbey|convent|temple|mosque|synagogue|shrine|pagoda|stupa|religio|christ|jesus|madonna|virgin|apostle|holy|sacred|bible|crucifix|altar|fresco|mural|painting|artwork|museum|sculpture|statue|stained glass|interior|cemetery|buddha|hindu|deity|coat of arms|kości|katedr|kaplic|święt|jezus|chrystus|matka boża|obraz|cerkiew|klasztor)", "i");

  let enabled = true;
  try { enabled = localStorage.getItem("podroznik-bg") !== "0"; } catch (e) { /* brak dostępu */ }
  let layers = null, front = 0, current = null, urls = [], busy = false;

  /* ---------- lista kandydatów z Commons ---------- */
  async function query(term) {
    const r = await fetch("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: "25",
      gsrsearch: `incategory:Featured_pictures_on_Wikimedia_Commons filemime:image/jpeg ${term} ${EXCLUDE}`,
      prop: "imageinfo|categories", clshow: "!hidden", cllimit: "max",
      iiprop: "url|size|extmetadata", iiurlwidth: String(WIDTH), iiextmetadatafilter: "Artist|LicenseShortName|ObjectName|ImageDescription|Categories" }));
    if (!r.ok) throw new Error(`Commons ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`Commons: ${j.error.info || j.error.code}`);
    const strip = h => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    let rejected = 0;
    const items = Object.values((j.query && j.query.pages) || {}).map(p => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.thumburl || !/\.(jpe?g)$/i.test(p.title) || ii.width < 1200 || ii.height < 700) return null;
      const m = ii.extmetadata || {};
      const text = [p.title, strip(m.ObjectName && m.ObjectName.value), strip(m.ImageDescription && m.ImageDescription.value).slice(0, 400),
        (p.categories || []).map(c => c.title).join(" ")].join(" ").replace(/_/g, " ");
      if (BAD.test(text)) { rejected++; return null; }
      return { src: ii.thumburl, page: ii.descriptionurl, title: strip(m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:|\.\w+$/g, "").replace(/_/g, " "),
        by: [strip(m.Artist && m.Artist.value), strip(m.LicenseShortName && m.LicenseShortName.value)].filter(Boolean).join(", ") };
    }).filter(Boolean);
    return { items, rejected };
  }
  async function pool() {
    let saved = await DB.getSetting("bgPool", null);
    if (saved && saved.v !== POOL_V) saved = null; // stara lista (z obrazami religijnymi) – od nowa
    const age = saved ? Date.now() - saved.at : Infinity;
    // lista świeża – albo krótka, ale niedawno szukana (nie pytaj Commons przy każdym ekranie)
    if (saved && (age < RETRY || (saved.items.length >= 20 && age < POOL_AGE))) return saved.items;
    if (!navigator.onLine) return saved ? saved.items : [];
    const seen = new Map((saved ? saved.items : []).map(x => [x.src, x]));
    const terms = TERMS.slice().sort(() => Math.random() - 0.5);
    let fails = 0, err = "", rejected = 0, asked = 0;
    for (const t of terms) {
      if (seen.size >= MAX * 1.5) break;
      try {
        asked++;
        const res = await query(t);
        rejected += res.rejected;
        for (const x of res.items) if (!seen.has(x.src)) seen.set(x.src, x);
        fails = 0;
      } catch (e) { err = String(e.message || e).slice(0, 120); if (++fails >= 3) break; } // pojedynczy błąd nie przerywa szukania
    }
    const blocked = new Set(await DB.getSetting("bgBlocked", []));
    const items = [...seen.values()].filter(x => !blocked.has(x.src));
    await DB.setSetting("bgPool", { v: POOL_V, at: Date.now(), items, err: items.length ? "" : err, asked, rejected });
    return items;
  }

  /* ---------- pobieranie po jednym ---------- */
  // pobrane zdjęcia; przy pierwszym uruchomieniu nowej wersji listy – kasuje stare (v1) i zablokowane
  let purged = false;
  async function cachedKeys() {
    try {
      if (!purged) {
        purged = true;
        const saved = await DB.getSetting("bgPool", null);
        if (!saved || saved.v !== POOL_V) await caches.delete(CACHE);
        else {
          const blocked = new Set(await DB.getSetting("bgBlocked", [])), c = await caches.open(CACHE);
          for (const r of await c.keys()) if (blocked.has(r.url)) await c.delete(r);
        }
      }
      return (await (await caches.open(CACHE)).keys()).map(r => r.url);
    } catch (e) { return []; }
  }
  async function downloadOne(have) {
    if (busy || !navigator.onLine || (navigator.connection && navigator.connection.saveData)) return false;
    busy = true;
    try {
      const items = await pool();
      const todo = items.filter(x => !have.includes(x.src));
      if (!todo.length) return false;
      const x = todo[Math.floor(Math.random() * todo.length)];
      const r = await fetch(x.src, { mode: "cors" });
      if (!r.ok) return false;
      await (await caches.open(CACHE)).put(x.src, r);
      return x.src;
    } catch (e) { return false; } finally { busy = false; }
  }

  /* ---------- wyświetlanie ---------- */
  function mount() {
    if (layers) return;
    const bg = document.createElement("div");
    bg.id = "bg"; bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = `<div class="bg-img"></div><div class="bg-img"></div><div class="bg-veil"></div>`;
    document.body.prepend(bg);
    layers = [...bg.querySelectorAll(".bg-img")];
  }
  async function show(src) {
    const res = await caches.match(src);
    if (!res) return false;
    const url = URL.createObjectURL(await res.blob());
    await new Promise(ok => { const im = new Image(); im.onload = im.onerror = ok; im.src = url; }); // bez mignięcia pustego tła
    if (!enabled) { URL.revokeObjectURL(url); return false; }
    mount();
    front = 1 - front;
    layers[front].style.backgroundImage = `url("${url}")`;
    layers[front].classList.add("on");
    layers[1 - front].classList.remove("on");
    document.documentElement.classList.add("has-bg");
    current = src;
    urls.push(url);
    while (urls.length > 2) URL.revokeObjectURL(urls.shift()); // poprzednie zdjęcie znika płynnie, starsze można zwolnić
    return true;
  }

  // nowe losowe tło – wywoływane przy każdej zmianie ekranu (app.js → render)
  async function next() {
    if (!enabled || !self.caches) return;
    let have = await cachedKeys();
    if (have.length < MAX) { // w tle dociągnij kolejne (na początku 3, potem po jednym)
      const n = have.length < 3 ? 3 - have.length : 1;
      (async () => {
        for (let i = 0; i < n; i++) { const src = await downloadOne(await cachedKeys()); if (!src) break; if (!current) await show(src); }
      })();
    }
    if (!have.length) return;
    const choices = have.length > 1 ? have.filter(u => u !== current) : have;
    await show(choices[Math.floor(Math.random() * choices.length)]);
  }

  async function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem("podroznik-bg", on ? "1" : "0"); } catch (e) { /* brak dostępu */ }
    await DB.setSetting("bgPhotos", on);
    if (on) next();
    else {
      document.documentElement.classList.remove("has-bg");
      if (layers) layers.forEach(l => l.classList.remove("on"));
      current = null;
    }
  }
  async function info() {
    const [items, have] = await Promise.all([DB.getSetting("bgPool", null), cachedKeys()]);
    const cur = items && current ? items.items.find(x => x.src === current) : null;
    const ok = items && items.v === POOL_V;
    return { enabled, count: have.length, max: MAX, current: cur, pool: ok ? items.items.length : null, err: ok ? items.err || "" : "",
      saveData: !!(navigator.connection && navigator.connection.saveData) };
  }
  // „nie pokazuj tego zdjęcia” – na stałe (lista bgBlocked), od razu inne
  async function block(src = current) {
    if (!src) return;
    const list = await DB.getSetting("bgBlocked", []);
    if (!list.includes(src)) await DB.setSetting("bgBlocked", list.concat(src));
    const saved = await DB.getSetting("bgPool", null);
    if (saved) await DB.setSetting("bgPool", { ...saved, items: saved.items.filter(x => x.src !== src) });
    try { await (await caches.open(CACHE)).delete(src); } catch (e) { /* brak pamięci */ }
    current = null;
    await next();
  }
  async function clear() {
    await caches.delete(CACHE);
    document.documentElement.classList.remove("has-bg");
    current = null;
  }

  App.Backdrop = { next, setEnabled, info, clear, block, BAD, get enabled() { return enabled; } };
})();
