/* Podróżnik – etap 4: pakowanie i przygotowania.
   Trasy:
     #/pakowanie                      wybiera podróż (trwającą, najbliższą albo ostatnio otwieraną)
     #/pakowanie/:tripId?l=todo       lista rzeczy (domyślnie) albo „Przed wyjazdem” (l=todo)
     #/pakowanie/:tripId/szablony     szablony list: wbudowane i własne
     #/rzecz/:id                      edycja (i usuwanie) rzeczy lub zadania
   Rzecz / zadanie (magazyn "packItems"):
     { id, tripId, list: "pack" | "todo", name, cat, qty, status: "buy" | "pack" | "done", due?, note, order }
     dla zadań (list "todo") status to "pack" (do zrobienia) albo "done" (zrobione)
   Własne szablony (magazyn "templates"): { id, name, icon, items: [{ list, name, cat, qty }] } */
(function () {
  const { esc, plural } = App;

  const CATS = {
    dokumenty: { icon: "🪪", name: "Dokumenty" },
    ubrania: { icon: "👕", name: "Ubrania" },
    elektronika: { icon: "🔌", name: "Elektronika" },
    kosmetyki: { icon: "🧴", name: "Kosmetyki" },
    leki: { icon: "💊", name: "Leki" },
    jedzenie: { icon: "🥪", name: "Jedzenie" },
    inne: { icon: "📦", name: "Inne" },
  };
  const STATUS = { buy: "Do kupienia", pack: "Do spakowania", done: "Spakowane" };

  /* ---------- wbudowane szablony ---------- */
  const P = (cat, ...names) => names.map(n => ({ list: "pack", cat, name: n }));
  const TODO = (...names) => names.map(n => ({ list: "todo", cat: "inne", name: n }));
  const BUILTIN = [
    { id: "b-podstawa", icon: "🧳", name: "Podstawa – każdy wyjazd", items: [
      ...P("dokumenty", "Dowód osobisty / paszport", "Portfel i karty", "Prawo jazdy", "Karta EKUZ / ubezpieczenie"),
      ...P("elektronika", "Telefon", "Ładowarka do telefonu", "Powerbank", "Słuchawki"),
      ...P("kosmetyki", "Szczoteczka i pasta", "Dezodorant", "Kosmetyczka"),
      ...P("leki", "Leki stałe", "Tabletki przeciwbólowe"),
      ...P("ubrania", "Bielizna", "Skarpetki", "Piżama"),
      ...TODO("Sprawdzić ważność dokumentów", "Naładować telefon i powerbank", "Sprawdzić prognozę pogody", "Wynieść śmieci, podlać kwiaty", "Zamknąć okna, wyłączyć urządzenia"),
    ] },
    { id: "b-weekend", icon: "🏙️", name: "Weekend w mieście", items: [
      ...P("ubrania", "Spodnie", "Koszulki", "Bluza / sweter", "Wygodne buty"),
      ...P("inne", "Plecak / torba", "Parasol"),
    ] },
    { id: "b-lot", icon: "✈️", name: "Lot z bagażem podręcznym", items: [
      ...P("kosmetyki", "Przezroczysta kosmetyczka na płyny (do 100 ml)"),
      ...P("elektronika", "Powerbank w bagażu podręcznym (nie w rejestrowanym!)"),
      ...P("inne", "Bagaż w wymiarach przewoźnika", "Długopis do formularzy"),
      ...TODO("Odprawa online", "Karta pokładowa w aplikacji (Bilety)", "Sprawdzić wymiary i wagę bagażu", "Być na lotnisku 2 h przed wylotem"),
    ] },
    { id: "b-sluzbowo", icon: "💼", name: "Wyjazd służbowy", items: [
      ...P("elektronika", "Laptop", "Ładowarka do laptopa", "Adapter do gniazdek"),
      ...P("ubrania", "Koszula", "Marynarka", "Eleganckie buty"),
      ...P("inne", "Wizytówki", "Notes i długopis"),
      ...TODO("Potwierdzić spotkania", "Przygotować dokumenty / prezentację", "Ustawić autoodpowiedź w mailu"),
    ] },
    { id: "b-zima", icon: "❄️", name: "Zima", items: [
      ...P("ubrania", "Kurtka zimowa", "Czapka", "Szalik", "Rękawiczki", "Ciepłe skarpety", "Bielizna termiczna", "Buty zimowe"),
      ...P("kosmetyki", "Krem ochronny / pomadka"),
    ] },
    { id: "b-lato", icon: "🏖️", name: "Plaża / lato", items: [
      ...P("ubrania", "Strój kąpielowy", "Klapki", "Kapelusz / czapka", "Szorty"),
      ...P("kosmetyki", "Krem z filtrem", "Balsam po opalaniu"),
      ...P("inne", "Ręcznik plażowy", "Okulary przeciwsłoneczne", "Butelka na wodę"),
    ] },
  ];

  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.created || "").localeCompare(b.created || "");
  const norm = s => String(s || "").trim().toLowerCase();

  // podsumowanie pakowania (używane też na stronie podróży i – w etapie 5 – w przypomnieniach)
  async function summary(tripId) {
    const all = await DB.byIndex("packItems", "tripId", tripId);
    const pack = all.filter(i => i.list !== "todo"), todo = all.filter(i => i.list === "todo");
    return {
      total: pack.length, done: pack.filter(i => i.status === "done").length, buy: pack.filter(i => i.status === "buy").length,
      todo: todo.length, todoDone: todo.filter(i => i.status === "done").length,
      overdue: todo.filter(i => i.status !== "done" && i.due && i.due < App.todayStr()).length,
    };
  }

  async function addItems(tripId, list, existing) {
    const have = new Set(existing.map(i => `${i.list}|${norm(i.name)}`));
    let order = existing.reduce((m, i) => Math.max(m, i.order ?? 0), 0) + 1, added = 0, skipped = 0;
    for (const it of list) {
      const key = `${it.list || "pack"}|${norm(it.name)}`;
      if (!norm(it.name) || have.has(key)) { skipped++; continue; }
      have.add(key);
      await DB.put("packItems", { tripId, list: it.list || "pack", name: it.name.trim(), cat: it.cat || "inne", qty: it.qty || "", status: "pack", order: order++ });
      added++;
    }
    return { added, skipped };
  }

  /* ================= WYBÓR PODRÓŻY ================= */
  App.route(/^\/pakowanie$/, async () => {
    const trips = await DB.all("trips");
    if (!trips.length) return App.empty("🧳", "Co zabrać",
      "Najpierw dodaj podróż – potem zrobisz do niej listę rzeczy i zadań przed wyjazdem.",
      `<a class="btn primary" href="#/podroze/nowa">Dodaj podróż</a>`);
    const last = await DB.getSetting("packTrip", null);
    const t = trips.find(x => x.id === last && x.end >= App.todayStr()) || App.Plan.pickTrip(trips);
    location.replace(`#/pakowanie/${t.id}`);
    return "";
  });

  /* ================= LISTA ================= */
  const checkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  App.route(/^\/pakowanie\/([\w-]+)$/, async ([id], q) => {
    const [trip, trips] = await Promise.all([DB.get("trips", id), DB.all("trips")]);
    if (!trip) { location.replace("#/pakowanie"); return ""; }
    DB.setSetting("packTrip", id);
    const mode = q.l === "todo" ? "todo" : "pack";
    let items = (await DB.byIndex("packItems", "tripId", id)).sort(byOrder);
    let hideDone = await DB.getSetting("packHideDone", false);
    const today = App.todayStr();

    const left = App.dayDiff(today, trip.start);
    const when = left > 1 ? `wyjazd za ${left} dni` : left === 1 ? "wyjazd jutro" : left === 0 ? "wyjazd dziś" : trip.end >= today ? "podróż trwa" : "podróż zakończona";
    const head = App.Plan.tripTabs(trips, id, x => `#/pakowanie/${x}${mode === "todo" ? "?l=todo" : ""}`, "pk-arch") + `
      <header class="pl-head">
        <div class="pl-head-name">
          <h2>${esc(trip.name)}</h2>
          ${trips.length > 1 ? `<span class="pl-head-chev" aria-hidden="true">${App.icon("chev")}</span>
            ${App.Plan.switchBtn("pk-trip", trip)}` : ""}
        </div>
        <p class="pl-info">${App.fmtRange(trip.start, trip.end)} · ${when}</p>
      </header>`;

    const counts = () => {
      const pack = items.filter(i => i.list !== "todo"), todo = items.filter(i => i.list === "todo");
      return { pack, todo, done: pack.filter(i => i.status === "done").length, buy: pack.filter(i => i.status === "buy").length, tDone: todo.filter(i => i.status === "done").length };
    };
    const tabs = () => { const c = counts(); return `
        <button type="button" data-l="pack" aria-pressed="${mode === "pack"}"><span>Rzeczy</span> <small>${c.done}/${c.pack.length}</small></button>
        <button type="button" data-l="todo" aria-pressed="${mode === "todo"}"><span>Przed wyjazdem</span> <small>${c.tDone}/${c.todo.length}</small></button>`; };

    const catOptions = Object.entries(CATS).map(([k, C]) => `<option value="${k}">${C.icon} ${C.name}</option>`).join("");
    const addBar = `
      <form class="pk-add" id="pk-add" autocomplete="off">
        <input name="name" maxlength="80" placeholder="${mode === "todo" ? "Dodaj zadanie, np. odprawa online" : "Dodaj rzecz, np. ładowarka"}" aria-label="Nazwa">
        ${mode === "pack" ? `<select name="cat" aria-label="Kategoria">${catOptions}</select>` : `<input type="date" name="due" aria-label="Termin (opcjonalnie)" title="Termin (opcjonalnie)">`}
        <button class="btn primary" type="submit" aria-label="Dodaj">${App.icon("plus")}</button>
      </form>`;

    // pierścień postępu: spakowane rzeczy (albo zrobione zadania na drugiej zakładce)
    function progress() {
      const c = counts();
      const [n, all] = mode === "todo" ? [c.tDone, c.todo.length] : [c.done, c.pack.length];
      if (!all) return ""; // pusta lista – sam stan pusty niżej
      const pct = Math.round(n / all * 100);
      const R = 26, L = 2 * Math.PI * R;
      const late = c.todo.filter(i => i.status !== "done" && i.due && i.due < today).length;
      const title = !all ? (mode === "todo" ? "Brak zadań" : "Lista jest pusta")
        : n === all ? (mode === "todo" ? "Wszystko zrobione" : "Wszystko spakowane")
        : mode === "todo" ? `Zostało ${all - n} ${plural(all - n, "zadanie", "zadania", "zadań")}` : `Zostało ${all - n} ${plural(all - n, "rzecz", "rzeczy", "rzeczy")}`;
      const chips = [
        `<span class="pk-prog-top">${mode === "todo" ? "Zrobione" : "Spakowane"} ${n}/${all}</span>`,
        c.buy && mode === "pack" ? `<span class="chip warn">${App.icon("cart")} do kupienia: ${c.buy}</span>` : "",
        late && mode === "todo" ? `<span class="chip err">po terminie: ${late}</span>` : "",
      ].filter(Boolean).join("");
      return `
        <div class="pk-progress${all && n === all ? " is-full" : ""}">
          <svg class="pk-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${R}"/><circle class="on" cx="32" cy="32" r="${R}" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - pct / 100)).toFixed(1)}"/></svg>
          <span class="pk-pct">${all && n === all ? App.icon("check") : `${pct}<small>%</small>`}</span>
          <div class="pk-prog-main">
            <b>${title}</b>
            <div class="pk-prog-sub">${chips}</div>
          </div>
        </div>`;
    }

    // na zakładce „Rzeczy”: najbliższe niezrobione zadanie przed wyjazdem
    function nextTask() {
      if (mode !== "pack") return "";
      const open = items.filter(i => i.list === "todo" && i.status !== "done")
        .sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due || "").localeCompare(b.due || "") || byOrder(a, b));
      if (!open.length) return "";
      const t = open[0], late = t.due && t.due < today;
      return `
        <a class="pk-next${late ? " late" : ""}" href="#/pakowanie/${id}?l=todo">
          <span class="li-ico" aria-hidden="true">${App.icon(late ? "alert" : "clock")}</span>
          <span class="li-main"><small>Przed wyjazdem${open.length > 1 ? ` · jeszcze ${open.length}` : ""}</small><b>${esc(t.name)}</b>${t.due ? `<small class="pk-next-due">${late ? "po terminie · " : "do "}${App.fmtDay(t.due)}</small>` : ""}</span>
          ${App.icon("chev")}
        </a>`;
    }

    function row(i) {
      const buy = i.status === "buy", done = i.status === "done";
      const dueTxt = i.due ? `<span class="pk-due${!done && i.due < today ? " late" : ""}">${i.due < today && !done ? "po terminie · " : "do "}${App.fmtDay(i.due)}</span>` : "";
      return `
        <div class="pk-row${done ? " is-done" : ""}${buy ? " is-buy" : ""}" data-id="${i.id}">
          <button type="button" class="pk-check" data-act="check" aria-pressed="${done}" aria-label="${done ? "Odznacz" : mode === "todo" ? "Zrobione" : "Spakowane"}: ${esc(i.name)}">${checkIcon}</button>
          <a class="pk-name" href="#/rzecz/${i.id}">${esc(i.name)}${i.qty ? ` <span class="pk-qty">×${esc(i.qty)}</span>` : ""}${dueTxt}</a>
          ${mode === "pack" ? `<button type="button" class="pk-buy" data-act="buy" aria-pressed="${buy}" aria-label="Do kupienia: ${esc(i.name)}" title="Do kupienia">${App.icon("cart")}</button>` : ""}
        </div>`;
    }

    // nagłówek grupy: ikona, nazwa, licznik i (dla kategorii) mały pasek postępu
    const groupHead = (ico, name, count, full, pct) => `
      <h3 class="pk-cat">${ico ? `<span class="pk-cat-ico" aria-hidden="true">${ico}</span>` : ""}<span class="pk-cat-name">${name}</span>
        <span class="pk-count${full ? " full" : ""}">${count}</span>
        ${pct == null ? "" : `<i class="pk-mini" aria-hidden="true"><i style="width:${pct}%"></i></i>`}</h3>`;

    function listHtml() {
      const mine = items.filter(i => (i.list === "todo") === (mode === "todo"));
      if (!mine.length) return `
        <div class="pk-empty">
          <div class="wl-empty-art" aria-hidden="true">${App.icon(mode === "todo" ? "check" : "pack")}</div>
          <p>${mode === "todo" ? "Brak zadań przed wyjazdem." : "Lista rzeczy jest pusta."}</p>
          <a class="btn primary" href="#/pakowanie/${id}/szablony">${App.icon("list")} Wybierz z szablonu</a>
        </div>`;
      const visible = hideDone ? mine.filter(i => i.status !== "done") : mine;
      const hidden = mine.length - visible.length;
      let html = "";
      if (mode === "todo") {
        // najpierw z terminem (najbliższy na górze), potem bez terminu; zrobione osobno na końcu
        const sorted = visible.slice().sort((a, b) =>
          (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due || "").localeCompare(b.due || "") || byOrder(a, b));
        const open = sorted.filter(i => i.status !== "done"), done = sorted.filter(i => i.status === "done");
        if (open.length) html += `<div class="pk-group">${groupHead("", "Do zrobienia", open.length, false)}${open.map(row).join("")}</div>`;
        if (done.length) html += `<div class="pk-group">${groupHead("", "Zrobione", done.length, true)}${done.map(row).join("")}</div>`;
      } else {
        for (const [k, C] of Object.entries(CATS)) {
          const inCat = mine.filter(i => (CATS[i.cat] ? i.cat : "inne") === k);
          const shown = visible.filter(i => (CATS[i.cat] ? i.cat : "inne") === k);
          if (!shown.length) continue;
          const d = inCat.filter(i => i.status === "done").length;
          html += `<div class="pk-group">${groupHead(C.icon, C.name, `${d}/${inCat.length}`, d === inCat.length, Math.round(d / inCat.length * 100))}${shown.map(row).join("")}</div>`;
        }
      }
      if (hidden) html += `<p class="muted small pk-hidden">Ukryto ${hidden} ${mode === "todo" ? "zrobionych" : "spakowanych"}.</p>`;
      if (!visible.length && hidden) html = `<p class="pk-all">${mode === "todo" ? "Wszystko zrobione ✅" : "Wszystko spakowane 🎉"}</p>` + html;
      return html;
    }

    const tools = `
      <label class="sw pk-toggle"${items.some(i => (i.list === "todo") === (mode === "todo")) ? "" : " hidden"}><input type="checkbox" id="pk-hide" ${hideDone ? "checked" : ""}><span class="sw-ui" aria-hidden="true"></span><span>Ukryj ${mode === "todo" ? "zrobione" : "spakowane"}</span></label>
      <div class="list pk-tools">
        <a class="li" id="pk-tpl" href="#/pakowanie/${id}/szablony"><span class="li-ico" aria-hidden="true">${App.icon("list")}</span><span class="li-main"><b>Szablony</b><small>gotowe listy i Twoje własne</small></span>${App.icon("chev")}</a>
        <button type="button" class="li" id="pk-save"><span class="li-ico" aria-hidden="true">${App.icon("star")}</span><span class="li-main"><b>Zapisz jako szablon</b><small>na kolejne wyjazdy</small></span></button>
        <button type="button" class="li" id="pk-reset"><span class="li-ico" aria-hidden="true">${App.icon("undo")}</span><span class="li-main"><b>Odznacz wszystko</b><small>np. przed pakowaniem na powrót</small></span></button>
      </div>`;

    return {
      title: "Pakowanie",
      action: `<a class="icon-btn" href="#/podroze/${id}" aria-label="Podróż">${App.Plan.routeIcon}</a>`,
      html: `${head}<div id="pk-progress">${progress()}</div>
        <div class="seg pk-tabs" id="pk-tabs">${tabs()}</div>
        <div id="pk-next">${nextTask()}</div>${addBar}<div id="pk-list">${listHtml()}</div>${tools}`,
      after(view) {
        const $ = s => view.querySelector(s);
        const draw = () => { $("#pk-progress").innerHTML = progress(); $("#pk-list").innerHTML = listHtml(); $("#pk-tabs").innerHTML = tabs(); $("#pk-next").innerHTML = nextTask(); bindTabs();
          $(".pk-toggle").hidden = !items.some(i => (i.list === "todo") === (mode === "todo")); };
        const sel = $("#pk-trip");
        if (sel) sel.onclick = () => App.Plan.tripSheet(trips, id, v => location.replace(`#/pakowanie/${v}${mode === "todo" ? "?l=todo" : ""}`));
        App.Plan.bindTripTabs(view, "pk-arch", x => `#/pakowanie/${x}${mode === "todo" ? "?l=todo" : ""}`);
        const bindTabs = () => view.querySelectorAll("[data-l]").forEach(b => b.onclick = () => location.replace(`#/pakowanie/${id}${b.dataset.l === "todo" ? "?l=todo" : ""}`));
        bindTabs();

        // szybkie dodawanie – pole zostaje aktywne, można wpisywać jedno po drugim
        const form = $("#pk-add");
        form.addEventListener("submit", async e => {
          e.preventDefault();
          const name = form.name.value.trim();
          if (!name) return form.name.focus();
          if (items.some(i => i.list === mode && norm(i.name) === norm(name))) { App.toast("Już jest na liście"); form.name.select(); return; }
          const rec = await DB.put("packItems", {
            tripId: id, list: mode, name, cat: mode === "pack" ? form.cat.value : "inne", qty: "",
            status: "pack", due: mode === "todo" ? form.due.value : "", order: items.reduce((m, i) => Math.max(m, i.order ?? 0), 0) + 1,
          });
          items.push(rec);
          form.name.value = "";
          if (form.due) form.due.value = "";
          draw();
          form.name.focus();
        });

        // odhaczanie i „do kupienia” (bez przeładowania i przewijania strony)
        $("#pk-list").addEventListener("click", async e => {
          const b = e.target.closest("[data-act]");
          if (!b) return;
          const it = items.find(i => i.id === b.closest(".pk-row").dataset.id);
          if (b.dataset.act === "check") it.status = it.status === "done" ? "pack" : "done";
          else it.status = it.status === "buy" ? "pack" : "buy";
          Object.assign(it, await DB.put("packItems", it));
          if (navigator.vibrate && it.status === "done") navigator.vibrate(15);
          draw();
        });

        $("#pk-hide").onchange = async e => { hideDone = e.target.checked; await DB.setSetting("packHideDone", hideDone); draw(); };

        $("#pk-save").onclick = async () => {
          if (!items.length) return App.toast("Lista jest pusta");
          const name = prompt("Nazwa szablonu (np. „Narty”, „Wyjazd z dzieckiem”):", trip.name);
          if (!name || !name.trim()) return;
          await DB.put("templates", { name: name.trim().slice(0, 60), icon: "⭐",
            items: items.map(i => ({ list: i.list, name: i.name, cat: i.cat, qty: i.qty || "" })) });
          App.toast(`Zapisano szablon „${name.trim()}”`);
        };

        $("#pk-reset").onclick = async () => {
          const done = items.filter(i => i.status === "done" && (i.list === "todo") === (mode === "todo"));
          if (!done.length) return App.toast("Nic nie jest odhaczone");
          if (!confirm(`Odznaczyć ${done.length} ${plural(done.length, "pozycję", "pozycje", "pozycji")}? Przydaje się np. przed pakowaniem na powrót.`)) return;
          for (const i of done) { i.status = "pack"; Object.assign(i, await DB.put("packItems", i)); }
          draw();
        };
      },
    };
  });

  /* ================= SZABLONY ================= */
  App.route(/^\/pakowanie\/([\w-]+)\/szablony$/, async ([id]) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/pakowanie"); return ""; }
    const own = (await DB.all("templates")).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pl"));
    const card = (t, mine) => {
      const p = t.items.filter(i => i.list !== "todo").length, td = t.items.length - p;
      return `
        <div class="tpl">
          <button type="button" class="tpl-main" data-tpl="${t.id}">
            <span class="tpl-ico" aria-hidden="true">${t.icon || "📋"}</span>
            <span class="tpl-txt"><b>${esc(t.name)}</b>
              <span class="muted small">${p} ${plural(p, "rzecz", "rzeczy", "rzeczy")}${td ? ` · ${td} ${plural(td, "zadanie", "zadania", "zadań")}` : ""}</span></span>
          </button>
          ${mine ? `<button type="button" class="tpl-del" data-del="${t.id}" aria-label="Usuń szablon ${esc(t.name)}">${App.icon("trash")}</button>` : ""}
        </div>`;
    };
    return {
      title: "Szablony",
      back: `#/pakowanie/${id}`,
      html: `<div id="tpl-list">
        <p class="muted small tpl-intro">Dotknij szablonu, by dodać jego rzeczy do listy „${esc(trip.name)}”. Możesz łączyć kilka – rzeczy, które już są, zostaną pominięte.</p>
        ${own.length ? `<h2 class="section">Twoje szablony</h2><div class="list tpl-box">${own.map(t => card(t, true)).join("")}</div>` : ""}
        <h2 class="section">Gotowe szablony</h2>
        <div class="list tpl-box">${BUILTIN.map(t => card(t, false)).join("")}</div>
        <p class="muted small tpl-outro">Własny szablon zrobisz z dowolnej listy: „Zapisz jako szablon” pod listą pakowania.</p></div>`,
      after(view) {
        // nasłuch na elemencie tego widoku (nie na #view, który zostaje między ekranami)
        view.querySelector("#tpl-list").addEventListener("click", async e => {
          const apply = e.target.closest("[data-tpl]"), del = e.target.closest("[data-del]");
          if (apply) {
            const t = BUILTIN.find(x => x.id === apply.dataset.tpl) || own.find(x => x.id === apply.dataset.tpl);
            const existing = await DB.byIndex("packItems", "tripId", id);
            const { added, skipped } = await addItems(id, t.items, existing);
            App.toast(`Dodano ${added}${skipped ? ` · pominięto ${skipped} (już były)` : ""}`);
            App.back(`#/pakowanie/${id}`);
          } else if (del) {
            const t = own.find(x => x.id === del.dataset.del);
            if (!confirm(`Usunąć szablon „${t.name}”?`)) return;
            await DB.del("templates", t.id);
            App.render();
          }
        });
      },
    };
  });

  /* ================= EDYCJA RZECZY / ZADANIA ================= */
  App.route(/^\/rzecz\/([\w-]+)$/, async ([itemId]) => {
    const it = await DB.get("packItems", itemId);
    if (!it) { location.replace("#/pakowanie"); return ""; }
    const isTodo = it.list === "todo";
    const back = `#/pakowanie/${it.tripId}${isTodo ? "?l=todo" : ""}`;
    const cats = Object.entries(CATS).map(([k, C]) => `
      <label class="type-chip"><input type="radio" name="cat" value="${k}" ${k === (it.cat || "inne") ? "checked" : ""}>
        <span><b aria-hidden="true">${C.icon}</b>${C.name}</span></label>`).join("");
    const statuses = (isTodo ? { pack: "Do zrobienia", done: "Zrobione" } : STATUS);
    const statusSeg = Object.entries(statuses).map(([k, n]) =>
      `<label class="pk-st"><input type="radio" name="status" value="${k}" ${it.status === k ? "checked" : ""}><span>${n}</span></label>`).join("");
    return {
      title: isTodo ? "Zadanie" : "Rzecz do zabrania",
      back,
      html: `
        <form id="pk-form" class="form" novalidate>
          <div class="fsec">
            <label class="field"><span>Nazwa</span><input name="name" required maxlength="80" value="${esc(it.name)}"></label>
            ${isTodo
              ? `<label class="field"><span>Termin (opcjonalnie)</span><input type="date" name="due" value="${esc(it.due || "")}"></label>`
              : `<label class="field"><span>Ilość (opcjonalnie)</span><input name="qty" maxlength="10" inputmode="numeric" placeholder="np. 3" value="${esc(it.qty || "")}"></label>`}
          </div>
          ${isTodo ? "" : `<div class="fsec"><h2 class="section">Kategoria</h2><div class="type-chips" role="radiogroup" aria-label="Kategoria">${cats}</div></div>`}
          <div class="fsec"><h2 class="section">Stan</h2>
            <fieldset class="field"><legend class="sr">Stan</legend><div class="pk-sts">${statusSeg}</div></fieldset></div>
          <div class="fsec"><h2 class="section">Notatka</h2>
            <label class="field"><span class="sr">Notatka</span><textarea name="note" rows="2" placeholder="opcjonalnie">${esc(it.note || "")}</textarea></label></div>
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">Zapisz</button>
            <button class="btn danger wide" type="button" id="del">${App.icon("trash", "sm")} Usuń</button>
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#pk-form");
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          for (const k in d) d[k] = String(d[k]).trim();
          if (!d.name) { const p = view.querySelector("#err"); p.textContent = "Podaj nazwę."; p.hidden = false; return; }
          await DB.put("packItems", { ...it, ...d });
          App.toast("Zapisano");
          App.back(back);
        });
        view.querySelector("#del").onclick = async () => {
          if (!confirm(`Usunąć „${it.name}”?`)) return;
          await DB.del("packItems", it.id);
          App.toast("Usunięto");
          App.back(back);
        };
      },
    };
  });

  App.Pack = { summary, BUILTIN, CATS };
})();
