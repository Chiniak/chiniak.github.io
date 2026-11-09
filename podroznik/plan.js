/* Podróżnik – etap 3: plan dnia i plan podróży.
   Trasy:
     #/plan                       wybiera podróż: trwającą, najbliższą, albo ostatnią
     #/plan/:tripId               plan dzień po dniu + karta „Dziś” (gdy podróż trwa)
     #/plan/:tripId/nowy?d=DATA   nowy punkt planu
     #/punkt/:id                  edycja (i usuwanie) punktu
   Punkt planu (magazyn "planItems"):
     { id, tripId, date: "RRRR-MM-DD", time: "GG:MM" | "", title, cat, place, note, cost, currency, order }
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
  const handleIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>`;
  const navLink = (place, label = "Nawiguj") => place
    ? `<a class="pl-nav" href="${esc(App.mapsUrl(place))}" target="_blank" rel="noopener" aria-label="${label}: ${esc(place)}">${navIcon}</a>` : "";

  const num = v => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const money = (n, cur) => `${n.toLocaleString("pl-PL", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

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
    const [segs, items] = await Promise.all([DB.byIndex("segments", "tripId", id), DB.byIndex("planItems", "tripId", id)]);
    const events = segEvents(segs);
    const today = App.todayStr();
    const ongoing = trip.start <= today && today <= trip.end;

    // przełącznik podróży
    const order = trips.slice().sort((a, b) => {
      const rank = t => (t.end < today ? 2 : t.start > today ? 1 : 0);
      return rank(a) - rank(b) || (rank(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start));
    });
    const switcher = trips.length > 1 ? `
      <label class="pl-switch"><span class="sr">Podróż</span>
        <select id="pl-trip">${order.map(t => `<option value="${t.id}" ${t.id === id ? "selected" : ""}>${esc(t.name)} · ${App.fmtRange(t.start, t.end)}${t.end < today ? " (archiwum)" : ""}</option>`).join("")}</select>
      </label>` : "";

    // dni: od początku do końca podróży + dni spoza zakresu, na których coś jest
    const days = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) days.push(d);
    const extra = new Set(items.map(i => i.date).concat(events.map(e => e.at.slice(0, 10))).filter(d => d < trip.start || d > trip.end));
    const allDays = [...new Set([...extra].filter(d => d < trip.start).sort().concat(days, [...extra].filter(d => d > trip.end).sort()))];

    const total = days.length;
    let html = switcher;
    if (ongoing) html += todayCard(trip, events, items);
    else if (trip.start > today) {
      const n = App.dayDiff(today, trip.start);
      html += `<p class="pl-info">Do wyjazdu ${n === 1 ? "1 dzień" : `${n} ${plural(n, "dzień", "dni", "dni")}`} · ${App.fmtRange(trip.start, trip.end)}</p>`;
    }

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

      const rows = mergeDay(dayItems, dayEvents).map(({ it, ev }) => ev ? `
        <div class="pl-row pl-seg">
          <div class="pl-time">${App.time(ev.at)}</div>
          <a class="pl-main" href="${ev.href}">
            <div class="pl-title"><span aria-hidden="true">${ev.icon}</span> ${esc(ev.title)}</div>
            ${ev.sub ? `<div class="pl-sub">${esc(ev.sub)}</div>` : ""}
          </a>
          ${navLink(ev.nav)}
        </div>` : `
        <div class="pl-row pl-user" data-id="${it.id}">
          <div class="pl-time">${it.time || "–"}</div>
          <a class="pl-main" href="#/punkt/${it.id}">
            <div class="pl-title"><span aria-hidden="true">${catOf(it).icon}</span> ${esc(it.title)}</div>
            ${it.place || num(it.cost) ? `<div class="pl-sub">${[esc(it.place && !/^https?:/i.test(it.place) ? it.place : it.place ? "📍 link do mapy" : ""), num(it.cost) ? money(num(it.cost), it.currency || "PLN") : ""].filter(Boolean).join(" · ")}</div>` : ""}
            ${it.note ? `<div class="pl-note">${esc(it.note)}</div>` : ""}
          </a>
          ${navLink(it.place)}
          <button type="button" class="pl-handle" aria-label="Przeciągnij, by zmienić kolejność">${handleIcon}</button>
        </div>`).join("");

      const sec = `
        <section class="pl-day${day === today ? " is-today" : ""}" data-date="${day}" ${day === today ? 'id="pl-today"' : ""}>
          <div class="pl-day-head">
            <h3>${App.fmtDayLong(day)} <span class="muted">· ${tag}${day === today ? " · dziś" : ""}</span></h3>
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
        const prev = row.previousElementSibling, next = row.nextElementSibling;
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

  async function itemForm({ itemId, tripId, date }) {
    const it = itemId ? await DB.get("planItems", itemId) : null;
    if (itemId && !it) { location.replace("#/plan"); return ""; }
    const trip = await DB.get("trips", it ? it.tripId : tripId);
    if (!trip) { location.replace("#/plan"); return ""; }
    const v = it || { date: date || (trip.start <= App.todayStr() && App.todayStr() <= trip.end ? App.todayStr() : trip.start), time: "", title: "", cat: "zwiedzanie", place: "", note: "", cost: "", currency: "PLN" };

    const cats = Object.entries(CATS).map(([k, C]) => `
      <label class="type-chip"><input type="radio" name="cat" value="${k}" ${k === (v.cat || "inne") ? "checked" : ""}>
        <span><b aria-hidden="true">${C.icon}</b>${C.name}</span></label>`).join("");

    return {
      title: it ? "Edytuj punkt" : "Nowy punkt planu",
      back: `#/plan/${trip.id}`,
      html: `
        <form id="pl-form" class="form" novalidate>
          <div class="type-chips" role="radiogroup" aria-label="Rodzaj">${cats}</div>
          <label class="field"><span>Co</span>
            <input name="title" required maxlength="100" placeholder="np. Oceanarium, kolacja w Time Out Market" value="${esc(v.title)}"></label>
          <div class="grid2">
            <label class="field"><span>Dzień</span><input type="date" name="date" required value="${esc(v.date)}"></label>
            <label class="field"><span>Godzina (opcjonalnie)</span><input type="time" name="time" value="${esc(v.time)}"></label>
          </div>
          <label class="field"><span>Miejsce – adres, nazwa lub link do mapy</span>
            <input name="place" maxlength="500" placeholder="np. Esplanada D. Carlos I, Lizbona" value="${esc(v.place)}"></label>
          <div class="grid2 price">
            <label class="field"><span>Koszt</span><input name="cost" inputmode="decimal" placeholder="np. 25" value="${esc(v.cost)}"></label>
            <label class="field"><span>Waluta</span><input name="currency" maxlength="5" autocapitalize="characters" value="${esc(v.currency || "PLN")}"></label>
          </div>
          <label class="field"><span>Notatka</span>
            <textarea name="note" rows="3" placeholder="np. bilety kupić online, zamknięte w poniedziałki">${esc(v.note)}</textarea></label>
          <p class="error" id="err" hidden></p>
          <button class="btn primary wide" type="submit">${it ? "Zapisz zmiany" : "Dodaj do planu"}</button>
          ${it ? `<button class="btn danger wide" type="button" id="del">Usuń punkt</button>` : ""}
        </form>`,
      after(view) {
        const f = view.querySelector("#pl-form");
        if (!it) f.title.focus();
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          for (const k in d) d[k] = String(d[k]).trim();
          const err = m => { const p = view.querySelector("#err"); p.textContent = m; p.hidden = false; };
          if (!d.title) return err("Wpisz, co planujesz.");
          if (!d.date) return err("Wybierz dzień.");
          if (d.cost && !num(d.cost)) return err("Koszt musi być liczbą, np. 25 albo 12,50.");
          d.currency = (d.currency || "PLN").toUpperCase();
          const moved = !it || it.date !== d.date || it.time !== d.time;
          const rec = await DB.put("planItems", { ...(it || {}), ...d, tripId: trip.id, order: it ? it.order : 1e6 });
          if (moved) await placeInDay(rec);
          if (d.date < trip.start || d.date > trip.end) App.toast("Zapisano · ten dzień jest poza datami podróży");
          else App.toast(it ? "Zapisano zmiany" : "Dodano do planu");
          App.back(`#/plan/${trip.id}`);
        });
        const del = view.querySelector("#del");
        if (del) del.onclick = async () => {
          if (!confirm(`Usunąć „${it.title}” z planu?`)) return;
          await DB.del("planItems", it.id);
          App.toast("Usunięto");
          App.back(`#/plan/${trip.id}`);
        };
      },
    };
  }
  App.route(/^\/plan\/([\w-]+)\/nowy$/, ([tripId], q) => itemForm({ tripId, date: q.d }));
  App.route(/^\/punkt\/([\w-]+)$/, ([itemId]) => itemForm({ itemId }));

  App.Plan = { segEvents, CATS };
})();
