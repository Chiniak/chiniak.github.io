/* Podróżnik – baza danych w telefonie (IndexedDB).
   Wszystkie magazyny tworzone od razu w wersji 1, żeby kolejne etapy nie potrzebowały migracji.
   Użycie: await DB.put("trips", {...}); await DB.get("trips", id); await DB.all("trips");
           await DB.byIndex("segments", "tripId", id); await DB.del("trips", id);
           await DB.getSetting("theme", "auto"); await DB.setSetting("theme", "dark"); */
(function () {
  const NAME = "podroznik";
  const VERSION = 1;

  // magazyn -> indeksy (pole, po którym można szybko wyszukiwać)
  const STORES = {
    trips:     ["start"],                      // podróże: nazwa, cel, start, end, kolor
    segments:  ["tripId", "depart"],           // odcinki: lot, pociąg, autobus… oraz noclegi
    files:     ["segmentId", "tripId"],        // bilety: zdjęcia, PDF, kody QR (Blob)
    planItems: ["tripId", "date"],             // punkty planu dnia
    packItems: ["tripId"],                     // rzeczy do spakowania / zadania przed wyjazdem
    templates: [],                             // szablony list pakowania
    reminders: ["tripId", "at"],               // przypomnienia
  };

  let opening = null;
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, indexes] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const s = db.createObjectStore(name, { keyPath: "id" });
          for (const i of indexes) s.createIndex(i, i);
        }
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // aplikacja i service worker mają osobne połączenia – przy aktualizacji bazy zamknij stare
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      req.onerror = () => { opening = null; reject(req.error); };
      req.onblocked = () => console.warn("Baza zablokowana – zamknij inne karty z aplikacją.");
    });
    return opening;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const DB = {
    open,
    uid,
    stores: Object.keys(STORES).concat("settings"),
    async put(store, obj) {
      const now = new Date().toISOString();
      const rec = { ...obj, id: obj.id || uid(), updated: now, created: obj.created || now };
      await tx(store, "readwrite", s => s.put(rec));
      return rec;
    },
    get: (store, id) => tx(store, "readonly", s => s.get(id)),
    all: (store) => tx(store, "readonly", s => s.getAll()),
    byIndex: (store, index, value) => tx(store, "readonly", s => s.index(index).getAll(value)),
    del: (store, id) => tx(store, "readwrite", s => s.delete(id)),
    count: (store) => tx(store, "readonly", s => s.count()),
    // zapis bez zmiany dat (przywracanie kopii zapasowej)
    putRaw: (store, obj) => tx(store, "readwrite", s => s.put(obj)),
    clear: (store) => tx(store, "readwrite", s => s.clear()),
    async getSetting(key, fallback) {
      const r = await tx("settings", "readonly", s => s.get(key));
      return r ? r.value : fallback;
    },
    setSetting: (key, value) => tx("settings", "readwrite", s => s.put({ key, value })),
  };

  self.DB = DB; // self = okno albo service worker (sprawdzanie przypomnień w tle)
})();
