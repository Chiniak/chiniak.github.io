/* Podróżnik – etap 10: rozliczenie wydatków w grupie (jak „split expenses” w Wanderlog).
   Trasa: #/rozliczenie/:tripId
   Uczestnicy: trips.people (ustawiane w budżecie). Wydatek: paidBy (kto płacił), split (za kogo; puste = wszyscy, po równo).
   Ceny biletów i noclegów z podróży są doliczane tylko, gdy wybrano, kto je opłacił (trips.segPayer) – wtedy za wszystkich.
   Kwoty przeliczane na walutę główną budżetu; wydatki bez kursu są pomijane (z ostrzeżeniem).
   Wynik: ile kto zapłacił, ile wynosi jego część, saldo i najkrótsza lista przelewów „kto → komu”. */
(function () {
  const { esc, plural } = App;
  const B = () => App.Budget;

  function settle(d) {
    const people = d.trip.people || [];
    const segPayer = d.trip.segPayer || "";
    const paid = Object.fromEntries(people.map(n => [n, 0])), share = Object.fromEntries(people.map(n => [n, 0]));
    let total = 0, skipped = 0, unassigned = 0;
    for (const i of d.items) {
      if (i.kind === "seg" && !segPayer) continue;
      if (i.home == null) { skipped++; continue; }
      const payer = i.kind === "seg" ? segPayer : i.paidBy || people[0];
      if (!(payer in paid)) { unassigned++; continue; } // osoba usunięta z listy uczestników
      const forWho = (i.split && i.split.length ? i.split : people).filter(n => n in share);
      if (!forWho.length) { unassigned++; continue; }
      paid[payer] += i.home;
      forWho.forEach(n => { share[n] += i.home / forWho.length; });
      total += i.home;
    }
    const balance = Object.fromEntries(people.map(n => [n, paid[n] - share[n]]));
    // przelewy: największy dłużnik płaci największemu wierzycielowi (najwyżej n−1 przelewów)
    const debt = people.filter(n => balance[n] < -0.005).map(n => [n, -balance[n]]).sort((a, b) => b[1] - a[1]);
    const cred = people.filter(n => balance[n] > 0.005).map(n => [n, balance[n]]).sort((a, b) => b[1] - a[1]);
    const transfers = [];
    while (debt.length && cred.length) {
      const x = Math.min(debt[0][1], cred[0][1]);
      transfers.push({ from: debt[0][0], to: cred[0][0], amount: x });
      debt[0][1] -= x; cred[0][1] -= x;
      if (debt[0][1] < 0.005) debt.shift();
      if (cred[0][1] < 0.005) cred.shift();
      debt.sort((a, b) => b[1] - a[1]); cred.sort((a, b) => b[1] - a[1]);
    }
    return { people, paid, share, balance, transfers, total, skipped, unassigned, segPayer };
  }

  App.route(/^\/rozliczenie\/([\w-]+)$/, async ([id]) => {
    const d = await B().load(id);
    if (!d) { location.replace("#/podroze"); return ""; }
    const m = v => B().money(v, d.home);
    const s = settle(d);
    if (s.people.length < 2) return {
      title: "Rozliczenie", back: `#/budzet/${id}`,
      html: App.empty("🤝", "Dodaj uczestników", "W budżecie podróży wpisz osoby, z którymi dzielisz koszty (np. „Ja, Ania, Tomek”).",
        `<a class="btn primary" href="#/budzet/${id}">Przejdź do budżetu</a>`),
    };
    const segSum = d.items.filter(i => i.kind === "seg" && i.home != null).reduce((a, i) => a + i.home, 0);
    // inicjał osoby w kółku, kolor stały dla imienia
    const HUES = ["#43BDB5", "#4C7FD9", "#D9645A", "#E0A23F", "#8A6BD6", "#3E9B74"];
    const av = n => `<span class="sp-av" style="--pc:${HUES[s.people.indexOf(n) % HUES.length] || HUES[0]}" aria-hidden="true">${esc((n.trim()[0] || "?").toUpperCase())}</span>`;
    const rows = s.people.map(n => {
      const b = s.balance[n];
      return `<div class="sp-person">
        ${av(n)}
        <span class="sp-who"><b>${esc(n)}</b>
        <span class="muted small">zapłacił(a) ${m(s.paid[n])} · część ${m(s.share[n])}</span></span>
        <span class="sp-bal ${b > 0.005 ? "plus" : b < -0.005 ? "minus" : ""}">${b > 0.005 ? "+" + m(b) : b < -0.005 ? "−" + m(-b) : "rozliczony"}</span>
      </div>`;
    }).join("");
    const transfers = s.transfers.map(t => `
      <div class="sp-transfer">${av(t.from)}<span class="sp-tr"><b>${esc(t.from)}</b> <span class="sp-arrow" aria-hidden="true">${App.icon("arrow", "sm")}</span><span class="sr">oddaje</span> <b>${esc(t.to)}</b></span><span class="sp-amt">${m(t.amount)}</span></div>`).join("");
    const text0 = `Rozliczenie: ${d.trip.name}\nRazem: ${m(s.total)}\n` +
      (s.transfers.length ? s.transfers.map(t => `• ${t.from} → ${t.to}: ${m(t.amount)}`).join("\n") : "Wszyscy rozliczeni.");
    const text = self.I18N ? I18N.trText(text0) : text0;

    return {
      title: "Rozliczenie",
      back: `#/budzet/${id}`,
      html: `
        <section class="bg-sum">
          <div class="bg-top"><span>Wspólne wydatki</span><b>${m(s.total)}</b></div>
          <div class="bg-chips"><span class="chip accent">${s.people.length} ${plural(s.people.length, "osoba", "osoby", "osób")}</span><span class="chip">średnio ${m(s.total / s.people.length)} na osobę</span></div>
        </section>
        ${s.skipped ? `<p class="td-note bg-warn">${App.icon("alert", "sm")}<span>${s.skipped} ${plural(s.skipped, "wydatek pominięty", "wydatki pominięte", "wydatków pominiętych")} – brak kursu waluty (uzupełnij w budżecie)</span></p>` : ""}
        ${s.unassigned ? `<p class="td-note bg-warn">${App.icon("alert", "sm")}<span>${s.unassigned} ${plural(s.unassigned, "wydatek ma", "wydatki mają", "wydatków ma")} osobę spoza listy uczestników – popraw w wydatku</span></p>` : ""}
        <h3 class="section">Kto komu oddaje</h3>
        <div class="list sp-list">${transfers || `<p class="sp-done">${App.icon("check", "sm")} Wszyscy są rozliczeni.</p>`}</div>
        ${s.transfers.length ? `<button type="button" class="btn primary wide sp-share" id="sp-share">${App.icon("share", "sm")} Wyślij rozliczenie</button>` : ""}
        <h3 class="section">Salda</h3>
        <div class="list sp-list">${rows}</div>
        ${segSum ? `<h3 class="section">Bilety i noclegi z podróży</h3>
        <form class="form bg-cfg" id="sp-seg"><label class="field"><span>Kto je opłacił? (${m(segSum)} – dzielone na wszystkich)</span>
          <select name="payer"><option value="">nie dziel – każdy płacił za siebie</option>${s.people.map(n => `<option ${n === s.segPayer ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label></form>` : ""}
        <p class="f-hint sp-hint">Wydatki bez wskazanej osoby liczą się jako zapłacone przez „${esc(s.people[0])}” za wszystkich. Kto płacił i za kogo – ustawisz w szybkim dodawaniu albo w edycji wydatku.</p>`,
      after(view) {
        const sh = view.querySelector("#sp-share");
        if (sh) sh.onclick = async () => {
          if (navigator.share) { try { await navigator.share({ title: "Rozliczenie", text }); return; } catch (e) { if (e.name === "AbortError") return; } }
          try { await navigator.clipboard.writeText(text); App.toast("Skopiowano – wklej w wiadomości"); } catch (e) { prompt("Skopiuj rozliczenie:", text); }
        };
        const f = view.querySelector("#sp-seg");
        if (f) f.payer.onchange = async () => {
          const t = await DB.get("trips", id);
          await DB.put("trips", { ...t, segPayer: f.payer.value });
          App.render();
        };
      },
    };
  });

  App.Split = { settle };
})();
