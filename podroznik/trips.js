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
    const all = await DB.byIndex("files", "segmentId", "cover");
    return Object.fromEntries(all.filter(f => !tripId || f.tripId === tripId).map(f => [f.tripId, f]));
  }
  // ustawia tło elementom [data-cover="id podróży"]; zwraca funkcję sprzątającą
  function paintCovers(root, map) {
    const urls = [];
    root.querySelectorAll("[data-cover]").forEach(el => {
      const f = map[el.dataset.cover];
      if (!f || !(f.blob instanceof Blob)) return;
      const u = URL.createObjectURL(f.blob); urls.push(u);
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

  App.route(/^\/podroze$/, async () => {
    const [trips, segs] = await Promise.all([DB.all("trips"), DB.all("segments")]);
    const segsOf = {};
    segs.forEach(s => (segsOf[s.tripId] = segsOf[s.tripId] || []).push(s));
    const statsAction = `<a class="icon-btn" href="#/statystyki" aria-label="Statystyki">${ic("chart")}</a>`;
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
          <h3 class="section">Zacznij</h3>${quickActions()}`,
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
        </a>`;

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
            ${bud && bud.spent ? `<b>${App.Budget.money(bud.spent, bud.home)}</b>` : `<b class="hm-none">Budżet</b>`}</a>
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
        <div class="sec-h"><h3 class="section">Najbliższy bilet</h3><a href="#/bilety">Wszystkie</a></div>
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
    if (rest.length) html += `<div class="sec-h"><h3 class="section">Nadchodzące</h3></div><div class="hm-scroll">${rest.map(tcard).join("")}</div>`;
    html += `<h3 class="section">Szybkie akcje</h3>${quickActions()}`;
    if (past.length) html += `
      <details class="archive">
        <summary><h3 class="section">Archiwum <span class="muted">(${past.length})</span></h3></summary>
        <div class="list">${past.map(trow).join("")}</div>
      </details>`;

    let unpaint = null, timer = null;
    return {
      title: "Podróżnik", brand: true, action: statsAction, html,
      after(v) {
        unpaint = paintCovers(v, cov);
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
    const cover = t ? (await covers(t.id))[t.id] : null;
    let newCover = null, dropCover = false, unpaint = null, previewUrl = null;
    const swatches = COLORS.map(c => `
      <label class="swatch" style="--c:${c}">
        <input type="radio" name="color" value="${c}" ${c === v.color ? "checked" : ""}><span aria-label="kolor ${c}"></span>
      </label>`).join("");

    return {
      title: t ? "Edytuj podróż" : "Nowa podróż",
      back: t ? `#/podroze/${t.id}` : "#/podroze",
      html: `
        <form id="trip-form" class="form" novalidate>
          <label class="field"><span>Nazwa</span>
            <input name="name" required maxlength="80" placeholder="np. Majówka w Lizbonie" value="${esc(v.name)}"></label>
          <label class="field"><span>Cel podróży</span>
            <input name="destination" maxlength="80" placeholder="np. Lizbona, Portugalia" value="${esc(v.destination)}"></label>
          <div class="grid2">
            <label class="field"><span>Od</span><input type="date" name="start" required value="${esc(v.start)}"></label>
            <label class="field"><span>Do</span><input type="date" name="end" required value="${esc(v.end)}"></label>
          </div>
          <fieldset class="field"><legend>Kolor</legend><div class="swatches">${swatches}</div></fieldset>
          <div class="field"><span>Zdjęcie w tle</span>
            <div class="cover-pick" id="cover-box" data-cover="${t ? t.id : ""}">
              <label class="btn">🖼️ ${cover ? "Zmień zdjęcie" : "Wybierz zdjęcie"}<input type="file" id="cover" accept="image/*" hidden></label>
              ${cover ? `<button type="button" class="btn" id="cover-del">Usuń</button>` : ""}
            </div></div>
          <label class="field"><span>Notatka</span>
            <textarea name="note" rows="3" placeholder="opcjonalnie">${esc(v.note)}</textarea></label>
          <p class="error" id="err" hidden></p>
          <button class="btn primary wide" type="submit">${t ? "Zapisz zmiany" : "Utwórz podróż"}</button>
          ${t ? `<button class="btn danger wide" type="button" id="del">Usuń podróż</button>` : ""}
        </form>`,
      after(view) {
        const f = view.querySelector("#trip-form");
        f.start.addEventListener("change", () => {
          if (!f.end.value || f.end.value < f.start.value) f.end.value = f.start.value;
          f.end.min = f.start.value;
        });
        if (!t) f.name.focus();
        const box = view.querySelector("#cover-box");
        if (cover) unpaint = paintCovers(view, { [t.id]: cover });
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
          if (newCover) await DB.put("files", { tripId: rec.id, segmentId: "cover", kind: "cover", mime: "image/jpeg", name: "tlo.jpg", label: "Tło podróży", blob: newCover });
          App.toast(t ? "Zapisano zmiany" : "Podróż utworzona");
          if (t) App.back(`#/podroze/${rec.id}`); else location.replace(`#/podroze/${rec.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.addEventListener("click", async () => {
          const segs = await DB.byIndex("segments", "tripId", t.id);
          if (!confirm(`Usunąć podróż „${t.name}”${segs.length ? ` razem z ${segs.length} ${plural(segs.length, "odcinkiem", "odcinkami", "odcinkami")}` : ""}? Tego nie da się cofnąć.`)) return;
          for (const store of ["segments", "files", "planItems", "packItems", "reminders", "expenses"]) {
            for (const r of await DB.byIndex(store, "tripId", t.id)) await DB.del(store, r.id);
          }
          await DB.del("trips", t.id);
          if (self.caches) caches.delete(`mapa-offline-${t.id}`).catch(() => {}); // pobrana mapa offline tej podróży
          App.toast("Podróż usunięta");
          location.replace("#/podroze");
        });
      },
      cleanup() { if (unpaint) unpaint(); if (previewUrl) URL.revokeObjectURL(previewUrl); },
    };
  }
  App.route(/^\/podroze\/nowa$/, () => tripForm(null));
  App.route(/^\/podroze\/([\w-]+)\/edytuj$/, ([id]) => tripForm(id));

  /* ================= SZCZEGÓŁY PODRÓŻY + OŚ CZASU ================= */
  function chips(s) {
    const T = typeOf(s);
    const out = [];
    for (const [k, label] of T.extra) if (s[k]) out.push(k === "carrier" || k === "number" ? esc(s[k]) : `${label}: ${esc(s[k])}`);
    if (s.booking) out.push(`Rez.: ${esc(s.booking)}`);
    if (s.price) out.push(`${esc(s.price)} ${esc(s.currency || "")}`.trim());
    return out.length ? `<div class="chips">${out.map(c => `<span>${c}</span>`).join("")}</div>` : "";
  }

  // 🎫 przy odcinku, który ma podpięte bilety
  const ticketMark = n => n ? `<span class="tl-tickets" title="Bilety: ${n}">🎫${n > 1 ? " " + n : ""}</span>` : "";

  function segCard(s, nTickets = 0) {
    const T = typeOf(s);
    if (s.type === "nocleg") {
      const nights = s.arrive ? dayDiff(s.depart, s.arrive) : 0;
      return `
        <a class="tl-card" href="#/odcinek/${s.id}">
          <div class="tl-ico" aria-hidden="true">${T.icon}</div>
          <div class="tl-main">
            <div class="tl-time">Zameldowanie ${App.time(s.depart)}${nights > 0 ? ` <span class="muted">· ${nights} ${plural(nights, "noc", "noce", "nocy")}</span>` : ""}${ticketMark(nTickets)}</div>
            <div class="tl-route">${esc(s.name || "Nocleg")}</div>
            ${s.address ? `<div class="muted small">${esc(s.address)}</div>` : ""}
            ${chips(s)}
          </div>
        </a>`;
    }
    const arriveDay = s.arrive ? dayDiff(s.depart, s.arrive) : 0;
    const dur = s.arrive ? App.duration(App.segMinutes(s)) : "";
    const shift = App.tzShiftText(s);
    return `
      <a class="tl-card" href="#/odcinek/${s.id}">
        <div class="tl-ico" aria-hidden="true">${T.icon}</div>
        <div class="tl-main">
          <div class="tl-time">${App.time(s.depart)}${s.arrive ? ` → ${App.time(s.arrive)}${arriveDay > 0 ? `<sup>+${arriveDay}</sup>` : ""}` : ""}
            ${dur ? `<span class="muted">· ${dur}</span>` : ""}${shift ? ` <span class="muted small">· ${shift}</span>` : ""}${ticketMark(nTickets)}</div>
          <div class="tl-route">${esc(s.from || "?")} → ${esc(s.to || "?")}</div>
          ${chips(s)}
        </div>
      </a>`;
  }

  // wymeldowanie z noclegu jako mała pozycja w dniu wyjazdu
  const checkoutCard = s => `
    <a class="tl-card tl-light" href="#/odcinek/${s.id}">
      <div class="tl-ico" aria-hidden="true">🔑</div>
      <div class="tl-main"><div class="tl-time">Wymeldowanie ${App.time(s.arrive)}</div>
      <div class="muted small">${esc(s.name || "Nocleg")}</div></div>
    </a>`;

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
    const pk = App.Pack ? await App.Pack.summary(id) : null;
    const packTxt = pk && pk.total + pk.todo
      ? `spakowane ${pk.done}/${pk.total}${pk.buy ? ` · do kupienia ${pk.buy}` : ""}${pk.todo ? ` · zadania ${pk.todoDone}/${pk.todo}` : ""}`
      : "lista rzeczy i zadań przed wyjazdem";
    const bg = App.Budget ? await App.Budget.summary(id) : null;
    const bgTxt = !bg ? "" : bg.budget ? `wydano ${App.Budget.money(bg.spent, bg.home)} z ${App.Budget.money(bg.budget, bg.home)}`
      : bg.spent ? `wydano ${App.Budget.money(bg.spent, bg.home)}` : "wydatki, waluty, ile zostało";
    const wx = App.Weather ? await App.Weather.get(t) : null;
    const cov = await covers(id);
    let unpaint = null;
    let timeline = "", lastDay = null;
    for (const [day, , html] of items) {
      if (day !== lastDay) {
        const n = dayDiff(t.start, day) + 1;
        const tag = n >= 1 && n <= total ? `dzień ${n}` : n < 1 ? "przed podróżą" : "po podróży";
        timeline += `<h3 class="tl-day${day === todayStr() ? " today" : ""}">${App.fmtDayLong(day)} <span class="muted">· ${tag}${day === todayStr() ? " · dziś" : ""}</span></h3>`;
        lastDay = day;
      }
      timeline += html;
    }

    const head = `
      <div class="trip-head" data-cover="${t.id}" style="--c:${esc(t.color || COLORS[0])}">
        ${t.destination ? `<div class="dest">${esc(t.destination)}</div>` : ""}
        <div class="dates">${App.fmtRange(t.start, t.end)} · ${total} ${plural(total, "dzień", "dni", "dni")}</div>
        <span class="pill pill-${status(t)}">${statusText(t)}</span>
        ${t.note ? `<p class="note">${esc(t.note)}</p>` : ""}
      </div>
      <a class="plan-link" href="#/plan/${t.id}"><span aria-hidden="true">🗓️</span> Plan dnia po dniu <span class="muted">– zwiedzanie, jedzenie, mapa</span><b aria-hidden="true">›</b></a>
      ${t.end >= todayStr() ? `<a class="plan-link" href="#/przygotuj/${t.id}"><span aria-hidden="true">📥</span> Przygotuj offline <span class="muted">– mapa, karty, zdjęcia, kursy na zapas</span><b aria-hidden="true">›</b></a>` : ""}
      <a class="plan-link" href="#/pakowanie/${t.id}"><span aria-hidden="true">🧳</span> Pakowanie <span class="muted">– ${packTxt}</span><b aria-hidden="true">›</b></a>
      ${bg ? `<a class="plan-link${bg.budget && bg.spent > bg.budget ? " warn" : ""}" href="#/budzet/${t.id}"><span aria-hidden="true">💰</span> Budżet <span class="muted">– ${bgTxt}</span><b aria-hidden="true">›</b></a>` : ""}
      <a class="plan-link" href="#/udostepnij/${t.id}"><span aria-hidden="true">👥</span> Udostępnij <span class="muted">– wspólna podróż, plan jako tekst</span><b aria-hidden="true">›</b></a>
      <button type="button" class="plan-link" id="ics-trip"><span aria-hidden="true">📅</span> Do kalendarza <span class="muted">– plik .ics z przypomnieniami</span><b aria-hidden="true">›</b></button>`;

    const typeButtons = Object.entries(TYPES).map(([k, T]) =>
      `<a class="type-btn" href="#/podroze/${id}/dodaj?typ=${k}"><span aria-hidden="true">${T.icon}</span>${T.name}</a>`).join("");

    return {
      title: t.name,
      back: "#/podroze",
      action: `<a class="icon-btn" href="#/podroze/${id}/edytuj" aria-label="Edytuj podróż">${editIcon}</a>`,
      html: head + (wx && wx.data ? App.Weather.strip(wx.data, t) : "") +
        (timeline || App.empty("🗺️", "Pusta oś czasu", "Dodaj pierwszy lot, pociąg, autobus albo nocleg – wybierz poniżej.")) +
        `<h3 class="section">Dodaj</h3><div class="type-grid">${typeButtons}</div>
         <a class="plan-link" href="#/wklej?trip=${id}" style="margin-top:10px"><span aria-hidden="true">📧</span> Z maila <span class="muted">– potwierdzenie lotu, pociągu, hotelu, PDF, .ics</span><b aria-hidden="true">›</b></a>`,
      cleanup() { if (unpaint) unpaint(); },
      after(view) {
        unpaint = paintCovers(view, cov);
        // pogoda: pokazane zapisane dane, świeże pobierane w tle (jeśli są starsze niż 3 h)
        if (wx) wx.refresh().then(changed => { if (changed) App.render(); }).catch(() => {});
        const b = view.querySelector("#ics-trip");
        if (b) b.onclick = () => App.Reminders.exportTrips([t.id], t.name);
      },
    };
  });

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
    let h = "";
    if (T.route === false) {
      h += input("name", "Nazwa obiektu", "np. Hotel Avenida", "required maxlength=\"100\"");
      h += input("address", "Adres", "ulica, miasto");
    } else {
      h += input("from", T.from, T.fromPh || "", "maxlength=\"100\"");
      h += input("to", T.to, T.toPh || "", "maxlength=\"100\"");
    }
    h += `<label class="field"><span>${T.depart}</span><input type="datetime-local" name="depart" required value="${esc(v.depart)}"></label>
      <label class="field"><span>${T.arrive}</span><input type="datetime-local" name="arrive" value="${esc(v.arrive)}"></label>`;
    h += pairs(T.extra.concat(TAIL));
    h += `<div class="grid2 price">
      ${input("price", "Cena", "np. 249", "inputmode=\"decimal\"")}
      ${input("currency", "Waluta", "PLN", "maxlength=\"5\" autocapitalize=\"characters\"")}
    </div>`;
    h += `<label class="field"><span>Notatka</span><textarea name="note" rows="3" placeholder="opcjonalnie">${esc(v.note)}</textarea></label>`;
    return h;
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
        <span><b aria-hidden="true">${T.icon}</b>${T.name}</span></label>`).join("");

    return {
      title: s ? `${TYPES[cur].icon} ${TYPES[cur].name}` : "Nowy odcinek",
      back: s ? `#/odcinek/${s.id}` : `#/podroze/${trip.id}`,
      html: `
        <form id="seg-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${typeChips}</div>
          <div id="seg-fields">${segFields(cur, v)}</div>
          <p class="error" id="err" hidden></p>
          <button class="btn primary wide" type="submit">${s ? "Zapisz zmiany" : "Dodaj do podróży"}</button>
          ${s ? `<button class="btn danger wide" type="button" id="del">Usuń</button>` : ""}
        </form>`,
      after(view) {
        const f = view.querySelector("#seg-form");
        const box = view.querySelector("#seg-fields");
        const bindDates = () => {
          // podpowiedź: przy pierwszym wyborze daty ustaw przyjazd na tę samą chwilę (zostaje tylko poprawić godzinę)
          f.depart.addEventListener("change", () => {
            if (f.depart.value && (!f.arrive.value || f.arrive.value < f.depart.value)) f.arrive.value = f.depart.value;
          });
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
  App.Trips = { TYPES, typeOf, chips, status, COLORS, bySegTime, editIcon, plusIcon };
})();
