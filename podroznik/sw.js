/* Podróżnik – działanie offline.
   Pliki aplikacji: najpierw sieć (aktualizacje od razu), zapisana kopia gdy brak internetu.
   Przy każdej zmianie plików podbij numer CACHE. Dane użytkownika są w IndexedDB, nie tutaj. */
const CACHE = "podroznik-v3";
const APP = [
  "./", "./index.html", "./style.css", "./db.js", "./app.js", "./trips.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./tickets.js",
  // biblioteki do biletów – od razu w pamięci, żeby działały offline także za pierwszym razem
  "./lib/pdf.min.js", "./lib/pdf.worker.min.js", "./lib/bwip-js.min.js", "./lib/zxing.min.js",
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

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
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
