/* Podróżnik – znajomi: profil, zaproszenia, czat 1:1 i podróże widoczne dla innych (rdzeń; ekrany: znajomi.js).
   Ten sam projekt Firebase co wspólne planowanie (sync.js: anonimowe logowanie, Firestore).

   Szyfrowanie end-to-end:
   – każdy telefon ma parę kluczy ECDH P-256 (prywatny tylko w telefonie, ustawienie „social.keys”); publiczny jest w profilu,
   – czat i lista podróży dla znajomego: AES-256-GCM kluczem z ECDH (moje prywatne + jego publiczne) – serwer widzi tylko szyfr,
   – każda udostępniona podróż ma własny losowy klucz; znajomi dostają go w zaszyfrowanej dla nich liście, podróż publiczna
     ma klucz w linku (część po # – nie trafia do serwera).
   Na serwerze jawne są tylko: imię w profilu, klucz publiczny, kto komu wysłał zaproszenie, kto z kim pisze i kiedy.

   Firestore (reguły: podroznik-app/firebase/firestore.rules):
     people/{uid}                     { name, pub, v }                    profil (odczyt: zalogowani, po identyfikatorze)
     people/{uid}/inbox/{from}        { kind: req|ok|bye, name, pub, t }  zaproszenia (czyta tylko właściciel)
     dm/{uidA_uidB}/msgs/{id}         { by, t, c, v }                     czat (tylko te dwie osoby)
     pub/{uid}/trips/{doc}            { c, t, v }                          zaszyfrowana migawka podróży
     pub/{uid}/keys/{friendUid}       { c, t, v }                          klucze podróży „dla znajomych” zaszyfrowane dla znajomego

   Widoczność podróży: private (tylko ja) · friends (znajomi) · public (każdy z linkiem, także znajomi).
   Migawka „bez szczegółów”: nazwa, cel, termin, trasa (skąd–dokąd, godziny), noclegi (nazwa, miasto), plan dni i pomysły
   (nazwa, godzina, kategoria, miejsce). Bez biletów, kodów rezerwacji, cen, notatek, dokumentów, wydatków i dziennika. */
(function () {
  const S = () => App.Sync;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const LINK = "https://chiniak.github.io/podroznik/dolacz.html#";

  /* ---------- stan lokalny ---------- */
  let st = null; // { friends: {uid: {name, pub, state: out|in|ok, since}}, trips: {tripId: {vis, doc, key}}, since: {uid: iso}, read: {uid: iso} }
  let loading = null;
  const load = () => loading || (loading = (async () => {
    st = Object.assign({ friends: {}, trips: {}, since: {}, read: {} }, await DB.getSetting("social", {}) || {});
  })());
  const save = () => { scheduleVault(); return DB.setSetting("social", st); };
  const listeners = new Set();
  const emit = (what, data) => { for (const fn of listeners) try { fn(what, data); } catch (e) { console.warn(e); } };

  /* ---------- klucze ---------- */
  let myKeys = null;
  async function keys() {
    if (myKeys) return myKeys;
    let k = await DB.getSetting("social.keys", null);
    if (!k) {
      const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
      k = { priv: await crypto.subtle.exportKey("jwk", pair.privateKey), pub: await crypto.subtle.exportKey("jwk", pair.publicKey) };
      await DB.setSetting("social.keys", k);
    }
    myKeys = { priv: await crypto.subtle.importKey("jwk", k.priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]), pub: JSON.stringify({ x: k.pub.x, y: k.pub.y }) };
    return myKeys;
  }
  const shared = {};
  async function sharedKey(peerPub) {
    if (shared[peerPub]) return shared[peerPub];
    const { x, y } = JSON.parse(peerPub);
    const pub = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return (shared[peerPub] = crypto.subtle.deriveKey({ name: "ECDH", public: pub }, (await keys()).priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
  }
  const rawKey = k => crypto.subtle.importKey("raw", S().unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"]);
  async function seal(key, obj) {
    const iv = S().rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return S().b64u(out);
  }
  async function unseal(key, c) {
    const b = S().unb64u(c);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, key, b.subarray(12))));
  }

  /* ---------- Firebase ---------- */
  const fb = () => S().firebase();
  const uid = async () => (await fb()).auth.currentUser.uid;
  const conv = (a, b) => [a, b].sort().join("_");
  const myName = async () => (await DB.getSetting("myName", "")) || "";
  let profileDone = null;
  async function profile() {
    const f = await fb(), me = f.auth.currentUser.uid, name = (await myName()).slice(0, 40), pub = (await keys()).pub;
    const key = `${me}|${name}|${pub}`;
    if (profileDone === key) return me;
    await f.db.collection("people").doc(me).set({ name, pub, v: 1 });
    profileDone = key;
    return me;
  }
  const available = () => !!(S() && S().configured());

  /* ---------- znajomi ---------- */
  const myLink = async () => LINK + "z." + await profile();
  // identyfikator osoby z linku, kodu z QR albo samego identyfikatora
  function parseFriend(text) {
    const m = /(?:#|^|\s)z\.([A-Za-z0-9]{20,40})(?![\w-])/.exec(String(text || "")) || /^\s*([A-Za-z0-9]{20,40})\s*$/.exec(String(text || ""));
    return m ? m[1] : null;
  }
  async function person(id) {
    const d = await (await fb()).db.collection("people").doc(id).get();
    return d.exists ? d.data() : null;
  }
  async function send(to, kind) {
    const f = await fb(), me = await profile();
    await f.db.collection("people").doc(to).collection("inbox").doc(me).set({ kind, name: (await myName()).slice(0, 40), pub: (await keys()).pub, t: f.now() });
  }
  async function addFriend(id) {
    await load();
    const me = await profile();
    if (id === me) throw Object.assign(new Error("To Twój własny kod."), { code: "self" });
    const p = await person(id);
    if (!p || !p.pub) throw Object.assign(new Error("Nie ma takiej osoby w Podróżniku."), { code: "missing" });
    const cur = st.friends[id];
    if (cur && cur.state === "ok") return cur;
    const mutual = cur && cur.state === "in"; // ta osoba już mnie zaprosiła – od razu znajomi
    st.friends[id] = { name: p.name || "", pub: p.pub, state: mutual ? "ok" : "out", since: new Date().toISOString() };
    await save();
    await send(id, mutual ? "ok" : "req");
    if (mutual) { await (await fb()).db.collection("people").doc(me).collection("inbox").doc(id).delete().catch(() => {}); await keyMaps(); startChat(id); }
    emit("friends");
    return st.friends[id];
  }
  async function accept(id) {
    await load();
    const fr = st.friends[id];
    if (!fr || fr.state !== "in") return;
    fr.state = "ok"; fr.since = new Date().toISOString();
    await save();
    await send(id, "ok");
    const me = await profile();
    await (await fb()).db.collection("people").doc(me).collection("inbox").doc(id).delete().catch(() => {});
    await keyMaps(); startChat(id);
    emit("friends");
  }
  async function remove(id) {
    await load();
    const fr = st.friends[id];
    if (!fr) return;
    const f = await fb(), me = await profile();
    delete st.friends[id]; delete st.since[id]; delete st.read[id];
    await save();
    if (chats[id]) { chats[id](); delete chats[id]; }
    await f.db.collection("people").doc(me).collection("inbox").doc(id).delete().catch(() => {});
    await f.db.collection("pub").doc(me).collection("keys").doc(id).delete().catch(() => {});
    if (fr.state !== "in") await send(id, "bye").catch(() => {});
    for (const m of await DB.byIndex("dms", "peer", id)) await DB.delRaw("dms", m.id);
    emit("friends");
  }
  async function rename(name) {
    await DB.setSetting("myName", String(name || "").trim().slice(0, 40));
    await profile();
    // znajomi zobaczą nowe imię przy następnym zaproszeniu – wyślij im odświeżenie
    for (const [id, fr] of Object.entries(st.friends)) if (fr.state === "ok") send(id, "ok").catch(() => {});
  }

  // skrzynka zaproszeń
  let inboxOff = null;
  async function listenInbox() {
    if (inboxOff) return;
    const f = await fb(), me = await profile();
    inboxOff = f.db.collection("people").doc(me).collection("inbox").onSnapshot(async snap => {
      await load();
      let changed = false;
      for (const ch of snap.docChanges()) {
        if (ch.type === "removed") continue;
        const from = ch.doc.id, d = ch.doc.data(), cur = st.friends[from];
        if (d.kind === "req") {
          if (cur && cur.state === "out") { // obie strony się zaprosiły
            Object.assign(cur, { state: "ok", name: d.name || cur.name, pub: d.pub || cur.pub });
            send(from, "ok").catch(() => {});
            ch.doc.ref.delete().catch(() => {});
            keyMaps(); startChat(from);
          } else if (cur && cur.state === "ok") { Object.assign(cur, { name: d.name || cur.name, pub: d.pub || cur.pub }); send(from, "ok").catch(() => {}); ch.doc.ref.delete().catch(() => {}); }
          else st.friends[from] = { name: d.name || "", pub: d.pub, state: "in", since: new Date().toISOString() };
          changed = true;
        } else if (d.kind === "ok") {
          if (cur && (cur.state === "out" || cur.state === "ok")) {
            const was = cur.state;
            Object.assign(cur, { state: "ok", name: d.name || cur.name, pub: d.pub || cur.pub });
            if (was === "out") { keyMaps(); startChat(from); emit("accepted", { id: from, name: cur.name }); }
            changed = true;
          }
          ch.doc.ref.delete().catch(() => {});
        } else if (d.kind === "bye") {
          if (cur) {
            delete st.friends[from]; delete st.since[from]; delete st.read[from];
            if (chats[from]) { chats[from](); delete chats[from]; }
            f.db.collection("pub").doc(me).collection("keys").doc(from).delete().catch(() => {}); // przestaje widzieć moje podróże
            changed = true;
          }
          ch.doc.ref.delete().catch(() => {});
        }
      }
      if (changed) { await save(); emit("friends"); }
    }, e => console.warn("zaproszenia:", e.code || e));
  }

  /* ---------- czat ---------- */
  const chats = {};
  async function startChat(id) {
    await load();
    const fr = st.friends[id];
    if (!fr || fr.state !== "ok" || chats[id]) return;
    const f = await fb(), me = await profile(), key = await sharedKey(fr.pub);
    const since = st.since[id] ? new Date(Date.parse(st.since[id]) - 120000) : new Date(0);
    chats[id] = f.db.collection("dm").doc(conv(me, id)).collection("msgs").where("t", ">=", f.ts.fromDate(since)).orderBy("t")
      .onSnapshot(async snap => {
        let last = st.since[id] || "", got = [];
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added" && ch.type !== "modified") continue;
          const d = ch.doc.data();
          if (!d.t) continue; // własna, jeszcze bez czasu serwera – zapisana lokalnie przy wysłaniu
          try {
            const m = await unseal(key, d.c);
            const rec = { id: ch.doc.id, peer: id, by: d.by === me ? "me" : id, at: m.at || d.t.toDate().toISOString(), text: String(m.text || "").slice(0, 4000) };
            if (!(await DB.get("dms", rec.id))) { await DB.putRaw("dms", rec); if (rec.by !== "me") got.push(rec); }
            const ts = d.t.toDate().toISOString(); if (ts > last) last = ts;
          } catch (e) { console.warn("czat: nie da się odszyfrować", e); }
        }
        if (last && last !== st.since[id]) { st.since[id] = last; save(); }
        if (got.length) emit("message", { id, name: fr.name, msgs: got });
      }, e => console.warn("czat:", e.code || e));
  }
  async function sendMessage(id, text) {
    await load();
    const fr = st.friends[id];
    if (!fr || fr.state !== "ok") throw new Error("To nie jest Twój znajomy.");
    text = String(text || "").trim().slice(0, 4000);
    if (!text) return null;
    const f = await fb(), me = await profile(), at = new Date().toISOString();
    const ref = f.db.collection("dm").doc(conv(me, id)).collection("msgs").doc();
    const rec = { id: ref.id, peer: id, by: "me", at, text };
    await DB.putRaw("dms", rec);
    ref.set({ by: me, t: f.now(), c: await seal(await sharedKey(fr.pub), { text, at }), v: 1 }).catch(e => console.warn("czat: wysyłanie", e));
    return rec;
  }
  async function messages(id) { return (await DB.byIndex("dms", "peer", id)).sort((a, b) => a.at.localeCompare(b.at)); }
  async function markRead(id) { await load(); st.read[id] = new Date().toISOString(); await save(); }
  async function unread(id) {
    await load();
    const r = st.read[id] || "";
    return (await DB.byIndex("dms", "peer", id)).filter(m => m.by !== "me" && m.at > r).length;
  }
  async function unreadAll() {
    await load();
    let n = 0;
    for (const [id, fr] of Object.entries(st.friends)) { if (fr.state === "ok") n += await unread(id); else if (fr.state === "in") n++; }
    return n;
  }

  /* ---------- podróże widoczne dla innych ---------- */
  const VIS = ["private", "friends", "public"];
  async function snapshot(tripId) {
    const [t, segs, items] = await Promise.all([DB.get("trips", tripId), DB.byIndex("segments", "tripId", tripId), DB.byIndex("planItems", "tripId", tripId)]);
    if (!t) return null;
    const num = v => (typeof v === "number" && isFinite(v) ? v : undefined);
    return {
      v: 1, owner: (await myName()).slice(0, 40), updated: new Date().toISOString(),
      trip: { name: t.name || "", destination: t.destination || "", start: t.start, end: t.end, color: t.color || "" },
      segs: segs.filter(s => s.type !== "nocleg" || s.depart).map(s => s.type === "nocleg"
        ? { type: "nocleg", name: (s.name || "").slice(0, 120), city: (s.city || "").slice(0, 80), depart: s.depart || "", arrive: s.arrive || "" }
        : { type: s.type || "inne", from: (s.from || "").slice(0, 120), to: (s.to || "").slice(0, 120), depart: s.depart || "", arrive: s.arrive || "", number: (s.number || "").slice(0, 20) }),
      items: items.map(i => ({ date: i.date || "", time: i.time || "", title: (i.title || "").slice(0, 120), cat: i.cat || "inne",
        place: /^https?:/i.test(i.place || "") ? "" : (i.place || "").slice(0, 200), lat: num(i.lat), lon: num(i.lon), order: num(i.order) })),
    };
  }
  async function setVisibility(tripId, vis) {
    if (!VIS.includes(vis)) return;
    await load();
    const f = await fb(), me = await profile();
    const cur = st.trips[tripId] || { doc: S().b64u(S().rand(9)), key: S().b64u(S().rand(32)) };
    if (vis === "private") {
      if (st.trips[tripId]) await f.db.collection("pub").doc(me).collection("trips").doc(cur.doc).delete().catch(() => {});
      delete st.trips[tripId];
      await save();
    } else {
      // przejście z „publicznej” na „dla znajomych”: nowy klucz i nowy dokument, żeby stary link przestał działać
      if (st.trips[tripId] && st.trips[tripId].vis === "public" && vis === "friends") {
        await f.db.collection("pub").doc(me).collection("trips").doc(cur.doc).delete().catch(() => {});
        cur.doc = S().b64u(S().rand(9)); cur.key = S().b64u(S().rand(32));
      }
      st.trips[tripId] = { ...cur, vis };
      await save();
      await publish(tripId);
    }
    await keyMaps();
    emit("visibility", { tripId, vis });
  }
  const visibility = async tripId => { await load(); return (st.trips[tripId] && st.trips[tripId].vis) || "private"; };
  const publicLink = async tripId => { await load(); const r = st.trips[tripId]; return r && r.vis === "public" ? `${LINK}p.${await profile()}.${r.doc}.${r.key}` : null; };
  async function publish(tripId) {
    const r = st.trips[tripId];
    if (!r) return;
    const snap = await snapshot(tripId);
    if (!snap) return setVisibility(tripId, "private");
    const f = await fb(), me = await profile();
    await f.db.collection("pub").doc(me).collection("trips").doc(r.doc).set({ c: await seal(await rawKey(r.key), snap), t: f.now(), v: 1 });
  }
  // lista podróży (dla znajomych i publicznych) dla każdego znajomego – zaszyfrowana jego kluczem
  async function keyMaps() {
    await load();
    const f = await fb(), me = await profile();
    const list = Object.values(st.trips).filter(r => r.vis === "friends" || r.vis === "public").map(r => ({ doc: r.doc, key: r.key }));
    for (const [id, fr] of Object.entries(st.friends)) {
      if (fr.state !== "ok") continue;
      try { await f.db.collection("pub").doc(me).collection("keys").doc(id).set({ c: await seal(await sharedKey(fr.pub), { trips: list }), t: f.now(), v: 1 }); }
      catch (e) { console.warn("lista podróży dla znajomego:", e.code || e); }
    }
  }
  // zmiany w udostępnionej podróży → nowa migawka (najwyżej co kilka sekund)
  const timers = {};
  function schedule(tripId) {
    if (!st || !st.trips[tripId]) return;
    clearTimeout(timers[tripId]);
    timers[tripId] = setTimeout(() => { delete timers[tripId]; publish(tripId).catch(e => console.warn("publikacja podróży:", e.code || e)); }, 4000);
  }
  DB.watch((store, rec, deleted) => {
    if (!st || !rec) return;
    if (store === "trips") { if (deleted) { if (st.trips[rec.id]) setVisibility(rec.id, "private").catch(() => {}); } else schedule(rec.id); }
    else if ((store === "segments" || store === "planItems") && rec.tripId) schedule(rec.tripId);
  });

  // podróże znajomego (z pamięci podręcznej, gdy nie ma internetu)
  async function friendTrips(id) {
    await load();
    const fr = st.friends[id];
    if (!fr || fr.state !== "ok") return [];
    const cacheKey = `social.cache.${id}`;
    try {
      const f = await fb(), me = await profile();
      const kd = await f.db.collection("pub").doc(id).collection("keys").doc(me).get();
      if (!kd.exists) { await DB.setSetting(cacheKey, []); return []; }
      const { trips = [] } = await unseal(await sharedKey(fr.pub), kd.data().c);
      const out = [];
      for (const r of trips) {
        const d = await f.db.collection("pub").doc(id).collection("trips").doc(r.doc).get().catch(() => null);
        if (!d || !d.exists) continue;
        try { out.push({ doc: r.doc, ...(await unseal(await rawKey(r.key), d.data().c)) }); } catch (e) { console.warn(e); }
      }
      await DB.setSetting(cacheKey, out);
      return out;
    } catch (e) {
      const cached = await DB.getSetting(cacheKey, null);
      if (cached) return Object.assign(cached, { offline: true });
      throw e;
    }
  }
  function parsePublic(text) {
    const m = /p\.([A-Za-z0-9]{20,40})\.([\w-]{12})\.([\w-]{43})(?![\w-])/.exec(String(text || ""));
    return m ? { uid: m[1], doc: m[2], key: m[3] } : null;
  }
  async function publicTrip({ uid: owner, doc, key }) {
    const d = await (await fb()).db.collection("pub").doc(owner).collection("trips").doc(doc).get();
    if (!d.exists) return null;
    return { doc, ...(await unseal(await rawKey(key), d.data().c)) };
  }
  // kopia cudzej podróży u mnie (bez powiązania – zwykła nowa podróż)
  async function copyTrip(snap) {
    const t = await DB.put("trips", { name: snap.trip.name, destination: snap.trip.destination, start: snap.trip.start, end: snap.trip.end, color: snap.trip.color || "#0f6e6e", note: snap.owner ? `Plan od: ${snap.owner}` : "" });
    for (const s of snap.segs || []) await DB.put("segments", { ...s, tripId: t.id });
    for (const i of snap.items || []) await DB.put("planItems", { ...i, tripId: t.id, note: "", cost: "", currency: "PLN" });
    return t;
  }

  /* ---------- konto Google (etap 2): to samo konto na nowym telefonie, szukanie po e-mailu ----------
     Logowanie dołącza konto Google do obecnego (anonimowego) identyfikatora – znajomi i czaty zostają.
     Jeśli konto Google jest już przypisane do innego identyfikatora (np. z poprzedniego telefonu), przełączamy się na niego
     i odtwarzamy z kopii na koncie (vault/{uid}: klucze, znajomi, widoczność podróży) – czat pobiera się wtedy od nowa z serwera.
     Kopia jest chroniona regułami (czyta ją tylko zalogowany właściciel), ale nie jest zaszyfrowana hasłem – można ją wyłączyć.
     emails/{email} → { uid }: znajomi znajdą Cię po dokładnym adresie (bez listowania); można wyłączyć. */
  const googleOf = u => u && u.providerData && u.providerData.find(p => p.providerId === "google.com");
  async function account() {
    const u = (await fb()).auth.currentUser, g = googleOf(u);
    return g ? { email: String(u.email || g.email || "").toLowerCase(), name: g.displayName || "" } : null;
  }
  async function credential(idToken) {
    if (idToken) return firebase.auth.GoogleAuthProvider.credential(idToken); // testy (emulator)
    const P = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.GoogleAuth;
    if (window.PodroznikNative && PodroznikNative.isNative && P) {
      const r = await P.authorize({ scopes: ["openid", "email", "profile"], interactive: true });
      return firebase.auth.GoogleAuthProvider.credential(null, r.accessToken);
    }
    return null; // przeglądarka: okno logowania Google (popup)
  }
  async function signInGoogle({ idToken } = {}) {
    await load();
    const f = await fb(), auth = f.auth, before = auth.currentUser && auth.currentUser.uid;
    const cred = await credential(idToken);
    try {
      if (cred) await auth.currentUser.linkWithCredential(cred);
      else await auth.currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) {
      if (e.code !== "auth/credential-already-in-use" && e.code !== "auth/email-already-in-use") throw e;
      const c = e.credential || cred;
      if (!c) throw e;
      await auth.signInWithCredential(c); // to konto ma już swój identyfikator (np. z poprzedniego telefonu)
    }
    await auth.currentUser.getIdToken(true); // e-mail w tokenie – potrzebny regułom
    profileDone = null;
    if (auth.currentUser.uid !== before) await restore();
    if (st.findable !== false) await setFindable(true).catch(e => console.warn("e-mail:", e.code || e));
    await profile();
    await writeVault();
    emit("account");
    return account();
  }
  function stopAll() {
    if (inboxOff) { inboxOff(); inboxOff = null; }
    for (const k of Object.keys(chats)) { chats[k](); delete chats[k]; }
    started = false;
  }
  // przełączenie na istniejące konto – stan z kopii na koncie (albo pusty)
  async function restore() {
    stopAll();
    const f = await fb(), me = f.auth.currentUser.uid;
    const d = await f.db.collection("vault").doc(me).get().catch(() => null);
    const v = d && d.exists ? d.data() : null;
    for (const m of await DB.all("dms")) await DB.delRaw("dms", m.id); // wiadomości poprzedniego identyfikatora
    if (v && v.keys) { await DB.setSetting("social.keys", v.keys); myKeys = null; for (const k of Object.keys(shared)) delete shared[k]; }
    // imię: z kopii albo z profilu na serwerze (gdy na tym telefonie jeszcze go nie ma)
    if (!(await myName())) { const nm = (v && v.name) || ((await person(me).catch(() => null)) || {}).name; if (nm) await DB.setSetting("myName", nm); }
    st = { friends: (v && v.friends) || {}, trips: (v && v.trips) || {}, since: {}, read: (v && v.read) || {}, findable: v ? v.findable : undefined, vault: v ? v.vault : undefined };
    await DB.setSetting("social", st);
    if (!v || !v.keys) await keyMaps().catch(() => {});
    await start(true);
  }
  let vaultTimer = null;
  function scheduleVault() { clearTimeout(vaultTimer); vaultTimer = setTimeout(() => writeVault().catch(e => console.warn("kopia na koncie:", e.code || e)), 1500); }
  async function writeVault() {
    if (!st || !available() || !fb) return;
    const f = await fb(), u = f.auth.currentUser;
    if (!googleOf(u)) return;
    const ref = f.db.collection("vault").doc(u.uid);
    if (st.vault === false) { await ref.delete().catch(() => {}); return; }
    const keysRaw = await DB.getSetting("social.keys", null);
    await ref.set({ v: 1, t: f.now(), vault: true, name: (await myName()).slice(0, 40), findable: st.findable !== false, keys: keysRaw, friends: st.friends, trips: st.trips, read: st.read });
  }
  async function setFindable(on) {
    await load();
    const f = await fb(), acc = await account();
    st.findable = !!on; await save();
    if (!acc || !acc.email) return;
    const ref = f.db.collection("emails").doc(acc.email);
    if (on) await ref.set({ uid: f.auth.currentUser.uid }); else await ref.delete().catch(() => {});
  }
  async function setVault(on) { await load(); st.vault = !!on; await save(); await writeVault(); }
  async function findByEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw Object.assign(new Error("To nie wygląda na adres e-mail."), { code: "bad-email" });
    const d = await (await fb()).db.collection("emails").doc(e).get();
    return d.exists ? d.data().uid : null;
  }
  // wylogowanie: ten telefon wraca do nowego, anonimowego profilu (znajomi zostają na koncie, jeśli jest kopia)
  async function signOut() {
    const f = await fb();
    await writeVault().catch(() => {});
    stopAll();
    await f.auth.signOut();
    await f.auth.signInAnonymously();
    await DB.setSetting("social.keys", null); myKeys = null; for (const k of Object.keys(shared)) delete shared[k];
    for (const m of await DB.all("dms")) await DB.delRaw("dms", m.id);
    st = { friends: {}, trips: {}, since: {}, read: {} }; await DB.setSetting("social", st);
    profileDone = null;
    emit("account");
  }

  /* ---------- start ---------- */
  let started = false;
  async function start(force) {
    if (started || !available() || !navigator.onLine) return;
    await load();
    if (!force && !Object.keys(st.friends).length && !Object.keys(st.trips).length && !(await DB.getSetting("social.on", false))) return; // nic nie używane – nie łącz się
    started = true;
    try {
      await listenInbox();
      for (const [id, fr] of Object.entries(st.friends)) if (fr.state === "ok") startChat(id);
    } catch (e) { started = false; console.warn("znajomi:", e.code || e); }
  }
  // pierwsze wejście na ekran Znajomi – od teraz łączymy się przy starcie
  async function enable() { await DB.setSetting("social.on", true); await profile(); await start(); }
  addEventListener("online", () => start());
  document.addEventListener("DOMContentLoaded", () => setTimeout(start, 600));

  App.Social = {
    available, enable, start, load, state: async () => (await load(), st), myLink, myName, rename, profile, parseFriend, person,
    addFriend, accept, remove, sendMessage, messages, markRead, unread, unreadAll, startChat,
    VIS, setVisibility, visibility, publicLink, friendTrips, parsePublic, publicTrip, copyTrip, snapshot,
    account, signInGoogle, signOut, setFindable, setVault, findByEmail,
    on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    _publish: publish, _keyMaps: keyMaps,
  };
})();
