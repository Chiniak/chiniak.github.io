/* Podróżnik – działanie offline.
   Pliki aplikacji: najpierw sieć (aktualizacje od razu), zapisana kopia gdy brak internetu.
   Przy każdej zmianie plików podbij numer CACHE. Dane użytkownika są w IndexedDB, nie tutaj. */
// baza i wyliczanie przypomnień – do sprawdzania w tle (Periodic Background Sync)
importScripts("i18n-en.js", "i18n.js", "db.js", "reminders-core.js");

const CACHE = "podroznik-v35";
const APP = [
  "./", "./index.html", "./style.css", "./i18n-en.js", "./i18n.js", "./db.js", "./app.js", "./trips.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./tickets.js", "./plan.js", "./pack.js", "./reminders-core.js", "./reminders.js", "./backup.js", "./lock.js", "./docs.js", "./budget.js", "./stats.js", "./weather.js", "./email.js", "./places.js", "./discover.js", "./split.js", "./share.js", "./offline.js", "./phrases.js", "./photos.js", "./backdrop.js", "./prep.js", "./ocr.js",
  // biblioteki do biletów – od razu w pamięci, żeby działały offline także za pierwszym razem
  "./lib/pdf.min.js", "./lib/pdf.worker.min.js", "./lib/bwip-js.min.js", "./lib/zxing.min.js", "./lib/airports.js", "./lib/world.js", "./lib/leaflet.js", "./lib/leaflet.css", "./lib/images/layers.png", "./lib/images/layers-2x.png",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("podroznik-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* kafelki mapy (etap 10): obejrzane online zostają w telefonie – mapa działa potem bez internetu (np. w Azji bez roamingu).
   Tylko to, co było oglądane (bez masowego pobierania – zasady OpenStreetMap). Najwyżej ok. 4000 kafelków (~60 MB). */
const TILES = "mapa-kafelki", TILE_MAX = 4000;
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)$/;
let tileCount = null;
// klucz kafelka bez poddomeny (a/b/c/d.basemaps…) – ten sam kafelek nie jest zapisywany 4 razy;
// tak samo zapisuje kafelki „Mapa offline” (offline.js) w pamięciach „mapa-offline-<podróż>”
const canon = u => { const x = new URL(u); if (/basemaps\.cartocdn\.com$/.test(x.hostname)) x.hostname = "a.basemaps.cartocdn.com"; x.search = ""; return x.href; };
async function tileFetch(req) {
  const key = canon(req.url);
  const hit = await caches.match(key); // obejrzane albo pobrane na offline (wszystkie pamięci)
  if (hit) return hit;
  const c = await caches.open(TILES);
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") {
    await c.put(key, res.clone());
    if (tileCount == null) tileCount = (await c.keys()).length; else tileCount++;
    if (tileCount > TILE_MAX) { // usuń najstarsze
      const keys = await c.keys();
      for (const k of keys.slice(0, keys.length - TILE_MAX + 200)) await c.delete(k);
      tileCount = TILE_MAX - 200;
    }
  }
  return res;
}

/* odczyt tekstu ze zdjęć (ocr.js): ~6 MB, które się nie zmieniają – najpierw pamięć „ocr-pliki”
   (nie kasowana przy nowej wersji, nie zaczyna się od „podroznik-”), sieć tylko za pierwszym razem */
async function ocrFetch(req) {
  const c = await caches.open("ocr-pliki");
  const key = req.url.split("?")[0];
  const hit = await c.match(key);
  if (hit) return hit;
  const res = await fetch(key);
  if (res.ok) await c.put(key, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (TILE_HOSTS.test(url.hostname) && url.searchParams.has("podroznik-off")) return; // pobieranie „Mapa offline” – wprost z sieci
  if (TILE_HOSTS.test(url.hostname)) { e.respondWith(tileFetch(req).catch(() => Response.error())); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  if (url.pathname.endsWith(".apk")) return; // plik APK pobierany wprost, bez zapisu w pamięci offline
  if (url.pathname.includes("/lib/ocr/")) { e.respondWith(ocrFetch(req)); return; }
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(async () =>
        (await caches.match(req, { ignoreSearch: true })) ||
        (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
  );
});

/* ---------- przypomnienia ---------- */
const showReminder = async r => {
  if (self.Notification && Notification.permission !== "granted") return false;
  I18N.setLang(await DB.getSetting("lang", "auto")); // język z Ustawień (service worker nie widzi localStorage)
  await self.registration.showNotification(I18N.tr(r.title), {
    body: I18N.tr(r.body), tag: r.id, icon: "icon-192.png", badge: "icon-192.png", data: { href: r.href }, renotify: true,
  });
  return true;
};

// Chrome na Androidzie budzi zainstalowaną aplikację co jakiś czas (sam decyduje jak często – zwykle kilka razy na dobę)
self.addEventListener("periodicsync", e => {
  if (e.tag === "reminders") e.waitUntil(Reminders.check(showReminder).catch(err => console.warn(err)));
});

// aplikacja (otwarta) prosi o pokazanie powiadomienia
self.addEventListener("message", e => {
  if (e.data && e.data.type === "check-reminders") e.waitUntil(Reminders.check(showReminder));
});

// dotknięcie powiadomienia otwiera aplikację na właściwym ekranie
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(`./index.html#${(e.notification.data && e.notification.data.href) || "/podroze"}`, self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) { await w.focus(); return w.navigate ? w.navigate(url) : undefined; }
    }
    return clients.openWindow(url);
  })());
});
