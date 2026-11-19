/* Tripwillow – tryb „W podróży”: jeden ekran na dziś (zasady wyglądu: DESIGN.md).
   Trasy:
     #/dzis              trwająca podróż (gdy żadna nie trwa – najbliższa, jako podgląd 1. dnia)
     #/dzis/:tripId?d=   dzień podróży (domyślnie dziś; poza podróżą – pierwszy albo ostatni dzień)
   Na ekranie: nagłówek (dzień X z Y, pogoda, strzałki dni) · Teraz / Dalej (karta „Dziś” z plan.js, tylko dziś) ·
   nocleg (nawigacja, telefon, karta dla kierowcy) · bilety na ten dzień · plan dnia · wydatki dnia z szybkim dodawaniem ·
   skróty (mapa dnia, w pobliżu, przewodnik, rozmówki, dokumenty) · jutro (pierwsze punkty następnego dnia).
   Ustawienie „startScreen” ("dzis" / "podroze") – ekran startowy w trakcie podróży (app.js). Bez wyboru: w aplikacji (APK,
   zainstalowana na ekranie głównym) „dzis”, w zwykłej karcie przeglądarki „podroze” (link otwiera to, co wskazuje). */
(function () {
  const { esc, plural } = App;
  const I = (n, c) => App.icon(n, c);
  const pad = n => String(n).padStart(2, "0");
  const nowStr = () => { const d = new Date(); return `${App.todayStr()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // trwająca podróż (pierwsza, która się zaczęła); null, gdy żadna nie trwa
  async function ongoingTrip() {
    const today = App.todayStr();
    const now = (await DB.all("trips")).filter(t => t.start <= today && today <= t.end).sort((a, b) => a.start.localeCompare(b.start));
    return now[0] || null;
  }

  App.route(/^\/dzis$/, async () => {
    const trips = await DB.all("trips");
    if (!trips.length) return {
      title: "Dziś", back: "#/podroze",
      html: App.empty("🧭", "Tryb „W podróży”", "Gdy podróż trwa, tu zobaczysz cały dzień na jednym ekranie: co teraz i dalej, nocleg, bilety, plan i wydatki.",
        `<a class="btn primary" href="#/podroze/nowa">Dodaj podróż</a>`),
    };
    const t = (await ongoingTrip()) || App.Plan.pickTrip(trips);
    location.replace(`#/dzis/${t.id}`);
    return "";
  });

  App.route(/^\/dzis\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/dzis"); return ""; }
    const today = App.todayStr();
    const ongoing = trip.start <= today && today <= trip.end;
    const def = ongoing ? today : trip.start > today ? trip.start : trip.end;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q.d || "") && q.d >= trip.start && q.d <= trip.end ? q.d : def;
    const isToday = day === today;
    const total = App.dayDiff(trip.start, trip.end) + 1, n = App.dayDiff(trip.start, day) + 1;

    const [segs, items, files, wx, bud] = await Promise.all([
      DB.byIndex("segments", "tripId", id), DB.byIndex("planItems", "tripId", id), DB.byIndex("files", "tripId", id),
      App.Weather ? App.Weather.get(trip).catch(() => null) : null,
      App.Budget ? App.Budget.load(id).catch(() => null) : null,
    ]);
    const P = App.Plan, events = P.segEvents(segs);

    // ---------- nagłówek: podróż, dzień X z Y, pogoda, strzałki dni ----------
    const prev = day > trip.start ? App.addDays(day, -1) : null, next = day < trip.end ? App.addDays(day, 1) : null;
    const dayLink = (d, ico, label) => d ? `<a class="icon-btn dz-arrow" href="#/dzis/${id}?d=${d}" aria-label="${label}: ${App.fmtDay(d)}">${I(ico)}</a>`
      : `<span class="icon-btn dz-arrow off" aria-hidden="true">${I(ico)}</span>`;
    const w = wx && wx.data && wx.data.kind === "forecast" && wx.data.days ? wx.data.days[day] : null;
    const wxHtml = w ? `<div class="dz-wx" title="${esc(App.Weather.wmo(w[0])[1])}">
        <span class="dz-wx-ico" aria-hidden="true">${App.Weather.wmo(w[0])[0]}</span>
        <span><b>${Math.round(w[1])}°</b><small>${Math.round(w[2])}°</small></span>
        ${w[3] >= 30 ? `<span class="dz-wx-rain">${w[3]}%</span>` : ""}
        <span class="sr">${esc(App.Weather.wmo(w[0])[1])}</span></div>` : "";
    const state = isToday ? `<span class="chip accent dz-state"><i class="live" aria-hidden="true"></i>W podróży</span>`
      : day < today ? `<span class="chip dz-state">Miniony dzień</span>` : `<span class="chip dz-state">Podgląd</span>`;
    let html = `
      <header class="dz-head">
        <div class="dz-top">${state}<a class="dz-trip" href="#/podroze/${id}">${esc(trip.name)}</a></div>
        <div class="dz-day">
          ${dayLink(prev, "back", "Poprzedni dzień")}
          <div class="dz-day-t">
            <span class="dz-n">dzień ${n} z ${total}</span>
            <h2>${App.fmtDayLong(day)}</h2>
          </div>
          ${dayLink(next, "chev", "Następny dzień")}
        </div>
        ${wxHtml}
        <div class="bar" aria-hidden="true"><i style="width:${Math.round(n / total * 100)}%"></i></div>
      </header>`;
    if (!ongoing) html += `<p class="td-note dz-note">${I("info", "sm")}<span>${trip.start > today
      ? `Podróż zaczyna się ${App.fmtDayLong(trip.start)} – wtedy ten ekran pokaże, co teraz i co dalej.`
      : "Podróż się zakończyła – to podgląd jej dni."}</span></p>`;

    // ---------- Teraz / Dalej (tylko dziś) ----------
    if (isToday) html += P.todayCard(trip, events, items);

    // ---------- nocleg ----------
    const stay = App.Places ? App.Places.hotelFor(segs, day) : null;
    if (stay) {
      const out = (stay.arrive || "").slice(0, 10) === day, inn = stay.depart.slice(0, 10) === day;
      const where = stay.address || stay.name;
      const label = out && !inn ? "Wymeldowanie dziś" : inn ? "Nocleg · zameldowanie dziś" : "Nocleg";
      const when = [inn ? `od ${App.time(stay.depart)}` : "", out ? `wymeldowanie do ${App.time(stay.arrive)}` : "",
        !out && stay.arrive ? `do ${App.fmtDay(stay.arrive)}` : ""].filter(Boolean).join(" · ");
      const act = (href, ico, txt, ext) => `<a class="dz-act" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${I(ico, "sm")}<span>${txt}</span></a>`;
      html += `
        <h2 class="section">${label}</h2>
        <section class="dz-stay${out && !inn ? " is-out" : ""}">
          <a class="dz-stay-main" href="#/odcinek/${stay.id}">
            <span class="li-ico" aria-hidden="true">${I(out && !inn ? "key" : "bed")}</span>
            <span class="li-main"><b>${esc(stay.name || "Nocleg")}</b>
              ${stay.address ? `<small>${esc(stay.address)}</small>` : ""}
              ${when || stay.room ? `<small class="dz-when">${[when, stay.room ? `pokój ${esc(stay.room)}` : ""].filter(Boolean).join(" · ")}</small>` : ""}</span>
            ${I("chev")}
          </a>
          <div class="dz-acts">
            ${where ? act(App.mapsUrl(where), "navigate", "Nawiguj", true) : ""}
            ${stay.phone ? act(`tel:${String(stay.phone).replace(/[^\d+]/g, "")}`, "phone", "Zadzwoń") : ""}
            ${act(`#/karty/${id}`, "taxi", "Dla kierowcy")}
          </div>
        </section>`;
    }

    // ---------- bilety na ten dzień (odcinki i punkty planu z tego dnia) ----------
    const daySegs = segs.filter(s => s.type !== "nocleg" && s.depart && s.depart.slice(0, 10) === day);
    const dayItems = items.filter(i => i.date === day).sort(P.byOrder);
    const fileOf = {};
    files.slice().sort((a, b) => (a.created || "").localeCompare(b.created || "")).forEach(f => { if (!fileOf[f.segmentId]) fileOf[f.segmentId] = f; });
    const tickets = daySegs.filter(s => fileOf[s.id]).map(s => ({ f: fileOf[s.id], at: s.depart, ico: App.icon.type(s.type), title: `${s.from || "?"} → ${s.to || "?"}` }))
      .concat(dayItems.filter(i => fileOf[`p:${i.id}`]).map(i => ({ f: fileOf[`p:${i.id}`], at: i.time ? `${day}T${i.time}` : `${day}T99`, ico: I("ticket"), title: i.title })))
      .sort((a, b) => a.at.localeCompare(b.at));
    if (tickets.length) html += `
      <h2 class="section">Bilety na ten dzień</h2>
      <div class="dz-tickets">${tickets.map(t => `
        <a class="dz-ticket" href="#/bilet/${t.f.id}">
          <span class="dz-tk-ico" aria-hidden="true">${t.ico}</span>
          <span class="dz-tk-main"><b>${esc(t.title)}</b>${App.time(t.at) && !t.at.endsWith("T99") ? `<small>${App.time(t.at)}</small>` : ""}</span>
          <span class="dz-tk-qr">${I("qr")}<span>Pokaż</span></span>
        </a>`).join("")}</div>`;

    // ---------- plan dnia ----------
    const now = nowStr();
    const dayEvents = events.filter(e => e.at.slice(0, 10) === day);
    const rows = P.mergeDay(dayItems, dayEvents).map(({ it, ev }) => {
      const at = ev ? ev.at : it.time ? `${day}T${it.time}` : "";
      const done = isToday && at && (ev && ev.end ? ev.end : at) < now;
      const title = ev ? ev.title : it.title;
      const sub = ev ? ev.sub : it.place && !/^https?:/i.test(it.place) ? it.place : "";
      const nav = ev ? ev.nav : it.place;
      return `
        <div class="li dz-row${done ? " is-done" : ""}">
          <span class="dz-time">${at ? App.time(at) : "–"}</span>
          <a class="li-main" href="${ev ? ev.href : `#/punkt/${it.id}`}">
            <b><span class="dz-ico" aria-hidden="true">${ev ? ev.ico || ev.icon : P.catOf(it).icon}</span> ${esc(title)}</b>
            ${sub ? `<small>${esc(sub)}</small>` : ""}
          </a>
          ${nav ? `<a class="icon-btn dz-nav" href="${esc(App.mapsUrl(nav))}" target="_blank" rel="noopener" aria-label="Nawiguj: ${esc(title)}">${I("navigate")}</a>` : ""}
        </div>`;
    }).join("");
    html += `
      <div class="sec-h"><h2 class="section">Plan dnia</h2><a href="#/plan/${id}">Cały plan</a></div>
      ${rows ? `<div class="list dz-plan">${rows}</div>` : ""}
      <a class="dz-add" href="#/plan/${id}/nowy?d=${day}">${I("plus", "sm")}<span>${rows ? "Dodaj punkt" : "Nic nie zaplanowano – dodaj punkt"}</span></a>`;

    // ---------- wydatki dnia + szybkie dodawanie ----------
    let lastCur = null;
    if (bud) {
      const B = App.Budget, home = bud.home;
      const spentDay = bud.items.filter(i => i.date === day).reduce((s, i) => s + (i.home || 0), 0);
      const daysLeft = ongoing ? App.dayDiff(today, trip.end) + 1 : 0;
      const left = bud.budget ? bud.budget - bud.spent : 0;
      const perDay = bud.budget && left > 0 && daysLeft > 0 ? left / daysLeft : 0;
      lastCur = await DB.getSetting(`budgetCur:${id}`, ongoing && bud.currencies[0] ? bud.currencies[0] : home);
      const cats = Object.entries(B.CATS).map(([k, C]) => `
        <label class="type-chip dz-cat"><input type="radio" name="cat" value="${k}" ${k === "jedzenie" ? "checked" : ""}>
          <span>${I(C.ic, "sm")}${C.name}</span></label>`).join("");
      html += `
        <div class="sec-h"><h2 class="section">Wydatki ${isToday ? "dziś" : "tego dnia"}</h2><a href="#/budzet/${id}">Budżet</a></div>
        <form class="dz-money" id="dz-add" autocomplete="off">
          <div class="dz-money-top">
            <b class="dz-spent">${B.money(spentDay, home)}</b>
            ${perDay ? `<span class="chip${spentDay > perDay ? " warn" : " accent"}">ok. ${B.money(perDay, home)} na dzień</span>` : ""}
          </div>
          <div class="type-chips dz-cats" role="radiogroup" aria-label="Kategoria">${cats}</div>
          <div class="dz-amt">
            <input name="amount" inputmode="decimal" placeholder="Kwota" aria-label="Kwota" required>
            <input name="currency" list="dz-curs" maxlength="5" autocapitalize="characters" value="${esc(lastCur)}" aria-label="Waluta">
            <button class="btn primary" type="submit" aria-label="Dodaj wydatek">${I("plus")}</button>
          </div>
          <datalist id="dz-curs">${[...new Set([home, ...bud.currencies, "EUR", "USD", "PLN"])].map(c => `<option value="${c}">`).join("")}</datalist>
        </form>`;
    }

    // ---------- dziennik (journal.js) – dziś albo dzień z przeszłości ----------
    if (App.Journal && day <= today) {
      const je = await App.Journal.entry(id, day), jm = je && App.Journal.moodOf(je.mood), jt = je && (je.text || "").trim();
      const nPh = (await DB.byIndex("journalPhotos", "tripId", id)).filter(p => p.date === day).length;
      html += `
        <a class="dz-journal" href="#/dziennik/${id}/${day}">
          <span class="li-ico" aria-hidden="true">${jm ? jm[1] : I("edit")}</span>
          <span class="li-main"><b>${jt || jm || nPh ? "Dziennik" : isToday ? "Jak minął dzień?" : "Dziennik tego dnia"}</b>
            <small>${jt ? esc(jt.slice(0, 90)) + (jt.length > 90 ? "…" : "") : nPh ? `${nPh} ${plural(nPh, "zdjęcie", "zdjęcia", "zdjęć")}` : "zapisz wspomnienia i zdjęcia"}</small></span>
          ${I("chev")}
        </a>`;
    }

    // ---------- skróty ----------
    const tool = (href, ico, name) => `<a class="plan-link pl-tool" href="${href}"><i aria-hidden="true">${I(ico)}</i><span>${name}</span></a>`;
    html += `<div class="pl-tools dz-tools">
        ${tool(`#/mapa/${id}?d=${day}`, "map", "Mapa dnia")}
        ${tool(`#/odkrywaj/${id}`, "compass", "W pobliżu")}
        ${App.Guide ? tool(`#/przewodnik/${id}`, "landmark", "Przewodnik") : ""}
        ${tool(`#/karty/${id}`, "chat", "Rozmówki")}
        ${tool(`#/waluty/${id}`, "currency", "Waluty")}
        ${tool(`#/budzet/${id}`, "wallet", "Budżet")}
        ${tool("#/dokumenty", "passport", "Dokumenty")}
      </div>`;

    // ---------- jutro ----------
    if (next) {
      const tmr = events.filter(e => e.at.slice(0, 10) === next).map(e => ({ at: e.at, ico: e.ico || e.icon, title: e.title }))
        .concat(items.filter(i => i.date === next && i.time).map(i => ({ at: `${next}T${i.time}`, ico: P.catOf(i).icon, title: i.title })))
        .sort((a, b) => a.at.localeCompare(b.at)).slice(0, 3);
      const untimed = items.filter(i => i.date === next && !i.time).length;
      html += `
        <a class="dz-next" href="#/dzis/${id}?d=${next}">
          <span class="dz-next-h"><span class="section">${isToday ? "Jutro" : "Następny dzień"}</span><span>${App.fmtDay(next)}</span>${I("chev", "sm")}</span>
          ${tmr.length ? tmr.map(e => `<span class="dz-next-row"><b>${App.time(e.at)}</b><span class="dz-ico" aria-hidden="true">${e.ico}</span><span>${esc(e.title)}</span></span>`).join("")
            : `<span class="dz-next-row muted">${untimed ? `${untimed} ${plural(untimed, "punkt", "punkty", "punktów")} bez godziny` : "Nic jeszcze nie zaplanowano"}</span>`}
        </a>`;
    } else html += `<p class="td-note dz-note">${I("trips", "sm")}<span>Ostatni dzień podróży.</span></p>`;

    let timer = null;
    return {
      title: "Dziś",
      back: "#/podroze",
      action: `<a class="icon-btn" href="#/plan/${id}" aria-label="Plan podróży">${I("plan")}</a>`,
      html,
      after(view) {
        if (wx) wx.refresh().then(changed => { if (changed && view.isConnected) App.render(); }).catch(() => {});
        if (isToday) timer = setInterval(() => {
          const card = view.querySelector(".today-card");
          if (card && !document.hidden) card.outerHTML = P.todayCard(trip, events, items);
        }, 60000);
        const f = view.querySelector("#dz-add");
        if (f) f.addEventListener("submit", async e => {
          e.preventDefault();
          const B = App.Budget, amount = B.num(f.amount.value);
          if (!(amount > 0)) { App.toast("Podaj kwotę"); f.amount.focus(); return; }
          const currency = B.cur3(f.currency.value) || bud.home;
          const cat = (f.querySelector("input[name=cat]:checked") || {}).value || "inne";
          const people = trip.people || [];
          const payer = people.length > 1 ? { paidBy: await DB.getSetting(`budgetPayer:${id}`, people[0]) } : {};
          await DB.put("expenses", { tripId: id, title: "", amount, currency, cat, date: day, ...payer });
          await DB.setSetting(`budgetCur:${id}`, currency);
          App.toast(`Dodano ${B.money(amount, currency)}${!bud.rates[currency] && currency !== bud.home ? " · uzupełnij kurs " + currency : ""}`);
          App.render();
        });
      },
      cleanup() { clearInterval(timer); },
    };
  });

  const isApp = () => !!(self.PodroznikNative && PodroznikNative.isNative) || (self.matchMedia && matchMedia("(display-mode: standalone)").matches);
  async function startScreen() { return (await DB.getSetting("startScreen", null)) || (isApp() ? "dzis" : "podroze"); }

  App.Today = { ongoingTrip, startScreen };
})();
