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

  /* ---------- pokazywanie powiadomień ---------- */
  const canNotify = () => "Notification" in window && Notification.permission === "granted";
  async function showNotification(r) {
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
    tick();
    setInterval(() => { if (!document.hidden) tick(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
    if ("serviceWorker" in navigator) registerBackground();
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
  async function homeCards() {
    const [trips, segs, files, dismissed] = await Promise.all([DB.all("trips"), DB.all("segments"), DB.all("files"), DB.getSetting("remDismissed", {})]);
    let html = "";

    let due = [];
    try { due = R.active((await R.load()).list); } catch (e) { /* bez przypomnień */ }
    due = due.filter(r => !dismissed[`${r.id}@${r.at}`]);
    if (due.length) html += `
      <section class="rm-due" aria-label="Przypomnienia">
        ${due.slice(0, 4).map(r => `
          <div class="rm-row">
            <span class="rm-bell" aria-hidden="true">🔔</span>
            <a class="rm-txt" href="#${esc(r.href)}"><b>${esc(r.title)}</b><span>${esc(r.body)}</span></a>
            <button type="button" class="rm-x" data-dismiss="${esc(`${r.id}@${r.at}`)}" aria-label="Ukryj przypomnienie">✕</button>
          </div>`).join("")}
      </section>`;

    const tg = target(trips, segs);
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
        const el = view.querySelector("#cd-time");
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
    if (!("Notification" in window)) return ["niedostępne", "Ta przeglądarka nie obsługuje powiadomień."];
    if (Notification.permission === "granted") return ["włączone ✅", ""];
    if (Notification.permission === "denied") return ["zablokowane ❌", "Odblokuj w Chrome: ⋮ → Ustawienia → Ustawienia witryn → Powiadomienia (albo ikona kłódki przy adresie)."];
    return ["nie włączone", ""];
  }

  App.route(/^\/ustawienia\/przypomnienia$/, async () => {
    const { cfg, list } = await R.load();
    const [perm, permHelp] = await permText();
    const bg = "serviceWorker" in navigator ? await registerBackground() : "brak";
    const now = R.nowStr();
    const upcoming = list.filter(r => r.at > now).slice(0, 8);
    const trips = (await DB.all("trips")).filter(t => t.end >= App.todayStr());

    const typeRows = Object.entries(R.TYPES).map(([k, [icon, name]]) => {
      const c = cfg.types[k];
      return `
        <div class="rm-type" data-type="${k}">
          <div class="rm-type-name"><span aria-hidden="true">${icon}</span> ${name}</div>
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
        <div class="card">
          <h2>Powiadomienia</h2>
          <div class="row"><span class="muted">Na tym telefonie</span><b>${perm}</b></div>
          <div class="row"><span class="muted">Sprawdzanie w tle</span><b>${bg === "włączone" ? "włączone ✅" : "niedostępne"}</b></div>
          ${permHelp ? `<p class="small muted">${permHelp}</p>` : ""}
          <div class="rm-btns">
            ${"Notification" in window && Notification.permission === "default" ? `<button type="button" class="btn primary" id="rm-perm">🔔 Włącz powiadomienia</button>` : ""}
            ${canNotify() ? `<button type="button" class="btn" id="rm-test">Wyślij próbne</button>` : ""}
          </div>
          <p class="rm-note">Aplikacja internetowa nie zawsze może obudzić się sama o czasie.
            Pewne są przypomnienia, gdy aplikacja jest otwarta albo gdy ją otworzysz (zaległe pokażą się od razu).
            ${bg === "włączone" ? "Chrome sprawdza je też w tle, ale sam decyduje jak często (zwykle kilka razy na dobę)." : "Sprawdzanie w tle Chrome włącza dopiero dla aplikacji dodanej do ekranu głównego i często używanej."}
            <b>Na 100% zadziała eksport do kalendarza</b> (niżej) – wtedy przypomni aplikacja Kalendarz.</p>
        </div>

        <form id="rm-form">
          <div class="card">
            ${sw("enabled", cfg.enabled, "<b>Przypomnienia włączone</b>")}
          </div>
          <h3 class="section">Transport i noclegi</h3>
          <div class="card rm-types">${typeRows}</div>
          <h3 class="section">Pakowanie i plan</h3>
          <div class="card">
            <label class="rm-sel"><span>🧳 Nie spakowane rzeczy (o 18:00)</span>
              <select name="packDays">${opts([[0, "wył."], [1, "1 dzień przed"], [2, "2 dni przed"], [3, "3 dni przed"], [5, "5 dni przed"], [7, "tydzień przed"]], cfg.packDays)}</select></label>
            ${sw("todos", cfg.todos, "✅ Zadania z terminem – o 9:00 w dniu terminu")}
            ${sw("backup", cfg.backup, "💾 Kopia zapasowa – 3 dni przed wyjazdem, jeśli są nowe zmiany")}
            <label class="rm-sel"><span>🗓️ Punkty planu z godziną</span>
              <select name="plan">${opts([[0, "wył."], [15, "15 min przed"], [30, "30 min przed"], [60, "1 h przed"]], cfg.plan)}</select></label>
          </div>
        </form>

        <h3 class="section">Kalendarz</h3>
        <div class="card">
          <p class="small" style="margin-top:0">Plik .ics z podróżami, transportem, planem i zadaniami – razem z alarmami ustawionymi wyżej.
            Na telefonie wybierz aplikację Kalendarz (np. Samsung). Google Kalendarz importuje pliki na komputerze (calendar.google.com → Ustawienia → Importuj);
            na telefonie użyj przycisku „Dodaj do Google Kalendarza” na stronie lotu / pociągu.</p>
          <button type="button" class="btn primary wide" id="rm-ics" ${trips.length ? "" : "disabled"}>📅 Eksportuj nadchodzące podróże (${trips.length})</button>
        </div>

        <h3 class="section">Najbliższe przypomnienia</h3>
        <div class="card">
          ${upcoming.length ? upcoming.map(r => `
            <a class="row rm-up" href="#${esc(r.href)}"><span><b>${esc(r.title)}</b><br><span class="muted small">${esc(r.body)}</span></span>
              <b class="rm-when">${App.fmtDay(r.at)}<br>${App.time(r.at)}</b></a>`).join("")
            : `<p class="muted small" style="margin:0">Brak zaplanowanych przypomnień${cfg.enabled ? "" : " – przypomnienia są wyłączone"}.</p>`}
        </div>`,
      after(view) {
        const form = view.querySelector("#rm-form");
        form.addEventListener("change", async () => {
          const f = new FormData(form);
          const next = { enabled: form.enabled.checked, packDays: +f.get("packDays"), todos: form.todos.checked, backup: form.backup.checked, plan: +f.get("plan"), types: {} };
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
        });
        const perm = view.querySelector("#rm-perm");
        if (perm) perm.onclick = async () => {
          const r = await Notification.requestPermission();
          App.toast(r === "granted" ? "Powiadomienia włączone" : "Nie włączono powiadomień");
          if (r === "granted") { registerBackground(); tick(); }
          App.render();
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

  App.Reminders = { homeCards, exportTrips, gcalUrl, buildIcs, tick };
})();
