/* Futbol – działanie offline. Pliki aplikacji: najpierw sieć, kopia gdy brak internetu.
   Przy każdej zmianie plików podbij numer CACHE. Dane meczów są w localStorage. */
const CACHE = "futbol-v2";
const APP = ["./", "./index.html", "./style.css", "./model.js", "./data.js", "./app.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("futbol-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // dane z zewnątrz – bez pośrednictwa
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) (await caches.open(CACHE)).put(e.request, r.clone());
      return r;
    } catch {
      return (await caches.match(e.request)) || (await caches.match("./index.html"));
    }
  })());
});
