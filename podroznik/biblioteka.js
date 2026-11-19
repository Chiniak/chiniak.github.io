/* Tripwillow – biblioteka planów (publiczne plany z ocenami) i profile autorów.
   Trasy:
     #/biblioteka?q=&k=&d=&s=&o=       wyszukiwarka: miasta / kraje (kilka po przecinku), rodzaj, liczba dni, pora roku, kolejność
     #/biblioteka/p/:id                plan: podgląd dzień po dniu, ocena 1–10, „Skopiuj do moich podróży”, zgłoszenie, autor
     #/biblioteka/opublikuj/:tripId    publikacja całej podróży albo jednego dnia (?d=RRRR-MM-DD), edycja (?id=…)
   Profile: sekcja „Plany w bibliotece” i „O mnie” w #/profil, #/osoba/:uid, #/znajomy/:uid (znajomi.js wywołuje App.Library).

   Firestore (reguły: podroznik-app/firebase/firestore.rules) – plany są JAWNE (bez szyfrowania), żeby dało się je wyszukiwać:
     library/{id}              { owner, ownerName, title, desc, kind: day|trip, days, month, cities[], countries[], tags[], lang,
                                 plan: { trip, segs, items }, ratingSum, ratingCount, created, t, v }
     library/{id}/ratings/{uid} { r: 1–10, t }  – jedna ocena na osobę; suma i liczba w planie zmieniają się w tej samej transakcji
     reports/{auto}            { plan, by, why, t }  – zgłoszenia nadużyć (czyta tylko właściciel projektu w konsoli)
   Tagi wyszukiwania: „k:it” (kraj), „m:rzym”, „m:rome”, „m:roma” (miasto w kilku językach – z OpenStreetMap przy publikacji).
   Plan bez: biletów, numerów lotów, kodów, cen, notatek, adresów noclegów, zdjęć. Daty przesunięte na wzorcowy rok
   (prawdziwy termin wyjazdu autora nie jest publikowany) – w podglądzie „Dzień 1, 2…”, miesiąc zostaje do filtra pory roku. */
(function () {
  const { esc, plural } = App;
  const ic = (n, c = "sm") => App.icon(n, c);
  const SO = () => App.Social;
  const COL = "library", BASE = "2001-01-01";
  const tr = x => self.I18N && I18N.tr ? I18N.tr(x) : x;
  const MAX_TAGS = 80;

  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const fb = () => App.Sync.firebase();
  const available = () => !!(SO() && SO().available());
  const avg = p => p.ratingCount ? p.ratingSum / p.ratingCount : 0;
  const fmtAvg = p => p.ratingCount ? (Math.round(avg(p) * 10) / 10).toLocaleString(self.I18N ? I18N.locale : "pl-PL") : "–";

  /* ---------- kraje: nazwy we wszystkich językach aplikacji → kod ---------- */
  const LANGS = ["pl", "en", "de", "es", "it", "pt", "zh", "fr"];
  let countryMap = null;
  const dn = {};
  const dName = (cc, l) => { try { dn[l] = dn[l] || new Intl.DisplayNames([l], { type: "region" }); const n = dn[l].of(cc); return n && n !== cc ? n : ""; } catch (e) { return ""; } };
  function countries() {
    if (countryMap) return countryMap;
    countryMap = new Map();
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const a of A) for (const b of A) {
      const cc = a + b;
      if (["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB"].includes(cc)) continue;
      if (!dName(cc, "en")) continue;
      for (const l of LANGS) { const n = norm(dName(cc, l)); if (n && n.length >= 2 && !countryMap.has(n)) countryMap.set(n, cc); }
    }
    for (const [k, cc] of Object.entries({ "usa": "US", "uk": "GB", "anglia": "GB", "england": "GB", "szkocja": "GB", "scotland": "GB", "holandia": "NL", "holland": "NL" })) countryMap.set(k, cc);
    return countryMap;
  }
  const countryName = cc => dName(cc, self.I18N ? I18N.lang : "pl") || cc;
  const flag = cc => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";

  // wyszukiwane miejsca: „Rzym, Florencja” albo „Włochy, Francja” → [{ tag, label }]
  function parseQuery(q) {
    const out = [], seen = new Set();
    for (const part of String(q || "").split(/[,;+\n]|\s[-–]\s/)) {
      const n = norm(part);
      if (!n) continue;
      const cc = countries().get(n);
      const tag = cc ? `k:${cc}` : `m:${n}`;
      if (seen.has(tag)) continue; seen.add(tag);
      out.push({ tag, label: cc ? `${flag(cc)} ${countryName(cc)}` : part.trim() });
    }
    return out.slice(0, 6);
  }

  /* ---------- miejsca planu: propozycja przy publikacji ---------- */
  const cityOf = s => String(s || "").split(/[,(|]/)[0].replace(/\b[A-Z]{3}\b/g, "").trim();
  async function suggestPlaces(tripId, day) {
    const [t, segs, items] = await Promise.all([DB.get("trips", tripId), DB.byIndex("segments", "tripId", tripId), DB.byIndex("planItems", "tripId", tripId)]);
    const inDay = x => !day || String(x || "").slice(0, 10) === day;
    const cities = new Set();
    const add = v => { const c = cityOf(v); if (c && c.length >= 2 && c.length <= 40) cities.add(c); };
    if (!day) for (const d of String(t.destination || "").split(/[,;/–-]/)) add(d);
    for (const s of segs) {
      if (s.type === "nocleg") { if (inDay(s.depart) || (day && s.depart && s.arrive && s.depart.slice(0, 10) <= day && s.arrive.slice(0, 10) >= day)) add(s.city || cityOf(s.address && s.address.split(",").slice(-1)[0])); }
      else if (s.type !== "lot" && inDay(s.depart)) add(s.to);
      else if (s.type === "lot" && !day) add(s.to);
    }
    if (day && !cities.size) add(t.destination);
    let cc = [];
    try { if (self.Visas) { await Visas.ready(); cc = Visas.countries(t, segs, items.filter(i => !day || i.date === day)); } } catch (e) { /* bez krajów */ }
    return { trip: t, cities: [...cities].slice(0, 8), countries: cc.slice(0, 10) };
  }
  // nazwy miasta w innych językach i kraj – z OpenStreetMap (gdy jest internet); bez tego zostaje wpisana nazwa
  async function cityTags(city) {
    const tags = new Set([`m:${norm(city)}`]);
    let cc = "";
    try {
      const r = await Promise.race([
        App.Places.osm("search", { q: city, limit: "1", namedetails: "1", addressdetails: "1" }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("czas")), 6000)),
      ]);
      const x = r && r[0];
      if (x) {
        const nd = x.namedetails || {};
        for (const k of ["name", ...LANGS.map(l => `name:${l}`), "int_name"]) if (nd[k]) tags.add(`m:${norm(nd[k])}`);
        if (x.address && x.address.country_code) cc = x.address.country_code.toUpperCase();
      }
    } catch (e) { /* offline – tylko wpisana nazwa */ }
    return { tags: [...tags].filter(t => t.length > 3), cc };
  }

  /* ---------- migawka planu do biblioteki ---------- */
  async function buildPlan(tripId, day) {
    const snap = await SO().snapshot(tripId);
    if (!snap) throw new Error("Nie ma takiej podróży.");
    const t = snap.trip;
    let segs = snap.segs || [], items = snap.items || [];
    let start = t.start, end = t.end;
    if (day) {
      start = end = day;
      items = items.filter(i => i.date === day);
      segs = segs.filter(s => String(s.depart || "").slice(0, 10) === day && s.type !== "nocleg");
    }
    const shift = App.dayDiff(start, BASE);
    const sd = d => d ? App.addDays(String(d).slice(0, 10), shift) + String(d).slice(10) : d;
    return {
      trip: { name: t.name, destination: t.destination || "", start: sd(start), end: sd(end), color: t.color || "" },
      segs: segs.map(s => s.type === "nocleg"
        ? { type: "nocleg", name: s.name, city: s.city, depart: sd(s.depart), arrive: sd(s.arrive) }
        : { type: s.type, from: s.from, to: s.to, depart: sd(s.depart), arrive: sd(s.arrive) }),
      items: items.filter(i => i.title).map(i => ({ date: i.date ? sd(i.date) : "", time: i.time || "", title: i.title, cat: i.cat || "inne",
        place: i.place || "", ...(typeof i.lat === "number" ? { lat: i.lat, lon: i.lon } : {}), order: i.order })),
      days: App.dayDiff(start, end) + 1, month: +String(start).slice(5, 7) || 0,
    };
  }

  /* ---------- zapis, odczyt, oceny ---------- */
  const st = async () => { const s = await SO().state(); s.library = s.library || {}; s.rated = s.rated || {}; return s; };
  const keyOf = (tripId, day) => day ? `${tripId}|${day}` : tripId;
  async function publish({ tripId, day, title, desc, cities, countries: ccs, id }) {
    const f = await fb(), me = await SO().profile();
    const p = await buildPlan(tripId, day);
    const tags = new Set(), cc = new Set(ccs || []);
    for (const c of (cities || []).slice(0, 8)) { const r = await cityTags(c); r.tags.forEach(x => tags.add(x)); if (r.cc) cc.add(r.cc); }
    for (const c of cc) tags.add(`k:${c}`);
    const doc = {
      owner: me, ownerName: (await SO().myName()).slice(0, 40), title: String(title || p.trip.name).trim().slice(0, 80), desc: String(desc || "").trim().slice(0, 1000),
      kind: day ? "day" : "trip", days: p.days, month: p.month, cities: (cities || []).map(c => String(c).slice(0, 40)).slice(0, 8), countries: [...cc].slice(0, 12),
      tags: [...tags].slice(0, MAX_TAGS), lang: self.I18N ? I18N.lang : "pl",
      plan: { trip: p.trip, segs: p.segs, items: p.items }, t: f.now(), v: 1,
    };
    const s = await st(), k = keyOf(tripId, day);
    let ref;
    if (id) { ref = f.db.collection(COL).doc(id); await ref.update(doc); }
    else { ref = f.db.collection(COL).doc(); await ref.set({ ...doc, ratingSum: 0, ratingCount: 0, created: f.now() }); }
    s.library[k] = ref.id;
    await DB.setSetting("social", s);
    return ref.id;
  }
  async function get(id) {
    const d = await (await fb()).db.collection(COL).doc(id).get();
    return d.exists ? { id: d.id, ...d.data() } : null;
  }
  async function remove(id) {
    const f = await fb(), s = await st();
    const rs = await f.db.collection(COL).doc(id).collection("ratings").get().catch(() => null);
    await f.db.collection(COL).doc(id).delete();
    if (rs) for (const d of rs.docs) await d.ref.delete().catch(() => {}); // reguła: oceny usuniętego planu może usunąć każdy
    for (const [k, v] of Object.entries(s.library)) if (v === id) delete s.library[k];
    await DB.setSetting("social", s);
  }
  async function myRating(id) {
    const f = await fb(), me = await SO().profile();
    const d = await f.db.collection(COL).doc(id).collection("ratings").doc(me).get().catch(() => null);
    return d && d.exists ? d.data().r : 0;
  }
  async function rate(id, r) {
    r = Math.round(+r);
    if (!(r >= 1 && r <= 10)) return;
    const f = await fb(), me = await SO().profile();
    const pref = f.db.collection(COL).doc(id), rref = pref.collection("ratings").doc(me);
    await f.db.runTransaction(async tx => {
      const p = await tx.get(pref), old = await tx.get(rref);
      if (!p.exists) throw new Error("Plan został usunięty.");
      const o = old.exists ? old.data().r : 0;
      tx.set(rref, { r, t: f.now() });
      tx.update(pref, { ratingSum: p.data().ratingSum + r - o, ratingCount: p.data().ratingCount + (old.exists ? 0 : 1) });
    });
    const s = await st(); s.rated[id] = r; await DB.setSetting("social", s);
  }
  async function unrate(id) {
    const f = await fb(), me = await SO().profile();
    const pref = f.db.collection(COL).doc(id), rref = pref.collection("ratings").doc(me);
    await f.db.runTransaction(async tx => {
      const p = await tx.get(pref), old = await tx.get(rref);
      if (!old.exists) return;
      if (!p.exists) { tx.delete(rref); return; }
      tx.delete(rref);
      tx.update(pref, { ratingSum: p.data().ratingSum - old.data().r, ratingCount: p.data().ratingCount - 1 });
    });
    const s = await st(); delete s.rated[id]; await DB.setSetting("social", s);
  }
  async function report(id, why) {
    const f = await fb(), me = await SO().profile();
    await f.db.collection("reports").add({ plan: id, by: me, why: String(why || "").slice(0, 300), t: f.now() });
  }
  // zablokowani autorzy – tylko na tym telefonie (ich plany i profile znikają z biblioteki)
  const blocked = async () => (await DB.getSetting("library.blocked", [])) || [];
  async function block(uid, on = true) {
    const b = new Set(await blocked());
    if (on) b.add(uid); else b.delete(uid);
    await DB.setSetting("library.blocked", [...b]);
  }

  const SEASON = { wiosna: [3, 4, 5], lato: [6, 7, 8], jesien: [9, 10, 11], zima: [12, 1, 2] };
  const DAYS = { "1": [1, 1], "2-4": [2, 4], "5-10": [5, 10], "11": [11, 999] };
  // wyszukiwanie: pierwszy tag z zapytania w bazie (array-contains), reszta warunków w telefonie
  async function search({ q = "", k = "", d = "", s = "", o = "top" } = {}) {
    const f = await fb(), terms = parseQuery(q), bl = new Set(await blocked());
    let snap;
    if (terms.length) snap = await f.db.collection(COL).where("tags", "array-contains", terms[0].tag).limit(200).get();
    else snap = await f.db.collection(COL).orderBy("t", "desc").limit(100).get();
    let list = snap.docs.map(x => ({ id: x.id, ...x.data() }));
    list = list.filter(p => !bl.has(p.owner) && terms.every(t => (p.tags || []).includes(t.tag)));
    if (k) list = list.filter(p => p.kind === k);
    if (DAYS[d]) list = list.filter(p => p.days >= DAYS[d][0] && p.days <= DAYS[d][1]);
    if (SEASON[s]) list = list.filter(p => SEASON[s].includes(p.month));
    const ts = p => (p.t && p.t.toMillis ? p.t.toMillis() : 0);
    // „najlepiej oceniane”: średnia z poprawką na małą liczbę ocen (2 wirtualne oceny 6/10)
    const score = p => (p.ratingSum + 12) / (p.ratingCount + 2);
    list.sort(o === "new" ? (a, b) => ts(b) - ts(a) : (a, b) => score(b) - score(a) || b.ratingCount - a.ratingCount || ts(b) - ts(a));
    return { terms, list };
  }
  async function byOwner(uid) {
    const snap = await (await fb()).db.collection(COL).where("owner", "==", uid).limit(100).get();
    return snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (b.t && b.t.toMillis ? b.t.toMillis() : 0) - (a.t && a.t.toMillis ? a.t.toMillis() : 0));
  }
  // usunięcie konta (social.js → deleteAccount): moje plany i moje oceny cudzych planów
  async function wipe() {
    const me = await SO().profile();
    for (const p of await byOwner(me).catch(() => [])) await remove(p.id).catch(e => console.warn("biblioteka:", e.code || e));
    const s = await st();
    for (const id of Object.keys(s.rated)) await unrate(id).catch(() => {});
  }

  /* ---------- wspólne kawałki ekranów ---------- */
  const offlineMsg = e => !navigator.onLine ? "Brak internetu – spróbuj, gdy będzie połączenie." : `Nie udało się połączyć: ${esc(e && (e.message || e.code) || "błąd")}`;
  const notReady = () => ({ title: "Biblioteka planów", html: App.empty("📚", "Już wkrótce", "Biblioteka planów działa razem ze znajomymi – uruchomimy ją w jednej z następnych wersji.") });
  const daysTxt = n => `${n} ${plural(n, "dzień", "dni", "dni")}`;
  const kindTxt = p => p.kind === "day" ? "plan dnia" : daysTxt(p.days);
  const stars = p => `<span class="lb-stars" aria-label="Ocena ${fmtAvg(p)} na 10">${ic("star")} <b>${fmtAvg(p)}</b><small>/10 · ${p.ratingCount} ${plural(p.ratingCount, "ocena", "oceny", "ocen")}</small></span>`;
  const placesTxt = p => [...(p.countries || []).map(c => `${flag(c)} ${countryName(c)}`), ...(p.cities || [])].slice(0, 5).join(" · ");
  const card = p => `<a class="lb-card" href="#/biblioteka/p/${p.id}" style="--c:${esc(p.plan && p.plan.trip && p.plan.trip.color || "#177670")}">
      <span class="lb-bar" aria-hidden="true"></span>
      <span class="lb-main"><small class="lb-kind">${p.kind === "day" ? ic("sun") : ic("map")} <span>${kindTxt(p)}</span></small>
        <b translate="no">${esc(p.title)}</b><small class="lb-pl" translate="no">${esc(placesTxt(p))}</small>
        <span class="lb-meta">${stars(p)}<small class="lb-by" translate="no">${esc(p.ownerName || "Podróżnik")}</small></span></span>${ic("chev", "")}</a>`;
  App.Library = { available, search, get, publish, remove, rate, unrate, myRating, report, block, blocked, byOwner, wipe, parseQuery, suggestPlaces, buildPlan, card, countries };

  /* ================= wyszukiwarka ================= */
  App.route(/^\/biblioteka$/, async (_, q) => {
    if (!available()) return notReady();
    const par = { q: q.q || "", k: q.k || "", d: q.d || "", s: q.s || "", o: q.o || "top" };
    let res = { terms: [], list: [] }, err = null;
    try { await SO().enable(); res = await search(par); } catch (e) { err = e; }
    const link = ch => { const x = { ...par, ...ch }; return "#/biblioteka?" + new URLSearchParams(Object.entries(x).filter(([, v]) => v)).toString(); };
    const chip = (key, val, label) => `<a class="st-chip${par[key] === val ? " on" : ""}" href="${link({ [key]: par[key] === val ? "" : val })}"${par[key] === val ? ' aria-current="true"' : ""}>${label}</a>`;
    return {
      title: "Biblioteka planów", back: "#/podroze",
      html: `
        <p class="muted lb-intro">Gotowe plany od innych podróżników – dzień w mieście albo cała wyprawa. Oceniaj i kopiuj do swoich podróży.</p>
        <form class="lb-search" id="lb-form" role="search">
          <label class="lb-q">${ic("search")}<input type="search" name="q" value="${esc(par.q)}" placeholder="Miasto lub kraj – kilka po przecinku" aria-label="Szukaj miasta lub kraju" autocomplete="off"></label>
          <button class="btn primary" type="submit">Szukaj</button>
        </form>
        ${res.terms.length ? `<p class="muted small lb-terms">Plany obejmujące: ${res.terms.map(t => `<b translate="no">${esc(t.label)}</b>`).join(" + ")}</p>` : ""}
        <div class="st-chips lb-f" aria-label="Rodzaj">${chip("k", "day", "Plan dnia")}${chip("k", "trip", "Wyprawa")}</div>
        <div class="st-chips lb-f" aria-label="Liczba dni">${chip("d", "1", "1 dzień")}${chip("d", "2-4", "2–4 dni")}${chip("d", "5-10", "5–10 dni")}${chip("d", "11", "11+ dni")}</div>
        <div class="st-chips lb-f" aria-label="Pora roku">${chip("s", "wiosna", "Wiosna")}${chip("s", "lato", "Lato")}${chip("s", "jesien", "Jesień")}${chip("s", "zima", "Zima")}</div>
        <div class="rz-seg lb-sort" role="group" aria-label="Kolejność">
          <a href="${link({ o: "top" })}" class="${par.o !== "new" ? "on" : ""}">${ic("star")} Najlepiej oceniane</a>
          <a href="${link({ o: "new" })}" class="${par.o === "new" ? "on" : ""}">${ic("clock")} Najnowsze</a></div>
        ${err ? `<p class="gd-err">${offlineMsg(err)}</p>` : ""}
        <div class="lb-list">${res.list.length ? res.list.map(card).join("")
          : err ? "" : `<p class="muted small lb-none">${res.terms.length || par.k || par.d || par.s ? "Nie ma jeszcze planów pasujących do wyszukiwania. Spróbuj innego miasta albo zdejmij filtry." : "Biblioteka jest jeszcze pusta – opublikuj pierwszy plan!"}</p>`}</div>
        <a class="btn wide lb-pub" href="#/biblioteka/opublikuj">${ic("plus")} <span>Opublikuj swój plan</span></a>`,
      after(view) {
        const f = view.querySelector("#lb-form");
        f.onsubmit = e => { e.preventDefault(); location.hash = link({ q: f.q.value.trim() }); };
      },
    };
  });

  /* ================= plan ================= */
  App.route(/^\/biblioteka\/p\/([\w-]{10,40})$/, async ([id]) => {
    if (!available()) return notReady();
    let p = null, err = null, me = "", mine = 0;
    try { await SO().enable(); me = await SO().profile(); p = await get(id); if (p) mine = await myRating(id); } catch (e) { err = e; }
    if (!p) return { title: "Plan", back: "#/biblioteka", html: err ? `<p class="gd-err">${offlineMsg(err)}</p>` : App.empty("📚", "Plan niedostępny", "Autor usunął ten plan z biblioteki.") };
    const own = p.owner === me;
    const ek = own ? (Object.entries((await st()).library).find(([, v]) => v === id) || [])[0] : null;
    const editKey = ek ? ek.split("|") : null;
    const snap = { ...p.plan, owner: p.ownerName, updated: p.t && p.t.toDate ? p.t.toDate().toISOString() : "" };
    const view = App.People ? App.People.tripView(snap, { owner: p.ownerName || "Podróżnik", ownerHref: own ? "#/profil" : `#/osoba/${p.owner}`, rel: true }) : "";
    const rateRow = own ? `<p class="muted small">To Twój plan – inni mogą go oceniać.</p>`
      : `<div class="lb-rate" role="group" aria-label="Twoja ocena od 1 do 10">${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
        `<button type="button" class="lb-star${n <= mine ? " on" : ""}" data-r="${n}" aria-label="${n} na 10" aria-pressed="${n === mine}">${ic("star", "")}</button>`).join("")}</div>
        <p class="muted small lb-mine">${mine ? `Twoja ocena: <b>${mine}/10</b> – dotknij, żeby zmienić` : "Dotknij gwiazdki, żeby ocenić (1–10)"}</p>`;
    return {
      title: "Plan z biblioteki", back: "#/biblioteka",
      html: `
        <section class="card lb-head">
          <small class="lb-kind">${p.kind === "day" ? ic("sun") : ic("map")} <span>${kindTxt(p)}</span></small>
          <h2 translate="no">${esc(p.title)}</h2>
          <p class="lb-pl" translate="no">${esc(placesTxt(p))}</p>
          ${p.desc ? `<p class="lb-desc" translate="no">${esc(p.desc)}</p>` : ""}
          <div class="lb-score">${stars(p)}</div>
          ${rateRow}
        </section>
        ${view}
        <div class="lb-acts">
          ${own ? `${editKey ? `<a class="btn" href="#/biblioteka/opublikuj/${esc(editKey[0])}?id=${id}${editKey[1] ? `&d=${editKey[1]}` : ""}">${ic("edit")} <span>Zaktualizuj</span></a>` : ""}
            <button type="button" class="btn danger" id="lb-del">${ic("trash")} <span>Usuń z biblioteki</span></button>`
          : `<button type="button" class="btn" id="lb-rep">${ic("alert")} <span>Zgłoś plan</span></button>
            <button type="button" class="btn" id="lb-block">${ic("close")} <span>Zablokuj autora</span></button>`}
        </div>
        <p class="f-hint">Plany w bibliotece są publiczne. Bez biletów, cen, notatek i prawdziwych dat wyjazdu autora.</p>`,
      after(v) {
        if (App.People) App.People.copyBtn(v, snap, p.ownerName);
        v.querySelectorAll("[data-r]").forEach(b => b.onclick = async () => {
          v.querySelectorAll("[data-r]").forEach(x => x.disabled = true);
          try { await rate(id, +b.dataset.r); App.toast(`Oceniono: ${b.dataset.r}/10`); } catch (e) { App.toast(offlineMsg(e)); }
          App.render();
        });
        const del = v.querySelector("#lb-del");
        if (del) del.onclick = async () => {
          if (!confirm("Usunąć ten plan z biblioteki? Zniknie razem z ocenami. Twoja podróż zostaje.")) return;
          try { await remove(id); App.toast("Usunięto z biblioteki"); location.hash = "#/profil"; } catch (e) { App.toast(offlineMsg(e)); }
        };
        const rep = v.querySelector("#lb-rep");
        if (rep) rep.onclick = async () => {
          const why = prompt("Co jest nie tak z tym planem? (np. obraźliwe treści, spam, dane osobowe)");
          if (why === null) return;
          try { await report(id, why); App.toast("Dziękujemy – zgłoszenie wysłane"); } catch (e) { App.toast(offlineMsg(e)); }
        };
        const bl = v.querySelector("#lb-block");
        if (bl) bl.onclick = async () => {
          if (!confirm(`Zablokować ${p.ownerName || "Podróżnik"}? Plany tej osoby przestaną się pokazywać w bibliotece na tym telefonie.`)) return;
          await block(p.owner); App.toast("Autor zablokowany"); location.hash = "#/biblioteka";
        };
      },
    };
  });

  /* ================= publikacja ================= */
  App.route(/^\/biblioteka\/opublikuj(?:\/([\w-]+))?$/, async ([tripId], q) => {
    if (!available()) return notReady();
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    if (!tripId) {
      return {
        title: "Opublikuj plan", back: "#/biblioteka",
        html: trips.length ? `<p class="muted">Którą podróż (albo dzień z niej) chcesz pokazać innym?</p>
          <div class="list">${trips.map(t => `<a class="li" href="#/biblioteka/opublikuj/${t.id}"><span class="li-ico">${ic("trips")}</span>
            <span class="li-main"><b>${esc(t.name)}</b><small>${App.fmtRange(t.start, t.end)}</small></span>${ic("chev", "")}</a>`).join("")}</div>`
          : App.empty("🧳", "Nie masz jeszcze podróży", "Dodaj podróż i jej plan – potem opublikujesz go w bibliotece."),
      };
    }
    const t = await DB.get("trips", tripId);
    if (!t) { location.replace("#/biblioteka/opublikuj"); return ""; }
    const s = await st();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q.d || "") ? q.d : "";
    const existingId = q.id || s.library[keyOf(tripId, day)] || "";
    let existing = null;
    try { if (existingId) existing = await get(existingId); } catch (e) { /* offline */ }
    const sug = await suggestPlaces(tripId, day);
    const items = await DB.byIndex("planItems", "tripId", tripId);
    const days = [];
    for (let d = t.start; d <= t.end && days.length < 120; d = App.addDays(d, 1)) days.push(d);
    const nIn = d => items.filter(i => i.date === d).length;
    const cities = existing ? existing.cities : sug.cities, ccs = existing ? existing.countries : sug.countries;
    const nItems = day ? nIn(day) : items.length;
    return {
      title: existing ? "Zaktualizuj plan" : "Opublikuj plan", back: `#/podroze/${tripId}`,
      html: `
        <form class="lb-pubform" id="lb-pf">
          <label class="field"><span>Co publikujesz?</span>
            <select name="day"><option value="">Całą podróż (${daysTxt(days.length)})</option>
              ${days.filter(nIn).map((d, i) => `<option value="${d}"${d === day ? " selected" : ""}>Jeden dzień: ${App.fmtDayLong(d)} (${nIn(d)} ${plural(nIn(d), "punkt", "punkty", "punktów")})</option>`).join("")}</select></label>
          <label class="field"><span>Tytuł</span><input name="title" maxlength="80" required value="${esc(existing ? existing.title : day ? tr(`1 dzień: ${sug.cities[0] || t.destination || t.name}`) : t.name)}"></label>
          <label class="field"><span>Opis (nieobowiązkowy)</span><textarea name="desc" maxlength="1000" rows="3" placeholder="Dla kogo jest ten plan, jakie tempo, co warto wiedzieć">${esc(existing ? existing.desc : "")}</textarea></label>
          <label class="field"><span>Miasta</span><input name="cities" value="${esc(cities.join(", "))}" placeholder="np. Rzym, Florencja"></label>
          <p class="f-hint">Po przecinku. Ludzie znajdą plan, wpisując którekolwiek z tych miast – także w innym języku.</p>
          <fieldset class="lb-cc"><legend>Kraje</legend>
            <div class="st-chips">${[...new Set(ccs)].map(c => `<label class="st-chip on"><input type="checkbox" name="cc" value="${c}" checked> ${flag(c)} ${esc(countryName(c))}</label>`).join("") || `<span class="muted small">Kraje dobierzemy z nazw miast.</span>`}</div>
          </fieldset>
          <section class="card lb-what">
            <p><b>Co zobaczą inni:</b> ${nItems} ${plural(nItems, "punkt", "punkty", "punktów")} planu z godzinami i miejscami, przejazdy (skąd–dokąd), noclegi (nazwa i miasto), Twoje imię.</p>
            <p><b>Czego nie zobaczą:</b> biletów, numerów lotów, kodów rezerwacji, cen, notatek, adresów noclegów, zdjęć ani prawdziwych dat Twojego wyjazdu.</p>
          </section>
          <label class="zn-sw lb-ok"><input type="checkbox" name="ok" required${existing ? " checked" : ""}>
            <span><b>Plan będzie publiczny</b><small>Każdy użytkownik Tripwillow może go zobaczyć, ocenić i skopiować. Nie publikuj danych osobowych ani treści obraźliwych.</small></span></label>
          <button class="btn primary wide" type="submit">${ic("send")} <span>${existing ? "Zaktualizuj w bibliotece" : "Opublikuj w bibliotece"}</span></button>
        </form>`,
      after(view) {
        const f = view.querySelector("#lb-pf");
        f.day.onchange = () => { location.replace(`#/biblioteka/opublikuj/${tripId}${f.day.value ? `?d=${f.day.value}` : ""}`); };
        f.onsubmit = async e => {
          e.preventDefault();
          const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
          try {
            const newId = await publish({ tripId, day, id: existing ? existing.id : "", title: f.title.value, desc: f.desc.value,
              cities: f.cities.value.split(",").map(x => x.trim()).filter(Boolean), countries: [...f.querySelectorAll("[name=cc]:checked")].map(x => x.value) });
            App.toast(existing ? "Plan zaktualizowany" : "Opublikowano w bibliotece");
            location.hash = `#/biblioteka/p/${newId}`;
          } catch (er) { btn.disabled = false; App.toast(offlineMsg(er)); }
        };
      },
    };
  });

  /* ================= profile: sekcja planów i „O mnie” (wywoływane z znajomi.js) ================= */
  App.Library.profileSection = async (uid, { own = false, name = "" } = {}) => {
    let list = [];
    try { list = await byOwner(uid); } catch (e) { return ""; }
    const sum = list.reduce((a, p) => a + p.ratingSum, 0), cnt = list.reduce((a, p) => a + p.ratingCount, 0);
    return `<div class="sec-h"><h2 class="section">Plany w bibliotece</h2>${own ? `<a href="#/biblioteka/opublikuj">Opublikuj</a>` : ""}</div>
      ${list.length ? `${cnt ? `<p class="muted small">Średnia ocen planów: <b>${fmtAvg({ ratingSum: sum, ratingCount: cnt })}/10</b> (${cnt} ${plural(cnt, "ocena", "oceny", "ocen")})</p>` : ""}<div class="lb-list">${list.map(card).join("")}</div>`
        : `<p class="muted small">${own ? "Nie masz jeszcze planów w bibliotece. Opublikuj podróż albo jeden dzień – inni ocenią i skopiują Twój plan." : `${esc(name || "Podróżnik")} nie ma jeszcze planów w bibliotece.`}</p>`}`;
  };
})();
