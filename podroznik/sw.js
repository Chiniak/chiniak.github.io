/* Podróżnik – działanie offline.
   Pliki aplikacji: najpierw sieć (aktualizacje od razu), zapisana kopia gdy brak internetu.
   Przy każdej zmianie plików podbij numer CACHE. Dane użytkownika są w IndexedDB, nie tutaj. */
// baza i wyliczanie przypomnień – do sprawdzania w tle (Periodic Background Sync)
importScripts("db.js", "reminders-core.js");

const CACHE = "podroznik-v8";
const APP = [
  "./", "./index.html", "./style.css", "./db.js", "./app.js", "./trips.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./tickets.js", "./plan.js", "./pack.js", "./reminders-core.js", "./reminders.js", "./backup.js", "./lock.js", "./docs.js",
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

/* ---------- przypomnienia ---------- */
const showReminder = async r => {
  if (self.Notification && Notification.permission !== "granted") return false;
  await self.registration.showNotification(r.title, {
    body: r.body, tag: r.id, icon: "icon-192.png", badge: "icon-192.png", data: { href: r.href }, renotify: true,
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
