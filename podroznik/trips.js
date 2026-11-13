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

  const COLORS = ["#0f6e6e", "#2f6fd6", "#c2453a", "#d08a17", "#7b4fd1", "#2e8b57"];

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

  /* ================= LISTA PODRÓŻY ================= */
  App.route(/^\/podroze$/, async () => {
    const [trips, segs] = await Promise.all([DB.all("trips"), DB.all("segments")]);
    const segsOf = {};
    segs.forEach(s => (segsOf[s.tripId] = segsOf[s.tripId] || []).push(s));

    // licznik do wyjazdu / odjazdu i aktywne przypomnienia (etap 5); bilet pokazany osobno, jeśli to inny odcinek niż w liczniku
    const home = App.Reminders ? await App.Reminders.homeCards() : { html: "" };
    const nearest = App.Tickets ? await App.Tickets.nearestCard({ skipSeg: home.segId }) : "";
    const fab = `<a class="fab" href="#/podroze/nowa" aria-label="Nowa podróż">${plusIcon}<span>Nowa podróż</span></a>`;
    if (!trips.length) {
      return {
        title: "Podróżnik",
        html: App.empty("🧳", "Nie masz jeszcze podróży",
          "Dodaj pierwszy wyjazd, a potem jego loty, pociągi, autobusy i noclegi.",
          `<a class="btn primary" href="#/podroze/nowa">${plusIcon} Dodaj podróż</a><p style="margin-top:14px"><a href="#/udostepnij">📥 Otwórz podróż od kogoś</a></p>`),
      };
    }

    const card = t => {
      const list = (segsOf[t.id] || []).sort(bySegTime);
      const icons = [...new Set(list.map(s => typeOf(s).icon))].join(" ");
      const transport = list.filter(s => s.type !== "nocleg").length, stays = list.length - transport;
      const counts = [
        transport && `${transport} ${plural(transport, "odcinek", "odcinki", "odcinków")}`,
        stays && `${stays} ${plural(stays, "nocleg", "noclegi", "noclegów")}`,
      ].filter(Boolean).join(" · ");
      return `
        <a class="trip-card" href="#/podroze/${t.id}" data-cover="${t.id}" style="--c:${esc(t.color || COLORS[0])}">
          <div class="trip-top">
            <h2>${esc(t.name)}</h2>
            <span class="pill pill-${status(t)}">${statusText(t)}</span>
          </div>
          <div class="muted">${[esc(t.destination), App.fmtRange(t.start, t.end)].filter(Boolean).join(" · ")}</div>
          ${list.length ? `<div class="trip-meta"><span class="icons">${icons}</span><span class="muted">${counts}</span></div>` : ""}
        </a>`;
    };

    const now = trips.filter(t => status(t) === "now").sort((a, b) => a.start.localeCompare(b.start));
    const future = trips.filter(t => status(t) === "future").sort((a, b) => a.start.localeCompare(b.start));
    const past = trips.filter(t => status(t) === "past").sort((a, b) => b.start.localeCompare(a.start));

    let html = home.html + nearest;
    if (now.length) html += `<h3 class="section">Trwające</h3>${now.map(card).join("")}`;
    html += `<h3 class="section">Nadchodzące</h3>` +
      (future.length ? future.map(card).join("") : `<p class="muted small">Brak zaplanowanych wyjazdów.</p>`);
    if (past.length) html += `
      <details class="archive">
        <summary><h3 class="section">Archiwum <span class="muted">(${past.length})</span></h3></summary>
        ${past.map(card).join("")}
      </details>`;
    html += `<a class="plan-link st-link" href="#/wklej"><span aria-hidden="true">📧</span> Dodaj z maila <span class="muted">– potwierdzenie, PDF albo .ics z rezerwacji</span><b aria-hidden="true">›</b></a>`;
    html += `<a class="plan-link" href="#/udostepnij" style="margin-top:8px"><span aria-hidden="true">📥</span> Otwórz podróż od kogoś <span class="muted">– plik z Podróżnika</span><b aria-hidden="true">›</b></a>`;
    html += `<a class="plan-link" href="#/statystyki" style="margin-top:8px"><span aria-hidden="true">📊</span> Statystyki <span class="muted">– kilometry, kraje, mapa</span><b aria-hidden="true">›</b></a>`;
    const cov = await covers();
    let unpaint = null;
    return {
      title: "Podróżnik", html: html + fab,
      after(v) { unpaint = paintCovers(v, cov); if (home.after) home.after(v); },
      cleanup() { if (unpaint) unpaint(); if (home.cleanup) home.cleanup(); },
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
