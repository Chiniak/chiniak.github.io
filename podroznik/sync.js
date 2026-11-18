/* Tripwillow – wspólna podróż na żywo (jak wspólne planowanie w Wanderlog), z szyfrowaniem end-to-end.
   Jak to działa:
   - Podróż „udostępniona na żywo” ma pokój (room) w Firebase Firestore i klucz AES-256 – oba są tylko w linku zaproszenia
     (https://chiniak.github.io/podroznik/dolacz.html#POKOJ.KLUCZ – część po # nie trafia do żadnego serwera). Serwer nie zna klucza, więc widzi wyłącznie szyfr.
   - Każda zmiana (DB.put / DB.del w magazynach z listy STORES dla tej podróży) to „operacja” { s: magazyn, r: rekord }
     albo { s, id, del: 1, at }, zaszyfrowana i dopisana do rooms/{pokój}/ops/{id}. Nic nie jest nadpisywane ani kasowane.
   - Każdy telefon słucha operacji swojego pokoju i stosuje je u siebie: wygrywa nowszy rekord (pole „updated”).
     Stosowanie jest powtarzalne (ta sama operacja dwa razy nic nie psuje), więc po restarcie czytamy od „since” z zapasem.
   - Offline: Firestore trzyma zapisy w pamięci telefonu i wysyła je po powrocie sieci; dopóki Firebase się nie wczyta,
     operacje czekają w ustawieniu „sync.pending”.
   - Nie są wysyłane: bilety i zdjęcia (files), dziennik, przypomnienia – zostają tylko w telefonie.
   Konfiguracja projektu Firebase: sync-config.js (self.SYNC_CONFIG). Do testów: localStorage „podroznik-emu” = emulator. */
(function () {
  const STORES = ["trips", "segments", "planItems", "packItems", "expenses", "chat", "votes", "members"];
  const MAX_C = 190000; // limit długości szyfru jednej operacji (reguły Firestore: 200 000)

  const emu = () => { try { return localStorage.getItem("podroznik-emu"); } catch (e) { return null; } };
  const config = () => emu() ? { apiKey: "demo-key", projectId: "demo-podroznik", authDomain: "localhost", emulator: emu() } : self.SYNC_CONFIG || null;

  /* ---------- base64url i szyfrowanie ---------- */
  const b64u = bytes => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const keys = {};
  const cryptoKey = k => keys[k] || (keys[k] = crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"]));
  async function seal(k, obj) {
    const iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(k), new TextEncoder().encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64u(out);
  }
  async function open(k, c) {
    const b = unb64u(c);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, await cryptoKey(k), b.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  /* ---------- stan: pokoje (ustawienie „sync.rooms”), ja (urządzenie), imię ---------- */
  let rooms = {};            // tripId -> { room, key, since }
  let me = null;             // stały identyfikator tego telefonu w podróżach wspólnych
  let ready = null;
  const saveRooms = () => DB.setSetting("sync.rooms", rooms);
  function init() {
    return ready || (ready = (async () => {
      rooms = await DB.getSetting("sync.rooms", {}) || {};
      me = await DB.getSetting("sync.me", null);
      if (!me) { me = b64u(rand(9)); await DB.setSetting("sync.me", me); }
    })());
  }
  const myName = () => DB.getSetting("myName", "");

  /* ---------- Firebase (wczytywany dopiero, gdy jest wspólna podróż) ---------- */
  let fb = null;
  function firebaseReady() {
    if (fb) return fb;
    fb = (async () => {
      const cfg = config();
      if (!cfg) throw Object.assign(new Error("Wspólne planowanie nie jest jeszcze włączone w tej wersji aplikacji."), { code: "noconfig" });
      for (const m of ["app", "auth", "firestore"]) await App.loadScript(`lib/firebase/firebase-${m}-compat.js`);
      const { emulator, ...opts } = cfg;
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(opts);
      const auth = app.auth(), db = app.firestore();
      if (emulator) {
        auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
        db.useEmulator("127.0.0.1", 8085);
      }
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { console.warn("Firestore offline:", e.code || e); }
      await new Promise(r => { const off = auth.onAuthStateChanged(() => { off(); r(); }); });
      if (!auth.currentUser) await auth.signInAnonymously(); // bez konta – anonimowy identyfikator wymagany przez reguły
      return { auth, db, ts: firebase.firestore.Timestamp, now: firebase.firestore.FieldValue.serverTimestamp };
    })();
    fb.catch(() => { fb = null; });
    return fb;
  }

  /* ---------- wysyłanie ---------- */
  const opsRef = (f, room) => f.db.collection("rooms").doc(room).collection("ops");
  let flushing = null;
  // kolejka „sync.pending” – każdy odczyt+zapis po kolei (równoczesne zmiany nie mogą się nadpisać)
  let lock = Promise.resolve();
  const locked = fn => (lock = lock.then(fn, fn));
  const addPending = items => locked(async () => {
    await DB.setSetting("sync.pending", (await DB.getSetting("sync.pending", []) || []).concat(items));
  });
  function enqueue(tripId, op) {
    const done = addPending([{ tripId, op }]);
    done.then(() => flush());
    return done;
  }
  function flush() {
    if (flushing) return flushing.then(() => flush());
    flushing = (async () => {
      await lock; // najpierw dopisz zmiany, które właśnie weszły do kolejki
      const pending = await DB.getSetting("sync.pending", []) || [];
      if (!pending.length) return;
      const f = await firebaseReady();
      for (let i = 0; i < pending.length; i += 400) {
        const batch = f.db.batch();
        let n = 0;
        for (const p of pending.slice(i, i + 400)) {
          const info = rooms[p.tripId];
          if (!info) continue; // podróż przestała być wspólna
          const c = await seal(info.key, p.op);
          if (c.length > MAX_C) { console.warn("Za duża zmiana – pominięta", p.op.s); continue; }
          batch.set(opsRef(f, info.room).doc(b64u(rand(12))), { by: f.auth.currentUser.uid, t: f.now(), c, v: 1 });
          n++;
        }
        // zapis trafia od razu do pamięci Firestore w telefonie (offline poczeka); nie czekamy na potwierdzenie serwera
        if (n) batch.commit().catch(e => console.warn("Wysyłanie zmian:", e.code || e));
      }
      // w trakcie wysyłania mogły dojść nowe zmiany (enqueue dopisuje na końcu) – zostaw je
      await locked(async () => DB.setSetting("sync.pending", (await DB.getSetting("sync.pending", []) || []).slice(pending.length)));
    })().catch(e => { if (e.code !== "noconfig") console.warn("Synchronizacja:", e.message || e); })
      .finally(() => { flushing = null; });
    return flushing;
  }

  DB.watch((store, rec, deleted) => {
    if (!STORES.includes(store) || !rec) return; // zmiany od innych zapisuje putRaw/delRaw – bez powiadomienia, więc nie wracają
    const tripId = store === "trips" ? rec.id : rec.tripId;
    if (!tripId || !rooms[tripId]) return;
    if (deleted && store === "trips") return; // usunięcie podróży u siebie = wyjście z niej (leave), nie kasowanie innym
    enqueue(tripId, deleted ? { s: store, id: rec.id, del: 1, at: new Date().toISOString() } : { s: store, r: rec });
  });

  /* ---------- odbieranie ---------- */
  const listeners = new Set(); // fn(tripId, zmienione magazyny) – ekrany odświeżają się po zmianach od innych
  async function apply(tripId, op) {
    if (!op || !STORES.includes(op.s)) return false;
    const id = op.del ? op.id : op.r && op.r.id;
    if (!id || (op.s === "trips" ? id !== tripId : !op.del && op.r.tripId !== tripId)) return false; // tylko ta podróż
    const cur = await DB.get(op.s, id);
    if (op.del) {
      if (op.s === "trips" || !cur || cur.tripId !== tripId || (cur.updated || "") > op.at) return false;
      await DB.delRaw(op.s, id);
      return true;
    }
    if (cur && (cur.updated || "") >= (op.r.updated || "")) return false;
    await DB.putRaw(op.s, op.r);
    return true;
  }

  const subs = {}; // tripId -> funkcja wyłączająca nasłuch
  async function listen(tripId) {
    if (subs[tripId]) return;
    const info = rooms[tripId];
    const f = await firebaseReady();
    if (!rooms[tripId] || subs[tripId]) return;
    const since = Math.max(0, (info.since || 0) - 120000); // zapas 2 min – powtórzenie operacji jest nieszkodliwe
    let chain = Promise.resolve();
    subs[tripId] = opsRef(f, info.room).where("t", ">=", f.ts.fromMillis(since)).orderBy("t")
      .onSnapshot({ includeMetadataChanges: false }, snap => {
        const docs = snap.docChanges().filter(ch => ch.type === "added" && !ch.doc.metadata.hasPendingWrites).map(ch => ch.doc.data());
        if (!docs.length) return;
        chain = chain.then(async () => {
          const changed = new Set();
          let maxT = info.since || 0;
          for (const d of docs) {
            if (d.t && d.t.toMillis() > maxT) maxT = d.t.toMillis();
            let op;
            try { op = await open(info.key, d.c); } catch (e) { continue; } // nie nasz klucz / uszkodzone
            if (await apply(tripId, op)) changed.add(op.s);
          }
          if (rooms[tripId] && maxT > (rooms[tripId].since || 0)) { rooms[tripId].since = maxT; await saveRooms(); }
          if (changed.size) for (const fn of listeners) try { fn(tripId, changed); } catch (e) { console.warn(e); }
        });
      }, e => { console.warn("Nasłuch podróży:", e.code || e); delete subs[tripId]; });
  }

  async function start() {
    await init();
    const ids = Object.keys(rooms);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map(listen));
      flush();
    } catch (e) { if (e.code !== "noconfig") console.warn("Synchronizacja:", e.message || e); }
  }
  // po powrocie sieci – ponów wczytanie Firebase (np. pierwsze logowanie anonimowe offline się nie udało)
  window.addEventListener("online", () => { if (Object.keys(rooms).length) start(); });

  /* ---------- udostępnianie, dołączanie, wyjście ---------- */
  const SHARED = ["segments", "planItems", "packItems", "expenses"];
  const link = info => `https://chiniak.github.io/podroznik/dolacz.html#${info.room}.${info.key}`;

  async function addPerson(tripId, name) {
    const t = await DB.get("trips", tripId);
    if (!t || !name) return;
    const people = t.people || [];
    if (!people.some(p => p.trim().toLowerCase() === name.trim().toLowerCase())) await DB.put("trips", { ...t, people: people.concat(name.trim()) });
  }
  async function hello(tripId, name, text) {
    await DB.put("members", { id: `${tripId}:${me}`, tripId, by: me, name });
    if (text) await DB.put("chat", { tripId, at: new Date().toISOString(), by: me, name, sys: 1, text });
  }

  async function share(tripId) {
    await init();
    if (rooms[tripId]) return link(rooms[tripId]);
    const name = await myName();
    await firebaseReady(); // najpierw sprawdź, czy Firebase działa – dopiero potem zakładaj pokój
    rooms[tripId] = { room: b64u(rand(15)), key: b64u(rand(32)), since: Date.now(), owner: true };
    await saveRooms();
    // cała podróż do pokoju (bez biletów i zdjęć)
    const ops = [{ s: "trips", r: await DB.get("trips", tripId) }];
    for (const st of SHARED) for (const r of await DB.byIndex(st, "tripId", tripId)) ops.push({ s: st, r });
    await addPending(ops.map(op => ({ tripId, op })));
    await addPerson(tripId, name);
    await hello(tripId, name, "zaczyna wspólne planowanie");
    await flush();
    listen(tripId).catch(e => console.warn(e));
    return link(rooms[tripId]);
  }

  // link (cały albo sama końcówka POKOJ.KLUCZ) -> { room, key }
  function parse(text) {
    const m = /([\w-]{16,32})\.([\w-]{43})(?![\w-])/.exec(String(text || "").trim());
    return m ? { room: m[1], key: m[2] } : null;
  }

  async function join(text, name) {
    await init();
    const inv = parse(text);
    if (!inv) throw new Error("To nie jest link zaproszenia do podróży.");
    for (const [id, r] of Object.entries(rooms)) if (r.room === inv.room) return { tripId: id, already: true };
    const f = await firebaseReady();
    const snap = await opsRef(f, inv.room).orderBy("t").get({ source: "server" });
    const ops = [];
    let maxT = 0;
    for (const d of snap.docs) {
      const x = d.data();
      if (x.t && x.t.toMillis() > maxT) maxT = x.t.toMillis();
      try { ops.push(await open(inv.key, x.c)); } catch (e) { /* cudzy szyfr */ }
    }
    const first = ops.find(o => o.s === "trips" && o.r);
    if (!first) throw new Error(snap.empty ? "Nie ma takiej podróży – link jest nieaktualny albo niepełny." : "Nie da się odczytać podróży – link jest niepełny.");
    const tripId = first.r.id;
    for (const op of ops) await apply(tripId, op);
    rooms[tripId] = { room: inv.room, key: inv.key, since: maxT };
    await saveRooms();
    await DB.setSetting("myName", name);
    await addPerson(tripId, name);
    await hello(tripId, name, "dołącza do podróży");
    listen(tripId).catch(e => console.warn(e));
    return { tripId, already: false };
  }

  async function leave(tripId) {
    await init();
    if (!rooms[tripId]) return;
    const name = await myName();
    try {
      await DB.put("members", { id: `${tripId}:${me}`, tripId, by: me, name, left: 1 });
      await DB.put("chat", { tripId, at: new Date().toISOString(), by: me, name, sys: 1, text: "opuszcza wspólną podróż" });
      await flush();
    } catch (e) { console.warn(e); }
    if (subs[tripId]) { subs[tripId](); delete subs[tripId]; }
    delete rooms[tripId];
    await saveRooms();
    await DB.setSetting(`chatRead.${tripId}`, null);
  }

  /* ---------- pomocniki dla ekranów ---------- */
  const isShared = async tripId => { await init(); return !!rooms[tripId]; };
  async function unread(tripId) {
    await init();
    if (!rooms[tripId]) return 0;
    const read = await DB.getSetting(`chatRead.${tripId}`, "") || "";
    return (await DB.byIndex("chat", "tripId", tripId)).filter(m => m.by !== me && !m.sys && (m.at || "") > read).length;
  }

  App.Sync = {
    STORES, init, start, share, join, leave, parse, isShared, unread, myName,
    me: () => me,
    link: tripId => rooms[tripId] ? link(rooms[tripId]) : null,
    configured: () => !!config(),
    on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    flush,
    firebase: firebaseReady, b64u, unb64u, rand, // znajomi (social.js)
    _seal: seal, _open: open, // testy
  };

  document.addEventListener("DOMContentLoaded", () => { setTimeout(start, 300); });
})();
