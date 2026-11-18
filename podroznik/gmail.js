/* Podróżnik – „📬 Z Gmaila”: logowanie kontem Google i propozycje z maili.
   Aplikacja sama szuka w Gmailu potwierdzeń rezerwacji (loty, pociągi, autobusy, promy, hotele, wycieczki, bilety,
   stoliki w restauracjach), odczytuje je w telefonie (App.Email.parse, App.Plan.infoFromText, załączniki PDF/.ics)
   i proponuje dodanie do pasującej podróży albo jako nową podróż.

   Dostęp: tylko odczyt (gmail.readonly). Bez serwera – telefon pyta Gmail API wprost.
   - aplikacja na Androida (podroznik-app): wtyczka GoogleAuth (Authorization API, klient „Android” w Google Cloud),
     token odświeżany bez pytania; sprawdzanie samo przy uruchomieniu (co 6 h).
   - przeglądarka: Google Identity Services (klient „Web”, CLIENT_ID niżej); token tylko w pamięci, sprawdzanie przyciskiem.

   Ustawienia (magazyn settings): "gmail" { email, at (połączono), lastScan, error },
   "gmailSeen" { [id maila]: { s: "new"|"added"|"skip"|"none", subject, from, date, items: [...] , att: [...] } } */
(function () {
  const { esc, plural } = App;
  const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
  const API = "https://gmail.googleapis.com/gmail/v1/users/me";
  // Identyfikator klienta „Web” z Google Cloud (publiczny – to nie jest hasło). Pusty = w przeglądarce Gmail niedostępny.
  const WEB_CLIENT_ID = "";
  const SCAN_EVERY = 6 * 3600e3, MAX_MSGS = 100, DAYS_BACK = 400;

  const N = () => window.PodroznikNative || {};
  const plugin = () => N().isNative && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.GoogleAuth;
  const available = () => !!(plugin() || WEB_CLIENT_ID);

  /* ---------- zapytanie do Gmaila: potwierdzenia rezerwacji ---------- */
  const FROM = ["booking.com", "airbnb", "agoda", "trip.com", "ctrip", "expedia", "hotels.com", "hostelworld", "12go", "trainline", "raileurope",
    "omio", "flixbus", "intercity.pl", "pkp", "polregio", "regiojet", "airasia", "vietjet", "vietnamairlines", "thaiairways", "lot.com", "ryanair",
    "wizzair", "lufthansa", "qatarairways", "emirates", "turkishairlines", "gotogate", "esky", "kiwi.com", "edreams", "skyscanner",
    "getyourguide", "klook", "viator", "tiqets", "musement", "headout", "kkday", "civitatis", "eventim", "ticketmaster", "ebilet", "going.",
    "opentable", "thefork", "quandoo", "resy", "baolau", "laos-rail", "12306"];
  const SUBJ = ["rezerwacj", "potwierdzeni", "bilet", "booking", "reservation", "confirmation", "confirmed", "itinerary", "e-ticket", "eticket",
    "ticket", "voucher", "boarding", "buchung", "reserva", "wycieczk"];
  const query = () => `newer_than:${DAYS_BACK}d -in:spam -in:trash -in:chats (from:(${FROM.join(" OR ")}) OR subject:(${SUBJ.join(" OR ")}))`;

  /* ---------- token dostępu ---------- */
  let tok = null; // { value, exp }
  let gisLoad = null;
  const loadGis = () => gisLoad || (gisLoad = new Promise((ok, fail) => {
    if (window.google && google.accounts && google.accounts.oauth2) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gisLoad = null; fail(new Error("Brak połączenia z Google")); };
    document.head.appendChild(s);
  }));

  async function token(interactive) {
    if (tok && tok.exp > Date.now() + 60e3) return tok.value;
    const P = plugin();
    if (P) {
      const r = await P.authorize({ scopes: [SCOPE], interactive });
      tok = { value: r.accessToken, exp: Date.now() + 50 * 60e3 };
      return tok.value;
    }
    if (!WEB_CLIENT_ID) throw new Error("Logowanie Google działa w aplikacji na Androida");
    if (!interactive) throw Object.assign(new Error("Potrzebne logowanie"), { code: "NEED_CONSENT" });
    await loadGis();
    return new Promise((ok, fail) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: WEB_CLIENT_ID, scope: SCOPE,
        callback: r => {
          if (r.error) return fail(new Error(r.error_description || r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return fail(new Error("Bez zgody na odczyt Gmaila nie da się szukać rezerwacji"));
          tok = { value: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 - 60e3 };
          ok(tok.value);
        },
        error_callback: e => fail(new Error(e && e.type === "popup_closed" ? "Anulowano" : (e && e.message) || "Anulowano")),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  /* tempo: Google ma limit zapytań na minutę na użytkownika (od 2026 niższy) – zapytania po kolei, z odstępem;
     po „quota exceeded / rate limit” czekamy i próbujemy dalej (PACE.tries razy), zamiast przerywać */
  const PACE = { gap: 400, wait: 65e3, tries: 4 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let nextAt = 0, onWait = null;
  async function api(path, interactive) {
    for (let attempt = 0, auth = 0; ; attempt++) {
      const now = Date.now(), at = Math.max(now, nextAt);
      nextAt = at + PACE.gap;
      if (at > now) await sleep(at - now);
      const res = await fetch(API + path, { headers: { Authorization: `Bearer ${await token(interactive)}` } });
      if (res.ok) return res.json();
      if (res.status === 401 && !auth++) { tok = null; continue; }
      let msg = `Gmail: błąd ${res.status}`, reason = "";
      try { const j = await res.json(); if (j.error) { msg = `Gmail: ${j.error.message || res.status}`; reason = ((j.error.errors || [])[0] || {}).reason || j.error.status || ""; } } catch (e) { /* bez treści */ }
      const quota = res.status === 429 || (res.status === 403 && /rate|quota|RESOURCE_EXHAUSTED/i.test(`${reason} ${msg}`));
      if (quota && attempt < PACE.tries) {
        const w = (+res.headers.get("Retry-After") || 0) * 1000 || PACE.wait;
        nextAt = Date.now() + w;
        onWait && onWait(Math.round(w / 1000));
        continue;
      }
      throw Object.assign(new Error(quota ? "Google chwilowo ogranicza liczbę zapytań do Gmaila – reszta maili przy następnym sprawdzeniu" : msg), { status: res.status, quota });
    }
  }

  /* ---------- treść maila ---------- */
  const b64u = s => Uint8Array.from(atob(String(s || "").replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const utf8 = s => { try { return new TextDecoder().decode(b64u(s)); } catch (e) { return ""; } };
  const header = (msg, name) => ((msg.payload && msg.payload.headers) || []).find(h => h.name.toLowerCase() === name)?.value || "";

  function walk(part, out) {
    if (!part) return out;
    const mt = (part.mimeType || "").toLowerCase(), name = part.filename || "";
    if (name && part.body && part.body.attachmentId) {
      if (/pdf$/.test(mt) || /\.pdf$/i.test(name) || /calendar/.test(mt) || /\.ics$/i.test(name))
        out.att.push({ aid: part.body.attachmentId, name, mime: mt || (/\.ics$/i.test(name) ? "text/calendar" : "application/pdf"), size: part.body.size || 0 });
    } else if (mt === "text/plain" && part.body && part.body.data) out.plain.push(utf8(part.body.data));
    else if (mt === "text/html" && part.body && part.body.data) out.html.push(utf8(part.body.data));
    else if (mt === "text/calendar" && part.body && part.body.data) out.ics.push(utf8(part.body.data));
    (part.parts || []).forEach(p => walk(p, out));
    return out;
  }

  async function attachmentFile(msgId, a) {
    const r = await api(`/messages/${msgId}/attachments/${a.aid}`);
    return new File([b64u(r.data)], a.name || "zalacznik.pdf", { type: a.mime || "application/pdf" });
  }

  /* ---------- propozycje z jednego maila ---------- */
  const ACT_CAT = [
    [/opentable|thefork|quandoo|resy|restaurac|restaurant|stolik|table for|rezerwacja stolika|dinner|kolacj|lunch/i, "jedzenie"],
    [/concert|koncert|festival|festiwal|eventim|ticketmaster|ebilet|going\.|spektakl|teatr|theatre|theater|show|mecz|match|kino|cinema/i, "wydarzenie"],
    [/park narodowy|national park|trek|hike|kayak|rafting|elephant|słoni|waterfall|wodospad|cruise|rejs|snorkel|diving/i, "natura"],
    [/getyourguide|klook|viator|tiqets|musement|headout|kkday|civitatis|museum|muzeum|tour\b|tours\b|wycieczk|zwiedzani|excursion|attraction|atrakcj|temple|świątyni|palace|pałac|admission|wstęp/i, "zwiedzanie"],
  ];
  const ACT_RE = new RegExp(ACT_CAT.map(([r]) => r.source).join("|") + "|ticket|bilet|voucher|reservation|rezerwacj|booking", "i");
  const SUBJ_PREFIX = /^(?:(?:re|fwd?|pd|odp)\s*:\s*)*(?:your |twoja |twoje |twój )?(?:booking|reservation|rezerwacja|order|zamówienie|tickets?|bilety?|e-?tickets?|voucher|potwierdzenie(?: rezerwacji| zamówienia)?|confirmation|confirmed|booking confirmation|reservation confirmation)?(?: (?:is |została |zostało )?(?:confirmed|potwierdzona|potwierdzone))?(?: for| na| do| dla| -|:| –)?\s*/i;
  const GENERIC = /^(?:booking|reservation|rezerwacja|order|zamówienie|potwierdzenie|confirmation|tickets?|bilety?|voucher|e-?ticket|your booking|nr|no\.?|#|\d|[\s:#\-–])*$/i;

  const AT_PLACE = /^(?:(?:re|fwd?)\s*:\s*)*(?:your |twoja )?(?:table )?(?:reservation|booking|rezerwacja(?: stolika)?)\s+(?:at|w|in|do)\s+(.+?)(?:\s+(?:is|has been|została|jest|zostala)\s+(?:confirmed|potwierdzona|przyjęta).*)?$/i;
  function activityTitle(subject, info) {
    const at = String(subject || "").match(AT_PLACE);
    if (at && at[1].length >= 3) return at[1].trim().slice(0, 90);
    let s = String(subject || "").replace(SUBJ_PREFIX, "").replace(/\s*[\-–|]\s*(?:booking|order|nr|no\.?|#)\s*[\w-]*$/i, "").replace(/\s{2,}/g, " ").trim();
    if (s.length < 4 || GENERIC.test(s)) s = (info && info.title) || "";
    return s.slice(0, 90);
  }

  async function extract(msg) {
    const subject = header(msg, "subject"), from = header(msg, "from");
    const parts = walk(msg.payload, { plain: [], html: [], ics: [], att: [] });
    const body = parts.html.length ? parts.html.join("\n") : parts.plain.join("\n");
    const text = `${subject}\n${body}`;
    let segs = [];
    try { segs = await App.Email.parse(text); } catch (e) { console.warn("gmail parse:", e); }
    // nic w treści – kalendarz w treści albo załączniki (PDF z biletem, .ics)
    if (!segs.length && parts.ics.length) { try { segs = await App.Email.parse(await App.Email.fileText(new File([parts.ics.join("\n")], "zaproszenie.ics", { type: "text/calendar" }))); } catch (e) { /* dalej */ } }
    let attText = null;
    const attachText = async () => {
      if (attText !== null) return attText;
      attText = "";
      for (const a of parts.att.filter(a => a.size < 4e6).slice(0, 2)) {
        try { attText += "\n" + ((await App.Email.fileText(await attachmentFile(msg.id, a))) || ""); } catch (e) { /* pomiń */ }
      }
      return attText;
    };
    if (!segs.length && parts.att.length) {
      const t = await attachText();
      if (t.trim()) { try { segs = await App.Email.parse(`${subject}\n${t}`); } catch (e) { /* dalej */ } }
    }
    const items = segs.filter(s => s.depart).map(s => ({ kind: "seg", ...s }));
    // aktywność: wycieczka, bilet wstępu, koncert, stolik w restauracji (data z treści, a gdy jej brak – z załącznika)
    if (!items.length && ACT_RE.test(`${subject}\n${from}`) && App.Plan && App.Plan.infoFromText) {
      const T = App.todayStr(), span = { start: App.addDays(T, -DAYS_BACK), end: App.addDays(T, 730) };
      let info = App.Plan.infoFromText(text, span);
      if ((!info || !info.date) && parts.att.length) {
        const t = await attachText();
        if (t.trim()) info = App.Plan.infoFromText(`${subject}\n${t}`, span);
      }
      const title = activityTitle(subject, info);
      if (info && info.date && title) {
        const cat = (ACT_CAT.find(([r]) => r.test(`${subject}\n${from}\n${body.slice(0, 3000)}`)) || [0, "wydarzenie"])[1];
        items.push({ kind: "plan", title, date: info.date, time: info.time || "", place: info.place || "", cost: info.cost || "", currency: info.currency || "", cat });
      }
    }
    const att = parts.att.filter(a => /pdf/i.test(a.mime) || /\.pdf$/i.test(a.name)).slice(0, 1);
    return { subject: subject.slice(0, 160), from: from.replace(/<.*>/, "").replace(/"/g, "").trim().slice(0, 60),
      date: +msg.internalDate || 0, items, att, s: items.length ? "new" : "none" };
  }

  /* ---------- skanowanie ---------- */
  let scanning = null;
  async function scan({ interactive = false, onProgress } = {}) {
    if (scanning) return scanning;
    scanning = (async () => {
      const cfg = await DB.getSetting("gmail", null);
      if (!cfg) throw new Error("Najpierw połącz konto Google");
      const seen = await DB.getSetting("gmailSeen", {});
      const ids = [];
      let page = "", done = 0, total = 0;
      onWait = secs => onProgress && onProgress(done, total, secs);
      do {
        const r = await api(`/messages?maxResults=100&q=${encodeURIComponent(query())}${page ? `&pageToken=${page}` : ""}`, interactive);
        (r.messages || []).forEach(m => ids.push(m.id));
        page = r.nextPageToken;
      } while (page && ids.length < MAX_MSGS);
      const todo = ids.slice(0, MAX_MSGS).filter(id => !seen[id]);
      total = todo.length;
      let added = 0, stop = null;
      // po kolei (limit Google); postęp zapisywany co 10 maili – przerwane sprawdzanie nie traci przeczytanych
      try {
        for (const id of todo) {
          try {
            const msg = await api(`/messages/${id}?format=full`);
            seen[id] = await extract(msg);
            if (seen[id].s === "new") added++;
          } catch (e) {
            if (e.quota || e.status === 401 || e.status === 403) { stop = e; break; }
            console.warn("gmail msg:", e);
          }
          done++;
          onProgress && onProgress(done, total);
          if (done % 10 === 0) await DB.setSetting("gmailSeen", seen);
        }
      } finally { onWait = null; }
      await markExisting(seen);
      await DB.setSetting("gmailSeen", seen);
      if (stop && !stop.quota) throw stop;
      await DB.setSetting("gmail", { ...cfg, lastScan: Date.now(), partial: !!stop, error: stop ? stop.message : "" });
      return { checked: done, found: added, partial: !!stop, left: total - done };
    })();
    try { return await scanning; }
    catch (e) {
      const cfg = await DB.getSetting("gmail", null);
      if (cfg) await DB.setSetting("gmail", { ...cfg, error: e.message || String(e), ...(e.quota ? { lastScan: Date.now(), partial: true } : {}) });
      throw e;
    } finally { scanning = null; onWait = null; }
  }

  /* to, co już jest w podróżach, nie jest proponowane drugi raz */
  const segKey = s => [s.type, (s.depart || "").slice(0, 16), s.type === "nocleg" ? (s.name || "").toLowerCase() : (s.number || `${s.from}|${s.to}`).toString().toLowerCase().replace(/\s/g, "")].join("|");
  const planKey = p => [p.date, (p.title || "").toLowerCase().trim()].join("|");
  async function markExisting(seen) {
    const [segs, plans] = await Promise.all([DB.all("segments"), DB.all("planItems")]);
    const have = new Set([...segs.map(segKey), ...plans.map(planKey)]);
    for (const m of Object.values(seen)) {
      if (m.s !== "new") continue;
      m.items.forEach(it => { if (have.has(it.kind === "seg" ? segKey(it) : planKey(it))) it.done = true; });
      if (m.items.every(it => it.done)) m.s = "added";
    }
  }

  /* ---------- propozycje pogrupowane według podróży ---------- */
  const dayOf = it => it.kind === "seg" ? it.depart.slice(0, 10) : it.date;
  const endOf = it => it.kind === "seg" ? (it.arrive || it.depart).slice(0, 10) : it.date;

  /* nazwa nowej podróży: miejsce, w którym spędza się najwięcej czasu (nie stacja przesiadkowa w drodze na lotnisko).
     Liczone są loty (jeśli są), inaczej wszystkie przejazdy: czas od przyjazdu do następnego wyjazdu; ostatni przejazd kończy się w domu (pomijany),
     chyba że jest jedyny. Bez przejazdów – nocleg (miasto/nazwa), potem pierwszy punkt. */
  const cleanPlace = s => String(s || "").replace(/\s*\(?\b[A-Z]{3}\b\)?\s*$/, "").replace(/\s+(International|Airport|Intl\.?)$/i, "").trim();
  function tripName(items) {
    const all = items.filter(x => x.kind === "seg" && x.type !== "nocleg" && x.to && x.depart).sort((a, b) => a.depart.localeCompare(b.depart));
    const home = all.length ? cleanPlace(all[0].from) : "";
    // loty są ważniejsze niż dojazdy (pociąg na lotnisko, wycieczka na miejscu): jeśli są, liczymy tylko je
    const flights = all.filter(x => x.type === "lot");
    const legs = flights.length ? flights : all;
    let best = null, bestGap = -1;
    legs.forEach((l, i) => {
      const next = legs[i + 1];
      if (!next && legs.length > 1) return; // powrót do domu
      const to = cleanPlace(l.to);
      if (!to || (home && to === home)) return;
      const gap = next ? new Date(next.depart) - new Date(l.arrive || l.depart) : 1e12;
      if (gap > bestGap) { bestGap = gap; best = to; }
    });
    if (best) return best;
    const stay = items.find(x => x.kind === "seg" && x.type === "nocleg");
    if (stay) return stay.city || stay.name || "Nowa podróż";
    return (items[0] && items[0].title) || "Nowa podróż";
  }

  async function proposals({ past = false } = {}) {
    const [seen, trips] = await Promise.all([DB.getSetting("gmailSeen", {}), DB.all("trips")]);
    const T = App.todayStr(), from = App.addDays(T, -1);
    const list = [];
    for (const [id, m] of Object.entries(seen)) {
      if (m.s !== "new") continue;
      m.items.forEach((it, i) => { if (!it.done && (past || endOf(it) >= from)) list.push({ ...it, msgId: id, idx: i, mail: m }); });
    }
    list.sort((a, b) => (dayOf(a) + (a.kind === "seg" ? a.depart.slice(11) : a.time || "")).localeCompare(dayOf(b) + (b.kind === "seg" ? b.depart.slice(11) : b.time || "")));
    const groups = [];
    for (const it of list) {
      const d = dayOf(it);
      const trip = trips.find(t => App.addDays(t.start, -1) <= d && t.end >= d); // dzień wcześniej: nocny lot do celu
      let g = trip ? groups.find(x => x.trip && x.trip.id === trip.id) : groups.find(x => !x.trip && App.addDays(x.end, 4) >= d);
      if (!g) groups.push(g = { trip, start: d, end: endOf(it), items: [] });
      g.items.push(it);
      if (endOf(it) > g.end) g.end = endOf(it);
    }
    groups.forEach(g => {
      if (g.trip) return;
      g.name = tripName(g.items);
    });
    const pastCount = past ? 0 : Object.values(seen).filter(m => m.s === "new").reduce((n, m) => n + m.items.filter(it => !it.done && endOf(it) < from).length, 0);
    return { groups, count: list.length, pastCount };
  }

  async function newCount() {
    try { return (await proposals()).count; } catch (e) { return 0; }
  }

  /* ---------- dodawanie ---------- */
  async function setItem(msgId, idx, patch) {
    const seen = await DB.getSetting("gmailSeen", {});
    const m = seen[msgId];
    if (!m) return;
    Object.assign(m.items[idx], patch);
    if (m.items.every(it => it.done || it.skip)) m.s = m.items.some(it => it.done) ? "added" : "skip";
    await DB.setSetting("gmailSeen", seen);
  }

  async function addItem(it, tripId) {
    const { kind, msgId, idx, mail, done, skip, ...rec } = it;
    let saved, seg;
    if (kind === "seg") {
      saved = await DB.put("segments", { ...rec, tripId });
      seg = saved;
    } else {
      const day = (await DB.byIndex("planItems", "tripId", tripId)).filter(x => x.date === rec.date).length;
      saved = await DB.put("planItems", { tripId, date: rec.date, time: rec.time, title: rec.title, cat: rec.cat, place: rec.place, note: `Z Gmaila: ${mail.subject}`,
        cost: rec.cost, currency: rec.currency, order: day });
      seg = App.Tickets && App.Tickets.planSeg ? App.Tickets.planSeg(saved) : null;
    }
    // bilet z załącznika – do pierwszej pozycji z tego maila
    if (seg && mail.att && mail.att.length && !mail.attDone && App.Tickets && App.Tickets.addFiles) {
      try { await App.Tickets.addFiles(seg, [await attachmentFile(msgId, mail.att[0])]); await markAtt(msgId); } catch (e) { console.warn("gmail att:", e); }
    }
    await setItem(msgId, idx, { done: true });
    // podróż obejmuje nowe daty
    const trip = await DB.get("trips", tripId);
    const d1 = dayOf(it), d2 = endOf(it);
    if (trip && (d1 < trip.start || d2 > trip.end)) await DB.put("trips", { ...trip, start: d1 < trip.start ? d1 : trip.start, end: d2 > trip.end ? d2 : trip.end });
    return saved;
  }
  async function markAtt(msgId) {
    const seen = await DB.getSetting("gmailSeen", {});
    if (seen[msgId]) { seen[msgId].attDone = true; await DB.setSetting("gmailSeen", seen); }
  }

  async function newTrip(g) {
    return DB.put("trips", { name: g.name, destination: g.name, start: g.start, end: g.end, color: "#0f6e6e" });
  }

  /* ---------- połączenie ---------- */
  async function connect() {
    const t = await token(true);
    const prof = await (await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${t}` } })).json();
    if (!prof.emailAddress) throw new Error((prof.error && prof.error.message) || "Nie udało się odczytać adresu e-mail");
    await DB.setSetting("gmail", { email: prof.emailAddress, at: Date.now(), lastScan: 0, error: "" });
    return prof.emailAddress;
  }
  async function disconnect() {
    const P = plugin();
    try { if (P) await P.revoke({ scopes: [SCOPE] }); else if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok.value, () => {}); } catch (e) { /* i tak zapominamy */ }
    tok = null;
    await DB.setSetting("gmail", null);
    await DB.setSetting("gmailSeen", {});
  }

  /* samo przy starcie aplikacji (tylko w aplikacji na Androida – bez okna zgody) */
  async function auto() {
    if (!plugin() || !navigator.onLine) return;
    const cfg = await DB.getSetting("gmail", null);
    // przerwane przez limit Google – ponownie po 10 min, inaczej co 6 h
    if (!cfg || Date.now() - (cfg.lastScan || 0) < (cfg.partial ? 10 * 60e3 : SCAN_EVERY)) return;
    try {
      const r = await scan({ interactive: false });
      if (r.found && /^#\/podroze\/?$|^#?$/.test(location.hash)) App.render && App.render();
    } catch (e) { console.warn("gmail auto:", e.message); }
  }

  /* karta na ekranie głównym */
  async function homeCard() {
    const cfg = await DB.getSetting("gmail", null);
    if (!cfg) return "";
    const n = await newCount();
    if (!n) return "";
    return `<a class="plan-link gm-home" href="#/gmail"><span aria-hidden="true">📬</span> Z Gmaila: ${n} ${plural(n, "propozycja", "propozycje", "propozycji")}
      <span class="muted">– dodaj do podróży</span><b aria-hidden="true">›</b></a>`;
  }

  /* ---------- ekran ---------- */
  const TYPE_ICON = { lot: "✈️", pociag: "🚆", autobus: "🚌", prom: "⛴️", nocleg: "🏨" };
  function itemHtml(it) {
    const mailLine = `<div class="muted small gm-mail" translate="no">✉️ ${esc(it.mail.from || "")}${it.mail.from ? " · " : ""}${esc(it.mail.subject || "")}</div>`;
    const btns = `<div class="gm-btns"><button type="button" class="btn small primary" data-add="${it.msgId}:${it.idx}">➕ Dodaj</button>
      <button type="button" class="btn small" data-skip="${it.msgId}:${it.idx}">Pomiń</button></div>`;
    if (it.kind === "plan") {
      const C = (App.Plan.CATS || {})[it.cat] || { icon: "📌", name: "" };
      return `<div class="em-card gm-item">
        <div class="tl-ico" aria-hidden="true">${C.icon}</div>
        <div class="tl-main">
          <div class="muted small">${esc(C.name)}</div>
          <div class="tl-route" translate="no"><b>${esc(it.title)}</b></div>
          <div class="tl-time">${App.fmtDay(it.date)}${it.time ? ` ${it.time}` : ""}</div>
          ${it.place || it.cost ? `<div class="chips">${it.place ? `<span>${esc(it.place)}</span>` : ""}${it.cost ? `<span>${esc(String(it.cost).replace(".", ","))} ${esc(it.currency || "")}</span>` : ""}</div>` : ""}
          ${mailLine}${btns}
        </div></div>`;
    }
    const T = App.Trips.TYPES[it.type] || { icon: "🧳", name: "" };
    const title = it.type === "nocleg" ? (it.name || "Nocleg") : `${it.from || "?"} → ${it.to || "?"}`;
    const when = `${App.fmtDay(it.depart)} ${App.time(it.depart)}${it.arrive ? ` → ${it.arrive.slice(0, 10) !== it.depart.slice(0, 10) ? App.fmtDay(it.arrive) + " " : ""}${App.time(it.arrive)}` : ""}`;
    const bits = [it.carrier, it.number, it.booking ? `rez. ${it.booking}` : "", it.price ? `${String(it.price).replace(".", ",")} ${it.currency || ""}` : ""].filter(Boolean);
    return `<div class="em-card gm-item">
      <div class="tl-ico" aria-hidden="true">${TYPE_ICON[it.type] || T.icon}</div>
      <div class="tl-main">
        <div class="muted small">${esc(T.name)}</div>
        <div class="tl-route" translate="no"><b>${esc(title)}</b></div>
        <div class="tl-time">${when}</div>
        ${bits.length ? `<div class="chips">${bits.map(b => `<span>${esc(b)}</span>`).join("")}</div>` : ""}
        ${mailLine}${btns}
      </div></div>`;
  }

  const ago = ms => {
    if (!ms) return "jeszcze nie";
    const min = Math.round((Date.now() - ms) / 60e3);
    if (min < 2) return "przed chwilą";
    if (min < 60) return `${min} min temu`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h temu`;
    return App.fmtDay(new Date(ms).toISOString().slice(0, 10));
  };

  App.route(/^\/gmail$/, async (_, q) => {
    const cfg = await DB.getSetting("gmail", null);
    const past = q.wczesniej === "1";
    const back = q.wroc || "#/podroze";
    if (!cfg) {
      const can = available();
      return {
        title: "Z Gmaila",
        back,
        html: `
          <div class="gm-intro">
            <section class="tx-hero">
              <span class="tx-hero-ic" aria-hidden="true">${App.icon("mail")}</span>
              <div><h2>Propozycje z Twojej poczty</h2>
              <p>Połącz konto Google, a Podróżnik sam znajdzie w Gmailu potwierdzenia rezerwacji i zaproponuje, co dodać:</p></div>
            </section>
            <ul class="list gm-list">
              <li class="li"><span class="li-ico" aria-hidden="true">${App.icon("plane")}</span><span class="li-main"><b>Loty, pociągi, autobusy, promy</b></span></li>
              <li class="li"><span class="li-ico" aria-hidden="true">${App.icon("bed")}</span><span class="li-main"><b>Noclegi</b><small>Booking.com, Agoda, Airbnb…</small></span></li>
              <li class="li"><span class="li-ico" aria-hidden="true">${App.icon("ticket")}</span><span class="li-main"><b>Wycieczki, bilety wstępu, koncerty</b><small>GetYourGuide, Klook, Viator…</small></span></li>
              <li class="li"><span class="li-ico" aria-hidden="true">${App.icon("food")}</span><span class="li-main"><b>Stoliki w restauracjach</b></span></li>
            </ul>
            <p class="td-note gm-privacy">${App.icon("shield", "sm")}<span>Tylko odczyt – Podróżnik nie wysyła, nie usuwa i nie zmienia maili. Maile czyta telefon wprost z Gmaila, nic nie trafia na żaden serwer.
              Szuka tylko maili z rezerwacjami z ostatnich 13 miesięcy. Każdą propozycję zatwierdzasz sam.
              <a href="https://chiniak.github.io/podroznik/prywatnosc.html#gmail-pl" target="_blank" rel="noopener">Polityka prywatności</a></span></p>
            ${can ? `<button type="button" class="btn primary wide" id="gm-connect">${App.icon("lock", "sm")} <span>Zaloguj się kontem Google</span></button>`
              : `<p class="td-note error gm-web">${App.icon("info", "sm")}<span>Logowanie Google działa w aplikacji na Androida (Podróżnik 2.0). W przeglądarce możesz dalej wkleić maila: <a href="#/wklej">Dodaj z maila</a>.</span></p>`}
          </div>`,
        after(v) {
          const b = v.querySelector("#gm-connect");
          if (b) b.onclick = async () => {
            b.disabled = true; b.querySelector("span").textContent = "Łączę…";
            try {
              const email = await connect();
              App.toast(`Połączono: ${email}`);
              location.replace(`#/gmail?skanuj=1${q.wroc ? `&wroc=${encodeURIComponent(q.wroc)}` : ""}`);
            } catch (e) {
              b.disabled = false; b.querySelector("span").textContent = "Zaloguj się kontem Google";
              App.toast(e.message === "Anulowano" ? "Anulowano" : `Nie udało się połączyć: ${e.message || e}`);
            }
          };
        },
      };
    }

    const { groups, count, pastCount } = await proposals({ past });
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    const tripOpts = sel => trips.map(t => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)} · ${App.fmtRange(t.start, t.end)}</option>`).join("");
    const groupHtml = (g, gi) => `
      <section class="gm-group" data-g="${gi}">
        <h2 class="section">${g.trip ? `🧳 ${esc(g.trip.name)}` : `➕ Nowa podróż: ${esc(g.name)}`} <span class="muted small">${App.fmtRange(g.start, g.end)}</span></h2>
        ${g.items.map(itemHtml).join("")}
        <div class="card em-save">
          <label class="field"><span>Dodaj do podróży</span>
            <select data-trip="${gi}">${tripOpts(g.trip ? g.trip.id : "")}<option value="__new" ${g.trip ? "" : "selected"}>➕ Nowa podróż – ${esc(g.name || "")}</option></select></label>
          ${g.items.length > 1 ? `<button type="button" class="btn primary wide" data-all="${gi}">Dodaj wszystkie (${g.items.length})</button>` : ""}
        </div>
      </section>`;

    return {
      title: "Z Gmaila",
      back,
      html: `
        <div class="pr-sum gm-account">
          <div class="pr-sum-top"><span class="pr-sum-k">Gmail</span><span class="chip ok">połączone</span></div>
          <h2 class="gm-mail" translate="no">${esc(cfg.email)}</h2>
          <dl class="bk-facts"><div><dt>Sprawdzone</dt><dd id="gm-last">${ago(cfg.lastScan)}</dd></div></dl>
          ${cfg.error ? `<p class="error small gm-err">${esc(cfg.error)}</p>` : ""}
          <div class="add-row gm-acts">
            <button type="button" class="btn primary" id="gm-scan">${App.icon("undo", "sm")} Sprawdź teraz</button>
            <button type="button" class="btn" id="gm-off">Odłącz konto</button>
          </div>
          <p class="small muted gm-prog" id="gm-prog"></p>
        </div>
        ${count ? `<h2 class="section">Propozycje: ${count}</h2>${groups.map(groupHtml).join("")}`
          : `<p class="muted">${cfg.lastScan ? "Brak nowych propozycji – wszystko z maili jest już w podróżach albo pominięte." : "Sprawdzam maile…"}</p>`}
        ${pastCount ? `<p><a href="#/gmail?wczesniej=1">Pokaż też wcześniejsze (${pastCount}) – np. do statystyk</a></p>` : ""}
        ${past ? `<p><a href="#/gmail">Tylko nadchodzące</a></p>` : ""}
        <p class="small muted">Nie znalazło jakiejś rezerwacji? Otwórz maila i użyj „Udostępnij → Podróżnik” albo <a href="#/wklej">📧 wklej treść</a>.</p>`,
      after(v) {
        const prog = v.querySelector("#gm-prog"), scanBtn = v.querySelector("#gm-scan");
        async function runScan() {
          scanBtn.disabled = true; prog.textContent = "Szukam maili z rezerwacjami…";
          try {
            const r = await scan({ interactive: true, onProgress: (d, n, wait) => {
              prog.textContent = wait ? `Google ogranicza tempo – czekam ${wait} s i czytam dalej (${d}/${n})` : `Czytam maile… ${d}/${n}`;
              if (self.I18N) prog.textContent = I18N.tr(prog.textContent);
            } });
            App.toast(r.partial ? `Przeczytano ${r.checked} maili, reszta (${r.left}) przy następnym sprawdzeniu` : r.found ? `Nowe propozycje: ${r.found}` : "Brak nowych rezerwacji w mailach");
            location.replace(`#/gmail${past ? "?wczesniej=1" : ""}`);
            App.render && App.render();
          } catch (e) {
            scanBtn.disabled = false; prog.textContent = "";
            App.toast(e.status === 401 || e.code === "NEED_CONSENT" ? "Zaloguj się ponownie – wygasła zgoda Google" : `Nie udało się: ${e.message || e}`);
          }
        }
        scanBtn.onclick = runScan;
        v.querySelector("#gm-off").onclick = async () => {
          if (!confirm("Odłączyć konto Google? Dodane już pozycje zostaną w podróżach.")) return;
          await disconnect(); App.toast("Odłączono konto Google"); App.render ? App.render() : location.reload();
        };
        const flat = groups.flatMap((g, gi) => g.items.map(it => ({ it, gi })));
        const find = key => flat.find(x => `${x.it.msgId}:${x.it.idx}` === key);
        async function target(gi) {
          const sel = v.querySelector(`[data-trip="${gi}"]`);
          if (sel.value !== "__new") return sel.value;
          const t = await newTrip(groups[gi]);
          sel.innerHTML = tripOpts(t.id) + `<option value="__new">➕ Nowa podróż</option>`;
          trips.unshift(t);
          return t.id;
        }
        v.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => {
          const x = find(b.dataset.add); if (!x) return;
          b.disabled = true;
          const tripId = await target(x.gi);
          await addItem(x.it, tripId);
          b.closest(".gm-item").classList.add("gm-done");
          b.parentNode.innerHTML = `<span class="muted small">✅ Dodano</span>`;
          App.toast("Dodano do podróży");
        });
        v.querySelectorAll("[data-skip]").forEach(b => b.onclick = async () => {
          const x = find(b.dataset.skip); if (!x) return;
          await setItem(x.it.msgId, x.it.idx, { skip: true });
          b.closest(".gm-item").remove();
        });
        v.querySelectorAll("[data-all]").forEach(b => b.onclick = async () => {
          const gi = +b.dataset.all;
          b.disabled = true;
          const tripId = await target(gi);
          let n = 0;
          for (const x of flat.filter(x => x.gi === gi)) {
            const btn = v.querySelector(`[data-add="${x.it.msgId}:${x.it.idx}"]`);
            if (!btn || btn.disabled) continue;
            await addItem(x.it, tripId); n++;
          }
          App.toast(`Dodano ${n} ${plural(n, "pozycję", "pozycje", "pozycji")} – sprawdź szczegóły`);
          location.hash = `#/podroze/${tripId}`;
        });
        if (q.skanuj === "1" || !cfg.lastScan) runScan();
      },
    };
  });

  App.Gmail = { tripName, PACE, available, scan, proposals, newCount, homeCard, auto, connect, disconnect, extract, query, SCOPE };
  // pierwsze sprawdzenie chwilę po starcie (nie spowalnia otwierania aplikacji)
  setTimeout(() => auto(), 4000);
})();
