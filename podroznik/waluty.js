/* Podróżnik – przelicznik walut offline.
   Trasy: #/waluty (trwająca / najbliższa podróż) i #/waluty/:tripId?z=VND
   Kursy z podróży (trip.rates – ile waluty głównej za 1 jednostkę, te same co w budżecie), więc działa bez internetu.
   Skąd kurs: trip.ratesInfo = { VND: { at: "RRRR-MM-DD", src: "NBP" | "ręcznie" } }. Z internetem – „Pobierz kursy NBP” (tylko gdy waluta główna to PLN).
   Waluty podróży: kraje (visas.js: loty, cel, noclegi, plan), kraje z kart dla kierowcy (local.cc), wydatki i ceny, ręcznie dodane (trip.curs).
   Pole kwoty liczy: „120 000 + 35 000”, „3 × 45000”, „1,5 * 20”. */
(function () {
  const { esc, plural } = App;
  const I = (n, c) => App.icon(n, c);
  const B = () => App.Budget;

  // waluta kraju (ISO 3166 → ISO 4217); Bułgaria w strefie euro od 2026
  const CUR = {
    PL: "PLN", AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
    LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR", BG: "EUR", AD: "EUR", MC: "EUR", SM: "EUR", VA: "EUR",
    ME: "EUR", XK: "EUR", CZ: "CZK", HU: "HUF", SE: "SEK", DK: "DKK", RO: "RON", CH: "CHF", LI: "CHF", NO: "NOK", IS: "ISK", GB: "GBP",
    AL: "ALL", BA: "BAM", MK: "MKD", RS: "RSD", MD: "MDL", UA: "UAH", TR: "TRY", GE: "GEL", AM: "AMD", AZ: "AZN", BY: "BYN", RU: "RUB",
    KZ: "KZT", UZ: "UZS", KG: "KGS", TJ: "TJS", TM: "TMT", MN: "MNT", CN: "CNY", HK: "HKD", MO: "MOP", TW: "TWD", JP: "JPY", KR: "KRW",
    VN: "VND", LA: "LAK", KH: "KHR", TH: "THB", MY: "MYR", SG: "SGD", ID: "IDR", PH: "PHP", MM: "MMK", IN: "INR", LK: "LKR", NP: "NPR",
    MV: "MVR", BT: "BTN", PK: "PKR", AE: "AED", QA: "QAR", OM: "OMR", BH: "BHD", KW: "KWD", SA: "SAR", JO: "JOD", IL: "ILS", EG: "EGP",
    IR: "IRR", MA: "MAD", TN: "TND", ZA: "ZAR", BW: "BWP", ZM: "ZMW", MU: "MUR", SN: "XOF", KE: "KES", TZ: "TZS", UG: "UGX", RW: "RWF",
    ET: "ETB", NA: "NAD", ZW: "USD", MG: "MGA", SC: "SCR", CV: "CVE", DZ: "DZD", GH: "GHS", NG: "NGN", US: "USD", CA: "CAD", MX: "MXN",
    CU: "CUP", DO: "DOP", JM: "JMD", BS: "BSD", CR: "CRC", PA: "USD", GT: "GTQ", HN: "HNL", SV: "USD", NI: "NIO", CO: "COP", EC: "USD",
    PE: "PEN", BO: "BOB", BR: "BRL", AR: "ARS", CL: "CLP", UY: "UYU", PY: "PYG", AU: "AUD", NZ: "NZD", FJ: "FJD", PF: "XPF", NC: "XPF",
  };
  // gdzie w praktyce płaci się też dolarami
  const ALSO_USD = new Set(["KH", "LA", "MM", "CU", "EG", "JO", "KE", "TZ", "NP", "MV"]);
  const COMMON = ["EUR", "USD", "GBP", "CHF", "CZK", "HUF", "THB", "JPY", "CNY", "VND", "TRY"];

  /* ---------- liczenie w polu kwoty (bez eval) ---------- */
  function calc(raw) {
    let s = String(raw || "").replace(/[×xX]/g, "*").replace(/[÷:]/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
    // „1.200.000” / „1,200,000” – kropki/przecinki jako separatory tysięcy
    s = s.replace(/\d{1,3}(?:([.,])\d{3})(?:\1\d{3})+(?![\d])/g, m => m.replace(/[.,]/g, ""));
    s = s.replace(/,/g, ".");
    if (!s || /[^\d.+\-*/()]/.test(s)) return null;
    let i = 0;
    const num = () => { const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
    const atom = () => {
      if (s[i] === "(") { i++; const v = expr(); if (s[i] !== ")") throw 0; i++; return v; }
      if (s[i] === "-") { i++; return -atom(); }
      return num();
    };
    const term = () => { let v = atom(); while (s[i] === "*" || s[i] === "/") { const op = s[i++]; const r = atom(); v = op === "*" ? v * r : v / r; } return v; };
    const expr = () => { let v = term(); while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; } return v; };
    try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
  }

  // liczba do pokazania: duże bez groszy, małe z 2 miejscami, bardzo małe – 3 cyfry znaczące
  const loc = () => (self.I18N ? I18N.locale : "pl-PL");
  function fmt(n) {
    const a = Math.abs(n);
    const o = a >= 1000 ? { maximumFractionDigits: 0 } : a >= 1 || a === 0 ? { minimumFractionDigits: Number.isInteger(Math.round(a * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 }
      : { maximumSignificantDigits: 3 };
    return n.toLocaleString(loc(), o);
  }
  const rateTxt = n => n.toLocaleString(loc(), n >= 100 ? { maximumFractionDigits: 2 } : n >= 1 ? { maximumFractionDigits: 4 } : { maximumSignificantDigits: 4 });
  const dmy = s => `${+s.slice(8)}.${s.slice(5, 7)}`;

  /* ---------- waluty podróży ---------- */
  async function load(id) {
    const [trip, segs, items] = await Promise.all([DB.get("trips", id), DB.byIndex("segments", "tripId", id), DB.byIndex("planItems", "tripId", id)]);
    if (!trip) return null;
    const bd = B() ? await B().load(id) : null;
    const home = bd ? bd.home : "PLN";
    const curs = [];
    const add = c => { c = String(c || "").toUpperCase(); if (/^[A-Z]{3}$/.test(c) && c !== home && !curs.includes(c)) curs.push(c); };
    if (self.Visas) {
      await Visas.ready();
      for (const cc of Visas.countries(trip, segs, items)) { add(CUR[cc]); if (ALSO_USD.has(cc)) add("USD"); }
    }
    segs.concat(items).forEach(p => p.local && p.local.cc && add(CUR[String(p.local.cc).toUpperCase()]));
    (bd ? bd.currencies : []).forEach(add);
    (trip.curs || []).forEach(add);
    Object.keys(trip.rates || {}).forEach(add);
    return { trip, home, curs, rates: { ...(trip.rates || {}), [home]: 1 }, info: trip.ratesInfo || {} };
  }
  // ile waluty b za 1 jednostkę a (przez walutę główną); null = brak kursu
  const cross = (rates, a, b) => rates[a] > 0 && rates[b] > 0 ? rates[a] / rates[b] : null;

  // „ściąga”: okrągłe kwoty w walucie a, których wartość w b jest sensowna (ok. 1 zł – 3000 zł)
  function cheat(rates, a, b, home) {
    const r = cross(rates, a, b), toHome = cross(rates, a, home);
    if (!r || !toHome) return [];
    const out = [];
    for (let e = -1; e <= 9 && out.length < 8; e++) for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      const h = v * toHome;
      if (h >= 1 && h <= 3000 && out.length < 8) out.push([v, v * r]);
    }
    return out;
  }

  App.route(/^\/waluty$/, async () => {
    const trips = await DB.all("trips");
    if (!trips.length) return {
      title: "Waluty", back: "#/podroze",
      html: App.empty("🧭", "Przelicznik walut", "Dodaj podróż – przelicznik dobierze waluty krajów, do których jedziesz, i zapamięta kursy na drogę.",
        `<a class="btn primary" href="#/podroze/nowa">Dodaj podróż</a>`),
    };
    const today = App.todayStr();
    const t = trips.filter(x => x.start <= today && today <= x.end)[0] || App.Plan.pickTrip(trips);
    location.replace(`#/waluty/${t.id}`);
    return "";
  });

  App.route(/^\/waluty\/([\w-]+)$/, async ([id], q) => {
    const d = await load(id);
    if (!d) { location.replace("#/waluty"); return ""; }
    const { trip, home, curs, rates, info } = d;
    const all = [home, ...curs];
    const saved = await DB.getSetting(`convPair:${id}`, null);
    let from = (q.z || (saved && saved.from) || curs.find(c => rates[c] > 0) || curs[0] || "EUR").toUpperCase();
    let to = ((saved && saved.to) || home).toUpperCase();
    if (from === to) to = from === home ? (curs[0] || "EUR") : home;
    const lastAmt = await DB.getSetting(`convAmt:${id}`, "");
    const opts = cur => [...new Set(all.concat([from, to], COMMON))].map(c => `<option value="${c}" ${c === cur ? "selected" : ""}>${c}</option>`).join("");
    const online = navigator.onLine;
    const missing = curs.filter(c => !(rates[c] > 0));

    const rateRow = c => {
      const r = rates[c], i = info[c];
      return `
        <div class="li cv-rate-row" data-cur="${c}">
          <span class="li-ico cv-code" aria-hidden="true">${c}</span>
          <span class="li-main"><b>1 ${c} = <span class="cv-r">${r > 0 ? rateTxt(r) : "?"}</span> ${home}</b>
            <small>${r > 0 ? `${i ? `${i.src === "NBP" ? "NBP" : "wpisany ręcznie"} · ${dmy(i.at)}` : "kurs z budżetu"}${r > 0 && r < 1 ? ` · 1 ${home} = ${rateTxt(1 / r)} ${c}` : ""}` : "brak kursu – wpisz albo pobierz"}</small></span>
          <label class="cv-edit"><span class="sr">Kurs ${c}</span><input inputmode="decimal" data-rate="${c}" value="${r > 0 ? String(r).replace(".", ",") : ""}" placeholder="kurs"></label>
        </div>`;
    };

    const html = `
      <section class="cv-card">
        <div class="cv-top"><span class="chip">${esc(trip.name)}</span>${missing.length ? `<span class="chip warn">brak kursu: ${missing.join(", ")}</span>` : ""}</div>
        <label class="cv-line">
          <span class="sr">Kwota</span>
          <input id="cv-amt" class="cv-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(lastAmt)}">
          <select id="cv-from" aria-label="Z waluty">${opts(from)}</select>
        </label>
        <div class="cv-mid"><span class="cv-calc" id="cv-calc" aria-live="polite"></span>
          <button type="button" class="icon-btn cv-swap" id="cv-swap" aria-label="Zamień waluty">${I("arrow")}</button></div>
        <div class="cv-line cv-out">
          <output id="cv-res" class="cv-res" for="cv-amt">0</output>
          <select id="cv-to" aria-label="Na walutę">${opts(to)}</select>
        </div>
        <p class="cv-rate" id="cv-rate"></p>
        <button type="button" class="btn wide cv-exp" id="cv-exp" hidden>${I("plus", "sm")} Dodaj jako wydatek</button>
      </section>
      ${curs.length ? `<div class="type-chips cv-chips">${curs.map(c => `<button type="button" class="st-chip${c === from ? " on" : ""}" data-pick="${c}">${c}</button>`).join("")}</div>` : ""}
      <h2 class="section" id="cv-cheat-h"></h2>
      <div class="list cv-cheat" id="cv-cheat"></div>
      <div class="sec-h"><h2 class="section">Kursy na drogę</h2><span class="chip ${online ? "accent" : ""}">${online ? "online" : "offline – zapisane kursy"}</span></div>
      <div class="list cv-rates">${curs.map(rateRow).join("") || `<p class="f-hint cv-none">Nie rozpoznano walut podróży – dodaj niżej.</p>`}</div>
      <div class="cv-tools">
        ${home === "PLN" ? `<button type="button" class="btn wide" id="cv-nbp"${online ? "" : " disabled"}>${I("bank", "sm")} ${online ? "Pobierz aktualne kursy NBP" : "Kursy NBP – potrzebny internet"}</button>` : ""}
        <label class="vz-add"><span class="sr">Dodaj walutę</span><select id="cv-add"><option value="">+ Dodaj walutę</option>${COMMON.concat(Object.values(CUR)).filter((c, i, a) => a.indexOf(c) === i && !all.includes(c)).sort().map(c => `<option>${c}</option>`).join("")}</select></label>
      </div>
      <p class="vz-src">${I("info", "sm")}<span>Kursy zapisują się w podróży i działają bez internetu. NBP podaje kurs średni – w kantorze i przy płatności kartą wychodzi zwykle kilka procent gorzej.</span></p>`;

    return {
      title: "Waluty",
      back: `#/podroze/${id}`,
      action: `<a class="icon-btn" href="#/budzet/${id}" aria-label="Budżet">${I("wallet")}</a>`,
      html,
      after(v) {
        const $ = s => v.querySelector(s);
        const amt = $("#cv-amt"), fromSel = $("#cv-from"), toSel = $("#cv-to");
        const savePair = () => DB.setSetting(`convPair:${id}`, { from: fromSel.value, to: toSel.value });
        let lastVal = null;
        const update = () => {
          const a = fromSel.value, b = toSel.value, val = calc(amt.value);
          const r = cross(rates, a, b);
          amt.classList.toggle("long", amt.value.length > 9); $("#cv-res").classList.toggle("long", $("#cv-res").textContent.length > 11);
          $("#cv-calc").textContent = val != null && /[+\-*/×x÷()]/.test(amt.value.replace(/^\s*-/, "")) ? `= ${fmt(val)} ${a}` : "";
          $("#cv-res").textContent = r == null ? "—" : fmt((val || 0) * r);
          $("#cv-rate").innerHTML = r == null
            ? `<span class="cv-bad">Brak kursu ${!(rates[a] > 0) ? a : b} – wpisz go niżej${navigator.onLine && home === "PLN" ? " albo pobierz z NBP" : ""}.</span>`
            : `1 ${a} = ${rateTxt(r)} ${b} · 1 ${b} = ${rateTxt(1 / r)} ${a}`;
          lastVal = val;
          $("#cv-exp").hidden = !(val > 0) || a === home && b === home;
          v.querySelectorAll("[data-pick]").forEach(x => x.classList.toggle("on", x.dataset.pick === a));
          // ściąga dla waluty obcej → druga
          const foreign = a !== home ? a : b, other = a !== home ? b : a;
          const rows = cheat(rates, foreign, other, home);
          $("#cv-cheat-h").textContent = rows.length ? `Ściąga: ${foreign} → ${other}` : "";
          $("#cv-cheat").innerHTML = rows.map(([x, y]) => `<button type="button" class="li cv-cheat-row" data-amt="${x}" data-cur="${foreign}"><b>${fmt(x)} ${foreign}</b><span>${fmt(y)} ${other}</span></button>`).join("");
          $("#cv-cheat").hidden = !rows.length;
          v.querySelectorAll(".cv-cheat-row").forEach(btn => btn.onclick = () => {
            fromSel.value = btn.dataset.cur; if (toSel.value === fromSel.value) toSel.value = other;
            amt.value = btn.dataset.amt; savePair(); update(); amt.focus();
          });
        };
        let tm = null;
        amt.addEventListener("input", () => { update(); clearTimeout(tm); tm = setTimeout(() => DB.setSetting(`convAmt:${id}`, amt.value), 600); });
        fromSel.onchange = toSel.onchange = () => { savePair(); update(); };
        $("#cv-swap").onclick = () => { const a = fromSel.value; fromSel.value = toSel.value; toSel.value = a; const r = $("#cv-res").textContent; if (lastVal && r !== "—") amt.value = r.replace(/\s| /g, ""); savePair(); update(); };
        v.querySelectorAll("[data-pick]").forEach(x => x.onclick = () => { fromSel.value = x.dataset.pick; if (toSel.value === x.dataset.pick) toSel.value = home; savePair(); update(); });
        update();

        // wydatek z przeliczonej kwoty (w walucie obcej)
        $("#cv-exp").onclick = async () => {
          const a = fromSel.value, b = toSel.value, val = lastVal;
          if (!(val > 0)) return;
          const cur = a !== home ? a : b, amount = a !== home ? val : val * (cross(rates, a, b) || 0);
          const today = App.todayStr(), date = trip.start <= today && today <= trip.end ? today : trip.start > today ? trip.start : trip.end;
          await DB.put("expenses", { tripId: id, title: "", amount: Math.round(amount * 100) / 100, currency: cur, cat: "inne", date });
          App.toast(`Dodano wydatek: ${fmt(amount)} ${cur}`);
        };

        // kursy: ręcznie
        const saveRate = async (c, val, src) => {
          const t = await DB.get("trips", id);
          const r = { ...(t.rates || {}) }, inf = { ...(t.ratesInfo || {}) };
          if (val > 0) { r[c] = val; inf[c] = { at: App.todayStr(), src }; } else { delete r[c]; delete inf[c]; }
          await DB.put("trips", { ...t, rates: r, ratesInfo: inf });
        };
        v.querySelectorAll("[data-rate]").forEach(inp => inp.onchange = async () => {
          const val = calc(inp.value);
          await saveRate(inp.dataset.rate, val, "ręcznie");
          App.toast(val > 0 ? "Zapisano kurs" : "Usunięto kurs");
          App.render();
        });
        const nbp = $("#cv-nbp");
        if (nbp) nbp.onclick = async () => {
          nbp.disabled = true; nbp.textContent = "Pobieram…";
          let ok = 0;
          for (const c of curs) { const val = await B().nbp(c); if (val) { await saveRate(c, val, "NBP"); ok++; } }
          App.toast(ok ? `Pobrano ${ok} ${plural(ok, "kurs", "kursy", "kursów")} z NBP` : "Nie udało się pobrać (brak internetu?)");
          App.render();
        };
        const addSel = $("#cv-add");
        addSel.onchange = async () => {
          if (!addSel.value) return;
          const t = await DB.get("trips", id);
          await DB.put("trips", { ...t, curs: [...new Set([...(t.curs || []), addSel.value])] });
          App.render();
        };
      },
    };
  });

  App.Money = { calc, fmt, load, cross, cheat, CUR };
})();
