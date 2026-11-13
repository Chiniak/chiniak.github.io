/* Podróżnik – etap 3: plan dnia i plan podróży.
   Trasy:
     #/plan                       wybiera podróż: trwającą, najbliższą, albo ostatnią
     #/plan/:tripId               plan dzień po dniu + karta „Dziś” (gdy podróż trwa)
     #/plan/:tripId/nowy?d=DATA   nowy punkt planu
     #/punkt/:id                  edycja (i usuwanie) punktu
   Punkt planu (magazyn "planItems"):
     { id, tripId, date: "RRRR-MM-DD" | "" (pomysł bez dnia, etap 10), time: "GG:MM" | "", title, cat, place, lat?, lon?, note, cost, currency, order }
   Transport i noclegi wskakują do planu same (z magazynu "segments") – edytuje się je w podróży.
   Kolejność: punkty mają ręczną kolejność ("order", przeciąganie ≡); odcinki wstawiane są według godziny. */
(function () {
  const { esc, plural } = App;
  const Tr = () => App.Trips;
  const pad = n => String(n).padStart(2, "0");
  const nowStr = () => { const d = new Date(); return `${App.todayStr()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const CATS = {
    zwiedzanie: { icon: "🏛️", name: "Zwiedzanie" },
    jedzenie: { icon: "🍽️", name: "Jedzenie" },
    wydarzenie: { icon: "🎟️", name: "Wydarzenie" },
    zakupy: { icon: "🛍️", name: "Zakupy" },
    natura: { icon: "🌳", name: "Natura" },
    spotkanie: { icon: "💼", name: "Spotkanie" },
    inne: { icon: "📌", name: "Inne" },
  };
  const catOf = it => CATS[it.cat] || CATS.inne;

  const navIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>`;
  const routeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 010 6H9a3 3 0 000 6h6.5"/></svg>`;
  const mapIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>`;
  const handleIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>`;
  const navLink = (place, label = "Nawiguj") => place
    ? `<a class="pl-nav" href="${esc(App.mapsUrl(place))}" target="_blank" rel="noopener" aria-label="${label}: ${esc(place)}">${navIcon}</a>` : "";

  const num = v => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const money = (n, cur) => `${n.toLocaleString((self.I18N ? I18N.locale : "pl-PL"), Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  function inTime(min) {
    if (min < 1) return "teraz";
    if (min < 60) return `za ${min} min`;
    if (min < 24 * 60) return `za ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
    const d = Math.round(min / 1440);
    return `za ${d} ${plural(d, "dzień", "dni", "dni")}`;
  }

  /* ---------- zdarzenia z odcinków (transport i noclegi) ---------- */
  function segEvents(segs) {
    const ev = [];
    for (const s of segs) {
      if (!s.depart) continue;
      const T = Tr().typeOf(s);
      if (s.type === "nocleg") {
        const where = s.address || s.name;
        ev.push({ at: s.depart, icon: T.icon, title: `Zameldowanie: ${s.name || "nocleg"}`, sub: s.address || "", href: `#/odcinek/${s.id}`, nav: where });
        if (s.arrive) ev.push({ at: s.arrive, icon: "🔑", title: `Wymeldowanie: ${s.name || "nocleg"}`, sub: "", href: `#/odcinek/${s.id}`, nav: "" });
      } else {
        const bits = [T.name, s.number, s.arrive ? `przyjazd ${App.time(s.arrive)}${s.arrive.slice(0, 10) !== s.depart.slice(0, 10) ? " (+1)" : ""}` : ""].filter(Boolean);
        ev.push({ at: s.depart, end: s.arrive, icon: T.icon, title: `${s.from || "?"} → ${s.to || "?"}`, sub: bits.join(" · "), href: `#/odcinek/${s.id}`, nav: s.from, seg: s });
      }
    }
    return ev.sort((a, b) => a.at.localeCompare(b.at));
  }

  // lista dnia: punkty w ręcznej kolejności, odcinki wstawione przed pierwszym późniejszym punktem z godziną
  function mergeDay(items, events) {
    const out = [], evs = events.slice();
    for (const it of items) {
      if (it.time) while (evs.length && App.time(evs[0].at) <= it.time) out.push({ ev: evs.shift() });
      out.push({ it });
    }
    evs.forEach(ev => out.push({ ev }));
    return out;
  }

  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.created || "").localeCompare(b.created || "");

  /* ---------- karta „Dziś” ---------- */
  function todayCard(trip, events, items) {
    const now = nowStr(), today = App.todayStr();
    const all = events.map(e => ({ at: e.at, end: e.end, icon: e.icon, title: e.title, sub: e.sub, nav: e.nav, href: e.href }))
      .concat(items.filter(i => i.time).map(i => ({
        at: `${i.date}T${i.time}`, icon: catOf(i).icon, title: i.title, sub: i.place || "", nav: i.place, href: `#/punkt/${i.id}`,
      })))
      .sort((a, b) => a.at.localeCompare(b.at));

    const current = all.find(e => e.end && e.at <= now && now < e.end);
    const next = all.find(e => e.at > now);
    const todayLeft = all.filter(e => e.at > now && e.at.slice(0, 10) === today).length;
    const untimed = items.filter(i => i.date === today && !i.time).length;

    const block = (label, e, extra) => `
      <div class="td-row">
        <div class="td-ico" aria-hidden="true">${e.icon}</div>
        <a class="td-main" href="${e.href}">
          <div class="td-label">${label}</div>
          <div class="td-title">${esc(e.title)}</div>
          <div class="td-sub">${extra}</div>
        </a>
        ${navLink(e.nav)}
      </div>`;

    let html = "";
    if (current) html += block("Teraz · w drodze", current, `przyjazd ${App.time(current.end)} · ${inTime(App.minutes(now, current.end))}`);
    if (next) {
      const when = next.at.slice(0, 10) === today ? App.time(next.at) : `${App.fmtDay(next.at)} ${App.time(next.at)}`;
      html += block("Dalej", next, `${when} · ${inTime(App.minutes(now, next.at))}${next.sub ? " · " + esc(next.sub) : ""}`);
    }
    if (!html) html = `<p class="td-empty">Na dziś nic więcej nie zaplanowano.</p>`;
    const summary = [
      todayLeft ? `${todayLeft} ${plural(todayLeft, "punkt", "punkty", "punktów")} z godziną jeszcze dziś` : "",
      untimed ? `${untimed} bez godziny` : "",
    ].filter(Boolean).join(" · ");
    return `
      <section class="today-card" aria-label="Dziś">
        <div class="td-head"><b>Dziś</b> · ${App.fmtDayLong(today)} · dzień ${App.dayDiff(trip.start, today) + 1}</div>
        ${html}
        ${summary ? `<div class="td-foot">${summary}</div>` : ""}
      </section>`;
  }

  /* ================= WYBÓR PODRÓŻY ================= */
  function pickTrip(trips) {
    const today = App.todayStr();
    const now = trips.filter(t => t.start <= today && t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    const fut = trips.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start));
    const past = trips.filter(t => t.end < today).sort((a, b) => b.end.localeCompare(a.end));
    return now[0] || fut[0] || past[0];
  }

  // opcje przełącznika podróży: trwające, nadchodzące, potem archiwum (także dla pakowania)
  function tripOptions(trips, id) {
    const today = App.todayStr();
    const rank = t => (t.end < today ? 2 : t.start > today ? 1 : 0);
    return trips.slice()
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)))
      .map(t => `<option value="${t.id}" ${t.id === id ? "selected" : ""}>${esc(t.name)} · ${App.fmtRange(t.start, t.end)}${t.end < today ? " (archiwum)" : ""}</option>`)
      .join("");
  }

  App.route(/^\/plan$/, async () => {
    const trips = await DB.all("trips");
    if (!trips.length) return App.empty("🗓️", "Plan dnia i podróży",
      "Najpierw dodaj podróż – jej loty, pociągi i noclegi pojawią się w planie same.",
      `<a class="btn primary" href="#/podroze/nowa">Dodaj podróż</a>`);
    const last = await DB.getSetting("planTrip", null);
    const t = trips.find(x => x.id === last && x.end >= App.todayStr()) || pickTrip(trips);
    location.replace(`#/plan/${t.id}`);
    return "";
  });

  /* ================= PLAN PODRÓŻY ================= */
  App.route(/^\/plan\/([\w-]+)$/, async ([id]) => {
    const [trip, trips] = await Promise.all([DB.get("trips", id), DB.all("trips")]);
    if (!trip) { location.replace("#/plan"); return ""; }
    DB.setSetting("planTrip", id);
    const wx = App.Weather ? await App.Weather.get(trip) : null;
    const [segs, items, tripFiles] = await Promise.all([DB.byIndex("segments", "tripId", id), DB.byIndex("planItems", "tripId", id), DB.byIndex("files", "tripId", id)]);
    const events = segEvents(segs);
    // bilety / screeny przypięte do punktów planu (tickets.js, segmentId „p:<id>”) – pierwszy otwiera się jednym dotknięciem
    const ticketOf = {};
    tripFiles.filter(f => String(f.segmentId).startsWith("p:")).sort((a, b) => (a.created || "").localeCompare(b.created || ""))
      .forEach(f => { const k = f.segmentId.slice(2); (ticketOf[k] = ticketOf[k] || []).push(f); });
    const tkBtn = it => ticketOf[it.id] ? `<a class="icon-btn pl-tk" href="#/bilet/${ticketOf[it.id][0].id}" aria-label="Bilet: ${esc(it.title)}">🎫${ticketOf[it.id].length > 1 ? `<small>${ticketOf[it.id].length}</small>` : ""}</a>` : "";
    const today = App.todayStr();
    const ongoing = trip.start <= today && today <= trip.end;

    // przełącznik podróży
    const switcher = trips.length > 1 ? `
      <label class="pl-switch"><span class="sr">Podróż</span>
        <select id="pl-trip">${tripOptions(trips, id)}</select>
      </label>` : "";

    // dni: od początku do końca podróży + dni spoza zakresu, na których coś jest
    const days = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) days.push(d);
    const extra = new Set(items.map(i => i.date).filter(Boolean).concat(events.map(e => e.at.slice(0, 10))).filter(d => d < trip.start || d > trip.end));
    const allDays = [...new Set([...extra].filter(d => d < trip.start).sort().concat(days, [...extra].filter(d => d > trip.end).sort()))];

    const total = days.length;
    let html = switcher;
    if (ongoing) html += todayCard(trip, events, items);
    else if (trip.start > today) {
      const n = App.dayDiff(today, trip.start);
      html += `<p class="pl-info">Do wyjazdu ${n === 1 ? "1 dzień" : `${n} ${plural(n, "dzień", "dni", "dni")}`} · ${App.fmtRange(trip.start, trip.end)}</p>`;
    }

    // etap 10: mapa, odkrywanie i pomysły (punkty bez dnia)
    const P = App.Places;
    const PH = it => App.Photos ? App.Photos.thumb(it) : ""; // zdjęcie miejsca (photos.js)
    html += `<div class="pl-tools">
        <a class="plan-link" href="#/mapa/${id}"><span aria-hidden="true">🗺️</span> Mapa i trasa <span class="muted">– punkty dnia, odległości</span><b aria-hidden="true">›</b></a>
        <a class="plan-link" href="#/odkrywaj/${id}"><span aria-hidden="true">🔭</span> Odkrywaj <span class="muted">– atrakcje i jedzenie w okolicy</span><b aria-hidden="true">›</b></a>
        <a class="plan-link" href="#/karty/${id}"><span aria-hidden="true">🚕</span> Karty dla kierowcy <span class="muted">– adresy w lokalnym piśmie, rozmówki</span><b aria-hidden="true">›</b></a>
        ${App.Tickets && App.Tickets.addFiles ? `<label class="plan-link pl-from-file"><span aria-hidden="true">📎</span> Z biletu lub screena <span class="muted">– zdjęcie, screen, PDF → punkt planu</span><b aria-hidden="true">›</b>
          <input type="file" id="pl-from-file" accept="image/*,application/pdf,.pkpass" multiple hidden></label>` : ""}
      </div>`;
    const ideas = items.filter(i => !i.date).sort(byOrder);
    const dayOpts = days.map(d => `<option value="${d}">${App.fmtDay(d)}</option>`).join("");
    html += `
      <details class="archive pl-ideas"${ideas.length && ideas.length <= 6 ? " open" : ""}>
        <summary><h3 class="section">💡 Pomysły – bez dnia <span class="muted">(${ideas.length})</span></h3></summary>
        ${ideas.map(it => `
          <div class="pl-row pl-idea">
            <a class="pl-main${it.photo ? " has-ph" : ""}" data-pid="${it.id}" href="#/punkt/${it.id}">${PH(it)}
              <div class="pl-title"><span aria-hidden="true">${catOf(it).icon}</span> ${esc(it.title)}</div>
              ${it.place ? `<div class="pl-sub">${esc(/^https?:/i.test(it.place) ? "📍 link do mapy" : it.place)}</div>` : ""}
            </a>
            ${tkBtn(it)}
            <label class="pl-move"><span class="sr">Przenieś do dnia</span>
              <select data-move="${it.id}"><option value="">+ dzień</option>${dayOpts}</select></label>
          </div>`).join("")}
        <a class="pl-empty" href="#/plan/${id}/nowy?d=pomysl">+ Dodaj pomysł</a>
      </details>`;

    const costs = {};
    let pastHtml = "", pastN = 0;
    for (const day of allDays) {
      const dayItems = items.filter(i => i.date === day).sort(byOrder);
      const dayEvents = events.filter(e => e.at.slice(0, 10) === day);
      const n = App.dayDiff(trip.start, day) + 1;
      const tag = n >= 1 && n <= total ? `dzień ${n}` : n < 1 ? "przed podróżą" : "po podróży";
      const dayCost = {};
      dayItems.forEach(i => { const c = num(i.cost); if (c) { const cur = i.currency || "PLN"; dayCost[cur] = (dayCost[cur] || 0) + c; costs[cur] = (costs[cur] || 0) + c; } });
      const costTxt = Object.entries(dayCost).map(([c, v]) => money(v, c)).join(" + ");

      let prevXY = P && P.hasXY(P.hotelFor(segs, day)) ? P.hotelFor(segs, day) : null;
      const legHtml = it => {
        if (!P || !P.hasXY(it)) return "";
        const l = prevXY ? P.leg(prevXY, it) : null;
        prevXY = it;
        return l ? `<div class="pl-leg" aria-label="Dojście">${l.icon} ${l.txt}</div>` : "";
      };
      const rows = mergeDay(dayItems, dayEvents).map(({ it, ev }) => ev ? (prevXY = null, `
        <div class="pl-row pl-seg">
          <div class="pl-time">${App.time(ev.at)}</div>
          <a class="pl-main" href="${ev.href}">
            <div class="pl-title"><span aria-hidden="true">${ev.icon}</span> ${esc(ev.title)}</div>
            ${ev.sub ? `<div class="pl-sub">${esc(ev.sub)}</div>` : ""}
          </a>
          ${navLink(ev.nav)}
        </div>`) : `${legHtml(it)}
        <div class="pl-row pl-user" data-id="${it.id}">
          <div class="pl-time">${it.time || "–"}</div>
          <a class="pl-main${it.photo ? " has-ph" : ""}" data-pid="${it.id}" href="#/punkt/${it.id}">${PH(it)}
            <div class="pl-title"><span aria-hidden="true">${catOf(it).icon}</span> ${esc(it.title)}</div>
            ${it.place || num(it.cost) ? `<div class="pl-sub">${[esc(it.place && !/^https?:/i.test(it.place) ? it.place : it.place ? "📍 link do mapy" : ""), num(it.cost) ? money(num(it.cost), it.currency || "PLN") : ""].filter(Boolean).join(" · ")}</div>` : ""}
            ${it.note ? `<div class="pl-note">${esc(it.note)}</div>` : ""}
          </a>
          ${tkBtn(it)}
          ${navLink(it.place)}
          <button type="button" class="pl-handle" aria-label="Przeciągnij, by zmienić kolejność">${handleIcon}</button>
        </div>`).join("");

      const sec = `
        <section class="pl-day${day === today ? " is-today" : ""}" data-date="${day}" ${day === today ? 'id="pl-today"' : ""}>
          <div class="pl-day-head">
            <h3>${App.fmtDayLong(day)} <span class="muted">· ${tag}${day === today ? " · dziś" : ""}</span>${wx ? App.Weather.dayBadge(wx.data, day) : ""}</h3>
            ${dayItems.length ? `<a class="icon-btn pl-dmap" href="#/mapa/${id}?d=${day}" aria-label="Mapa dnia: ${App.fmtDay(day)}">${mapIcon}</a>` : ""}
            <a class="icon-btn pl-add" href="#/plan/${id}/nowy?d=${day}" aria-label="Dodaj punkt: ${App.fmtDay(day)}">${Tr().plusIcon}</a>
          </div>
          <div class="pl-list">${rows || `<a class="pl-empty" href="#/plan/${id}/nowy?d=${day}">+ Dodaj punkt planu</a>`}</div>
          ${costTxt ? `<div class="pl-cost">Koszty dnia: ${costTxt}</div>` : ""}
        </section>`;
      // w trakcie podróży miniony dni chowamy, żeby dzisiejszy plan był od razu pod kartą „Dziś”
      if (ongoing && day < today) { pastHtml += sec; pastN++; continue; }
      if (pastHtml) {
        html += `<details class="archive pl-past"><summary><h3 class="section">Poprzednie dni <span class="muted">(${pastN})</span></h3></summary>${pastHtml}</details>`;
        pastHtml = "";
      }
      html += sec;
    }
    const sum = Object.entries(costs).map(([c, v]) => money(v, c)).join(" + ");
    if (sum) html += `<p class="pl-info">Koszty planu razem: <b>${sum}</b> <span class="muted">(bez transportu i noclegów)</span></p>`;

    let timer = null;
    return {
      title: `Plan · ${trip.name}`,
      action: `<a class="icon-btn" href="#/podroze/${id}" aria-label="Podróż: oś czasu, transport i noclegi">${routeIcon}</a>`,
      html,
      after(view) {
        if (wx) wx.refresh().then(changed => { if (changed) App.render(); }).catch(() => {});
        const sel = view.querySelector("#pl-trip");
        if (sel) sel.onchange = () => location.replace(`#/plan/${sel.value}`);
        if (ongoing) {
          // co minutę odśwież tylko kartę „Dziś” (liczniki „za X min”), bez przewijania strony
          timer = setInterval(() => {
            const card = view.querySelector(".today-card");
            if (card && !document.hidden) card.outerHTML = todayCard(trip, events, items);
          }, 60000);
        }
        view.querySelectorAll(".pl-handle").forEach(h => enableDrag(h));
        const ff = view.querySelector("#pl-from-file");
        if (ff) ff.onchange = () => {
          const files = [...ff.files];
          ff.value = "";
          if (!files.length) return;
          pending = files; // formularz nowego punktu je przejmie (i spróbuje odczytać dzień i godzinę z PDF)
          location.hash = `#/plan/${id}/nowy?d=${ongoing ? today : trip.start}&plik=1`;
        };
        // zdjęcia miejsc: dociągane w tle (Wikipedia) i wstawiane bez przeładowania ekranu
        if (App.Photos) App.Photos.fill(items, (it, ph) => { if (view.isConnected) App.Photos.paint(view, it, ph); });
        view.querySelectorAll("[data-move]").forEach(sel2 => sel2.onchange = async () => {
          if (!sel2.value) return;
          const it = await DB.get("planItems", sel2.dataset.move);
          const rec = await DB.put("planItems", { ...it, date: sel2.value, time: "", order: 1e6 });
          await placeInDay(rec);
          App.toast(`Dodano do planu: ${App.fmtDay(sel2.value)}`);
          App.render();
        });
      },
      cleanup() { clearInterval(timer); },
    };
  });

  /* ---------- przeciąganie punktów w obrębie dnia ---------- */
  function enableDrag(handle) {
    handle.addEventListener("pointerdown", e => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      const row = handle.closest(".pl-row"), list = row.parentElement;
      const before = [...list.querySelectorAll(".pl-user")].map(r => r.dataset.id).join();
      // nasłuch na oknie: przestawienie wiersza w DOM zrywa "pointer capture", więc puszczenie palca trafiłoby gdzie indziej
      row.classList.add("dragging");
      let raf = null, lastY = e.clientY;
      const step = () => {
        const y = lastY;
        const sib = (el, dir) => { let x = el[dir]; while (x && x.classList.contains("pl-leg")) x = x[dir]; return x; };
        const prev = sib(row, "previousElementSibling"), next = sib(row, "nextElementSibling");
        if (prev) { const r = prev.getBoundingClientRect(); if (y < r.top + r.height / 2) list.insertBefore(row, prev); }
        if (next) { const r = next.getBoundingClientRect(); if (y > r.top + r.height / 2) list.insertBefore(next, row); }
        if (y < 90) scrollBy(0, -8); else if (y > innerHeight - 110) scrollBy(0, 8);
        raf = row.classList.contains("dragging") ? requestAnimationFrame(step) : null;
      };
      raf = requestAnimationFrame(step);
      const move = ev => { if (ev.pointerId === e.pointerId) { lastY = ev.clientY; ev.preventDefault(); } };
      const up = async ev => {
        if (ev.pointerId !== e.pointerId) return;
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        row.classList.remove("dragging");
        cancelAnimationFrame(raf);
        const ids = [...list.querySelectorAll(".pl-user")].map(r => r.dataset.id);
        if (ids.join() === before) return;
        for (let i = 0; i < ids.length; i++) {
          const it = await DB.get("planItems", ids[i]);
          if (it && it.order !== i) await DB.put("planItems", { ...it, order: i });
        }
        if (navigator.vibrate) navigator.vibrate(20);
        App.render();
      };
      addEventListener("pointermove", move, { passive: false });
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    });
  }

  /* ================= FORMULARZ PUNKTU ================= */
  let pending = []; // pliki wybrane w planie („Z biletu lub screena”) – czekają na formularz nowego punktu

  /* pola nowego punktu z tekstu biletu (PDF albo zdjęcie/screen po OCR): dzień, godzina, nazwa, miejsce, cena.
     Dzień: pierwsza data w dniach podróży (albo pierwsza przyszła, albo pierwsza w ogóle), godzina tuż przy niej. */
  const LABEL_TITLE = /^(?:wydarzenie|nazwa(?: wydarzenia)?|tytuł|event(?: name)?|title|show|spektakl|koncert|concert|attraction|atrakcja|tour|wycieczka|activity|aktywność|product|produkt|bilet na|ticket for)\s*[:\-–]\s*(.{3,})$/i;
  const LABEL_PLACE = /^(?:miejsce(?: wydarzenia)?|lokalizacja|venue|location|adres|address|where|gdzie|meeting point|miejsce zbiórki|pick-?up(?: point)?|obiekt)\s*[:\-–]?\s*(.*)$/i;
  const NOT_TITLE = /(bilet|ticket|e-?ticket|voucher|potwierdzenie|confirmation|zamówieni|order|rezerwacj|booking|faktura|invoice|paragon|receipt|https?:|www\.|@|\.(com|pl|net)\b|cena|price|total|razem|suma|kod|code|reservation|numer|number|nr\b|no\.|based on|correct\?|data|date|godz|time|rząd|row|seat|sektor|sector|gate|brama|wejście|entrance|dear|szanown|dziękujemy|thank)/i;
  function infoFromText(raw, trip) {
    const E = App.Email;
    if (!E || !E.findDates) return null;
    // typowe błędy OCR w datach: „12/08/2026” odczytane jako „1208:2026”, „12.08 2026”
    const text = E.normalize(raw).replace(/\b(\d{2})[\/.:\- ]?(\d{2})[\/.:\- ](20\d{2})\b/g, (m, d, mo, y) => +d <= 31 && +mo <= 12 && +mo >= 1 ? `${d}.${mo}.${y}` : m);
    const out = {};
    const dates = E.findDates(text);
    if (dates.length) {
      const d = dates.find(x => x.date >= trip.start && x.date <= trip.end) || dates.find(x => x.date >= App.todayStr()) || dates[0];
      const times = E.findTimes(text);
      const t = times.find(x => x.index >= d.end && x.index - d.end < 120) || times.find(x => x.index < d.index && d.index - x.index < 60) || (times.length === 1 ? times[0] : null);
      out.date = d.date; out.time = t ? t.time : "";
    } else {
      const times = E.findTimes(text);
      if (times.length === 1) out.time = times[0].time;
    }
    const lines = text.split("\n").map(l => l.replace(/[|_~«»]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    const letters = l => (l.match(/\p{L}/gu) || []).length;
    // „śmieci” z OCR: słowa z cyframi w środku („zZh32m”), czas trwania („2 h 32 m”), krótkie urywki
    const junk = l => /\b\p{L}*\d+\p{L}+\d*\b|\b\d+\s?h\s?\d+\s?m(in)?\b/iu.test(l) || !/\p{L}{3}/u.test(l);
    // przejazd (karta Google, aplikacje przewoźników): „Departs at 15:08” / „Odjazd 15:08” + stacja w wierszu nad nim
    const DEP = /^(?:departs?(?: at)?|departure|odjazd|wyjazd|odlot|abfahrt)\b/i, ARR = /^(?:arrives?(?: at)?|arrival|przyjazd|przylot|ankunft)\b/i;
    const di = lines.findIndex(l => DEP.test(l)), ai = lines.findIndex(l => ARR.test(l));
    const station = i => i > 0 && !junk(lines[i - 1]) && letters(lines[i - 1]) >= 3 && !DEP.test(lines[i - 1]) && !ARR.test(lines[i - 1]) && lines[i - 1].length <= 60 ? lines[i - 1] : "";
    if (di >= 0) {
      const t = E.findTimes(lines[di])[0];
      if (t) out.time = t.time; // godzina odjazdu ważniejsza niż ta przy dacie
      const a = station(di), b = ai > di ? station(ai) : "";
      if (a || b) out.title = a && b ? `${a} → ${b}` : b ? `→ ${b}` : a;
    }
    // nazwa: wiersz z etykietą („Wydarzenie: …”), inaczej pierwszy „zwykły” wiersz z kilku pierwszych
    if (!out.title) for (const l of lines) { const m = l.match(LABEL_TITLE); if (m && letters(m[1]) >= 3) { out.title = m[1].trim(); break; } }
    if (!out.title) out.title = (lines.slice(0, 10).find(l => l.length >= 4 && l.length <= 70 && letters(l) >= 4 && letters(l) / l.length > 0.6
      && !NOT_TITLE.test(l) && !junk(l) && !DEP.test(l) && !ARR.test(l) && !E.findDates(l).length && !E.findTimes(l).length && /\p{L}{3}/u.test(l)) || "");
    // miejsce: po etykiecie (w tym samym albo następnym wierszu); nie numer miejsca siedzącego
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(LABEL_PLACE);
      if (!m) continue;
      let v = m[1].trim();
      if (!v && lines[i + 1]) v = lines[i + 1];
      if (letters(v) >= 4 && !/^\d+\s*[a-z]?$/i.test(v) && !/rząd|row|sektor|seat/i.test(v)) {
        if (lines[i + 1] && m[1].trim() && /\d/.test(lines[i + 1]) && letters(lines[i + 1]) >= 3 && !LABEL_PLACE.test(lines[i + 1]) && !NOT_TITLE.test(lines[i + 1])) v += ", " + lines[i + 1]; // adres w dwóch wierszach
        out.place = v.slice(0, 200); break;
      }
    }
    // cena: z etykietą (razem, total…), inaczej jedyna kwota z walutą
    const c = E.common(text);
    if (c.price) { out.cost = c.price; out.currency = c.currency; }
    else {
      const CURS = "PLN|zł|EUR|€|USD|US\\$|\\$|GBP|£|CHF|CZK|Kč|CNY|RMB|¥|THB|฿|VND|₫|LAK|₭|KHR|JPY|HKD|SGD|MYR|IDR";
      // tylko kwota na początku albo końcu wiersza (nie „2 £ 3” – źle odczytane „2 & 3” w nazwie stacji)
      const re = new RegExp(`^(?:(\\d[\\d .,]*\\d|\\d) ?(${CURS})(?![\\p{L}])|(${CURS}) ?(\\d[\\d .,]*\\d|\\d))$`, "u");
      const all = lines.flatMap(l => { const w = l.split(" "); const out = [];
        for (let n = 1; n <= Math.min(3, w.length); n++) for (const part of [w.slice(0, n).join(" "), w.slice(-n).join(" ")]) { const m = part.match(re); if (m) out.push(m); }
        return out; });
      const vals = [...new Set(all.map(m => `${E.amount(m[1] || m[4])}|${E.CUR[m[2] || m[3]] || (m[2] || m[3]).toUpperCase()}`))].filter(v => !v.startsWith("|"));
      if (vals.length === 1) [out.cost, out.currency] = vals[0].split("|");
    }
    return out;
  }
  // nowy punkt z godziną trafia chronologicznie między punkty z godziną; potem numeracja 0..n
  async function placeInDay(rec) {
    const day = (await DB.byIndex("planItems", "tripId", rec.tripId)).filter(i => i.date === rec.date && i.id !== rec.id).sort(byOrder);
    let pos = day.length;
    if (rec.time) {
      const i = day.findIndex(x => x.time && x.time > rec.time);
      if (i >= 0) pos = i;
    }
    day.splice(pos, 0, rec);
    for (let i = 0; i < day.length; i++) if (day[i].order !== i || day[i] === rec) await DB.put("planItems", { ...day[i], order: i });
  }

  // podgląd zdjęcia w formularzu punktu (photos.js)
  const photoBox = ph => ph && ph.data
    ? `<img class="pl-ph-big" src="${ph.data}" alt="">${ph.credit ? `<div class="muted small">${ph.page ? `<a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.credit)} ↗</a>` : esc(ph.credit)}</div>` : ""}`
    : `<p class="muted small">Zdjęcie pojawi się samo (z Wikipedii), gdy miejsce jest znane – możesz też dodać własne.</p>`;

  async function itemForm({ itemId, tripId, date, q = {} }) {
    const it = itemId ? await DB.get("planItems", itemId) : null;
    if (itemId && !it) { location.replace("#/plan"); return ""; }
    const trip = await DB.get("trips", it ? it.tripId : tripId);
    if (!trip) { location.replace("#/plan"); return ""; }
    const v = it || { date: date === "pomysl" ? "" : date || (trip.start <= App.todayStr() && App.todayStr() <= trip.end ? App.todayStr() : trip.start), time: "", title: "", cat: "zwiedzanie", place: "", note: "", cost: "", currency: "PLN" };
    // z mapy: dotknięte miejsce (lat, lon) albo wpisane wyszukiwanie (q)
    const fromMap = !it && ((q.lat && q.lon) || q.q);
    if (!it && q.lat && q.lon && isFinite(+q.lat) && isFinite(+q.lon)) { v.lat = +q.lat; v.lon = +q.lon; v.place = `${(+q.lat).toFixed(5)}, ${(+q.lon).toFixed(5)}`; }
    if (!it && q.q) v.place = q.q;
    // dzień: dni podróży + „pomysł bez dnia” (+ dzień spoza podróży, jeśli punkt już taki ma)
    const dayList = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) dayList.push(d);
    if (v.date && !dayList.includes(v.date)) { dayList.push(v.date); dayList.sort(); }
    const dateOpts = `<option value="" ${!v.date ? "selected" : ""}>💡 Pomysł – bez dnia</option>` +
      dayList.map(d => `<option value="${d}" ${d === v.date ? "selected" : ""}>${App.fmtDay(d)}${d < trip.start || d > trip.end ? " (poza podróżą)" : ""}</option>`).join("");

    const files = it ? (await DB.byIndex("files", "segmentId", `p:${it.id}`)).sort((a, b) => (a.created || "").localeCompare(b.created || "")) : [];
    // pliki z „Z biletu lub screena” (plan) – tylko dla nowego punktu otwartego z tego przycisku
    // (pending czyści dopiero zapis – ekran może się wyrenderować dwa razy)
    let newFiles = !it && q.plik ? pending.slice() : [];
    if (!it && q.plik && !newFiles.length) { location.replace(`#/plan/${trip.id}`); return ""; } // np. odświeżona strona – plików już nie ma
    if (newFiles.length) v.cat = "wydarzenie";

    const cats = Object.entries(CATS).map(([k, C]) => `
      <label class="type-chip"><input type="radio" name="cat" value="${k}" ${k === (v.cat || "inne") ? "checked" : ""}>
        <span><b aria-hidden="true">${C.icon}</b>${C.name}</span></label>`).join("");

    return {
      title: it ? (it.date ? "Edytuj punkt" : "Edytuj pomysł") : v.date ? "Nowy punkt planu" : "Nowy pomysł",
      back: `#/plan/${trip.id}`,
      html: `
        <form id="pl-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${cats}</div>
          <label class="field"><span>Co</span>
            <input name="title" required maxlength="100" placeholder="np. Oceanarium, kolacja w Time Out Market" value="${esc(v.title)}"></label>
          <div class="grid2">
            <label class="field"><span>Dzień</span><select name="date">${dateOpts}</select></label>
            <label class="field"><span>Godzina (opcjonalnie)</span><input type="time" name="time" value="${esc(v.time)}"></label>
          </div>
          ${App.Tickets && App.Tickets.addFiles ? `<div class="field"><span>🎫 Bilety i zdjęcia – bilet, screen potwierdzenia, zaproszenie</span>
            <div class="pl-files" id="pl-files">${files.map(x => `<a class="pl-file" href="#/bilet/${x.id}">${x.kind === "code" ? "🔳" : x.kind === "pdf" ? "📄" : "🖼️"} ${esc(x.label || "Bilet")}${x.code ? " · kod" : ""}</a>`).join("")}</div>
            <label class="btn wide">📎 Dodaj zdjęcie, screen lub PDF<input type="file" id="pl-file" accept="image/*,application/pdf,.pkpass" multiple hidden></label>
            <p class="muted small" id="pl-file-note">${files.length ? "Dotknij biletu, by pokazać go na pełnym ekranie (np. przy wejściu)." : "Bilet pokaże się na pełnym ekranie, a kod (QR, kreskowy) aplikacja odczyta sama."}</p></div>` : ""}
          ${App.Places ? App.Places.searchBox(v) : `<label class="field"><span>Miejsce – adres, nazwa lub link do mapy</span>
            <input name="place" maxlength="500" value="${esc(v.place)}"></label>`}
          <div class="grid2 price">
            <label class="field"><span>Koszt</span><input name="cost" inputmode="decimal" placeholder="np. 25" value="${esc(v.cost)}"></label>
            <label class="field"><span>Waluta</span><input name="currency" maxlength="5" autocapitalize="characters" value="${esc(v.currency || "PLN")}"></label>
          </div>
          <label class="field"><span>Notatka</span>
            <textarea name="note" rows="3" placeholder="np. bilety kupić online, zamknięte w poniedziałki">${esc(v.note)}</textarea></label>
          ${App.Photos ? `<div class="field"><span>Zdjęcie</span>
            <div class="pl-ph-box" id="pl-ph">${photoBox(v.photo)}</div>
            <div class="pl-ph-btns">
              <button type="button" class="btn" id="pl-ph-find">🔎 Znajdź</button>
              <label class="btn">📷 Własne<input type="file" id="pl-ph-file" accept="image/*" hidden></label>
              <button type="button" class="btn" id="pl-ph-del"${v.photo ? "" : " hidden"}>Usuń</button>
            </div></div>` : ""}
          <p class="error" id="err" hidden></p>
          <button class="btn primary wide" type="submit">${it ? "Zapisz zmiany" : "Dodaj do planu"}</button>
          ${it ? `<button class="btn danger wide" type="button" id="del">Usuń punkt</button>` : ""}
        </form>`,
      after(view) {
        const f = view.querySelector("#pl-form");
        if (!it && !fromMap && !newFiles.length) f.title.focus();
        // bilety / screeny: zapisywane razem z punktem (tickets.js → addFiles)
        const fileBox = view.querySelector("#pl-files");
        const showNew = () => {
          if (!fileBox) return;
          fileBox.querySelectorAll(".pl-file.new").forEach(x => x.remove());
          fileBox.insertAdjacentHTML("beforeend", newFiles.map((x, i) => `<span class="pl-file new">${/pdf/i.test(x.type) || /\.pdf$/i.test(x.name) ? "📄" : "🖼️"} ${esc(x.name || "plik")} <button type="button" class="pl-file-x" data-i="${i}" aria-label="Usuń plik">✕</button></span>`).join(""));
          fileBox.querySelectorAll(".pl-file-x").forEach(b => b.onclick = () => { newFiles.splice(+b.dataset.i, 1); showNew(); });
        };
        // pola z biletu (tylko nowy punkt): PDF – tekst z pliku, zdjęcie/screen – odczyt tekstu (OCR, ocr.js).
        // Uzupełniane tylko puste pola (to, co wpisał użytkownik, zostaje).
        const note = view.querySelector("#pl-file-note");
        let reading = false;
        const readInfo = async (list, quiet) => {
          if (it || reading) return null;
          const pdf = list.find(x => /pdf/i.test(x.type) || /\.pdf$/i.test(x.name));
          const img = list.find(x => /^image\//i.test(x.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(x.name));
          const src = pdf || img;
          if (!src) return null;
          if (!pdf && !App.Ocr) return null;
          reading = true;
          const old = note ? note.textContent : "";
          const say = m => { if (note) note.textContent = m; if (quiet && m) App.toast(m); };
          let txt = "";
          try {
            if (pdf && App.Tickets.pdfText) txt = await App.Tickets.pdfText(pdf);
            if (!txt.trim() && img && App.Ocr) {
              say("🔎 Czytam tekst ze zdjęcia…");
              txt = await App.Ocr.text(img, p => say(`🔎 Czytam tekst ze zdjęcia… ${Math.round(p * 100)}%`));
            }
          } catch (e) {
            reading = false; if (note) note.textContent = old;
            if (img && !pdf && !quiet) App.toast(navigator.onLine ? "Nie udało się odczytać tekstu ze zdjęcia – uzupełnij sam" : "Odczyt zdjęć wymaga jednorazowego pobrania (internet) – uzupełnij sam");
            return null;
          }
          reading = false; if (note) note.textContent = old;
          if (!f.isConnected) return null;
          const w = infoFromText(txt, trip);
          const got = [];
          if (w) {
            if (w.date && !f.time.value) {
              if (![...f.date.options].some(o => o.value === w.date)) f.date.insertAdjacentHTML("beforeend", `<option value="${w.date}">${App.fmtDay(w.date)}${w.date < trip.start || w.date > trip.end ? " (poza podróżą)" : ""}</option>`);
              f.date.value = w.date; got.push(App.fmtDay(w.date));
            }
            if (w.time && !f.time.value) { f.time.value = w.time; got.push(w.time); }
            if (w.title && !f.title.value.trim()) { f.title.value = w.title; got.push("nazwa"); }
            if (w.place && f.place && !f.place.value.trim()) { f.place.value = w.place; got.push("miejsce"); }
            if (w.cost && !f.cost.value.trim()) { f.cost.value = w.cost.replace(".", ","); if (w.currency) f.currency.value = w.currency; got.push(`${w.cost.replace(".", ",")} ${w.currency || ""}`.trim()); }
          }
          if (got.length) App.toast(`Z biletu: ${got.join(" · ")} – sprawdź`);
          else if (!quiet) App.toast("Nie znalazłem na bilecie daty ani nazwy – uzupełnij sam");
          return w;
        };
        if (fileBox) {
          showNew();
          if (newFiles.length) readInfo(newFiles);
          view.querySelector("#pl-file").onchange = e => {
            const add = [...e.target.files]; e.target.value = "";
            newFiles = newFiles.concat(add); showNew(); readInfo(add);
          };
        }
        // zdjęcie: undefined = bez zmian, null = usunięte, obiekt = nowe
        let photo;
        const phBox = view.querySelector("#pl-ph"), phDel = view.querySelector("#pl-ph-del");
        const setPhoto = ph => { photo = ph; phBox.innerHTML = photoBox(ph); phDel.hidden = !ph; };
        if (phBox) {
          const findBtn = view.querySelector("#pl-ph-find");
          findBtn.onclick = async () => {
            const lat = parseFloat(f.lat ? f.lat.value : ""), lon = parseFloat(f.lon ? f.lon.value : "");
            const probe = { title: f.title.value.trim() || f.place.value.trim(), ...(isFinite(lat) && isFinite(lon) ? { lat, lon } : {}) };
            if (!probe.title) { App.toast("Wpisz najpierw nazwę miejsca"); return; }
            findBtn.disabled = true; findBtn.textContent = "Szukam…";
            try {
              const hit = await App.Photos.find(probe);
              if (hit) setPhoto({ data: await App.Photos.toData(hit.src), page: hit.page, credit: hit.credit, auto: true });
              else App.toast("Nie znaleziono zdjęcia – dodaj własne");
            } catch (e) { App.toast("Brak internetu albo Wikipedia nie odpowiada"); }
            findBtn.disabled = false; findBtn.textContent = "🔎 Znajdź";
          };
          view.querySelector("#pl-ph-file").onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            e.target.value = "";
            const prev = photo;
            try {
              const blob = await App.Photos.toData(URL.createObjectURL(file), 480);
              setPhoto({ data: blob, page: "", credit: "", auto: false });
            } catch (err) { App.toast("Nie udało się wczytać zdjęcia"); return; }
            // nowy punkt bez nazwy: może to screen biletu – odczyt tekstu; bilet (data/godzina) trafia do 🎫 Biletów, nie jako zdjęcie miejsca
            if (!it && fileBox && !f.title.value.trim() && App.Ocr) {
              const w = await readInfo([file], true);
              if (w && (w.date || w.time) && f.isConnected) {
                newFiles.push(file); showNew();
                setPhoto(prev === undefined ? null : prev);
                if (prev === undefined) photo = undefined;
              }
            }
          };
          phDel.onclick = () => setPhoto(null);
        }
        if (App.Places) App.Places.bindSearch(f, trip);
        if (fromMap && q.q) f.querySelector("#pl-find").click();
        if (fromMap && q.lat && App.Places) App.Places.reverse(q.lat, q.lon).then(r => {
          if (!r || !f.isConnected || f.lat.value !== String(+q.lat)) return; // użytkownik w międzyczasie zmienił miejsce
          f.place.value = r.address;
          if (!f.title.value.trim()) f.title.value = r.name;
        }).catch(() => {});
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          for (const k in d) d[k] = String(d[k]).trim();
          const err = m => { const p = view.querySelector("#err"); p.textContent = m; p.hidden = false; };
          if (!d.title) return err("Wpisz, co planujesz.");
          if (!d.date) d.time = ""; // pomysł nie ma godziny
          // położenie z wyszukiwarki (liczby) albo brak
          const lat = parseFloat(d.lat), lon = parseFloat(d.lon);
          delete d.lat; delete d.lon;
          const xy = isFinite(lat) && isFinite(lon) ? { lat, lon, geoNone: false } : { lat: null, lon: null, geoNone: it && it.place === d.place ? !!it.geoNone : false };
          if (!isFinite(lat) && it && it.place === d.place && App.Places && App.Places.hasXY(it)) { xy.lat = it.lat; xy.lon = it.lon; }
          if (d.cost && !num(d.cost)) return err("Koszt musi być liczbą, np. 25 albo 12,50.");
          d.currency = (d.currency || "PLN").toUpperCase();
          if (photo !== undefined) Object.assign(d, { photo, photoOff: photo === null, photoTry: Date.now() });
          else if (it && it.photo && it.photo.auto && (it.title !== d.title || (isFinite(lat) && (lat !== it.lat || lon !== it.lon))))
            Object.assign(d, { photo: null, photoTry: 0, photoUrl: "" }); // inne miejsce – zdjęcie znajdzie się od nowa
          const moved = !it || it.date !== d.date || it.time !== d.time;
          const rec = await DB.put("planItems", { ...(it || {}), ...d, ...xy, tripId: trip.id, order: it ? it.order : 1e6 });
          if (moved) await placeInDay(rec);
          if (newFiles.length) await App.Tickets.addFiles(App.Tickets.planSeg(rec), newFiles);
          pending = [];
          if (!d.date) App.toast(it ? "Zapisano pomysł" : "Dodano do pomysłów");
          else if (d.date < trip.start || d.date > trip.end) App.toast("Zapisano · ten dzień jest poza datami podróży");
          else App.toast(it ? "Zapisano zmiany" : "Dodano do planu");
          App.back(`#/plan/${trip.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.onclick = async () => {
          if (!confirm(`Usunąć „${it.title}” z planu?${files.length ? ` Razem z ${files.length === 1 ? "biletem" : `biletami (${files.length})`}.` : ""}`)) return;
          await DB.del("planItems", it.id);
          for (const x of files) await DB.del("files", x.id); // jego bilety i screeny
          App.toast("Usunięto");
          App.back(`#/plan/${trip.id}`);
        };
      },
    };
  }
  App.route(/^\/plan\/([\w-]+)\/nowy$/, ([tripId], q) => itemForm({ tripId, date: q.d, q }));
  App.route(/^\/punkt\/([\w-]+)$/, ([itemId]) => itemForm({ itemId }));

  App.Plan = { infoFromText, segEvents, CATS, catOf, pickTrip, tripOptions, routeIcon, placeInDay };
})();
