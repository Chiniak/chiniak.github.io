/* Tripwillow – etap 8 (pkt 37): budżet podróży i wydatki.
   Trasy:
     #/budzet/:tripId   podsumowanie, kategorie, lista wydatków, szybkie dodawanie, budżet i kursy walut
     #/wydatek/:id      edycja i usuwanie wydatku
   Wydatek (magazyn "expenses"): { id, tripId, date, title, amount, currency, cat, paidBy?, split? }
   Wspólna podróż (etap 10, rozliczenie w split.js): trips.people = ["Ja", "Ania"], paidBy = kto płacił, split = za kogo (brak = wszyscy).
   W podróży (trips): budget: { amount, currency } – waluta główna (domyślnie PLN), rates: { EUR: 4.31, ... } – ile waluty głównej za 1 jednostkę.
   Do wydanych doliczane są też ceny z odcinków (bilety, noclegi); koszty z planu dnia pokazane osobno jako „zaplanowane”. */
(function () {
  const { esc, plural } = App;

  const CATS = {
    transport: { icon: "🚆", ic: "train", name: "Transport" },
    nocleg: { icon: "🏨", ic: "bed", name: "Noclegi" },
    jedzenie: { icon: "🍽️", ic: "food", name: "Jedzenie" },
    atrakcje: { icon: "🎟️", ic: "ticket", name: "Atrakcje" },
    zakupy: { icon: "🛍️", ic: "bag", name: "Zakupy" },
    inne: { icon: "📦", ic: "box", name: "Inne" },
  };
  const num = v => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const money = (n, cur) => `${(Math.round(n * 100) / 100).toLocaleString((self.I18N ? I18N.locale : "pl-PL"), { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })} ${cur}`;
  const cur3 = c => (c || "").trim().toUpperCase().slice(0, 5);

  async function load(tripId) {
    const [trip, expenses, segs, plan] = await Promise.all([
      DB.get("trips", tripId), DB.byIndex("expenses", "tripId", tripId), DB.byIndex("segments", "tripId", tripId), DB.byIndex("planItems", "tripId", tripId)]);
    if (!trip) return null;
    const home = cur3(trip.budget && trip.budget.currency) || "PLN";
    const rates = { ...(trip.rates || {}), [home]: 1 };
    const toHome = (amount, c) => { const r = rates[cur3(c) || home]; return r ? amount * r : null; };

    // wszystkie pozycje „wydane”: własne wydatki + ceny z odcinków
    const items = expenses.map(e => ({ ...e, kind: "exp", amount: num(e.amount), currency: cur3(e.currency) || home }))
      .concat(segs.filter(s => num(s.price) > 0).map(s => {
        const T = App.Trips.typeOf(s);
        return { id: s.id, kind: "seg", date: (s.depart || trip.start).slice(0, 10), cat: s.type === "nocleg" ? "nocleg" : "transport",
          icon: T.icon, ic: App.icon.type(s.type), title: s.type === "nocleg" ? (s.name || "Nocleg") : `${s.from || "?"} → ${s.to || "?"}`, amount: num(s.price), currency: cur3(s.currency) || home };
      }));
    let spent = 0;
    const byCat = {}, unknown = {};
    for (const i of items) {
      const h = toHome(i.amount, i.currency);
      if (h == null) { unknown[i.currency] = (unknown[i.currency] || 0) + i.amount; continue; }
      i.home = h; spent += h;
      byCat[i.cat in CATS ? i.cat : "inne"] = (byCat[i.cat in CATS ? i.cat : "inne"] || 0) + h;
    }
    let planned = 0;
    const plannedUnknown = {};
    for (const p of plan) {
      const c = num(p.cost); if (!c || !p.date) continue; // pomysły bez dnia nie są liczone
      const h = toHome(c, p.currency || home);
      if (h == null) plannedUnknown[cur3(p.currency)] = (plannedUnknown[cur3(p.currency)] || 0) + c; else planned += h;
    }
    const currencies = [...new Set(items.map(i => i.currency).concat(plan.filter(p => num(p.cost)).map(p => cur3(p.currency) || home)))].filter(c => c && c !== home);
    return { trip, home, rates, items, spent, byCat, unknown, planned, plannedUnknown, currencies, budget: trip.budget ? num(trip.budget.amount) : 0 };
  }

  // średni kurs NBP (ile PLN za 1 jednostkę) albo null; tabela A, a gdy waluty tam nie ma – tabela B (np. VND, LAK, KHR, MMK)
  async function nbp(c) {
    try {
      let r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${encodeURIComponent(c)}/?format=json`);
      if (r.status === 404) r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/b/${encodeURIComponent(c)}/?format=json`);
      if (!r.ok) return null;
      const j = await r.json();
      return +j.rates[0].mid.toPrecision(6);
    } catch (e) { return null; } // brak internetu
  }

  async function summary(tripId) {
    const d = await load(tripId);
    return d ? { spent: d.spent, budget: d.budget, home: d.home, unknown: Object.keys(d.unknown).length } : null;
  }

  /* ================= BUDŻET PODRÓŻY ================= */
  App.route(/^\/budzet\/([\w-]+)$/, async ([id]) => {
    const d = await load(id);
    if (!d) { location.replace("#/podroze"); return ""; }
    const { trip, home } = d;
    const today = App.todayStr();
    const days = App.dayDiff(trip.start, trip.end) + 1;
    const left = d.budget ? d.budget - d.spent : 0;
    const pct = d.budget ? Math.min(100, Math.round(d.spent / d.budget * 100)) : 0;
    const ongoing = trip.start <= today && today <= trip.end;
    const daysLeft = ongoing ? App.dayDiff(today, trip.end) + 1 : trip.start > today ? days : 0;
    const unknownTxt = Object.entries(d.unknown).map(([c, v]) => money(v, c)).join(" + ");

    const I = (n, c) => App.icon(n, c);
    const catIco = k => `<span class="li-ico bg-ico c-${k in CATS ? k : "inne"}" aria-hidden="true">${I((CATS[k] || CATS.inne).ic)}</span>`;
    const summaryCard = `
      <section class="bg-sum${d.budget && d.spent > d.budget ? " is-over" : ""}">
        <div class="bg-top"><span>Wydano</span><b>${money(d.spent, home)}</b></div>
        ${d.budget ? `
          <div class="bar bg-bar${d.spent > d.budget ? " over" : ""}"><i style="width:${pct}%"></i></div>
          <div class="bg-sub">${left >= 0 ? `Zostało <b>${money(left, home)}</b> z ${money(d.budget, home)}` : `<b class="over-txt">Przekroczono o ${money(-left, home)}</b> (budżet ${money(d.budget, home)})`}</div>
          ${left > 0 && daysLeft > 0 ? `<div class="bg-chips"><span class="chip accent">ok. ${money(left / daysLeft, home)} na dzień</span><span class="chip">${daysLeft} ${plural(daysLeft, "dzień", "dni", "dni")}</span></div>` : ""}`
          : `<div class="bg-sub">Ustaw budżet niżej, by widzieć, ile zostało.</div>`}
        ${d.planned ? `<div class="bg-sub bg-planned">${I("plan", "sm")} W planie dnia zaplanowano jeszcze ${money(d.planned, home)}</div>` : ""}
      </section>
      ${unknownTxt ? `<p class="td-note bg-warn">${I("alert", "sm")}<span>Bez przeliczenia (brak kursu): ${unknownTxt} – uzupełnij kurs niżej</span></p>` : ""}`;

    const max = Math.max(1, ...Object.values(d.byCat));
    const cats = Object.entries(CATS).filter(([k]) => d.byCat[k]).map(([k, C]) => `
      <div class="bg-cat">
        ${catIco(k)}
        <span class="bg-cat-main"><span class="bg-cat-name">${C.name}</span>
          <span class="bg-cat-bar"><i style="width:${Math.round(d.byCat[k] / max * 100)}%"></i></span></span>
        <b>${money(d.byCat[k], home)}</b>
      </div>`).join("");

    const catOpts = Object.entries(CATS).map(([k, C]) => `<option value="${k}" ${k === "jedzenie" ? "selected" : ""}>${C.name}</option>`).join("");
    const curList = [home, ...d.currencies];
    const lastCur = await DB.getSetting(`budgetCur:${id}`, ongoing && d.currencies[0] ? d.currencies[0] : home);
    const defDate = ongoing ? today : trip.start > today ? trip.start : trip.end;
    const people = trip.people || [];
    const lastPayer = await DB.getSetting(`budgetPayer:${id}`, people[0] || "");
    const who = people.length > 1 ? `
        <div class="bg-add-row bg-who">
          <label><span class="sr">Kto płacił</span><select name="paidBy">${people.map(n => `<option ${n === lastPayer ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
          <label><span class="sr">Za kogo</span><select name="split"><option value="">za wszystkich</option>${people.map(n => `<option value="${esc(n)}">tylko za: ${esc(n)}</option>`).join("")}</select></label>
        </div>` : "";
    const add = `
      <h2 class="section">Dodaj wydatek</h2>
      <form class="bg-add" id="bg-add" autocomplete="off">
        <input name="title" maxlength="60" placeholder="Na co? np. kawa, muzeum" aria-label="Na co">
        <div class="bg-add-row bg-amt">
          <input name="amount" inputmode="decimal" placeholder="Kwota" aria-label="Kwota" required>
          <input name="currency" list="bg-curs" maxlength="5" autocapitalize="characters" value="${esc(lastCur)}" aria-label="Waluta">
        </div>
        <div class="bg-add-row bg-meta">
          <select name="cat" aria-label="Kategoria">${catOpts}</select>
          <input type="date" name="date" value="${defDate}" aria-label="Dzień" class="bg-date">
        </div>
        ${who}
        <button class="btn primary wide" type="submit">${I("plus", "sm")} Dodaj wydatek</button>
        <datalist id="bg-curs">${[...new Set(curList.concat(["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "CNY", "THB", "VND", "LAK"]))].map(c => `<option value="${c}">`).join("")}</datalist>
      </form>`;

    // lista wg dni (najnowsze na górze)
    const byDay = {};
    d.items.forEach(i => (byDay[i.date] = byDay[i.date] || []).push(i));
    const list = Object.keys(byDay).sort().reverse().map(day => {
      const rows = byDay[day];
      const sum = rows.reduce((s, i) => s + (i.home || 0), 0);
      return `
        <div class="bg-day">
          <h2 class="section bg-day-h"><span>${App.fmtDayLong(day)}</span><span>${money(sum, home)}</span></h2>
          <div class="list">${rows.map(i => `
            <a class="li bg-row" href="${i.kind === "seg" ? `#/odcinek/${i.id}` : `#/wydatek/${i.id}`}">
              ${i.kind === "seg" ? `<span class="li-ico bg-ico c-${i.cat}" aria-hidden="true">${i.ic}</span>` : catIco(i.cat)}
              <span class="li-main"><b class="bg-row-name">${esc(i.title || (CATS[i.cat] || CATS.inne).name)}</b>
                <small>${[(CATS[i.cat] || CATS.inne).name, i.kind === "seg" ? "z biletów" : "", people.length > 1 && i.paidBy ? `płaci ${esc(i.paidBy)}${i.split && i.split.length && i.split.length < people.length ? ` za: ${i.split.map(esc).join(", ")}` : ""}` : ""].filter(Boolean).join(" · ")}</small></span>
              <span class="bg-row-amt"><b>${money(i.amount, i.currency)}</b>${i.currency !== home && i.home != null ? `<small>${money(i.home, home)}</small>` : ""}</span>
            </a>`).join("")}</div>
        </div>`;
    }).join("") || `<p class="f-hint pk-empty">Brak wydatków. Ceny biletów i noclegów z podróży wliczą się same.</p>`;

    const rateRows = d.currencies.map(c => `
      <label class="bg-rate-row"><span>1 ${c} =</span>
        <span class="bg-rate"><input name="rate_${c}" inputmode="decimal" value="${d.rates[c] ? String(d.rates[c]).replace(".", ",") : ""}" placeholder="kurs"> ${home}</span></label>`).join("");

    return {
      title: "Budżet",
      back: `#/podroze/${id}`,
      html: `${summaryCard}${cats ? `<h2 class="section">Kategorie</h2><div class="list bg-cats">${cats}</div>` : ""}
        ${people.length > 1 ? `<div class="list bg-split-link"><a class="li" href="#/rozliczenie/${id}"><span class="li-ico">${I("users")}</span><span class="li-main"><b>Rozliczenie</b><small>kto komu ile oddaje · ${people.length} ${plural(people.length, "osoba", "osoby", "osób")}</small></span>${I("chev")}</a></div>` : ""}
        <div class="list bg-split-link"><a class="li" href="#/waluty/${id}"><span class="li-ico">${I("currency")}</span><span class="li-main"><b>Przelicznik walut</b><small>offline, ściąga kwot, kursy na drogę</small></span>${I("chev")}</a></div>
        ${add}
        <div id="bg-list">${list}</div>
        <h2 class="section">Budżet i waluty</h2>
        <form class="form bg-cfg" id="bg-cfg">
          <div class="grid2 price">
            <label class="field"><span>Budżet całej podróży</span><input name="budget" inputmode="decimal" value="${d.budget ? String(d.budget).replace(".", ",") : ""}" placeholder="np. 3000"></label>
            <label class="field"><span>Waluta główna</span><input name="home" maxlength="5" autocapitalize="characters" value="${home}"></label>
          </div>
          <label class="field"><span>Uczestnicy – do dzielenia kosztów (oddziel przecinkami)</span>
            <input name="people" maxlength="200" placeholder="np. Ja, Ania, Tomek" value="${esc(people.join(", "))}"></label>
          ${rateRows ? `<div class="field"><span>Kursy do przeliczenia (ile ${home} za 1 jednostkę)</span><div class="list bg-rates">${rateRows}</div></div>` : ""}
          ${rateRows && home === "PLN" ? `<button type="button" class="btn wide" id="bg-nbp">${I("bank", "sm")} Pobierz kursy z NBP</button>` : ""}
          <button class="btn primary wide" type="submit">Zapisz budżet i kursy</button>
        </form>`,
      after(view) {
        const f = view.querySelector("#bg-add");
        f.addEventListener("submit", async e => {
          e.preventDefault();
          const amount = num(f.amount.value);
          if (!(amount > 0)) { App.toast("Podaj kwotę"); f.amount.focus(); return; }
          const currency = cur3(f.currency.value) || home;
          const split = f.split && f.split.value ? { paidBy: f.paidBy.value, split: [f.split.value] } : f.paidBy ? { paidBy: f.paidBy.value } : {};
          await DB.put("expenses", { tripId: id, title: f.title.value.trim(), amount, currency, cat: f.cat.value, date: f.date.value || defDate, ...split });
          if (f.paidBy) await DB.setSetting(`budgetPayer:${id}`, f.paidBy.value);
          await DB.setSetting(`budgetCur:${id}`, currency);
          App.toast(`Dodano ${money(amount, currency)}${!d.rates[currency] && currency !== home ? " · uzupełnij kurs " + currency : ""}`);
          App.render();
        });

        const cfg = view.querySelector("#bg-cfg");
        cfg.addEventListener("submit", async e => {
          e.preventDefault();
          const t = await DB.get("trips", id);
          const newHome = cur3(cfg.home.value) || "PLN";
          const rates = { ...(t.rates || {}) };
          const info = { ...(t.ratesInfo || {}) };
          d.currencies.forEach(c => {
            const inp = cfg[`rate_${c}`], v = num(inp.value);
            if (v > 0) { if (v !== rates[c]) info[c] = { at: App.todayStr(), src: inp.dataset.src || "ręcznie" }; rates[c] = v; } else { delete rates[c]; delete info[c]; }
          });
          const ppl = [...new Set(cfg.people.value.split(",").map(x => x.trim().slice(0, 30)).filter(Boolean))];
          await DB.put("trips", { ...t, budget: { amount: num(cfg.budget.value), currency: newHome }, rates, ratesInfo: info, people: ppl });
          App.toast("Zapisano");
          App.render();
        });

        const nbpBtn = view.querySelector("#bg-nbp");
        if (nbpBtn) nbpBtn.onclick = async () => {
          nbpBtn.disabled = true; nbpBtn.textContent = "Pobieram…";
          let ok = 0;
          for (const c of d.currencies) {
            const v = await nbp(c);
            if (v) { cfg[`rate_${c}`].value = String(v).replace(".", ","); cfg[`rate_${c}`].dataset.src = "NBP"; ok++; }
          }
          nbpBtn.disabled = false; nbpBtn.innerHTML = `${App.icon("bank", "sm")} Pobierz kursy z NBP`;
          App.toast(ok ? `Pobrano ${ok} ${plural(ok, "kurs", "kursy", "kursów")} – zapisz` : "Nie udało się pobrać (brak internetu?) – wpisz ręcznie");
        };
      },
    };
  });

  /* ================= EDYCJA WYDATKU ================= */
  App.route(/^\/wydatek\/([\w-]+)$/, async ([id]) => {
    const e = await DB.get("expenses", id);
    if (!e) { location.replace("#/podroze"); return ""; }
    const back = `#/budzet/${e.tripId}`;
    const trip = await DB.get("trips", e.tripId);
    const people = (trip && trip.people) || [];
    const forAll = !e.split || !e.split.length;
    const whoHtml = people.length > 1 ? `
          <label class="field"><span>Kto płacił</span><select name="paidBy">${people.concat(e.paidBy && !people.includes(e.paidBy) ? [e.paidBy] : [])
            .map(n => `<option ${n === (e.paidBy || people[0]) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
          <fieldset class="field"><legend>Za kogo</legend><div class="bg-split">${people.map(n => `
            <label class="type-chip"><input type="checkbox" name="split" value="${esc(n)}" ${forAll || e.split.includes(n) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}</div></fieldset>` : "";
    return {
      title: "Wydatek",
      back,
      html: `
        <form id="ex-form" class="form" novalidate>
          <div class="fsec">
            <label class="field"><span>Na co</span><input name="title" maxlength="60" value="${esc(e.title)}"></label>
            <div class="grid2 price">
              <label class="field"><span>Kwota</span><input name="amount" inputmode="decimal" value="${String(e.amount).replace(".", ",")}"></label>
              <label class="field"><span>Waluta</span><input name="currency" maxlength="5" autocapitalize="characters" value="${esc(e.currency)}"></label>
            </div>
            <label class="field"><span>Dzień</span><input type="date" name="date" value="${esc(e.date)}"></label>
          </div>
          <div class="fsec"><h2 class="section">Kategoria</h2>
            <div class="type-chips" role="radiogroup" aria-label="Kategoria">${Object.entries(CATS).map(([k, C]) => `
              <label class="type-chip"><input type="radio" name="cat" value="${k}" ${k === e.cat ? "checked" : ""}><span><b aria-hidden="true">${App.icon(C.ic, "sm")}</b>${C.name}</span></label>`).join("")}</div></div>
          ${whoHtml ? `<div class="fsec"><h2 class="section">Podział</h2>${whoHtml}</div>` : ""}
          <p class="error" id="err" hidden></p>
          <div class="f-actions">
            <button class="btn primary wide" type="submit">Zapisz</button>
            <button class="btn danger wide" type="button" id="del">${App.icon("trash", "sm")} Usuń wydatek</button>
          </div>
        </form>`,
      after(view) {
        const f = view.querySelector("#ex-form");
        f.addEventListener("submit", async ev => {
          ev.preventDefault();
          const amount = num(f.amount.value);
          if (!(amount > 0)) { const p = view.querySelector("#err"); p.textContent = "Podaj kwotę większą od zera."; p.hidden = false; return; }
          const fd = new FormData(f);
          const who = {};
          if (people.length > 1) {
            const split = fd.getAll("split");
            if (!split.length) { const p = view.querySelector("#err"); p.textContent = "Zaznacz, za kogo był wydatek."; p.hidden = false; return; }
            who.paidBy = fd.get("paidBy");
            who.split = split.length === people.length ? [] : split;
          }
          await DB.put("expenses", { ...e, ...who, title: f.title.value.trim(), amount, currency: cur3(f.currency.value) || e.currency, cat: fd.get("cat"), date: f.date.value || e.date });
          App.toast("Zapisano");
          App.back(back);
        });
        view.querySelector("#del").onclick = async () => {
          if (!confirm("Usunąć ten wydatek?")) return;
          await DB.del("expenses", e.id);
          App.toast("Usunięto");
          App.back(back);
        };
      },
    };
  });

  App.Budget = { summary, load, nbp, CATS, money, num, cur3 };
})();
