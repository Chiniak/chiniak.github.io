/* Tripwillow – etap 3: plan dnia i plan podróży.
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
  const ic = (type, cls) => App.icon ? App.icon.type(type, cls) : "";
  function segEvents(segs) {
    const ev = [];
    for (const s of segs) {
      if (!s.depart) continue;
      const T = Tr().typeOf(s);
      if (s.type === "nocleg") {
        const where = s.address || s.name;
        ev.push({ at: s.depart, icon: T.icon, ico: ic(s.type), title: `Zameldowanie: ${s.name || "nocleg"}`, sub: s.address || "", href: `#/odcinek/${s.id}`, nav: where });
        if (s.arrive) ev.push({ at: s.arrive, icon: "🔑", ico: ic("nocleg"), title: `Wymeldowanie: ${s.name || "nocleg"}`, sub: "", href: `#/odcinek/${s.id}`, nav: "" });
      } else {
        const bits = [T.name, s.number, s.arrive ? `przyjazd ${App.time(s.arrive)}${s.arrive.slice(0, 10) !== s.depart.slice(0, 10) ? " (+1)" : ""}` : ""].filter(Boolean);
        ev.push({ at: s.depart, end: s.arrive, icon: T.icon, ico: ic(s.type), title: `${s.from || "?"} → ${s.to || "?"}`, sub: bits.join(" · "), href: `#/odcinek/${s.id}`, nav: s.from, seg: s });
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
  // opts.more: link do ekranu „Dziś” (tryb W podróży, dzis.js) w nagłówku karty
  function todayCard(trip, events, items, opts = {}) {
    const now = nowStr(), today = App.todayStr();
    const all = events.map(e => ({ at: e.at, end: e.end, icon: e.ico || e.icon, title: e.title, sub: e.sub, nav: e.nav, href: e.href }))
      .concat(items.filter(i => i.time).map(i => ({
        at: `${i.date}T${i.time}`, icon: catOf(i).icon, title: i.title, sub: i.place && !/^https?:/i.test(i.place) ? i.place : "", nav: i.place, href: `#/punkt/${i.id}`,
      })))
      .sort((a, b) => a.at.localeCompare(b.at));

    const current = all.find(e => e.end && e.at <= now && now < e.end);
    const next = all.find(e => e.at > now);
    const todayLeft = all.filter(e => e.at > now && e.at.slice(0, 10) === today).length;
    const untimed = items.filter(i => i.date === today && !i.time).length;

    const block = (label, e, extra, live) => `
      <div class="td-row">
        <div class="td-ico" aria-hidden="true">${e.icon}</div>
        <a class="td-main" href="${e.href}">
          <div class="td-label">${live ? `<i class="live" aria-hidden="true"></i>` : ""}${label}</div>
          <div class="td-title">${esc(e.title)}</div>
          <div class="td-sub">${extra}</div>
        </a>
        ${navLink(e.nav)}
      </div>`;

    let html = "";
    if (current) html += block("Teraz · w drodze", current, `przyjazd ${App.time(current.end)} · ${inTime(App.minutes(now, current.end))}`, true);
    if (next) {
      const when = next.at.slice(0, 10) === today ? App.time(next.at) : `${App.fmtDay(next.at)} ${App.time(next.at)}`;
      html += block("Dalej", next, `${when} · ${inTime(App.minutes(now, next.at))}${next.sub ? " · " + esc(next.sub) : ""}`);
    }
    if (!html) html = `<p class="td-empty">Na dziś nic więcej nie zaplanowano.</p>`;
    const summary = [
      todayLeft ? `${todayLeft} ${plural(todayLeft, "punkt", "punkty", "punktów")} z godziną jeszcze dziś` : "",
      untimed ? `${untimed} bez godziny` : "",
    ].filter(Boolean).map(x => `<span>${x}</span>`).join(" · ");
    return `
      <section class="today-card" aria-label="Dziś">
        <div class="td-head"><span class="chip accent">Dziś</span><span>${App.fmtDayLong(today)}</span>${opts.more ? `<a class="td-more" href="#/dzis/${trip.id}">Cały dzień${App.icon("chev", "sm")}</a>` : ""}</div>
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

  /* przełącznik podróży: arkusz z kartami (nazwa, cel, termin, „trwa / za X dni / minęła”), pogrupowany:
     teraz, nadchodzące, minione (zwinięte). onPick(id) – wybór. Używany w planie i pakowaniu. */
  function tripSheet(trips, id, onPick) {
    const today = App.todayStr();
    const old = document.querySelector(".tp-sheet");
    if (old) old.remove();
    const status = t => {
      if (t.start <= today && today <= t.end) { const n = App.dayDiff(t.start, today) + 1, all = App.dayDiff(t.start, t.end) + 1; return { cls: "now", txt: `trwa · dzień ${n} z ${all}` }; }
      if (t.start > today) { const n = App.dayDiff(today, t.start); return { cls: "soon", txt: n === 1 ? "jutro" : `za ${n} ${plural(n, "dzień", "dni", "dni")}` }; }
      return { cls: "past", txt: "minęła" };
    };
    const card = t => {
      const s = status(t), dest = t.destination && t.destination.trim() !== t.name.trim() ? t.destination : "";
      return `<button type="button" class="tp-trip${t.id === id ? " on" : ""}" data-pick="${t.id}"${t.id === id ? ' aria-current="true"' : ""} style="--c:${esc(t.color || "#0f6e6e")}">
          <span class="tp-bar" aria-hidden="true"></span>
          <span class="tp-main"><b>${esc(t.name)}</b><small>${dest ? `${esc(dest)} · ` : ""}${App.fmtRange(t.start, t.end)}</small></span>
          <span class="tp-st tp-${s.cls}">${s.txt}</span>${t.id === id ? `<span class="tp-check" aria-hidden="true">${App.icon("check", "sm")}</span>` : ""}
        </button>`;
    };
    const now = trips.filter(t => t.start <= today && today <= t.end).sort((a, b) => a.start.localeCompare(b.start));
    const fut = trips.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start));
    const past = trips.filter(t => t.end < today).sort((a, b) => b.end.localeCompare(a.end));
    const sec = (title, list) => list.length ? `<h3 class="tp-h">${title}</h3>${list.map(card).join("")}` : "";
    const curPast = past.some(t => t.id === id);
    const dlg = document.createElement("dialog");
    dlg.className = "tp-sheet";
    dlg.setAttribute("aria-label", "Wybierz podróż");
    dlg.innerHTML = `
      <div class="tp-in">
        <div class="tp-top"><h2>Wybierz podróż</h2><button type="button" class="icon-btn" data-close aria-label="Zamknij">${App.icon("close")}</button></div>
        <div class="tp-list">
          ${sec("Teraz", now)}${sec("Nadchodzące", fut)}
          ${past.length ? `<details class="tp-past"${curPast || (!now.length && !fut.length) ? " open" : ""}><summary>Minione <span class="chip">${past.length}</span>${App.icon("chev", "pl-sum-chev")}</summary>${past.map(card).join("")}</details>` : ""}
        </div>
        <a class="btn wide tp-new" href="#/podroze/nowa">${App.icon("plus", "sm")} <span>Nowa podróż</span></a>
      </div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener("click", e => {
      if (e.target === dlg || e.target.closest("[data-close]")) return close();
      if (e.target.closest(".tp-new")) return close();
      const b = e.target.closest("[data-pick]");
      if (b) { close(); if (b.dataset.pick !== id) onPick(b.dataset.pick); }
    });
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(); });
    dlg.showModal();
    const cur = dlg.querySelector(".tp-trip.on");
    if (cur) cur.scrollIntoView({ block: "center" });
  }
  // przycisk przełącznika w nagłówku (zastępuje listę rozwijaną)
  const switchBtn = (bid, trip) => `<button type="button" class="pl-switch-btn" id="${bid}" aria-haspopup="dialog" aria-label="Zmień podróż (teraz: ${esc(trip.name)})"></button>`;

  // opcje przełącznika podróży: trwające, nadchodzące, potem archiwum (także dla pakowania)
  function tripOptions(trips, id) {
    const today = App.todayStr();
    const rank = t => (t.end < today ? 2 : t.start > today ? 1 : 0);
    return trips.slice()
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)))
      .map(t => `<option value="${t.id}" ${t.id === id ? "selected" : ""}>${esc(t.name)} · ${App.fmtRange(t.start, t.end)}${t.end < today ? " (archiwum)" : ""}</option>`)
      .join("");
  }

  /* pasek „Twoje podróże” (plan i pakowanie): karty trwających i nadchodzących podróży + archiwum w liście.
     href(id) – adres po wybraniu; selId – id <select> archiwum */
  function tripTabs(trips, id, href, selId) {
    if (trips.length < 2) return "";
    const today = App.todayStr();
    const active = trips.filter(t => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    const past = trips.filter(t => t.end < today).sort((a, b) => b.start.localeCompare(a.start));
    const cur = trips.find(t => t.id === id);
    if (cur && cur.end < today) active.push(cur); // oglądana podróż z archiwum też ma kartę
    const sub = t => {
      if (t.start <= today && today <= t.end) return `trwa · dzień ${App.dayDiff(t.start, today) + 1} z ${App.dayDiff(t.start, t.end) + 1}`;
      if (t.end < today) return App.fmtRange(t.start, t.end);
      const n = App.dayDiff(today, t.start);
      return `${n === 1 ? "jutro" : `za ${n} ${plural(n, "dzień", "dni", "dni")}`} · ${App.fmtRange(t.start, t.end)}`;
    };
    const card = t => `
      <a class="pl-tcard${t.id === id ? " is-on" : ""}${t.start <= today && today <= t.end ? " is-now" : ""}" href="${href(t.id)}" data-trip="${t.id}"${t.id === id ? ` aria-current="page"` : ""} title="Przytrzymaj, żeby edytować albo usunąć" style="--c:${esc(t.color || "#0f6e6e")}">
        <b><i aria-hidden="true"></i>${esc(t.name)}</b><small>${sub(t)}</small></a>`;
    const arch = past.filter(t => t.id !== id);
    return `<nav class="pl-trips" aria-label="Twoje podróże">${active.map(card).join("")}
      ${arch.length ? `<label class="pl-tcard pl-tarch"><b>Archiwum (${arch.length})</b><small>wcześniejsze podróże</small>
        <select id="${selId}"><option value="" selected disabled>Archiwum</option>${arch.map(t => `<option value="${t.id}">${esc(t.name)} · ${App.fmtRange(t.start, t.end)}</option>`).join("")}</select></label>` : ""}
    </nav>`;
  }

  // przełączanie bez dokładania historii (wstecz wraca do poprzedniego ekranu, nie do poprzedniej podróży)
  function bindTripTabs(view, selId, href) {
    let pressed = false; // po przytrzymaniu nie przełączaj podróży
    view.querySelectorAll("a.pl-tcard").forEach(a => {
      a.onclick = e => { e.preventDefault(); if (pressed) { pressed = false; return; } if (!a.classList.contains("is-on")) location.replace(a.getAttribute("href")); };
      // przytrzymanie (albo prawy przycisk / klawisz menu) → menu podróży: edycja, szczegóły, usunięcie
      let timer = null, x0 = 0, y0 = 0;
      const open = () => { clearTimeout(timer); timer = null; pressed = true; tripMenu(a.dataset.trip); };
      a.addEventListener("contextmenu", e => { e.preventDefault(); if (timer || !pressed) open(); });
      a.addEventListener("pointerdown", e => { if (e.button) return; pressed = false; x0 = e.clientX; y0 = e.clientY; timer = setTimeout(open, 550); });
      a.addEventListener("pointermove", e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(timer); timer = null; } });
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) a.addEventListener(ev, () => { clearTimeout(timer); timer = null; });
    });
    const arch = view.querySelector(`#${selId}`);
    if (arch) arch.onchange = () => location.replace(href(arch.value));
    const on = view.querySelector(".pl-tcard.is-on"), bar = view.querySelector(".pl-trips");
    if (on && bar) { // wybrana karta poza ekranem → przewiń do niej
      const r = on.getBoundingClientRect(), b = bar.getBoundingClientRect();
      if (r.left < b.left || r.right > b.right) bar.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2);
    }
  }

  // menu podróży z paska „Twoje podróże” (Plan, Pakowanie)
  async function tripMenu(tripId) {
    const t = await DB.get("trips", tripId);
    if (!t) return;
    const old = document.querySelector(".tp-sheet"); if (old) old.remove();
    const dlg = document.createElement("dialog");
    dlg.className = "tp-sheet";
    dlg.setAttribute("aria-label", `Podróż: ${t.name}`);
    const item = (act, icon, title, sub, cls = "") => `<button type="button" class="li tm-act ${cls}" data-act="${act}"><span class="li-ico">${App.icon(icon, "sm")}</span>
      <span class="li-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
    dlg.innerHTML = `<div class="tp-in">
        <div class="tp-top"><h2 translate="no">${esc(t.name)}</h2><button type="button" class="icon-btn" data-close aria-label="Zamknij">${App.icon("close")}</button></div>
        <p class="muted small" style="margin:0 0 8px">${App.fmtRange(t.start, t.end)}${t.destination ? ` · <span translate="no">${esc(t.destination)}</span>` : ""}</p>
        <div class="list tm-list">
          ${item("edit", "edit", "Edytuj podróż", "nazwa, daty, cel, kolor, zdjęcie")}
          ${item("open", "trips", "Szczegóły podróży", "bilety, noclegi, narzędzia")}
          ${item("del", "trash", "Usuń podróż", "razem z biletami, planem i pakowaniem", "danger")}
        </div></div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(); });
    dlg.addEventListener("click", async e => {
      if (e.target === dlg || e.target.closest("[data-close]")) return close();
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "edit") { close(); location.hash = `#/podroze/${t.id}/edytuj`; return; }
      if (act === "open") { close(); location.hash = `#/podroze/${t.id}`; return; }
      if (act === "del") {
        close();
        if (!App.Trips || !(await App.Trips.removeTrip(t))) return;
        const here = location.hash.includes(t.id);
        if ((await DB.getSetting("planTrip", "")) === t.id) await DB.setSetting("planTrip", "");
        if (here) location.replace(location.hash.split("?")[0].split("/").slice(0, 2).join("/")); else App.render();
      }
    });
    dlg.showModal();
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
    const tkBtn = it => ticketOf[it.id] ? `<a class="icon-btn pl-tk" href="#/bilet/${ticketOf[it.id][0].id}" aria-label="Bilet: ${esc(it.title)}">${App.icon("ticket")}${ticketOf[it.id].length > 1 ? `<small>${ticketOf[it.id].length}</small>` : ""}</a>` : "";
    const today = App.todayStr();
    const ongoing = trip.start <= today && today <= trip.end;

    // dni: od początku do końca podróży + dni spoza zakresu, na których coś jest
    const days = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) days.push(d);
    const extra = new Set(items.map(i => i.date).filter(Boolean).concat(events.map(e => e.at.slice(0, 10))).filter(d => d < trip.start || d > trip.end));
    const allDays = [...new Set([...extra].filter(d => d < trip.start).sort().concat(days, [...extra].filter(d => d > trip.end).sort()))];
    const total = days.length;
    const ideas = items.filter(i => !i.date).sort(byOrder);

    // nagłówek: podróż (dotknięcie nazwy = przełącznik), zakres dat, postęp
    const n0 = App.dayDiff(trip.start, today) + 1;
    let info;
    if (ongoing) info = `${App.fmtRange(trip.start, trip.end)} · ${`dzień ${n0} z ${total}`}`;
    else if (trip.start > today) {
      const n = App.dayDiff(today, trip.start);
      info = `Do wyjazdu ${n === 1 ? "1 dzień" : `${n} ${plural(n, "dzień", "dni", "dni")}`} · ${App.fmtRange(trip.start, trip.end)}`;
    } else info = App.fmtRange(trip.start, trip.end);
    let html = tripTabs(trips, id, x => `#/plan/${x}`, "pl-arch") + `
      <header class="pl-head">
        <div class="pl-head-name">
          <h2>${esc(trip.name)}</h2>
          ${trips.length > 1 ? `<span class="pl-head-chev" aria-hidden="true">${App.icon("chev")}</span>
            ${switchBtn("pl-trip", trip)}` : ""}
        </div>
        <p class="pl-info">${info}</p>
        ${ongoing ? `<div class="bar" aria-hidden="true"><i style="width:${Math.round(n0 / total * 100)}%"></i></div>` : ""}
      </header>`;

    // pasek dni: dotknięcie przewija do dnia
    const wd = d => App.parseDay(d).toLocaleDateString(self.I18N ? I18N.locale : "pl-PL", { weekday: "short" }).replace(".", "");
    const busy = new Set(items.map(i => i.date).filter(Boolean).concat(events.map(e => e.at.slice(0, 10))));
    html += `<nav class="pl-days" aria-label="Dni podróży">${allDays.map(d => `
        <button type="button" class="pl-dchip${d === today ? " is-today" : ""}${d < trip.start || d > trip.end ? " is-out" : ""}" data-go="${d}" aria-label="${App.fmtDay(d)}">
          <small>${wd(d)}</small><b>${+d.slice(8)}</b><i class="${busy.has(d) ? "on" : ""}" aria-hidden="true"></i></button>`).join("")}
        <button type="button" class="pl-dchip pl-dchip-ideas" data-go="ideas" aria-label="Pomysły – bez dnia"><small>💡</small><b>${ideas.length}</b><i aria-hidden="true"></i></button>
      </nav>`;

    if (ongoing) html += todayCard(trip, events, items, { more: true });

    // szybki dostęp (etap 10–11 + bilety w planie)
    const tool = (href, ico, name, sub) => `<a class="plan-link pl-tool" href="${href}" title="${sub}"><i aria-hidden="true">${App.icon(ico)}</i><span>${name}</span></a>`;
    html += `<div class="pl-tools">
        ${tool(`#/mapa/${id}`, "map", "Mapa i trasa", "punkty dnia, odległości")}
        ${tool(`#/odkrywaj/${id}`, "compass", "Odkrywaj", "atrakcje i jedzenie w okolicy")}
        ${tool(`#/karty/${id}`, "taxi", "Dla kierowcy", "adresy w lokalnym piśmie, rozmówki")}
        ${App.Tickets && App.Tickets.addFiles ? `<label class="plan-link pl-tool pl-from-file" title="zdjęcie, screen, PDF → punkt planu"><i aria-hidden="true">${App.icon("clip")}</i><span>Z biletu</span>
          <input type="file" id="pl-from-file" accept="image/*,application/pdf,.pkpass" multiple hidden></label>` : ""}
      </div>`;

    // karta punktu: zdjęcie, kategoria, nazwa, adres, koszt, notatka
    const P = App.Places;
    const PH = it => App.Photos ? App.Photos.thumb(it) : ""; // zdjęcie miejsca (photos.js)
    const placeTxt = it => it.place ? (/^https?:/i.test(it.place) ? "link do mapy" : it.place) : "";
    const itemMain = it => `
      <a class="pl-main${it.photo ? " has-ph" : ""}" data-pid="${it.id}" href="#/punkt/${it.id}">${PH(it)}
        <div class="pl-cat"><span aria-hidden="true">${catOf(it).icon}</span> <span>${catOf(it).name}</span></div>
        <div class="pl-title">${esc(it.title)}</div>
        ${placeTxt(it) ? `<div class="pl-sub">${App.icon("pin")}<span>${esc(placeTxt(it))}</span></div>` : ""}
        ${num(it.cost) ? `<div class="pl-price">${money(num(it.cost), it.currency || "PLN")}</div>` : ""}
        ${it.note ? `<div class="pl-note">${esc(it.note)}</div>` : ""}
      </a>`;

    // trasa dnia: długość + „Ułóż trasę” (places.js); po ułożeniu – wynik i „Cofnij”, dopóki kolejność się nie zmieni
    const kmTxt = k => App.Places.fmtDist(k / 1.3);
    if (lastOpt && (lastOpt.tripId !== id || items.filter(i => i.date === lastOpt.day).sort(byOrder).map(i => i.id).join() !== lastOpt.ids.join())) lastOpt = null;
    const routeBar = (day, dayItems) => {
      if (!P) return "";
      const hotel = P.hotelFor(segs, day), h = P.hasXY(hotel) ? hotel : null;
      const located = dayItems.filter(P.hasXY).length;
      if (located + (h ? 1 : 0) < 2) return "";
      const canOpt = dayItems.filter(i => !i.time && P.hasXY(i)).length >= 2;
      if (lastOpt && lastOpt.day === day) return `
          <div class="pl-route is-done" role="status">
            <span class="pl-route-t">${App.icon("sparkle", "sm")}<span>${lastOpt.saved >= 0.05 ? `Trasa krótsza o ${kmTxt(lastOpt.saved)}: było ${kmTxt(lastOpt.before)}, jest ${kmTxt(lastOpt.after)}` : `Ta kolejność jest już najkrótsza · ${kmTxt(lastOpt.after)}`}</span></span>
            ${lastOpt.saved >= 0.05 ? `<button type="button" class="btn small pl-route-undo" data-undo="${day}">Cofnij</button>` : `<button type="button" class="icon-btn pl-route-x" data-undo="${day}" aria-label="Zamknij">${App.icon("close")}</button>`}
          </div>`;
      return `
          <div class="pl-route">
            <span class="pl-route-t">${App.icon("walk", "sm")}<span>Trasa dnia${h ? " z noclegu i z powrotem" : ""}: ok. ${kmTxt(P.routeKm(dayItems, h) * 1.3)}</span></span>
            ${canOpt ? `<button type="button" class="btn small pl-route-opt" data-opt="${day}" title="Punkty z godziną zostają na swoim miejscu">${App.icon("sparkle", "sm")} Ułóż trasę</button>` : ""}
          </div>`;
    };

    const costs = {};
    let daysHtml = "", pastHtml = "", pastN = 0;
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
        return l ? `<div class="pl-leg" aria-label="Dojście"><span>${l.icon} ${l.txt}</span></div>` : "";
      };
      const rows = mergeDay(dayItems, dayEvents).map(({ it, ev }) => ev ? (prevXY = null, `
        <div class="pl-row pl-seg">
          <div class="pl-time">${App.time(ev.at)}</div>
          <div class="pl-card">
            <a class="pl-main" href="${ev.href}">
              <div class="pl-title">${esc(ev.title)}</div>
              ${ev.sub ? `<div class="pl-sub">${esc(ev.sub)}</div>` : ""}
            </a>
            ${navLink(ev.nav)}
          </div>
          <span class="pl-dot" aria-hidden="true">${ev.ico || ev.icon}</span>
        </div>`) : `${legHtml(it)}
        <div class="pl-row pl-user${it.time ? "" : " no-time"}" data-id="${it.id}">
          <div class="pl-time">${it.time || "–"}</div>
          <div class="pl-card">
            ${itemMain(it)}
            <div class="pl-acts">
              ${tkBtn(it)}
              ${navLink(it.place)}
              <button type="button" class="pl-handle" aria-label="Przeciągnij, by zmienić kolejność">${handleIcon}</button>
            </div>
          </div>
          <span class="pl-dot" aria-hidden="true"></span>
        </div>`).join("");

      const sec = `
        <section class="pl-day${day === today ? " is-today" : ""}" data-date="${day}" id="${day === today ? "pl-today" : `pl-d-${day}`}">
          <div class="pl-day-head">
            <div class="pl-day-t">
              <div class="pl-day-n"><span>${tag}</span>${day === today ? ` <span class="chip accent">dziś</span>` : ""}${wx ? App.Weather.dayBadge(wx.data, day) : ""}</div>
              <h3>${App.fmtDayLong(day)}</h3>
            </div>
            ${dayItems.length ? `<a class="icon-btn pl-dmap" href="#/mapa/${id}?d=${day}" aria-label="Mapa dnia: ${App.fmtDay(day)}">${App.icon("map")}</a>` : ""}
            <a class="icon-btn pl-add" href="#/plan/${id}/nowy?d=${day}" aria-label="Dodaj punkt: ${App.fmtDay(day)}">${App.icon("plus")}</a>
          </div>
          <div class="pl-list">${rows || `<a class="pl-empty" href="#/plan/${id}/nowy?d=${day}">+ Dodaj punkt planu</a>`}</div>
          ${routeBar(day, dayItems)}
          ${costTxt ? `<div class="pl-cost">Koszty dnia: ${costTxt}</div>` : ""}
        </section>`;
      // w trakcie podróży minione dni chowamy, żeby dzisiejszy plan był od razu pod kartą „Dziś”
      if (ongoing && day < today) { pastHtml += sec; pastN++; continue; }
      if (pastHtml) {
        daysHtml += `<details class="pl-past"><summary>${App.icon("clock")}<span>Poprzednie dni</span> <span class="chip">${pastN}</span>${App.icon("chev", "pl-sum-chev")}</summary>${pastHtml}</details>`;
        pastHtml = "";
      }
      daysHtml += sec;
    }
    html += `<div class="pl-timeline">${daysHtml}</div>`;

    // pomysły (punkty bez dnia) – osobno, pod planem dni
    const dayOpts = days.map(d => `<option value="${d}">${App.fmtDay(d)}</option>`).join("");
    html += `
      <details class="pl-ideas" id="pl-ideas"${ideas.length && ideas.length <= 6 ? " open" : ""}>
        <summary>
          <span class="pl-ideas-ico" aria-hidden="true">💡</span>
          <span class="pl-ideas-t"><b>Pomysły – bez dnia</b><small>Przenieś do dnia, gdy zdecydujesz</small></span>
          <span class="chip">${ideas.length}</span>${App.icon("chev", "pl-sum-chev")}
        </summary>
        <div class="pl-ideas-list">
        ${ideas.map(it => `
          <div class="pl-row pl-idea">
            <div class="pl-card">
              ${itemMain(it)}
              <div class="pl-acts">
                ${tkBtn(it)}
                <label class="pl-move"><span class="sr">Przenieś do dnia</span>
                  <select data-move="${it.id}"><option value="">+ dzień</option>${dayOpts}</select></label>
              </div>
            </div>
          </div>`).join("")}
        <a class="pl-empty" href="#/plan/${id}/nowy?d=pomysl">+ Dodaj pomysł</a>
        </div>
      </details>
      ${ideas.filter(i => i.lat != null && i.lon != null).length >= 2 && App.Distribute ? `<a class="btn wide pl-distribute" href="#/rozloz/${id}">${App.icon("sparkle", "sm")} Rozłóż pomysły na dni</a>` : ""}`;

    const sum = Object.entries(costs).map(([c, v]) => money(v, c)).join(" + ");
    if (sum) html += `<p class="pl-total">Koszty planu razem: <b>${sum}</b> <span class="muted">(bez transportu i noclegów)</span></p>`;

    // na dole: wyczyszczenie planu (punkty i pomysły) albo usunięcie całej podróży
    html += `
      <div class="pl-danger">
        ${items.length ? `<button type="button" class="btn danger" id="pl-clear">${App.icon("trash", "sm")} <span>Wyczyść plan</span></button>` : ""}
        <button type="button" class="btn danger" id="pl-deltrip">${App.icon("trash", "sm")} <span>Usuń całą podróż</span></button>
      </div>`;

    let timer = null;
    return {
      title: "Plan",
      action: `<a class="icon-btn" href="#/podroze/${id}" aria-label="Podróż: oś czasu, transport i noclegi">${routeIcon}</a>`,
      html,
      after(view) {
        if (wx) wx.refresh().then(changed => { if (changed) App.render(); }).catch(() => {});
        const sel = view.querySelector("#pl-trip");
        if (sel) sel.onclick = () => tripSheet(trips, id, v => location.replace(`#/plan/${v}`));
        bindTripTabs(view, "pl-arch", x => `#/plan/${x}`);
        if (ongoing) {
          // co minutę odśwież tylko kartę „Dziś” (liczniki „za X min”), bez przewijania strony
          timer = setInterval(() => {
            const card = view.querySelector(".today-card");
            if (card && !document.hidden) card.outerHTML = todayCard(trip, events, items, { more: true });
          }, 60000);
        }
        view.querySelectorAll(".pl-handle").forEach(h => enableDrag(h));
        // pasek dni → przewiń do dnia (dzień z „Poprzednich dni” najpierw rozwija listę)
        view.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
          const el = b.dataset.go === "ideas" ? view.querySelector("#pl-ideas") : view.querySelector(`.pl-day[data-date="${b.dataset.go}"]`);
          if (!el) return;
          const det = el.closest("details") || (el.tagName === "DETAILS" ? el : null);
          if (det) det.open = true;
          el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        });
        const strip = view.querySelector(".pl-days"), cur = strip && strip.querySelector(".is-today");
        if (cur) strip.scrollLeft = Math.max(0, cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2);
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
        const clr = view.querySelector("#pl-clear");
        if (clr) clr.onclick = async () => {
          const n = items.length;
          if (!confirm(`Usunąć wszystkie punkty planu i pomysły z podróży „${trip.name}” (${n})? Loty, pociągi i noclegi zostają. Tego nie da się cofnąć.`)) return;
          const tk = await DB.byIndex("files", "tripId", id);
          for (const f of tk) if (String(f.segmentId).startsWith("p:")) await DB.del("files", f.id); // bilety przypięte do punktów
          for (const it of items) await DB.del("planItems", it.id);
          lastOpt = null;
          App.toast("Plan wyczyszczony");
          App.render();
        };
        view.querySelector("#pl-deltrip").onclick = async () => {
          if (!App.Trips || !App.Trips.removeTrip || !(await App.Trips.removeTrip(trip))) return;
          DB.setSetting("planTrip", "");
          location.replace("#/plan");
        };
        view.querySelectorAll("[data-opt]").forEach(b => b.onclick = async () => {
          b.disabled = true;
          const day = b.dataset.opt;
          const r = await App.Places.optimizeDay(id, day);
          if (r.reason) { App.toast(r.reason); b.disabled = false; return; }
          lastOpt = { tripId: id, day, ...r };
          if (r.moved && navigator.vibrate) navigator.vibrate(20);
          App.render();
        });
        view.querySelectorAll("[data-undo]").forEach(b => b.onclick = async () => {
          const o = lastOpt;
          lastOpt = null;
          if (o && o.saved >= 0.05) { await App.Places.restoreOrder(o.prev); App.toast("Przywrócono poprzednią kolejność"); }
          App.render();
        });
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

  let lastOpt = null; // ostatnie „Ułóż trasę” w planie: { tripId, day, prev, ids, before, after, saved }

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
  // to samo z zewnątrz (udostępnione do aplikacji – udostepnione.js): nowy punkt planu z plików
  async function fromFiles(tripId, files) {
    const trip = await DB.get("trips", tripId), today = App.todayStr();
    pending = files;
    location.hash = `#/plan/${tripId}/nowy?d=${trip && trip.start <= today && today <= trip.end ? today : trip ? trip.start : today}&plik=1`;
  }

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
        if (lines[i + 1] && m[1].trim() && /\d/.test(lines[i + 1]) && letters(lines[i + 1]) >= 3 && !LABEL_PLACE.test(lines[i + 1]) && !NOT_TITLE.test(lines[i + 1]) && !/^\p{L}[\p{L} ]{2,25}:/u.test(lines[i + 1])) v += ", " + lines[i + 1]; // adres w dwóch wierszach
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
          <div class="fsec">
            <label class="field"><span>Co</span>
              <input name="title" required maxlength="100" placeholder="np. Oceanarium, kolacja w Time Out Market" value="${esc(v.title)}"></label>
          </div>
          <div class="fsec"><h2 class="section">Kiedy</h2>
            <div class="grid2">
              <label class="field"><span>Dzień</span><select name="date">${dateOpts}</select></label>
              <label class="field"><span>Godzina (opcjonalnie)</span><input type="time" name="time" value="${esc(v.time)}"></label>
            </div>
          </div>
          <div class="fsec"><h2 class="section">Gdzie</h2>
            ${App.Places ? App.Places.searchBox(v) : `<label class="field"><span>Miejsce – adres, nazwa lub link do mapy</span>
              <input name="place" maxlength="500" value="${esc(v.place)}"></label>`}
          </div>
          ${App.Tickets && App.Tickets.addFiles ? `<div class="fsec"><h2 class="section">Bilety i zdjęcia</h2><div class="field"><span>Bilet, screen potwierdzenia, zaproszenie</span>
            <div class="pl-files" id="pl-files">${files.map(x => `<a class="pl-file" href="#/bilet/${x.id}">${App.icon(x.kind === "code" ? "qr" : x.kind === "pdf" ? "doc" : "image", "sm")} ${esc(x.label || "Bilet")}${x.code ? " · kod" : ""}</a>`).join("")}</div>
            <label class="btn wide">${App.icon("clip", "sm")} Dodaj zdjęcie, screen lub PDF<input type="file" id="pl-file" accept="image/*,application/pdf,.pkpass" multiple hidden></label>
            <p class="f-hint" id="pl-file-note">${files.length ? "Dotknij biletu, by pokazać go na pełnym ekranie (np. przy wejściu)." : "Bilet pokaże się na pełnym ekranie, a kod (QR, kreskowy) aplikacja odczyta sama."}</p></div></div>` : ""}
          <div class="fsec"><h2 class="section">Koszt i notatka</h2>
            <div class="grid2 price">
              <label class="field"><span>Koszt</span><input name="cost" inputmode="decimal" placeholder="np. 25" value="${esc(v.cost)}"></label>
              <label class="field"><span>Waluta</span><input name="currency" maxlength="5" autocapitalize="characters" value="${esc(v.currency || "PLN")}"></label>
            </div>
            <label class="field"><span>Notatka</span>
              <textarea name="note" rows="3" placeholder="np. bilety kupić online, zamknięte w poniedziałki">${esc(v.note)}</textarea></label>
          </div>
          ${App.Photos ? `<div class="fsec"><h2 class="section">Zdjęcie</h2><div class="field"><span class="sr">Zdjęcie</span>
            <div class="pl-ph-box" id="pl-ph">${photoBox(v.photo)}</div>
            <div class="pl-ph-btns">
              <button type="button" class="btn" id="pl-ph-find">${App.icon("search", "sm")} Znajdź</button>
              <label class="btn">${App.icon("camera", "sm")} Własne<input type="file" id="pl-ph-file" accept="image/*" hidden></label>
              <button type="button" class="btn" id="pl-ph-del"${v.photo ? "" : " hidden"}>${App.icon("trash", "sm")} Usuń</button>
            </div></div></div>` : ""}
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">${it ? "Zapisz zmiany" : "Dodaj do planu"}</button>
            ${it ? `<button class="btn danger wide" type="button" id="del">${App.icon("trash", "sm")} Usuń punkt</button>` : ""}
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#pl-form");
        if (!it && !fromMap && !newFiles.length) f.title.focus();
        // bilety / screeny: zapisywane razem z punktem (tickets.js → addFiles)
        const fileBox = view.querySelector("#pl-files");
        const showNew = () => {
          if (!fileBox) return;
          fileBox.querySelectorAll(".pl-file.new").forEach(x => x.remove());
          fileBox.insertAdjacentHTML("beforeend", newFiles.map((x, i) => `<span class="pl-file new">${App.icon(/pdf/i.test(x.type) || /\.pdf$/i.test(x.name) ? "doc" : "image", "sm")} ${esc(x.name || "plik")} <button type="button" class="pl-file-x" data-i="${i}" aria-label="Usuń plik">✕</button></span>`).join(""));
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

  App.Plan = { fromFiles, tripMenu, tripSheet, switchBtn, infoFromText, segEvents, CATS, catOf, pickTrip, tripOptions, tripTabs, bindTripTabs, routeIcon, placeInDay, todayCard, mergeDay, byOrder, inTime };
})();
