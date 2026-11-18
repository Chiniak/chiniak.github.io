/* Podróżnik – etap 1: podróże, odcinki transportu, noclegi i oś czasu.
   Trasy:
     #/podroze                    lista: trwające / nadchodzące / archiwum
     #/podroze/nowa               nowa podróż
     #/podroze/:id                szczegóły podróży z osią czasu
     #/podroze/:id/edytuj         edycja (i usuwanie) podróży
     #/podroze/:id/dodaj?typ=lot  nowy odcinek lub nocleg
     #/odcinek/:id/edytuj         edycja (i usuwanie) odcinka  (szczegóły odcinka z biletami: tickets.js)
   Godziny zapisywane są jako czas lokalny miejsca: "2026-11-13T08:15". */
(function () {
  const { esc, todayStr, dayDiff, plural } = App;

  const COLORS = ["#43BDB5", "#4C7FD9", "#D9645A", "#E0A23F", "#8A6BD6", "#3E9B74"]; // redesign: kolory dopasowane do palety

  /* ---------- rodzaje odcinków ----------
     extra: [pole, etykieta, podpowiedź]; route=false oznacza nocleg (nazwa + adres zamiast skąd/dokąd) */
  const TYPES = {
    lot: { icon: "✈️", name: "Lot", from: "Skąd (lotnisko)", to: "Dokąd (lotnisko)", depart: "Wylot", arrive: "Przylot",
      fromPh: "np. Warszawa WAW", toPh: "np. Lizbona LIS",
      extra: [["carrier", "Linia lotnicza", "np. LOT"], ["number", "Nr lotu", "np. LO 281"], ["terminal", "Terminal", ""], ["gate", "Gate", ""],
              ["seat", "Miejsce", "np. 14A"], ["baggage", "Bagaż", "np. 23 kg + podręczny"]] },
    pociag: { icon: "🚆", name: "Pociąg", from: "Skąd (stacja)", to: "Dokąd (stacja)", depart: "Odjazd", arrive: "Przyjazd",
      fromPh: "np. Kraków Główny", toPh: "np. Gdańsk Główny",
      extra: [["carrier", "Przewoźnik", "np. PKP Intercity"], ["number", "Nr pociągu", "np. EIP 5300"], ["car", "Wagon", ""], ["seat", "Miejsce", ""],
              ["platform", "Peron / tor", ""]] },
    autobus: { icon: "🚌", name: "Autobus", from: "Skąd (przystanek)", to: "Dokąd (przystanek)", depart: "Odjazd", arrive: "Przyjazd",
      extra: [["carrier", "Przewoźnik", "np. FlixBus"], ["number", "Nr kursu / linii", ""], ["platform", "Stanowisko", ""], ["seat", "Miejsce", ""]] },
    prom: { icon: "⛴️", name: "Prom", from: "Skąd (port)", to: "Dokąd (port)", depart: "Wypłynięcie", arrive: "Przypłynięcie",
      extra: [["carrier", "Armator", ""], ["number", "Statek / rejs", ""], ["seat", "Kabina / miejsce", ""], ["vehicle", "Pojazd na pokładzie", ""]] },
    auto: { icon: "🚗", name: "Auto", from: "Odbiór (miejsce)", to: "Zwrot (miejsce)", depart: "Odbiór", arrive: "Zwrot",
      extra: [["carrier", "Wypożyczalnia / auto", "np. Hertz, własne"], ["number", "Model / nr rejestracyjny", ""]] },
    taxi: { icon: "🚕", name: "Taxi", from: "Skąd", to: "Dokąd", depart: "Odbiór", arrive: "Na miejscu",
      extra: [["carrier", "Firma / aplikacja", "np. Uber, Bolt"]] },
    metro: { icon: "🚇", name: "Metro / tramwaj", from: "Skąd (przystanek)", to: "Dokąd (przystanek)", depart: "Odjazd", arrive: "Przyjazd",
      extra: [["number", "Linia", "np. M1, 7"]] },
    inny: { icon: "🧭", name: "Inny", from: "Skąd", to: "Dokąd", depart: "Start", arrive: "Koniec",
      extra: [["carrier", "Rodzaj / przewoźnik", "np. rower, wycieczka"], ["number", "Numer", ""]] },
    nocleg: { icon: "🏨", name: "Nocleg", route: false, depart: "Zameldowanie", arrive: "Wymeldowanie",
      extra: [["room", "Pokój", ""], ["phone", "Telefon", ""]] },
  };
  const TAIL = [["booking", "Nr rezerwacji", "np. ABC123"]];
  const typeOf = s => TYPES[s.type] || TYPES.inny;
  const FORM_KEYS = new Set(["type", "from", "to", "name", "address", "depart", "arrive", "price", "currency", "note",
    ...TAIL.map(x => x[0]), ...Object.values(TYPES).flatMap(T => T.extra.map(x => x[0]))]);

  /* ---------- status podróży ---------- */
  function status(t) {
    const today = todayStr();
    if (t.end < today) return "past";
    if (t.start > today) return "future";
    return "now";
  }
  function statusText(t) {
    const today = todayStr(), s = status(t);
    if (s === "future") {
      const n = dayDiff(today, t.start);
      return n === 1 ? "jutro" : `za ${n} ${plural(n, "dzień", "dni", "dni")}`;
    }
    if (s === "now") return `trwa · dzień ${dayDiff(t.start, today) + 1} z ${dayDiff(t.start, t.end) + 1}`;
    return "zakończona";
  }

  const bySegTime = (a, b) => (a.depart || "").localeCompare(b.depart || "");
  const plusIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>`;

  /* ---------- zdjęcie w tle podróży (etap 9) ----------
     rekord w magazynie "files": { tripId, segmentId: "cover", kind: "cover", blob } – kopia zapasowa obejmuje go sama */
  async function covers(tripId) {
    const [all, trips] = await Promise.all([DB.byIndex("files", "segmentId", "cover"),
      tripId ? DB.get("trips", tripId).then(t => (t ? [t] : [])) : DB.all("trips")]);
    const map = Object.fromEntries(all.filter(f => !tripId || f.tripId === tripId).map(f => [f.tripId, f]));
    // bez własnej okładki: automatyczne zdjęcie celu (covers.js)
    if (App.Covers) for (const t of trips) if (!map[t.id]) { const c = App.Covers.of(t); if (c) map[t.id] = { auto: true, data: c.data, credit: c.credit }; }
    return map;
  }
  // własne okładki (do pomijania przy szukaniu zdjęć celu)
  const ownCovers = map => new Set(Object.entries(map).filter(([, f]) => !f.auto).map(([id]) => id));
  // wstaw zdjęcie celu, które właśnie się pobrało, bez przeładowania ekranu
  function paintAuto(root, tripId, data) {
    root.querySelectorAll(`[data-cover="${tripId}"]`).forEach(el => {
      if (el.classList.contains("has-photo")) return;
      el.style.setProperty("--photo", `url("${data}")`);
      el.classList.add("has-photo");
    });
  }
  // ustawia tło elementom [data-cover="id podróży"]; zwraca funkcję sprzątającą
  function paintCovers(root, map) {
    const urls = [];
    root.querySelectorAll("[data-cover]").forEach(el => {
      const f = map[el.dataset.cover];
      if (!f) return;
      let u = null;
      if (f.data) u = f.data;
      else if (f.blob instanceof Blob) { u = URL.createObjectURL(f.blob); urls.push(u); }
      else return;
      el.style.setProperty("--photo", `url("${u}")`);
      el.classList.add("has-photo");
    });
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }

  /* ================= LISTA PODRÓŻY (ekran główny, redesign „Premium Light” – DESIGN.md) =================
     A nagłówek: powitanie + data · B karta bieżącej / najbliższej podróży (okładka albo kolor podróży, odliczanie)
     C postęp: spakowane, punkty planu, wydatki · D najbliższy bilet (odcinek z QR) · przypomnienia i Gmail
     E pozostałe nadchodzące (poziomy rząd), archiwum · F szybkie akcje */
  const ICON_OF = { lot: "plane", pociag: "train", autobus: "bus", prom: "ferry", auto: "car", taxi: "taxi", metro: "train", nocleg: "bed", inny: "compass" };
  const ic = (n, c) => App.icon ? App.icon(n, c) : "";
  const tripDays = t => dayDiff(t.start, t.end) + 1;
  const daysTxt = n => `${n} ${plural(n, "dzień", "dni", "dni")}`;

  // odliczanie: największa jednostka dużą cyfrą, reszta obok
  function countdown(at, tz) {
    const ms = App.instant(at, tz) - Date.now();
    if (ms <= 60000) return { big: "0", unit: "min" };
    const min = Math.floor(ms / 60000), d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
    if (d >= 1) return { big: String(d), unit: plural(d, "dzień", "dni", "dni"), rest: h ? `${h} h` : "" };
    if (h >= 1) return { big: String(h), unit: "h", rest: `${m} min` };
    return { big: String(m), unit: "min" };
  }
  const cdHtml = c => `<b>${c.big}</b><span>${c.unit}</span>${c.rest ? `<span class="cd-rest">${c.rest}</span>` : ""}`;

  function greeting() {
    const h = new Date().getHours();
    return h >= 18 || h < 4 ? "Dobry wieczór" : "Dzień dobry";
  }
  const longDate = () => new Intl.DateTimeFormat(self.I18N ? I18N.locale : "pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const quickActions = () => {
    const gm = App.Gmail && App.Gmail.available();
    return `
      <div class="hm-quick">
        <a class="hm-qa primary" href="#/podroze/nowa"><i>${ic("plus")}</i><span>Nowa podróż</span></a>
        ${gm ? `<a class="hm-qa" href="#/gmail"><i>${ic("mail")}</i><span>Z Gmaila</span></a>` : ""}
        <a class="hm-qa" href="#/wklej"><i>${ic("doc")}</i><span>Z maila lub PDF</span></a>
        <a class="hm-qa" href="#/udostepnij"><i>${ic("download")}</i><span>Otwórz od kogoś</span></a>
      </div>`;
  };

  // kafelek „Wydatki”: pełne złote bez groszy, waluta mniejsza – żeby kwota mieściła się w 1/3 szerokości (zgłoszone 16.11: „1313,60 P…”)
  const tileMoney = (n, cur) => `${Math.round(n).toLocaleString(self.I18N ? I18N.locale : "pl-PL")}<span> ${cur}</span>`;
  App.route(/^\/podroze$/, async () => {
    const [trips, segs] = await Promise.all([DB.all("trips"), DB.all("segments")]);
    const segsOf = {};
    segs.forEach(s => (segsOf[s.tripId] = segsOf[s.tripId] || []).push(s));
    const zn = App.Social && App.Social.available() ? await App.Social.unreadAll().catch(() => 0) : -1;
    const statsAction = (zn >= 0 ? `<a class="icon-btn zn-top" href="#/znajomi" aria-label="Znajomi${zn ? ` – ${zn} nowe` : ""}">${ic("users")}${zn ? `<span class="zn-dot">${zn}</span>` : ""}</a>` : "")
      + `<a class="icon-btn" href="#/statystyki" aria-label="Statystyki">${ic("chart")}</a>`;
    const head = `<header class="hm-head"><h2>${greeting()}</h2><p>${longDate()}</p></header>`;

    if (!trips.length) {
      return {
        title: "Podróżnik", brand: true, action: statsAction,
        html: `${head}
          <section class="hm-empty">
            <div class="hm-empty-art" aria-hidden="true">${ic("trips", "lg")}</div>
            <h3>Zaplanuj pierwszą podróż</h3>
            <p>Dodaj wyjazd, a potem loty, pociągi i noclegi. Bilety, plan dnia i lista pakowania będą w jednym miejscu – także offline.</p>
          </section>
          <h2 class="section">Zacznij</h2>${quickActions()}`,
      };
    }

    const now = trips.filter(t => status(t) === "now").sort((a, b) => a.start.localeCompare(b.start));
    const future = trips.filter(t => status(t) === "future").sort((a, b) => a.start.localeCompare(b.start));
    const past = trips.filter(t => status(t) === "past").sort((a, b) => b.start.localeCompare(a.start));
    const hero = now[0] || future[0] || null;
    const cov = await covers();

    // ---------- B: bieżąca / najbliższa podróż ----------
    let heroHtml = "", statsHtml = "", cdAt = null, cdTz = null;
    if (hero) {
      const list = (segsOf[hero.id] || []).sort(bySegTime);
      const nowStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const next = list.find(x => x.type !== "nocleg" && x.depart && x.depart > nowStr);
      const st = status(hero);
      cdAt = next ? next.depart : st === "future" ? `${hero.start}T00:00` : null;
      cdTz = next ? next.tzFrom : null;
      const T = next ? typeOf(next) : null;
      const label = st === "now" ? "W trakcie" : "Najbliższa podróż";
      const sub = st === "now" ? `dzień ${dayDiff(hero.start, todayStr()) + 1} z ${tripDays(hero)}` : daysTxt(tripDays(hero));
      const c = cdAt ? countdown(cdAt, cdTz) : null;
      heroHtml = `
        <a class="hm-hero trip-card" href="#/podroze/${hero.id}" data-cover="${hero.id}" style="--c:${esc(hero.color || COLORS[0])}">
          <div class="hm-hero-top">
            <span class="glass cd-label"><i class="live" aria-hidden="true"></i>${label}</span>
            ${T ? `<span class="glass" aria-label="${esc(T.name)}">${ic(ICON_OF[next.type] || "compass", "sm")}</span>` : ""}
          </div>
          <div class="hm-hero-body">
            ${hero.destination ? `<span class="hm-dest">${esc(hero.destination)}</span>` : ""}
            <h2>${esc(hero.name)}</h2>
            <span class="hm-dates">${App.fmtRange(hero.start, hero.end)} · ${sub}</span>
            ${c ? `<div class="hm-count">
              <div class="cd-time" id="cd-time" role="timer" data-at="${esc(cdAt)}" data-tz="${esc(cdTz || "")}">${cdHtml(c)}</div>
              <span class="hm-count-what">${next ? (st === "now" ? "do odjazdu" : "do wyjazdu") : "do wyjazdu"}</span>
              ${next ? `<span class="hm-count-at"><span>${esc(T.depart)}</span> <b>${App.time(next.depart)}</b></span>` : ""}
            </div>` : ""}
          </div>
        </a>
        ${st === "now" ? `<a class="btn primary wide hm-today" href="#/dzis/${hero.id}">${ic("sun", "sm")} Dziś w podróży</a>` : ""}`;

      // ---------- C: postęp ----------
      const [pk, plan, bud] = await Promise.all([
        App.Pack ? App.Pack.summary(hero.id) : null,
        DB.byIndex("planItems", "tripId", hero.id),
        App.Budget ? App.Budget.summary(hero.id).catch(() => null) : null,
      ]);
      const planned = plan.filter(p => p.date).length;
      const pct = pk && pk.total ? Math.round(pk.done / pk.total * 100) : 0;
      statsHtml = `
        <div class="hm-stats">
          <a class="hm-stat" href="#/pakowanie/${hero.id}"><small>Spakowane</small>
            ${pk && pk.total ? `<b>${pk.done}<span> / ${pk.total}</span></b><span class="bar"><i style="width:${pct}%"></i></span>` : `<b class="hm-none">Dodaj listę</b>`}</a>
          <a class="hm-stat" href="#/plan/${hero.id}"><small>W planie</small>
            <b>${planned}<span> ${plural(planned, "punkt", "punkty", "punktów")}</span></b></a>
          <a class="hm-stat" href="#/budzet/${hero.id}"><small>Wydatki</small>
            ${bud && bud.spent ? `<b>${tileMoney(bud.spent, bud.home)}</b>` : `<b class="hm-none">Budżet</b>`}</a>
        </div>`;
    }

    // ---------- D: najbliższy bilet, przypomnienia, Gmail ----------
    const tk = App.Tickets ? await App.Tickets.nearest() : null;
    let ticketHtml = "";
    if (tk) {
      const s = tk.seg;
      const split = v => { const m = String(v || "").match(/^(.*?)[\s(]*\b([A-Z]{3})\)?$/); return m ? { code: m[2], city: m[1].trim() } : { code: "", city: String(v || "?") }; };
      const route = !s.plan && s.type !== "nocleg" && (s.from || s.to);
      const A = route ? split(s.from) : null, B = route ? split(s.to) : null;
      const end = x => x.code ? `<span class="code">${esc(x.code)}</span><span class="city">${esc(x.city)}</span>` : `<span class="code long">${esc(x.city)}</span>`;
      const prov = s.plan ? [] : [s.carrier, s.number].filter(Boolean);
      const typeName = s.plan ? (App.Plan ? App.Plan.catOf(s.plan).name : "") : typeOf(s).name;
      ticketHtml = `
        <div class="sec-h"><h2 class="section">Najbliższy bilet</h2><a href="#/bilety">Wszystkie</a></div>
        <div class="tk-stub">
          <a class="tk-stub-main" href="${tk.href}">
            <span class="tk-prov">${ic(s.plan ? "ticket" : ICON_OF[s.type] || "compass", "sm")}<span>${esc(prov.length ? prov.join(" · ") : typeName)}</span><span class="chip accent">${tk.rel}</span></span>
            ${route ? `<span class="tk-route"><span class="tk-end">${end(A)}</span><span class="tk-line" aria-hidden="true">${ic(ICON_OF[s.type] || "compass", s.type === "lot" ? "sm rot" : "sm")}</span><span class="tk-end r">${end(B)}</span></span>`
              : `<span class="tk-title">${esc(tk.title)}</span>`}
            <span class="tk-when">${tk.when}</span>
          </a>
          <a class="tk-stub-qr" href="#/bilet/${tk.fileId}" aria-label="Pokaż bilet">${ic("qr", "lg")}<span>Pokaż</span></a>
        </div>`;
    }
    const home = App.Reminders ? await App.Reminders.homeCards({ countdown: false }) : { html: "" };
    const gmail = App.Gmail ? await App.Gmail.homeCard() : "";

    // ---------- E: pozostałe podróże ----------
    const rest = [...now, ...future].filter(t => t !== hero);
    const tcard = t => `
      <a class="hm-tcard trip-card" href="#/podroze/${t.id}">
        <span class="hm-tcard-img" data-cover="${t.id}" style="--c:${esc(t.color || COLORS[0])}"><span class="glass">${statusText(t)}</span></span>
        <b>${esc(t.name)}</b>
        <small>${[App.fmtRange(t.start, t.end), esc(t.destination)].filter(Boolean).join(" · ")}</small>
      </a>`;
    const trow = t => {
      const list = segsOf[t.id] || [];
      return `
      <a class="li hm-trow trip-card" href="#/podroze/${t.id}">
        <span class="hm-thumb" data-cover="${t.id}" style="--c:${esc(t.color || COLORS[0])}"></span>
        <span class="li-main"><b>${esc(t.name)}</b><small>${[App.fmtRange(t.start, t.end), esc(t.destination)].filter(Boolean).join(" · ")}${list.length ? ` · ${list.length} ${plural(list.length, "odcinek", "odcinki", "odcinków")}` : ""}</small></span>
        ${ic("chev")}
      </a>`;
    };

    let html = head + heroHtml + statsHtml + ticketHtml + home.html + gmail;
    if (!hero) html += `<p class="muted hm-nothing">Brak zaplanowanych wyjazdów.</p>`;
    if (rest.length) html += `<div class="sec-h"><h2 class="section">Nadchodzące</h2></div><div class="hm-scroll">${rest.map(tcard).join("")}</div>`;
    html += `<h2 class="section">Szybkie akcje</h2>${quickActions()}`;
    if (past.length) html += `
      <details class="archive">
        <summary><h2 class="section">Archiwum <span class="muted">(${past.length})</span></h2></summary>
        <div class="list">${past.map(trow).join("")}</div>
      </details>`;

    let unpaint = null, timer = null;
    return {
      title: "Podróżnik", brand: true, action: statsAction, html,
      after(v) {
        unpaint = paintCovers(v, cov);
        if (App.Covers) App.Covers.fill([...now, ...future], ownCovers(cov), (t, c) => paintAuto(v, t.id, c.data));
        if (home.after) home.after(v);
        const el = v.querySelector("#cd-time");
        if (el) timer = setInterval(() => { el.innerHTML = cdHtml(countdown(el.dataset.at, el.dataset.tz || undefined)); }, 15000);
      },
      cleanup() { if (unpaint) unpaint(); if (home.cleanup) home.cleanup(); clearInterval(timer); },
    };
  });

  /* ================= FORMULARZ PODRÓŻY ================= */
  async function tripForm(id) {
    const t = id ? await DB.get("trips", id) : null;
    if (id && !t) { location.replace("#/podroze"); return ""; }
    const v = t || { name: "", destination: "", start: "", end: "", color: COLORS[0], note: "" };
    const shown = t ? (await covers(t.id))[t.id] : null;
    const cover = shown && !shown.auto ? shown : null, auto = shown && shown.auto ? shown : null; // własna okładka / zdjęcie celu
    let newCover = null, dropCover = false, dropAuto = false, unpaint = null, previewUrl = null, autoTimer = null;
    const swatches = COLORS.map(c => `
      <label class="swatch" style="--c:${c}">
        <input type="radio" name="color" value="${c}" aria-label="kolor ${c}" ${c === v.color ? "checked" : ""}><span aria-hidden="true"></span>
      </label>`).join("");

    return {
      title: t ? "Edytuj podróż" : "Nowa podróż",
      back: t ? `#/podroze/${t.id}` : "#/podroze",
      html: `
        <form id="trip-form" class="form" novalidate>
          <div class="fsec">
            <label class="field"><span>Nazwa</span>
              <input name="name" required maxlength="80" placeholder="np. Majówka w Lizbonie" value="${esc(v.name)}"></label>
            <label class="field"><span>Cel podróży</span>
              <input name="destination" maxlength="80" placeholder="np. Lizbona, Portugalia" value="${esc(v.destination)}"></label>
          </div>
          <div class="fsec"><h2 class="section">Termin</h2>
            <div class="grid2">
              <label class="field"><span>Od</span><input type="date" name="start" required value="${esc(v.start)}"></label>
              <label class="field"><span>Do</span><input type="date" name="end" required value="${esc(v.end)}"></label>
            </div>
            <p class="f-hint" id="tf-days" aria-live="polite"></p>
          </div>
          <div class="fsec"><h2 class="section">Wygląd</h2>
            <div class="field"><span>Okładka</span>
              <div class="cover-pick hm-hero" id="cover-box" data-cover="${t ? t.id : ""}" style="--c:${esc(v.color || COLORS[0])}">
                <div class="hm-hero-body"><span class="hm-dest" id="cp-dest">${esc(v.destination)}</span><h2 id="cp-name">${esc(v.name) || "Nowa podróż"}</h2></div>
                <div class="cp-btns">
                  <label class="glass cp-btn">${ic("image", "sm")}<span>${cover ? "Zmień zdjęcie" : "Wybierz zdjęcie"}</span><input type="file" id="cover" accept="image/*" hidden></label>
                  ${cover ? `<button type="button" class="glass cp-btn" id="cover-del">${ic("trash", "sm")}<span>Usuń</span></button>` : ""}
                  <button type="button" class="glass cp-btn" id="cover-auto-del"${auto ? "" : " hidden"}>${ic("close", "sm")}<span>Usuń zdjęcie celu</span></button>
                </div>
              </div>
              <small class="f-hint" id="cover-auto-txt" aria-live="polite">${auto ? `Zdjęcie celu dobrane automatycznie · ${esc(auto.credit)}` : App.Covers ? "Zdjęcie celu dobierze się samo po wpisaniu celu podróży. Możesz też wybrać własne." : "Bez zdjęcia okładka ma kolor podróży."}</small></div>
            <fieldset class="field"><legend>Kolor</legend><div class="swatches">${swatches}</div></fieldset>
          </div>
          <div class="fsec"><h2 class="section">Notatka</h2>
            <label class="field"><span class="sr">Notatka</span>
              <textarea name="note" rows="3" placeholder="np. wiza, ubezpieczenie, kontakt do hotelu">${esc(v.note)}</textarea></label>
          </div>
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">${t ? "Zapisz zmiany" : "Utwórz podróż"}</button>
            ${t ? `<button class="btn danger wide" type="button" id="del">${ic("trash", "sm")} Usuń podróż</button>` : ""}
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#trip-form");
        const daysEl = view.querySelector("#tf-days");
        const showDays = () => {
          const ok = f.start.value && f.end.value && f.end.value >= f.start.value;
          const n = ok ? dayDiff(f.start.value, f.end.value) + 1 : 0;
          daysEl.textContent = ok ? `${n} ${plural(n, "dzień", "dni", "dni")}${f.start.value > todayStr() ? ` · wyjazd za ${dayDiff(todayStr(), f.start.value)} ${plural(dayDiff(todayStr(), f.start.value), "dzień", "dni", "dni")}` : ""}` : "";
        };
        f.start.addEventListener("change", () => {
          if (!f.end.value || f.end.value < f.start.value) f.end.value = f.start.value;
          f.end.min = f.start.value;
          showDays();
        });
        f.end.addEventListener("change", showDays);
        showDays();
        if (!t) f.name.focus();
        const box = view.querySelector("#cover-box");
        // podgląd okładki: nazwa, cel i kolor na żywo
        f.name.addEventListener("input", () => { view.querySelector("#cp-name").textContent = f.name.value.trim() || "Nowa podróż"; });
        f.destination.addEventListener("input", () => { view.querySelector("#cp-dest").textContent = f.destination.value.trim(); });
        f.addEventListener("change", e => { if (e.target.name === "color") box.style.setProperty("--c", e.target.value); });
        if (shown) unpaint = paintCovers(view, { [t.id]: shown });
        const adel = view.querySelector("#cover-auto-del"), atxt = view.querySelector("#cover-auto-txt");
        adel.onclick = () => {
          dropAuto = true; autoPick = null;
          if (!newCover && !(cover && !dropCover)) { box.classList.remove("has-photo"); box.style.removeProperty("--photo"); }
          adel.hidden = true; atxt.textContent = "Bez zdjęcia okładka ma kolor podróży.";
        };
        // zdjęcie celu dobierane od razu w formularzu (Wikipedia / Commons), gdy nie ma własnego
        let autoPick = null, autoQ = auto && auto.q ? auto.q : "", autoSeq = 0;
        const ownPhoto = () => !!newCover || (!!cover && !dropCover);
        const findAuto = async () => {
          const q = (f.destination.value.trim() || f.name.value.trim());
          if (!App.Covers || ownPhoto() || q.length < 3 || q === autoQ || (dropAuto && t && q === App.Covers.query(t))) return;
          if (!App.Covers.canFetch()) { if (!auto) atxt.textContent = "Zdjęcie celu dobierze się samo, gdy będzie internet."; return; }
          const seq = ++autoSeq;
          autoQ = q;
          atxt.textContent = `Szukam zdjęcia: ${q}…`;
          try {
            const hit = await App.Covers.find(q);
            if (seq !== autoSeq || ownPhoto()) return;
            if (!hit) { atxt.textContent = "Nie znaleziono zdjęcia celu – możesz wybrać własne."; return; }
            const data = await App.Covers.toData(hit.src);
            if (seq !== autoSeq || ownPhoto()) return;
            autoPick = { data, credit: hit.credit, page: hit.page, q };
            dropAuto = false;
            box.style.setProperty("--photo", `url("${data}")`);
            box.classList.add("has-photo");
            adel.hidden = false;
            atxt.textContent = `Zdjęcie celu dobrane automatycznie · ${hit.credit}`;
          } catch (e) {
            if (seq === autoSeq) { autoQ = ""; atxt.textContent = "Nie udało się pobrać zdjęcia celu – możesz wybrać własne."; }
          }
        };
        const later = () => { clearTimeout(autoTimer); autoTimer = setTimeout(findAuto, 1100); };
        f.destination.addEventListener("input", later);
        f.destination.addEventListener("change", () => { clearTimeout(autoTimer); findAuto(); });
        f.name.addEventListener("input", () => { if (!f.destination.value.trim()) later(); });
        view.querySelector("#cover").addEventListener("change", async e => {
          const file = e.target.files[0];
          if (!file) return;
          try { newCover = await App.resizeImage(file); } catch (err) { App.toast("Nie udało się wczytać zdjęcia"); return; }
          dropCover = false;
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(newCover);
          box.style.setProperty("--photo", `url("${previewUrl}")`);
          box.classList.add("has-photo");
        });
        const cdel = view.querySelector("#cover-del");
        if (cdel) cdel.onclick = () => { dropCover = true; newCover = null; box.classList.remove("has-photo"); cdel.hidden = true; };
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          const err = msg => { const p = view.querySelector("#err"); p.textContent = msg; p.hidden = false; };
          if (!d.name.trim()) return err("Podaj nazwę podróży.");
          if (!d.start) return err("Podaj datę rozpoczęcia.");
          if (!d.end) d.end = d.start;
          if (d.end < d.start) return err("Data końca nie może być przed datą początku.");
          const rec = await DB.put("trips", { ...(t || {}), ...d, name: d.name.trim(), destination: d.destination.trim() });
          if ((newCover || dropCover) && cover) await DB.del("files", cover.id);
          if (dropAuto && App.Covers) await App.Covers.remove(rec.id);
          if (newCover) await DB.put("files", { tripId: rec.id, segmentId: "cover", kind: "cover", mime: "image/jpeg", name: "tlo.jpg", label: "Tło podróży", blob: newCover });
          // zdjęcie celu znalezione w formularzu – zapisane od razu (bez ponownego szukania)
          if (autoPick && !dropAuto && !newCover && App.Covers && App.Covers.query(rec) === autoPick.q) {
            const cur = await DB.get("trips", rec.id);
            await DB.putRaw("trips", { ...cur, coverAuto: autoPick, coverOff: null, coverTry: null, coverTryQ: null });
          }
          App.toast(t ? "Zapisano zmiany" : "Podróż utworzona");
          if (t) App.back(`#/podroze/${rec.id}`); else location.replace(`#/podroze/${rec.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.addEventListener("click", async () => {
          if (await removeTrip(t)) location.replace("#/podroze");
        });
      },
      cleanup() { if (unpaint) unpaint(); if (previewUrl) URL.revokeObjectURL(previewUrl); clearTimeout(autoTimer); },
    };
  }
  App.route(/^\/podroze\/nowa$/, () => tripForm(null));
  App.route(/^\/podroze\/([\w-]+)\/edytuj$/, ([id]) => tripForm(id));

  /* ================= SZCZEGÓŁY PODRÓŻY + OŚ CZASU ================= */
  function chips(s, noWho) {
    const T = typeOf(s);
    const out = [];
    for (const [k, label] of T.extra) if (s[k] && !(noWho && (k === "carrier" || k === "number"))) out.push(k === "carrier" || k === "number" ? esc(s[k]) : `${label}: ${esc(s[k])}`);
    if (s.booking) out.push(`Rez.: ${esc(s.booking)}`);
    if (s.price) out.push(`${esc(s.price)} ${esc(s.currency || "")}`.trim());
    return out.length ? `<div class="chips">${out.map(c => `<span>${c}</span>`).join("")}</div>` : "";
  }

  // bilet przy odcinku, który ma podpięte pliki
  const ticketMark = n => n ? `<span class="tl-tickets chip accent" title="Bilety: ${n}">${ic("ticket", "sm")}${n > 1 ? " " + n : ""}</span>` : "";
  const segIco = s => `<div class="tl-ico" aria-hidden="true">${ic(ICON_OF[s.type] || "compass")}</div>`;

  function segCard(s, nTickets = 0) {
    const T = typeOf(s);
    if (s.type === "nocleg") {
      const nights = s.arrive ? dayDiff(s.depart, s.arrive) : 0;
      return `
        <a class="tl-card" href="#/odcinek/${s.id}">
          ${segIco(s)}
          <div class="tl-main">
            <div class="tl-kind">${esc(T.name)}${ticketMark(nTickets)}</div>
            <div class="tl-route">${esc(s.name || "Nocleg")}</div>
            <div class="tl-time">Zameldowanie ${App.time(s.depart)}${nights > 0 ? ` <span class="muted">· ${nights} ${plural(nights, "noc", "noce", "nocy")}</span>` : ""}</div>
            ${s.address ? `<div class="tl-addr">${ic("pin", "xs")}<span>${esc(s.address)}</span></div>` : ""}
            ${chips(s)}
          </div>
        </a>`;
    }
    const arriveDay = s.arrive ? dayDiff(s.depart, s.arrive) : 0;
    const dur = s.arrive ? App.duration(App.segMinutes(s)) : "";
    const shift = App.tzShiftText(s);
    const who = [s.carrier, s.number].filter(Boolean).map(esc).join(" · ");
    return `
      <a class="tl-card" href="#/odcinek/${s.id}">
        ${segIco(s)}
        <div class="tl-main">
          <div class="tl-kind">${esc(T.name)}${who ? ` <span class="muted">· ${who}</span>` : ""}${ticketMark(nTickets)}</div>
          <div class="tl-route">${esc(s.from || "?")} → ${esc(s.to || "?")}</div>
          <div class="tl-time">${App.time(s.depart)}${s.arrive ? ` → ${App.time(s.arrive)}${arriveDay > 0 ? `<sup>+${arriveDay}</sup>` : ""}` : ""}
            ${dur ? `<span class="muted">· ${dur}</span>` : ""}${shift ? ` <span class="muted small">· ${shift}</span>` : ""}</div>
          ${chips(s, true)}
        </div>
      </a>`;
  }

  // wymeldowanie z noclegu jako mała pozycja w dniu wyjazdu
  const checkoutCard = s => `
    <a class="tl-card tl-light" href="#/odcinek/${s.id}">
      <div class="tl-ico" aria-hidden="true">${ic("key")}</div>
      <div class="tl-main"><div class="tl-time">Wymeldowanie ${App.time(s.arrive)}</div>
      <div class="muted small">${esc(s.name || "Nocleg")}</div></div>
    </a>`;

  /* Szczegóły podróży (etap 7a redesignu – DESIGN.md): okładka jak na ekranie głównym, postęp (spakowane / plan / wydatki),
     narzędzia jako lista, oś czasu z nagłówkami dni jak w Planie, dodawanie odcinka kafelkami z ikonami. */
  App.route(/^\/podroze\/([\w-]+)$/, async ([id]) => {
    const t = await DB.get("trips", id);
    if (!t) { location.replace("#/podroze"); return ""; }
    const segs = (await DB.byIndex("segments", "tripId", id)).sort(bySegTime);
    if (App.Stats) await App.Stats.fillTz(segs).catch(() => {}); // strefy czasowe lotnisk (etap 9)
    const nFiles = {};
    for (const f of await DB.byIndex("files", "tripId", id)) nFiles[f.segmentId] = (nFiles[f.segmentId] || 0) + 1;

    // pozycje osi czasu: [dzień, czas, html]
    const items = [];
    for (const s of segs) {
      if (!s.depart) continue;
      items.push([s.depart.slice(0, 10), s.depart, segCard(s, nFiles[s.id])]);
      if (s.type === "nocleg" && s.arrive && s.arrive.slice(0, 10) !== s.depart.slice(0, 10))
        items.push([s.arrive.slice(0, 10), s.arrive, checkoutCard(s)]);
    }
    items.sort((a, b) => a[1].localeCompare(b[1]));

    const total = dayDiff(t.start, t.end) + 1;
    const today = todayStr(), st = status(t);
    const [pk, plan, bg] = await Promise.all([
      App.Pack ? App.Pack.summary(id) : null,
      DB.byIndex("planItems", "tripId", id),
      App.Budget ? App.Budget.summary(id).catch(() => null) : null,
    ]);
    const planned = plan.filter(p => p.date).length, ideas = plan.length - planned;
    const wx = App.Weather ? await App.Weather.get(t) : null;
    const cov = await covers(id);
    let unpaint = null;

    // oś czasu: nagłówek dnia jak w Planie (DZIEŃ N + data w Newsreader)
    let timeline = "", lastDay = null;
    for (const [day, , html] of items) {
      if (day !== lastDay) {
        if (lastDay) timeline += `</div></section>`;
        const n = dayDiff(t.start, day) + 1;
        const tag = n >= 1 && n <= total ? `Dzień ${n}` : n < 1 ? "Przed podróżą" : "Po podróży";
        timeline += `<section class="td-day${day === today ? " is-today" : ""}">
          <div class="pl-day-head"><div class="pl-day-t">
            <div class="pl-day-n"><span>${tag}</span>${day === today ? ` <span class="chip accent">dziś</span>` : ""}</div>
            <h3 class="tl-day">${App.fmtDayLong(day)}</h3></div></div><div class="td-list">`;
        lastDay = day;
      }
      timeline += html;
    }
    if (lastDay) timeline += `</div></section>`;

    // A: okładka – zdjęcie albo kolor podróży (jak karta na ekranie głównym)
    const sub = st === "now" ? `dzień ${dayDiff(t.start, today) + 1} z ${total}` : `${total} ${plural(total, "dzień", "dni", "dni")}`;
    const pct = st === "now" ? Math.round((dayDiff(t.start, today) + 1) / total * 100) : 0;
    const head = `
      <div class="trip-head hm-hero td-hero" data-cover="${t.id}" style="--c:${esc(t.color || COLORS[0])}">
        <div class="hm-hero-top">
          <span class="glass pill-${st}">${st === "now" ? `<i class="live" aria-hidden="true"></i>` : ""}${statusText(t)}</span>
        </div>
        <div class="hm-hero-body">
          ${t.destination ? `<span class="hm-dest dest">${esc(t.destination)}</span>` : ""}
          <h2>${esc(t.name)}</h2>
          <span class="hm-dates dates">${App.fmtRange(t.start, t.end)} · ${sub}</span>
          ${st === "now" ? `<span class="bar td-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ""}
        </div>
      </div>
      ${cov[id] && cov[id].auto ? `<p class="cover-credit">Zdjęcie: ${esc(cov[id].credit)}</p>` : ""}
      ${t.note ? `<p class="td-note note">${ic("info", "sm")}<span>${esc(t.note)}</span></p>` : ""}`;

    // B: postęp – każdy kafelek prowadzi do swojego ekranu
    const over = bg && bg.budget && bg.spent > bg.budget;
    const ppct = pk && pk.total ? Math.round(pk.done / pk.total * 100) : 0;
    const stats = `
      <div class="hm-stats td-stats">
        <a class="hm-stat" href="#/plan/${t.id}"><small>W planie</small>
          <b>${planned}<span> ${plural(planned, "punkt", "punkty", "punktów")}</span></b>${ideas ? `<em>${ideas} ${plural(ideas, "pomysł", "pomysły", "pomysłów")}</em>` : ""}</a>
        <a class="hm-stat" href="#/pakowanie/${t.id}"><small>Spakowane</small>
          ${pk && pk.total ? `<b>${pk.done}<span> / ${pk.total}</span></b><span class="bar"><i style="width:${ppct}%"></i></span>` : `<b class="hm-none">Dodaj listę</b>`}
          ${pk && pk.todo ? `<em>zadania ${pk.todoDone}/${pk.todo}</em>` : ""}</a>
        ${App.Budget ? `<a class="hm-stat${over ? " over" : ""}" href="#/budzet/${t.id}"><small>Wydatki</small>
          ${bg && bg.spent ? `<b>${tileMoney(bg.spent, bg.home)}</b>` : `<b class="hm-none">Budżet</b>`}
          ${bg && bg.budget ? `<em>${over ? "ponad budżet" : `z ${App.Budget.money(bg.budget, bg.home)}`}</em>` : ""}</a>` : ""}
      </div>`;

    // C: narzędzia
    const jr = App.Journal && t.start <= today ? await App.Journal.summary(id) : null;
    const guides = App.Guide ? await App.Guide.forTrip(id) : [];
    const vis = App.Social && App.Social.available() ? await App.Social.visibility(id) : "private";
    const shared = App.Sync ? await App.Sync.isShared(id) : false, unread = shared ? await App.Sync.unread(id) : 0;
    const row = (href, icon, title, desc, extra = "") => `
      <${href ? `a href="${href}"` : `button type="button"`} class="li td-link"${extra}>
        <span class="li-ico">${ic(icon)}</span>
        <span class="li-main"><b>${title}</b><small>${desc}</small></span>${ic("chev")}
      </${href ? "a" : "button"}>`;
    const tools = `
      <div class="list td-tools">
        ${row(`#/plan/${t.id}`, "plan", "Plan dnia po dniu", "zwiedzanie, jedzenie, mapa")}
        ${t.end >= today ? row(`#/przygotuj/${t.id}`, "cloud", "Przygotuj offline", "mapa, karty, zdjęcia, kursy na zapas") : ""}
        ${t.start <= today ? row(`#/dziennik/${t.id}`, "edit", "Dziennik podróży", jr && (jr.days || jr.photos) ? `${jr.days} ${plural(jr.days, "dzień opisany", "dni opisane", "dni opisanych")} · ${jr.photos} ${plural(jr.photos, "zdjęcie", "zdjęcia", "zdjęć")}` : "wspomnienia i zdjęcia z każdego dnia") : ""}
        ${App.Guide ? row(`#/przewodnik/${t.id}`, "compass", "Przewodnik", guides.length ? `${guides.map(g => esc(g.title)).join(", ")} · offline` : "Wikivoyage: co zobaczyć, jedzenie, dojazd – offline") : ""}
        ${row(`#/waluty/${t.id}`, "currency", "Przelicznik walut", "działa offline, kursy na drogę")}
        ${App.Sync ? row(`#/razem/${t.id}`, "chat", "Razem", shared ? `czat i pomysły${unread ? ` · <b class="rz-new">${unread} ${plural(unread, "nowa wiadomość", "nowe wiadomości", "nowych wiadomości")}</b>` : ""}` : "planujcie wspólnie – czat, pomysły, zmiany na żywo") : ""}
        ${App.Social && App.Social.available() ? row(`#/widocznosc/${t.id}`, vis === "private" ? "lock" : vis === "public" ? "globe" : "users", "Kto widzi podróż", vis === "public" ? "publiczna – każdy z linkiem" : vis === "friends" ? "widzą ją Twoi znajomi" : "prywatna – tylko Ty") : ""}
        ${row(`#/udostepnij/${t.id}`, "share", "Wyślij podróż", "jako plik albo plan w wiadomości")}
        ${row(null, "bell", "Do kalendarza", "plik .ics z przypomnieniami", ` id="ics-trip"`)}
      </div>`;

    const visas = t.end >= today && self.Visas ? await visaPanel(t, segs, plan) : "";

    const typeButtons = Object.entries(TYPES).map(([k, T]) =>
      `<a class="type-btn" href="#/podroze/${id}/dodaj?typ=${k}"><i aria-hidden="true">${ic(ICON_OF[k] || "compass")}</i>${T.name}</a>`).join("");
    const nSeg = segs.length;

    return {
      title: "Podróż",
      back: "#/podroze",
      action: `<a class="icon-btn" href="#/podroze/${id}/edytuj" aria-label="Edytuj podróż">${ic("edit")}</a>`,
      html: head + stats + tools + visas + (wx && wx.data ? App.Weather.strip(wx.data, t) : "") +
        `<div class="sec-h td-sec"><h2 class="section">Trasa i noclegi</h2>${nSeg ? `<span class="chip">${nSeg}</span>` : ""}</div>` +
        (timeline || App.empty("🗺️", "Pusta oś czasu", "Dodaj pierwszy lot, pociąg, autobus albo nocleg – wybierz poniżej.")) +
        `<h2 class="section">Dodaj do podróży</h2><div class="type-grid">${typeButtons}</div>
         <div class="list td-tools td-mail">
           ${row(`#/wklej?trip=${id}`, "mail", "Z maila", "potwierdzenie lotu, pociągu, hotelu, PDF, .ics")}
         </div>`,
      cleanup() { if (unpaint) unpaint(); },
      after(view) {
        unpaint = paintCovers(view, cov);
        if (App.Covers && !cov[id]) App.Covers.fill([t], new Set(), (x, c) => paintAuto(view, x.id, c.data));
        // pogoda: pokazane zapisane dane, świeże pobierane w tle (jeśli są starsze niż 3 h)
        if (wx) wx.refresh().then(changed => { if (changed) App.render(); }).catch(() => {});
        bindVisas(view, t);
        const b = view.querySelector("#ics-trip");
        if (b) b.onclick = () => App.Reminders.exportTrips([t.id], t.name);
      },
    };
  });

  /* ================= WJAZD I WIZY (visas.js) ================= */
  const flag = cc => String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
  const dmy = s => `${+s.slice(8)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  async function visaPanel(t, segs, plan) {
    await Visas.ready();
    const list = Visas.analyze(t, segs, plan, await DB.all("docs"));
    const cit = Visas.citizen();
    const daysTxt = n => `${n} ${plural(n, "dzień", "dni", "dni")}`;
    const info = v => {
      const p = v.permit;
      return {
        free: v.days ? `Bez wizy do ${daysTxt(v.days)}` : "Bez wizy",
        form: `${v.days ? `Bez wizy do ${daysTxt(v.days)}` : "Bez wizy"} · ${p} – online najwcześniej 3 dni przed przylotem`,
        eta: `${p || "Zezwolenie elektroniczne"} – złóż online przed wylotem${v.transit ? " · także przy samej przesiadce" : ""}`,
        evisa: `${p || "E-wiza"} – złóż online z wyprzedzeniem`,
        voa: `Wiza na lotnisku albo wcześniej online${p ? ` (${p})` : ""}`,
        visa: `${p || "Wiza z ambasady"} – zacznij załatwiać wcześnie`,
        check: `Zasady czasowe albo niepewne${p ? ` (${p})` : ""} – sprawdź przed wyjazdem`,
        unknown: "Brak danych w aplikacji – sprawdź na stronie MSZ",
      }[v.kind];
    };
    const chipCls = { free: "ok", form: "accent", eta: "warn", evisa: "warn", voa: "accent", visa: "err", check: "warn", unknown: "" };
    const rows = list.map(v => {
      const act = Visas.needsAction(v);
      const lead = (Visas.LEAD[v.kind] || [])[0];
      const extra = [
        v.over ? `<span class="vz-bad">Podróż: ${daysTxt(v.stay)} – dłużej, niż można bez wizy</span>` : "",
        v.untilPassed ? `<span class="vz-bad">Zwolnienie z wiz do ${dmy(v.until)} – podróż kończy się później</span>` : v.until ? `<span>Zwolnienie czasowe – do ${dmy(v.until)}</span>` : "",
        v.done ? `<span class="vz-ok">${v.doneBy === "doc" ? "Wiza w Dokumentach" : "Oznaczone: mam"}</span>`
          : act && lead ? `<span>${v.arriveKnown ? `Przylot ${App.fmtDay(v.arrive)} · przypomnę ${daysTxt(lead)} wcześniej` : `Przypomnę ${daysTxt(lead)} przed wyjazdem`}</span>` : v.transit ? "<span>przesiadka</span>" : "",
      ].filter(Boolean).join("");
      return `
        <div class="li vz-row${v.done ? " is-done" : ""}${act ? " is-act" : ""}" data-cc="${v.cc}">
          <span class="li-ico vz-flag" aria-hidden="true">${flag(v.cc)}</span>
          <span class="li-main">
            <span class="vz-top"><b>${esc(v.name)}</b><span class="chip ${v.done ? "ok" : chipCls[v.kind]}">${v.done ? "mam" : Visas.KIND_TXT[v.kind]}</span></span>
            <button type="button" class="icon-btn vz-x" data-vz-skip="${v.cc}" aria-label="Nie jadę do: ${esc(v.name)}" title="Nie jadę tam">${ic("close", "sm")}</button>
            <small>${esc(info(v))}</small>
            ${extra ? `<small class="vz-extra">${extra}</small>` : ""}
            ${v.url && v.kind !== "free" || !(["free", "unknown"].includes(v.kind) && !v.over && !v.untilPassed || v.doneBy === "doc") ? `<span class="vz-acts">` : `<span class="vz-acts" hidden>`}
              ${v.url && v.kind !== "free" ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${ic("globe", "sm")}<span>Oficjalna strona</span></a>` : ""}
              ${["free", "unknown"].includes(v.kind) && !v.over && !v.untilPassed || v.doneBy === "doc" ? "" : `<button type="button" data-vz-done="${v.cc}" aria-pressed="${v.done}">${ic("check", "sm")}<span>Mam</span></button>`}
            </span>
          </span>
        </div>`;
    }).join("");
    const opts = Visas.addable().filter(cc => !list.some(v => v.cc === cc))
      .map(cc => [cc, Visas.name(cc)]).sort((a, b) => a[1].localeCompare(b[1], "pl"))
      .map(([cc, n]) => `<option value="${cc}">${esc(n)}</option>`).join("");
    const todo = list.filter(Visas.needsAction).length;
    return `
      <div class="sec-h td-sec"><h2 class="section">Wjazd i wizy</h2>${todo ? `<span class="chip warn">${todo} do zrobienia</span>` : list.length ? `<span class="chip ok">w porządku</span>` : ""}</div>
      ${rows ? `<div class="list vz-list">${rows}</div>` : `<p class="f-hint vz-none">${Visas.EU_SET.has(cit) ? "Nie rozpoznano kraju poza Unią Europejską – dodaj go niżej, jeśli trzeba." : "Nie rozpoznano kraju podróży – dodaj go niżej, jeśli trzeba."}</p>`}
      <label class="vz-add"><span class="sr">Dodaj kraj</span><select id="vz-add"><option value="">+ Dodaj kraj</option>${opts}</select></label>
      ${cit === "PL" ? `<p class="vz-src">${ic("info", "sm")}<span>Polski paszport, dane orientacyjne (stan: ${Visas.AS_OF}). Przepisy się zmieniają – przed wyjazdem sprawdź
        <a href="${Visas.MSZ}" target="_blank" rel="noopener">MSZ: Informacje dla podróżujących</a>. Wnioski składaj tylko na oficjalnych stronach.
        <a href="#/ustawienia">Inne obywatelstwo?</a></span></p>`
      : `<p class="vz-src">${ic("info", "sm")}<span>Paszport: <b translate="no">${esc(Visas.name(cit))}</b>. Dane orientacyjne z Passport Index (stan: ${dmy(Visas.worldAsOf() || "2026-02-17")}).
        Przepisy się zmieniają – przed wyjazdem sprawdź na stronie MSZ swojego kraju albo ambasady kraju docelowego. Wnioski składaj tylko na oficjalnych stronach.
        <a href="#/ustawienia">Zmień obywatelstwo</a></span></p>`}`;
  }
  function bindVisas(view, t) {
    const save = async fn => {
      const cur = await DB.get("trips", t.id);
      const v = { add: [], skip: [], done: [], ...(cur.visa || {}) };
      fn(v);
      await DB.put("trips", { ...cur, visa: v });
      App.render();
    };
    const tog = (arr, cc, on) => { const i = arr.indexOf(cc); if (on && i < 0) arr.push(cc); if (!on && i >= 0) arr.splice(i, 1); };
    view.querySelectorAll("[data-vz-done]").forEach(b => b.onclick = () => save(v => tog(v.done, b.dataset.vzDone, b.getAttribute("aria-pressed") !== "true")));
    view.querySelectorAll("[data-vz-skip]").forEach(b => b.onclick = () => save(v => { const cc = b.dataset.vzSkip; if (v.add.includes(cc)) tog(v.add, cc, false); else tog(v.skip, cc, true); }));
    const sel = view.querySelector("#vz-add");
    if (sel) sel.onchange = () => sel.value && save(v => { tog(v.add, sel.value, true); tog(v.skip, sel.value, false); });
  }

  /* ================= FORMULARZ ODCINKA ================= */
  function segFields(type, v) {
    const T = TYPES[type];
    const input = (k, label, ph = "", attrs = "") =>
      `<label class="field"><span>${label}</span><input name="${k}" value="${esc(v[k])}" placeholder="${esc(ph)}" ${attrs}></label>`;
    const pairs = list => {
      let h = "";
      for (let i = 0; i < list.length; i += 2) {
        const [a, b] = [list[i], list[i + 1]];
        h += b ? `<div class="grid2">${input(...a)}${input(...b)}</div>` : input(...a);
      }
      return h;
    };
    const sec = (title, body) => `<div class="fsec"><h2 class="section">${title}</h2>${body}</div>`;
    const where = T.route === false
      ? input("name", "Nazwa obiektu", "np. Hotel Avenida", "required maxlength=\"100\"") + input("address", "Adres", "ulica, miasto")
      : input("from", T.from, T.fromPh || "", "maxlength=\"100\"") + input("to", T.to, T.toPh || "", "maxlength=\"100\"");
    const when = `<label class="field"><span>${T.depart}</span><input type="datetime-local" name="depart" required value="${esc(v.depart)}"></label>
      <label class="field"><span>${T.arrive}</span><input type="datetime-local" name="arrive" value="${esc(v.arrive)}"></label>
      <p class="f-hint" id="sf-dur" aria-live="polite"></p>`;
    return sec(T.route === false ? "Obiekt" : "Trasa", where) + sec("Czas", when) +
      sec("Szczegóły", pairs(T.extra.concat(TAIL))) +
      sec("Cena i notatka", `<div class="grid2 price">
        ${input("price", "Cena", "np. 249", "inputmode=\"decimal\"")}
        ${input("currency", "Waluta", "PLN", "maxlength=\"5\" autocapitalize=\"characters\"")}
      </div>
      <label class="field"><span>Notatka</span><textarea name="note" rows="3" placeholder="opcjonalnie">${esc(v.note)}</textarea></label>`);
  }

  async function segForm({ segId, tripId, type }) {
    const s = segId ? await DB.get("segments", segId) : null;
    if (segId && !s) { location.replace("#/podroze"); return ""; }
    const trip = await DB.get("trips", s ? s.tripId : tripId);
    if (!trip) { location.replace("#/podroze"); return ""; }
    // nowy odcinek: data startu podróży jako podpowiedź, żeby kalendarz nie otwierał się na dzisiejszym dniu
    const t0 = TYPES[type] ? type : "lot";
    let v = s || { type: t0, currency: "PLN", depart: `${trip.start}T${t0 === "nocleg" ? "15:00" : "08:00"}` };
    // dane odczytane z maila (etap 8, email.js) – jednorazowo wypełniają nowy odcinek
    const fromMail = !s && !!App.prefill;
    if (fromMail) { v = { ...v, ...App.prefill }; App.prefill = null; }
    let cur = v.type;

    const typeChips = Object.entries(TYPES).map(([k, T]) => `
      <label class="type-chip"><input type="radio" name="type" value="${k}" ${k === cur ? "checked" : ""}>
        <span><b aria-hidden="true">${ic(ICON_OF[k] || "compass", "sm")}</b>${T.name}</span></label>`).join("");

    return {
      title: s ? TYPES[cur].name : "Nowy odcinek",
      back: s ? `#/odcinek/${s.id}` : `#/podroze/${trip.id}`,
      html: `
        <form id="seg-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${typeChips}</div>
          ${fromMail ? `<p class="td-note">${ic("mail", "sm")}<span>Dane odczytane z maila – sprawdź godziny i miejsca przed zapisaniem.</span></p>` : ""}
          <div id="seg-fields" class="fsecs">${segFields(cur, v)}</div>
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">${s ? "Zapisz zmiany" : "Dodaj do podróży"}</button>
            ${s ? `<button class="btn danger wide" type="button" id="del">${ic("trash", "sm")} Usuń</button>` : ""}
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#seg-form");
        const box = view.querySelector("#seg-fields");
        const bindDates = () => {
          // czas trwania / liczba nocy pod polami dat
          const dur = () => {
            const el = view.querySelector("#sf-dur"), a = f.depart.value, b = f.arrive.value;
            if (!el) return;
            if (!a || !b || b <= a) { el.textContent = ""; return; }
            if (TYPES[cur].route === false) { const n = dayDiff(a, b); el.textContent = n > 0 ? `${n} ${plural(n, "noc", "noce", "nocy")}` : ""; }
            else el.textContent = cur === "lot" ? "" : `Czas podróży: ${App.duration(App.segMinutes({ depart: a, arrive: b }))}`; // lot: strefy liczone w szczegółach
          };
          // podpowiedź: przy pierwszym wyborze daty ustaw przyjazd na tę samą chwilę (zostaje tylko poprawić godzinę)
          f.depart.addEventListener("change", () => {
            if (f.depart.value && (!f.arrive.value || f.arrive.value < f.depart.value)) f.arrive.value = f.depart.value;
            dur();
          });
          f.arrive.addEventListener("change", dur);
          dur();
        };
        bindDates();
        f.addEventListener("change", e => {
          if (e.target.name !== "type") return;
          const now = Object.fromEntries(new FormData(f));
          // zachowaj wspólne pola przy zmianie rodzaju (nocleg ↔ transport: nazwa ↔ skąd)
          if (TYPES[cur].route === false && TYPES[now.type].route !== false && !now.from) now.to = now.name;
          if (TYPES[cur].route !== false && TYPES[now.type].route === false && !now.name) now.address = now.to;
          v = { ...v, ...now };
          cur = now.type;
          box.innerHTML = segFields(cur, v);
          bindDates();
        });
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          const err = msg => { const p = view.querySelector("#err"); p.textContent = msg; p.hidden = false; p.scrollIntoView({ block: "center" }); };
          for (const k in d) if (typeof d[k] === "string") d[k] = d[k].trim();
          const T = TYPES[d.type];
          if (T.route === false && !d.name) return err("Podaj nazwę obiektu.");
          if (!d.depart) return err(`Podaj datę i godzinę: ${T.depart.toLowerCase()}.`);
          if (d.arrive && d.arrive < d.depart) return err(`${T.arrive} nie może być przed: ${T.depart.toLowerCase()}.`);
          if (d.currency) d.currency = d.currency.toUpperCase();
          if (!d.price) d.currency = d.currency || "PLN";

          // przy zmianie rodzaju usuń pola, których nowy rodzaj nie ma
          const keep = new Set(["type", "depart", "arrive", "price", "currency", "note", "booking",
            ...(T.route === false ? ["name", "address"] : ["from", "to"]), ...T.extra.map(x => x[0])]);
          // pola spoza formularza (id, data utworzenia, dane z kolejnych etapów) zostają bez zmian
          const base = s ? Object.fromEntries(Object.entries(s).filter(([k]) => !FORM_KEYS.has(k))) : {};
          const clean = Object.fromEntries(Object.entries(d).filter(([k]) => keep.has(k)));
          const rec = await DB.put("segments", { ...base, ...clean, tripId: trip.id });

          // poszerz daty podróży, jeśli odcinek wychodzi poza nie
          const d1 = rec.depart.slice(0, 10), d2 = (rec.arrive || rec.depart).slice(0, 10);
          if (d1 < trip.start || d2 > trip.end) {
            await DB.put("trips", { ...trip, start: d1 < trip.start ? d1 : trip.start, end: d2 > trip.end ? d2 : trip.end });
            App.toast("Zapisano · daty podróży poszerzone");
          } else App.toast(s ? "Zapisano zmiany" : "Dodano do podróży");
          if (fromMail) location.replace(`#/podroze/${trip.id}`);
          else App.back(s ? `#/odcinek/${s.id}` : `#/podroze/${trip.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.addEventListener("click", async () => {
          if (!confirm("Usunąć ten odcinek? Tego nie da się cofnąć.")) return;
          for (const r of await DB.byIndex("files", "segmentId", s.id)) await DB.del("files", r.id);
          await DB.del("segments", s.id);
          App.toast("Usunięto");
          location.replace(`#/podroze/${trip.id}`);
        });
      },
    };
  }
  App.route(/^\/podroze\/([\w-]+)\/dodaj$/, ([tripId], q) => segForm({ tripId, type: q.typ }));
  App.route(/^\/odcinek\/([\w-]+)\/edytuj$/, ([segId]) => segForm({ segId }));

  // wspólne elementy dla biletów (tickets.js)
  // usunięcie całej podróży (z pytaniem); true, gdy usunięta
  async function removeTrip(t) {
    const segs = await DB.byIndex("segments", "tripId", t.id);
    const shared = App.Sync && await App.Sync.isShared(t.id);
    if (!confirm(`Usunąć podróż „${t.name}”${segs.length ? ` razem z ${segs.length} ${plural(segs.length, "odcinkiem", "odcinkami", "odcinkami")}` : ""}? Tego nie da się cofnąć.${shared ? " To podróż wspólna – zniknie tylko u Ciebie, u innych zostanie." : ""}`)) return false;
    if (shared) await App.Sync.leave(t.id); // najpierw wyjście, żeby usuwanie nie poszło do innych
    for (const store of ["segments", "files", "planItems", "packItems", "reminders", "expenses", "journal", "journalPhotos", "chat", "votes", "members"]) {
      for (const r of await DB.byIndex(store, "tripId", t.id)) await DB.del(store, r.id);
    }
    if (App.Guide) await App.Guide.detachAll(t.id);
    await DB.del("trips", t.id);
    if (self.caches) caches.delete(`mapa-offline-${t.id}`).catch(() => {}); // pobrana mapa offline tej podróży
    if (App.Reminders && App.Reminders.syncNative) Promise.resolve(App.Reminders.syncNative()).catch(() => {}); // powiadomienia usuniętej podróży
    App.toast("Podróż usunięta");
    return true;
  }

  App.Trips = { removeTrip, TYPES, typeOf, chips, status, COLORS, bySegTime, editIcon, plusIcon };
})();
