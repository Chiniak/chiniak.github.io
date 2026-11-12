/* Podróżnik – tło ze zdjęć: przy każdym przejściu na inny ekran losowe zdjęcie z podróży (krajobrazy, miasta, Azja…).
   Zdjęcia: „Featured pictures” z Wikimedia Commons (wolne licencje, autor widoczny w Ustawieniach → Tło).
   Lista kandydatów (ustawienie `bgPool`) pobierana raz na 30 dni; same zdjęcia (~1000 px) pobierane po jednym
   przy kolejnych przejściach, aż będzie ich 100 – w pamięci „tla-zdjecia” (działa offline, nie kasuje jej nowa wersja aplikacji).
   Ustawienie `bgPhotos` (domyślnie włączone; `localStorage podroznik-bg` – żeby nie mignęło przy starcie). */
(function () {
  const CACHE = "tla-zdjecia", MAX = 100, WIDTH = 1000, POOL_AGE = 30 * 86400000;
  const TERMS = ["landscape", "mountains", "beach", "temple", "Thailand", "Vietnam", "Laos", "China", "Japan", "lake", "waterfall",
    "sunset", "island", "old town", "rice terraces", "desert", "harbour", "castle", "Poland", "Alps", "Norway", "Iceland", "Italy",
    "Portugal", "Spain", "Greece", "canyon", "forest", "coast", "skyline", "bridge", "volcano", "Bangkok", "Hanoi", "Luang Prabang", "Halong"];
  const META = /\b(diagram|map|chart|logo|coat of arms|flag|portrait|nude|insect|spider|microscop|x-ray|anatomy|skull)\b/i;

  let enabled = true;
  try { enabled = localStorage.getItem("podroznik-bg") !== "0"; } catch (e) { /* brak dostępu */ }
  let layers = null, front = 0, current = null, urls = [], busy = false;

  /* ---------- lista kandydatów z Commons ---------- */
  async function query(term) {
    const r = await fetch("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: "25",
      gsrsearch: `incategory:Featured_pictures_on_Wikimedia_Commons filetype:bitmap ${term}`,
      prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: String(WIDTH), iiextmetadatafilter: "Artist|LicenseShortName|ObjectName" }));
    if (!r.ok) throw new Error(`Commons ${r.status}`);
    const j = await r.json();
    const strip = h => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    return Object.values((j.query && j.query.pages) || {}).map(p => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.thumburl || !/\.(jpe?g|png|webp|tiff?)$/i.test(p.title) || META.test(p.title) || ii.width < 1200 || ii.height < 700) return null;
      const m = ii.extmetadata || {};
      return { src: ii.thumburl, page: ii.descriptionurl, title: strip(m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:|\.\w+$/g, "").replace(/_/g, " "),
        by: [strip(m.Artist && m.Artist.value), strip(m.LicenseShortName && m.LicenseShortName.value)].filter(Boolean).join(", ") };
    }).filter(Boolean);
  }
  async function pool() {
    const saved = await DB.getSetting("bgPool", null);
    if (saved && saved.items.length >= MAX && Date.now() - saved.at < POOL_AGE) return saved.items;
    if (!navigator.onLine) return saved ? saved.items : [];
    const seen = new Map((saved ? saved.items : []).map(x => [x.src, x]));
    const terms = TERMS.slice().sort(() => Math.random() - 0.5);
    for (const t of terms) {
      if (seen.size >= MAX * 1.5) break;
      try { for (const x of await query(t)) if (!seen.has(x.src)) seen.set(x.src, x); } catch (e) { break; }
    }
    const items = [...seen.values()];
    await DB.setSetting("bgPool", { at: Date.now(), items });
    return items;
  }

  /* ---------- pobieranie po jednym ---------- */
  async function cachedKeys() {
    try { return (await (await caches.open(CACHE)).keys()).map(r => r.url); } catch (e) { return []; }
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
    return { enabled, count: have.length, max: MAX, current: cur };
  }
  async function clear() {
    await caches.delete(CACHE);
    document.documentElement.classList.remove("has-bg");
    current = null;
  }

  App.Backdrop = { next, setEnabled, info, clear, get enabled() { return enabled; } };
})();
