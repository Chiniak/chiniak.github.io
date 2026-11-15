/* Podróżnik – etap 5: licznik do podróży, przypomnienia i kalendarz.
   - Licznik na ekranie głównym: do następnej podróży albo (w trakcie podróży) do najbliższego odjazdu.
   - Przypomnienia: liczone w reminders-core.js; pokazywane jako powiadomienia, gdy aplikacja jest otwarta,
     przy jej otwarciu (zaległe) i – jeśli Chrome pozwoli – w tle (Periodic Background Sync w sw.js).
     Aktywne przypomnienia widać też jako baner na ekranie głównym.
   - Kalendarz: plik .ics z alarmami (pewne powiadomienia z aplikacji kalendarza) i link „Dodaj do Google Kalendarza”.
   Trasy: #/ustawienia/przypomnienia */
(function () {
  const { esc, plural } = App;
  const R = Reminders;

  /* ---------- aplikacja na Androida: powiadomienia zaplanowane w telefonie (@capacitor/local-notifications) ----------
     Najbliższe przypomnienia (do LIMIT, 60 dni) są planowane w systemie – przychodzą o czasie przy zamkniętej aplikacji
     i po restarcie telefonu. Plan odświeżany przy starcie, po zmianach (każdy ekran, z opóźnieniem) i przy chowaniu aplikacji.
     Klucze zaplanowanych („id@at”) w localStorage – tick() nie pokazuje ich drugi raz. */
  const LN = () => window.PodroznikNative && PodroznikNative.isNative && window.Capacitor && Capacitor.Plugins.LocalNotifications;
  const CHANNEL = "przypomnienia", LIMIT = 60, KEYS = "podroznik-ln-keys", SIG = "podroznik-ln-sig";
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* brak miejsca */ } };
  const numId = key => { let h = 7; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0; return (h & 0x3fffffff) || 1; };
  const tr = t => self.I18N ? I18N.tr(t) : t;
  const nPerm = { display: "prompt", exact: "granted" };
  async function nativePerms() {
    const P = LN();
    try { nPerm.display = (await P.checkPermissions()).display; } catch (e) { nPerm.display = "denied"; }
    try { nPerm.exact = (await P.checkExactNotificationSetting()).exact_alarm || "granted"; } catch (e) { nPerm.exact = "granted"; }
    return nPerm;
  }
  let channelReady = null;
  const channel = () => channelReady || (channelReady = LN().createChannel({ id: CHANNEL, name: tr("Przypomnienia o podróży"), description: tr("Odjazdy, odprawa, pakowanie, plan dnia"),
    importance: 4, visibility: 1, vibration: true }).catch(e => console.warn("kanał:", e)));
  const toNative = (r, at) => ({ id: numId(`${r.id}@${r.at}`), title: tr(r.title), body: tr(r.body), largeBody: tr(r.body), channelId: CHANNEL,
    smallIcon: "ic_stat_podroznik", iconColor: "#0F6E6E", extra: { href: r.href || "/podroze" },
    schedule: { at, allowWhileIdle: true }, isExactNotification: nPerm.exact === "granted" });

  let syncTimer = null, syncing = null;
  async function syncNative() {
    const P = LN();
    if (!P) return null;
    if (syncing) return syncing;
    syncing = (async () => {
      await nativePerms();
      if (nPerm.display !== "granted") return { scheduled: 0, perm: nPerm.display };
      const { list } = await R.load();
      const now = R.nowStr(), until = R.addMin(now, 60 * 24 * 60);
      const next = list.filter(r => r.at > now && r.at <= until).sort((a, b) => a.at.localeCompare(b.at)).slice(0, LIMIT);
      const sig = JSON.stringify([nPerm.exact, self.I18N ? I18N.lang : "pl", next.map(r => [r.id, r.at, r.title, r.body, r.href])]);
      const pending = await P.getPending().catch(() => ({ notifications: [] }));
      // bez zmian i wszystko dalej zaplanowane (po aktualizacji aplikacji / wymuszonym zatrzymaniu system kasuje alarmy)
      const have = new Set((pending.notifications || []).map(n => +n.id)), soon = R.addMin(now, 2);
      if (sig === lsGet(SIG, "") && next.filter(r => r.at > soon).every(r => have.has(numId(`${r.id}@${r.at}`)))) return { scheduled: next.length, same: true };
      await channel();
      if (pending.notifications && pending.notifications.length) await P.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) }).catch(() => {});
      if (next.length) await P.schedule({ notifications: next.map(r => toNative(r, new Date(r.at))) });
      lsSet(KEYS, next.map(r => `${r.id}@${r.at}`));
      lsSet(SIG, sig);
      return { scheduled: next.length };
    })();
    try { return await syncing; } catch (e) { console.warn("powiadomienia:", e); return { error: e.message || String(e) }; } finally { syncing = null; }
  }
  const syncSoon = (ms = 3000) => { if (!LN()) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNative, ms); };

  async function startNative() {
    const P = LN();
    P.addListener("localNotificationActionPerformed", e => {
      const href = e && e.notification && e.notification.extra && e.notification.extra.href;
      if (href) location.hash = `#${href}`;
    });
    await nativePerms();
    // pierwsze uruchomienie: pytamy o zgodę, gdy są przypomnienia do zaplanowania (raz – potem w Ustawieniach)
    if (nPerm.display === "prompt" && !lsGet("podroznik-ln-asked", false)) {
      const { list } = await R.load();
      if (list.some(r => r.at > R.nowStr())) {
        lsSet("podroznik-ln-asked", true);
        try { nPerm.display = (await P.requestPermissions()).display; } catch (e) { /* odmowa */ }
      }
    }
    syncNative();
    document.addEventListener("visibilitychange", () => { if (document.hidden) syncNative(); });
  }

  /* ---------- pokazywanie powiadomień ---------- */
  const canNotify = () => LN() ? nPerm.display === "granted" : "Notification" in window && Notification.permission === "granted";
  async function showNotification(r) {
    const P = LN();
    if (P) {
      // zaplanowane w telefonie – system już je pokazał (albo pokaże), nie dublujemy
      if (r.id !== "test" && lsGet(KEYS, []).includes(`${r.id}@${r.at}`)) return true;
      if (nPerm.display !== "granted") return false;
      try { await channel(); await P.schedule({ notifications: [toNative(r, new Date(Date.now() + 1500))] }); return true; }
      catch (e) { console.warn("Powiadomienie:", e); return false; }
    }
    if (!canNotify() || !("serviceWorker" in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(r.title, { body: r.body, tag: r.id, icon: "icon-192.png", badge: "icon-192.png", data: { href: r.href }, renotify: true });
      return true;
    } catch (e) { console.warn("Powiadomienie:", e); return false; }
  }

  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try { await R.check(showNotification); } catch (e) { console.warn(e); } finally { ticking = false; }
  }

  async function registerBackground() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!("periodicSync" in reg)) return "brak";
      const st = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (st.state !== "granted") return "brak zgody";
      await reg.periodicSync.register("reminders", { minInterval: 60 * 60 * 1000 });
      return "włączone";
    } catch (e) { return "brak"; }
  }

  function start() {
    if (LN()) startNative().catch(e => console.warn(e)).then(() => tick());
    else tick();
    setInterval(() => { if (!document.hidden) tick(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
    if ("serviceWorker" in navigator && !LN()) registerBackground();
  }
  document.addEventListener("DOMContentLoaded", start);

  /* ---------- licznik ---------- */
  function target(trips, segs) {
    const now = R.nowStr(), today = App.todayStr();
    const transport = segs.filter(s => s.depart && s.type !== "nocleg").sort((a, b) => a.depart.localeCompare(b.depart));
    const ongoing = trips.filter(t => t.start <= today && today <= t.end).sort((a, b) => a.start.localeCompare(b.start));
    for (const t of ongoing) {
      const s = transport.find(x => x.tripId === t.id && x.depart > now);
      if (s) return { trip: t, seg: s, at: s.depart, label: "Najbliższy odjazd" };
    }
    const next = trips.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!next) return null;
    const s = transport.find(x => x.tripId === next.id && x.depart > now);
    return { trip: next, seg: s || null, at: s ? s.depart : `${next.start}T00:00`, label: "Do wyjazdu" };
  }

  function parts(at) {
    const ms = R.parse(at) - Date.now();
    if (ms <= 0) return [["0", "min"]];
    const sec = Math.floor(ms / 1000), d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (d > 0) return [[d, d === 1 ? "dzień" : "dni"], [h, "godz."], [m, "min"]];
    if (h > 0) return [[h, "godz."], [m, "min"], [String(s).padStart(2, "0"), "sek."]];
    return [[m, "min"], [String(s).padStart(2, "0"), "sek."]];
  }
  const partsHtml = at => parts(at).map(([v, u]) => `<div><b>${v}</b><span>${u}</span></div>`).join("");

  // karty na ekran główny: licznik + aktywne przypomnienia
  async function homeCards({ countdown = true } = {}) {
    const [trips, segs, files, dismissed] = await Promise.all([DB.all("trips"), DB.all("segments"), DB.all("files"), DB.getSetting("remDismissed", {})]);
    let html = "";

    let due = [];
    try { due = R.active((await R.load()).list); } catch (e) { /* bez przypomnień */ }
    due = due.filter(r => !dismissed[`${r.id}@${r.at}`]);
    if (due.length) html += `
      <section class="rm-due" aria-label="Przypomnienia">
        ${due.slice(0, 4).map(r => `
          <div class="rm-row">
            <span class="rm-bell" aria-hidden="true">${App.icon ? App.icon("bell") : "🔔"}</span>
            <a class="rm-txt" href="#${esc(r.href)}"><b>${esc(r.title)}</b><span>${esc(r.body)}</span></a>
            <button type="button" class="rm-x" data-dismiss="${esc(`${r.id}@${r.at}`)}" aria-label="Ukryj przypomnienie">${App.icon ? App.icon("close", "sm") : "✕"}</button>
          </div>`).join("")}
      </section>`;

    const tg = countdown ? target(trips, segs) : null; // ekran główny (redesign) ma własne odliczanie w karcie podróży
    if (tg) {
      const T = tg.seg ? App.Trips.typeOf(tg.seg) : null;
      const file = tg.seg ? files.filter(f => f.segmentId === tg.seg.id).sort((a, b) => (a.created || "").localeCompare(b.created || ""))[0] : null;
      const pk = App.Pack ? await App.Pack.summary(tg.trip.id) : null;
      const sub = tg.seg
        ? `<a class="cd-sub" href="#/odcinek/${tg.seg.id}">${T.icon} ${esc(tg.seg.from || "?")} → ${esc(tg.seg.to || "?")} · ${App.fmtDay(tg.seg.depart)} ${App.time(tg.seg.depart)}</a>`
        : `<a class="cd-sub" href="#/podroze/${tg.trip.id}">${App.fmtRange(tg.trip.start, tg.trip.end)} · dodaj transport, by liczyć do odjazdu</a>`;
      html += `
        <section class="cd-card" style="--c:${esc(tg.trip.color || "#0f6e6e")}" aria-label="Licznik">
          <div class="cd-label">${tg.label} · <a href="#/podroze/${tg.trip.id}">${esc(tg.trip.name)}</a></div>
          <div class="cd-time" id="cd-time" data-at="${tg.at}" role="timer">${partsHtml(tg.at)}</div>
          ${sub}
          <div class="cd-actions">
            ${file ? `<a class="btn" href="#/bilet/${file.id}">🎫 Bilet</a>` : ""}
            ${tg.label === "Do wyjazdu" ? `<a class="btn" href="#/pakowanie/${tg.trip.id}">🧳 ${pk && pk.total ? `Spakowane ${pk.done}/${pk.total}` : "Pakowanie"}</a>` : ""}
            <a class="btn" href="#/plan/${tg.trip.id}">🗓️ Plan</a>
          </div>
        </section>`;
    }

    let timer = null;
    return {
      html,
      segId: tg && tg.seg ? tg.seg.id : null,
      after(view) {
        const el = countdown ? view.querySelector("#cd-time") : null; // bez licznika: odliczanie należy do ekranu głównego (trips.js)
        if (el) timer = setInterval(() => { el.innerHTML = partsHtml(el.dataset.at); }, 1000);
        view.querySelectorAll("[data-dismiss]").forEach(b => b.onclick = async () => {
          const d = await DB.getSetting("remDismissed", {});
          d[b.dataset.dismiss] = R.nowStr();
          await DB.setSetting("remDismissed", d);
          const box = b.closest(".rm-due");
          b.closest(".rm-row").remove();
          if (!box.querySelector(".rm-row")) box.remove();
        });
      },
      cleanup() { clearInterval(timer); },
    };
  }

  /* ---------- kalendarz ---------- */
  const icsDate = s => s.replace(/[-:]/g, "").slice(0, 13) + "00";          // 2026-11-20T06:40 → 20261120T064000 (czas lokalny)
  const icsDay = s => s.slice(0, 10).replace(/-/g, "");
  const icsText = t => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  function fold(line) {
    // linie w .ics: maks. 75 bajtów, dalszy ciąg od spacji
    const enc = new TextEncoder(), out = [];
    let cur = "", bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  function segInfo(s) {
    return [s.carrier, s.number, s.car ? `wagon ${s.car}` : "", s.seat ? `miejsce ${s.seat}` : "", s.platform ? `peron ${s.platform}` : "",
      s.gate ? `gate ${s.gate}` : "", s.terminal ? `terminal ${s.terminal}` : "", s.booking ? `rezerwacja ${s.booking}` : "", s.note || ""].filter(Boolean).join(" · ");
  }
  const segSummary = s => {
    const T = App.Trips.typeOf(s);
    return s.type === "nocleg" ? `${T.icon} ${s.name || "Nocleg"}` : `${T.icon} ${s.from || "?"} → ${s.to || "?"}${s.number ? ` (${s.number})` : ""}`;
  };

  async function buildIcs(tripIds) {
    const { cfg, list } = await R.load();
    const ids = new Set(tripIds);
    const trips = (await DB.all("trips")).filter(t => ids.has(t.id));
    const segs = (await DB.all("segments")).filter(s => ids.has(s.tripId) && s.depart);
    const plan = (await DB.all("planItems")).filter(i => ids.has(i.tripId) && i.time);
    const todos = (await DB.all("packItems")).filter(i => ids.has(i.tripId) && i.list === "todo" && i.due && i.status !== "done");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Podroznik//PL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Podróżnik"];
    const alarm = (trigger, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];
    const ev = (uid, start, end, summary, { allDay, loc, desc, alarms = [] } = {}) => {
      L.push("BEGIN:VEVENT", `UID:${uid}@podroznik`, `DTSTAMP:${stamp}`,
        allDay ? `DTSTART;VALUE=DATE:${icsDay(start)}` : `DTSTART:${icsDate(start)}`,
        allDay ? `DTEND;VALUE=DATE:${icsDay(end)}` : `DTEND:${icsDate(end)}`,
        `SUMMARY:${icsText(summary)}`);
      if (loc) L.push(`LOCATION:${icsText(loc)}`);
      if (desc) L.push(`DESCRIPTION:${icsText(desc)}`);
      alarms.forEach(a => L.push(...a));
      L.push("END:VEVENT");
    };

    for (const t of trips) ev(`trip-${t.id}`, t.start, App.addDays(t.end, 1), `🧳 ${t.name}`, { allDay: true, loc: t.destination, desc: t.note });
    for (const s of segs) {
      const end = s.arrive && s.arrive > s.depart ? s.arrive : R.addMin(s.depart, 60);
      // alarmy = przypomnienia z ustawień, liczone względem początku wydarzenia
      const alarms = list.filter(r => r.href === `/odcinek/${s.id}` && r.at <= s.depart)
        .map(r => alarm(`-PT${R.minutesBetween(r.at, s.depart)}M`, r.title));
      ev(`seg-${s.id}`, s.depart, end, segSummary(s), {
        loc: s.type === "nocleg" ? (s.address || s.name) : s.from, desc: segInfo(s), alarms });
    }
    for (const i of plan) {
      const st = `${i.date}T${i.time}`;
      ev(`plan-${i.id}`, st, R.addMin(st, 60), `${(App.Plan.CATS[i.cat] || App.Plan.CATS.inne).icon} ${i.title}`,
        { loc: i.place, desc: i.note, alarms: cfg.plan > 0 ? [alarm(`-PT${cfg.plan}M`, i.title)] : [] });
    }
    for (const i of todos) ev(`todo-${i.id}`, i.due, App.addDays(i.due, 1), `✅ ${i.name}`,
      { allDay: true, alarms: cfg.todos ? [alarm("PT9H", i.name)] : [] });
    L.push("END:VCALENDAR");
    return { text: L.map(fold).join("\r\n") + "\r\n", count: trips.length + segs.length + plan.length + todos.length };
  }

  async function exportTrips(tripIds, name) {
    if (!tripIds.length) return App.toast("Brak podróży do eksportu");
    const { text, count } = await buildIcs(tripIds);
    const fileName = `${(name || "podroze").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "podroze"}.ics`;
    const file = new File([text], fileName, { type: "text/calendar" });
    // na telefonie: menu „Udostępnij” (np. do aplikacji Kalendarz); gdy się nie da – zwykłe pobranie pliku
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fileName }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    App.toast(`Zapisano ${fileName} · ${count} ${plural(count, "wydarzenie", "wydarzenia", "wydarzeń")}`);
  }

  // jedno wydarzenie w Google Kalendarzu (na Androidzie otwiera aplikację Kalendarz)
  function gcalUrl(s) {
    const end = s.arrive && s.arrive > s.depart ? s.arrive : R.addMin(s.depart, 60);
    const p = new URLSearchParams({
      action: "TEMPLATE", text: segSummary(s), dates: `${icsDate(s.depart)}/${icsDate(end)}`,
      details: `${segInfo(s)}\n\nBilet: aplikacja Podróżnik`.trim(), location: s.type === "nocleg" ? (s.address || s.name || "") : (s.from || ""),
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  /* ================= USTAWIENIA PRZYPOMNIEŃ ================= */
  const BEFORE = [[0, "wył."], [15, "15 min"], [30, "30 min"], [60, "1 h"], [90, "1,5 h"], [120, "2 h"], [180, "3 h"], [240, "4 h"]];
  const opts = (list, v) => list.map(([k, n]) => `<option value="${k}" ${+v === k ? "selected" : ""}>${n}</option>`).join("");
  const sw = (name, on, label) => `<label class="sw"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="sw-ui" aria-hidden="true"></span><span>${label}</span></label>`;

  async function permText() {
    if (LN()) {
      await nativePerms();
      if (nPerm.display === "granted") return ["włączone ✅", nPerm.exact === "granted" ? "" : "Telefon może je opóźniać o kilka minut – włącz „Dokładne godziny” poniżej."];
      if (nPerm.display === "denied") return ["zablokowane ❌", "Włącz je w ustawieniach telefonu: Aplikacje → Podróżnik → Powiadomienia."];
      return ["nie włączone", ""];
    }
    if (!("Notification" in window)) return ["niedostępne", "Ta przeglądarka nie obsługuje powiadomień."];
    if (Notification.permission === "granted") return ["włączone ✅", ""];
    if (Notification.permission === "denied") return ["zablokowane ❌", "Odblokuj w Chrome: ⋮ → Ustawienia → Ustawienia witryn → Powiadomienia (albo ikona kłódki przy adresie)."];
    return ["nie włączone", ""];
  }

  App.route(/^\/ustawienia\/przypomnienia$/, async () => {
    const { cfg, list } = await R.load();
    const [perm, permHelp] = await permText();
    const native = !!LN();
    const sync = native ? await syncNative() : null;
    const bg = native ? "" : "serviceWorker" in navigator ? await registerBackground() : "brak";
    const now = R.nowStr();
    const upcoming = list.filter(r => r.at > now).slice(0, 8);
    const trips = (await DB.all("trips")).filter(t => t.end >= App.todayStr());

    const typeRows = Object.entries(R.TYPES).map(([k, [icon, name]]) => {
      const c = cfg.types[k];
      return `
        <div class="rm-type" data-type="${k}">
          <div class="rm-type-name"><span class="li-ico" aria-hidden="true">${App.icon.type(k)}</span> ${name}</div>
          <div class="rm-type-opts">
            ${sw("day", c.day, k === "nocleg" ? "Dzień przed zameldowaniem (19:00)" : "Dzień wcześniej (19:00)")}
            ${k === "nocleg" ? sw("checkout", c.checkout, "Rano w dniu wymeldowania")
              : `<label class="rm-sel"><span>Przed odjazdem</span><select name="before">${opts(BEFORE, c.before)}</select></label>`}
            ${k === "lot" ? sw("checkin", c.checkin, "Odprawa online (24 h przed)") : ""}
          </div>
        </div>`;
    }).join("");

    return {
      title: "Przypomnienia",
      back: "#/ustawienia",
      html: `
        <section class="pr-sum rm-status">
          <div class="pr-sum-top"><span class="pr-sum-k">Powiadomienia</span>${canNotify() ? `<span class="chip ok">działają</span>` : `<span class="chip warn">nie działają</span>`}</div>
          <dl class="bk-facts">
            <div><dt>Na tym telefonie</dt><dd>${perm}</dd></div>
            ${native ? `<div><dt>Zaplanowane w telefonie</dt><dd>${sync && sync.scheduled != null ? sync.scheduled : 0}</dd></div>
            <div><dt>Dokładne godziny</dt><dd>${nPerm.exact === "granted" ? "tak ✅" : "nie"}</dd></div>`
            : `<div><dt>Sprawdzanie w tle</dt><dd>${bg === "włączone" ? "włączone ✅" : "niedostępne"}</dd></div>`}
          </dl>
          ${permHelp ? `<p class="rm-help">${permHelp}</p>` : ""}
          <div class="rm-btns">
            ${(native ? nPerm.display === "prompt" : "Notification" in window && Notification.permission === "default") ? `<button type="button" class="btn primary" id="rm-perm">${App.icon("bell", "sm")} Włącz powiadomienia</button>` : ""}
            ${native && nPerm.display === "granted" && nPerm.exact !== "granted" ? `<button type="button" class="btn primary" id="rm-exact">${App.icon("clock", "sm")} Dokładne godziny</button>` : ""}
            ${canNotify() ? `<button type="button" class="btn" id="rm-test">Wyślij próbne</button>` : ""}
          </div>
          ${native ? `<p class="rm-note">Przypomnienia są zaplanowane w telefonie – przyjdą o czasie także przy zamkniętej aplikacji i po ponownym uruchomieniu telefonu.
            Najbliższe ${LIMIT} na 60 dni; plan odświeża się sam po każdej zmianie.</p>` : `<p class="rm-note">Aplikacja internetowa nie zawsze może obudzić się sama o czasie.
            Pewne są przypomnienia, gdy aplikacja jest otwarta albo gdy ją otworzysz (zaległe pokażą się od razu).
            ${bg === "włączone" ? "Chrome sprawdza je też w tle, ale sam decyduje jak często (zwykle kilka razy na dobę)." : "Sprawdzanie w tle Chrome włącza dopiero dla aplikacji dodanej do ekranu głównego i często używanej."}
            <b>Na 100% zadziała eksport do kalendarza</b> (niżej) – wtedy przypomni aplikacja Kalendarz.</p>`}
        </section>

        <form id="rm-form">
          <div class="list rm-master">
            ${sw("enabled", cfg.enabled, "<b>Przypomnienia włączone</b>")}
          </div>
          <h2 class="section">Transport i noclegi</h2>
          <div class="list rm-types">${typeRows}</div>
          <h2 class="section">Pakowanie i plan</h2>
          <div class="list rm-other">
            <label class="rm-sel"><span>Nie spakowane rzeczy (o 18:00)</span>
              <select name="packDays">${opts([[0, "wył."], [1, "1 dzień przed"], [2, "2 dni przed"], [3, "3 dni przed"], [5, "5 dni przed"], [7, "tydzień przed"]], cfg.packDays)}</select></label>
            ${sw("todos", cfg.todos, "Zadania z terminem – o 9:00 w dniu terminu")}
            ${sw("backup", cfg.backup, "Kopia zapasowa – 3 dni przed wyjazdem, jeśli są nowe zmiany")}
            ${sw("visa", cfg.visa, "Wizy i zezwolenia na wjazd – z wyprzedzeniem przed przylotem")}
            <label class="rm-sel"><span>Punkty planu z godziną</span>
              <select name="plan">${opts([[0, "wył."], [15, "15 min przed"], [30, "30 min przed"], [60, "1 h przed"]], cfg.plan)}</select></label>
          </div>
        </form>

        <h2 class="section">Kalendarz</h2>
        <div class="bg-cfg rm-cal">
          <p class="small">Plik .ics z podróżami, transportem, planem i zadaniami – razem z alarmami ustawionymi wyżej.
            Na telefonie wybierz aplikację Kalendarz (np. Samsung). Google Kalendarz importuje pliki na komputerze (calendar.google.com → Ustawienia → Importuj);
            na telefonie użyj przycisku „Dodaj do Google Kalendarza” na stronie lotu / pociągu.</p>
          <button type="button" class="btn primary wide" id="rm-ics" ${trips.length ? "" : "disabled"}>${App.icon("plan", "sm")} Eksportuj nadchodzące podróże (${trips.length})</button>
        </div>

        <h2 class="section">Najbliższe przypomnienia</h2>
        <div class="list rm-list">
          ${upcoming.length ? upcoming.map(r => `
            <a class="li rm-up" href="#${esc(r.href)}"><span class="li-ico" aria-hidden="true">${App.icon("bell")}</span><span class="li-main"><b>${esc(r.title)}</b><small>${esc(r.body)}</small></span>
              <span class="rm-when">${App.fmtDay(r.at)}<b>${App.time(r.at)}</b></span></a>`).join("")
            : `<p class="f-hint rm-none">Brak zaplanowanych przypomnień${cfg.enabled ? "" : " – przypomnienia są wyłączone"}.</p>`}
        </div>`,
      after(view) {
        const form = view.querySelector("#rm-form");
        form.addEventListener("change", async () => {
          const f = new FormData(form);
          const next = { enabled: form.enabled.checked, packDays: +f.get("packDays"), todos: form.todos.checked, backup: form.backup.checked, visa: form.visa.checked, plan: +f.get("plan"), types: {} };
          form.querySelectorAll(".rm-type").forEach(row => {
            const t = {}, g = n => row.querySelector(`[name="${n}"]`);
            if (g("day")) t.day = g("day").checked;
            if (g("before")) t.before = +g("before").value;
            if (g("checkin")) t.checkin = g("checkin").checked;
            if (g("checkout")) t.checkout = g("checkout").checked;
            next.types[row.dataset.type] = t;
          });
          await DB.setSetting("reminders", next);
          App.toast("Zapisano");
          syncSoon(500);
        });
        const perm = view.querySelector("#rm-perm");
        if (perm) perm.onclick = async () => {
          if (LN()) {
            lsSet("podroznik-ln-asked", true);
            let d = "denied";
            try { d = (await LN().requestPermissions()).display; } catch (e) { /* odmowa */ }
            App.toast(d === "granted" ? "Powiadomienia włączone" : "Nie włączono powiadomień");
            await syncNative(); App.render(); return;
          }
          const r = await Notification.requestPermission();
          App.toast(r === "granted" ? "Powiadomienia włączone" : "Nie włączono powiadomień");
          if (r === "granted") { registerBackground(); tick(); }
          App.render();
        };
        const exact = view.querySelector("#rm-exact");
        if (exact) exact.onclick = async () => {
          try { await LN().changeExactNotificationSetting(); } catch (e) { /* ekran ustawień telefonu */ }
          lsSet(SIG, ""); await syncNative(); App.render();
        };
        const test = view.querySelector("#rm-test");
        if (test) test.onclick = async () => {
          const ok = await showNotification({ id: "test", title: "Podróżnik – próba", body: "Tak będą wyglądać przypomnienia o podróży ✈️", href: "/podroze" });
          App.toast(ok ? "Wysłano – sprawdź pasek powiadomień" : "Nie udało się wysłać");
        };
        view.querySelector("#rm-ics").onclick = () => exportTrips(trips.map(t => t.id), trips.length === 1 ? trips[0].name : "podroze");
      },
    };
  });

  // po zmianach danych (zapis → przejście na inny ekran) plan powiadomień w telefonie odświeża się sam
  window.addEventListener("hashchange", () => syncSoon());

  App.Reminders = { homeCards, exportTrips, gcalUrl, buildIcs, tick, syncNative, notifyOn: () => canNotify() };
})();
