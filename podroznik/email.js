/* Podróżnik – etap 8 (pkt 39): odczyt biletu / rezerwacji z wklejonego maila.
   Trasa: #/wklej?trip=<id>   (także po „Udostępnij → Podróżnik” z innej aplikacji – App.sharedText)
   Działa w telefonie, bez wysyłania treści gdziekolwiek. Odczyt jest heurystyczny (szuka wzorców):
     lot      – numer lotu (np. LO 281, FR 1234), kody lotnisk (WAW, LIS), daty, godziny, miejsce
     pociąg / autobus – numer (EIP 5300, IC 3510…), stacje z godzinami, wagon, miejsce, przewoźnik
     nocleg   – zameldowanie / wymeldowanie, nazwa obiektu, adres
   plus numer rezerwacji i cena. Wynik to propozycja do sprawdzenia przed zapisaniem. */
(function () {
  const { esc, plural } = App;

  /* ---------- daty i godziny ---------- */
  const MONTHS = { sty: 1, lut: 2, mar: 3, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, paz: 10, lis: 11, gru: 12,
    jan: 1, feb: 2, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, mai: 5, okt: 10, dez: 12 };
  const monthOf = w => MONTHS[w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").slice(0, 3)];
  const L = "A-Za-zżźćńółęąśŻŹĆŃÓŁĘĄŚ";
  const DATE_RE = new RegExp([
    "(\\d{4})-(\\d{2})-(\\d{2})",                                   // 2026-11-20
    "\\b(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})\\b",                 // 20.11.2026, 20/11/26
    `\\b(\\d{1,2})\\.?\\s+([${L}]{3,12})\\.?,?\\s*(\\d{4})?`,       // 20 listopada 2026, 20 Nov
    `\\b([${L}]{3,12})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`,             // November 20, 2026
    "\\b(\\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\\d{2})?\\b", // 20NOV26
  ].map(x => `(?:${x})`).join("|"), "g");
  const pad = n => String(n).padStart(2, "0");

  function findDates(text) {
    const out = [], today = App.todayStr();
    for (const m of text.matchAll(DATE_RE)) {
      let y, mo, d;
      if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if (m[4]) { d = +m[4]; mo = +m[5]; y = +m[6]; if (y < 100) y += 2000; }
      else if (m[7]) { d = +m[7]; mo = monthOf(m[8]); y = m[9] ? +m[9] : null; }
      else if (m[10]) { mo = monthOf(m[10]); d = +m[11]; y = +m[12]; }
      else if (m[13]) { d = +m[13]; mo = monthOf(m[14]); y = m[15] ? 2000 + +m[15] : null; }
      if (!mo || mo > 12 || !d || d > 31) continue;
      if (!y) { y = +today.slice(0, 4); if (`${y}-${pad(mo)}-${pad(d)}` < App.addDays(today, -60)) y++; }
      if (y < 2000 || y > 2100) continue;
      out.push({ date: `${y}-${pad(mo)}-${pad(d)}`, index: m.index, end: m.index + m[0].length });
    }
    return out;
  }
  const findTimes = text => [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(m => ({ time: `${pad(m[1])}:${m[2]}`, index: m.index }));
  const after = (list, i) => list.find(x => x.index >= i);

  /* ---------- wspólne pola ---------- */
  const BOOKING_RE = /(?:PNR|kod(?:u)? rezerwacji|numer rezerwacji|nr\.? rezerwacji|numer potwierdzenia|booking (?:reference|ref\.?|code|number|id)|confirmation (?:code|number)|reservation (?:code|number)|buchungsnummer)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,14})/i;
  const PRICE_RE = /(?:razem|suma|łącznie|do zapłaty|zapłacono|cena(?: całkowita)?|total(?: price| amount)?|amount paid|gesamt)[^\d\n]{0,25}(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(PLN|zł|EUR|€|USD|\$|GBP|£|CHF|CZK|Kč)/i;
  const CUR = { "zł": "PLN", "€": "EUR", "$": "USD", "£": "GBP", "Kč": "CZK" };
  function common(text) {
    const b = text.match(BOOKING_RE), p = text.match(PRICE_RE);
    return {
      booking: b ? b[1].toUpperCase() : "",
      price: p ? p[1].replace(/\s/g, "").replace(",", ".") : "",
      currency: p ? (CUR[p[2]] || p[2].toUpperCase()) : "",
    };
  }
  const CARRIERS = [
    ["LOT", /\bPLL LOT|Polskie Linie Lotnicze|\bLOT Polish/i], ["Ryanair", /ryanair/i], ["Wizz Air", /wizz ?air/i], ["Lufthansa", /lufthansa/i],
    ["easyJet", /easyjet/i], ["Enter Air", /enter air/i], ["KLM", /\bKLM\b/], ["Air France", /air france/i], ["British Airways", /british airways/i],
    ["SAS", /\bSAS\b|scandinavian airlines/i], ["Norwegian", /norwegian/i], ["TAP", /\bTAP\b|tap air/i], ["Vueling", /vueling/i],
    ["Eurowings", /eurowings/i], ["Turkish Airlines", /turkish airlines/i], ["Emirates", /emirates/i], ["Swiss", /\bswiss\b/i], ["Austrian", /austrian airlines/i],
    ["PKP Intercity", /intercity|PKP IC|\bpkp\b/i], ["Polregio", /polregio/i], ["Koleje Mazowieckie", /koleje mazowieckie/i], ["Koleje Śląskie", /koleje śląskie/i],
    ["Deutsche Bahn", /deutsche bahn|\bDB\b|bahn\.de/i], ["ČD", /české dráhy|\bČD\b|cd\.cz/i], ["ÖBB", /ÖBB|oebb/i], ["RegioJet", /regiojet/i],
    ["Leo Express", /leo express/i], ["Trenitalia", /trenitalia/i], ["Renfe", /renfe/i], ["SNCF", /sncf|ouigo/i], ["FlixBus", /flix ?bus|flixtrain/i],
    ["Sindbad", /sindbad/i], ["Booking.com", /booking\.com/i], ["Airbnb", /airbnb/i],
  ];
  const carrierIn = text => (CARRIERS.find(([, re]) => re.test(text)) || [""])[0];
  const AIRLINE_NAMES = { LO: "LOT", FR: "Ryanair", RK: "Ryanair", W6: "Wizz Air", W4: "Wizz Air", W9: "Wizz Air", LH: "Lufthansa", U2: "easyJet", EC: "easyJet",
    BA: "British Airways", KL: "KLM", AF: "Air France", OS: "Austrian", LX: "Swiss", SK: "SAS", AY: "Finnair", TP: "TAP", IB: "Iberia", VY: "Vueling",
    EW: "Eurowings", DY: "Norwegian", D8: "Norwegian", TK: "Turkish Airlines", EK: "Emirates", QR: "Qatar Airways", A3: "Aegean", RO: "Tarom", OK: "Czech Airlines",
    JU: "Air Serbia", BT: "airBaltic", "4U": "Eurowings", HV: "Transavia", TO: "Transavia", E4: "Enter Air", ENT: "Enter Air", PC: "Pegasus", SN: "Brussels Airlines",
    LG: "Luxair", EI: "Aer Lingus", AZ: "ITA Airways", FI: "Icelandair", AA: "American Airlines", DL: "Delta", UA: "United", AC: "Air Canada", ET: "Ethiopian",
    MS: "EgyptAir", EY: "Etihad", LY: "El Al", PS: "UIA" };

  /* ---------- loty ---------- */
  const AIRLINES = "LO|FR|RK|W6|W4|W9|LH|U2|EC|BA|KL|AF|OS|LX|SK|AY|TP|IB|VY|EW|DY|D8|TK|EK|QR|A3|RO|OK|JU|BT|4U|HV|TO|V7|ENT|E4|PC|SN|LG|EI|AZ|UX|FI|AA|DL|UA|AC|ET|MS|QS|OU|EY|LY|PS";
  const FLIGHT_RE = new RegExp(`\\b(${AIRLINES})\\s?(\\d{1,4})\\b`, "g");
  const NOT_AIRPORT = new Set(["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "PNR", "LOT", "THE", "AND", "FOR", "VIA", "PDF", "SMS", "VAT", "NIP", "ZIP", "FAQ", "WWW", "ADT", "CHD", "INF", "OUT", "RET", "DEP", "ARR", "PAX", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "BAG", "PLL", "MRS", "ETK", "EMD", "BIC", "IBA"]);

  function placeName(block, code, air) {
    const m = block.match(new RegExp(`([${L}][${L} .'-]{1,28}?)\\s*[(\\[]\\s*${code}\\s*[)\\]]`));
    if (m) return `${m[1].trim().replace(/^(?:(?:to|do|z|ze|from|von|nach|a|à|->)\s+)+/i, "")} ${code}`;
    const a = air.get(code);
    return a && a.name ? `${a.name} ${code}` : code;
  }

  function parseFlights(text, air) {
    const hits = [...text.matchAll(FLIGHT_RE)];
    const seen = new Set(), out = [];
    hits.forEach((h, i) => {
      const number = `${h[1]} ${h[2]}`;
      if (seen.has(number)) return;
      seen.add(number);
      // fragment maila tego lotu: od linii z numerem do linii następnego lotu (wcześniejsze linie tylko, gdy brak lotnisk)
      const lineStart = i => text.lastIndexOf("\n", i) + 1;
      const next = hits.slice(i + 1).find(x => `${x[1]} ${x[2]}` !== number);
      const stop = next ? lineStart(next.index) : Math.min(text.length, h.index + 500);
      const codesIn = blk => [...new Set([...blk.matchAll(/\b[A-Z]{3}\b/g)].map(m => m[0]).filter(c => !NOT_AIRPORT.has(c) && air.has(c)))];
      let start = lineStart(h.index);
      let block = text.slice(start, stop), codes = codesIn(block);
      if (codes.length < 2) {
        const prevStop = i > 0 ? hits[i - 1].index + 1 : 0;
        let s2 = start;
        for (let k = 0; k < 2 && s2 > prevStop; k++) s2 = lineStart(Math.max(prevStop, s2 - 2));
        const wider = text.slice(s2, stop), c2 = codesIn(wider);
        if (c2.length > codes.length) { start = s2; block = wider; codes = c2; }
      }
      const rel = h.index - start;
      const dates = findDates(block), times = findTimes(block);
      const d = after(dates, rel - 80) || dates[0];
      const t1 = after(times, d ? d.end : rel) || times[0];
      const t2 = t1 && times.find(x => x.index > t1.index);
      const seat = block.match(/(?:seat|miejsce|siedzenie|sitzplatz)\s*[:#]?\s*(\d{1,2}[A-K])\b/i);
      const gate = block.match(/\bgate\s*[:#]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
      const terminal = block.match(/\bterminal\s*[:#]?\s*([A-Z0-9]{1,3})\b/i);
      const seg = { type: "lot", number, carrier: AIRLINE_NAMES[h[1]] || carrierIn(text) || "", from: codes[0] ? placeName(block, codes[0], air) : "", to: codes[1] ? placeName(block, codes[1], air) : "" };
      if (d && t1) seg.depart = `${d.date}T${t1.time}`;
      if (d && t2) seg.arrive = `${t2.time < t1.time ? App.addDays(d.date, 1) : d.date}T${t2.time}`;
      if (seat) seg.seat = seat[1].toUpperCase();
      if (gate) seg.gate = gate[1].toUpperCase();
      if (terminal) seg.terminal = terminal[1].toUpperCase();
      out.push(seg);
    });
    return out;
  }

  /* ---------- pociąg / autobus ---------- */
  const TRAIN_RE = /\b(EIP|EIC|EC|EN|IC|TLK|ICE|IR|RE|RJ|NJ|TGV|FLX)\s?(\d{2,5})\b/;
  const LABELS = /\b(odjazd|przyjazd|departure|arrival|abfahrt|ankunft|godz\.?|from|to|od|do|z|ze|stacja|station|przystanek|stop|data|date|dnia|peron|tor|platform|wagon|miejsce|seat|klasa|class)\b\.?:?/gi;
  function cleanPlace(line) {
    let s = line.replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, " ");
    for (const d of findDates(s).reverse()) s = s.slice(0, d.index) + " " + s.slice(d.end);
    return s.replace(LABELS, " ")
      .replace(/[|→>–—\-:,;()]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  }
  function parseGround(text, type) {
    const seg = { type, carrier: carrierIn(text) || "" };
    const n = text.match(TRAIN_RE);
    if (n) seg.number = `${n[1]} ${n[2]}`;
    else { const b = text.match(/(?:linia|line|kurs|course|bus)\s*(?:nr\.?)?\s*[:#]?\s*([A-Z]?\d{2,5})\b/i); if (b) seg.number = b[1]; }
    // relacja wprost: „Z: Kraków Główny Do: Gdańsk Główny”, „From X to Y”, „Relacja: X – Y”
    const rel = text.match(/(?:relacja|trasa|route|strecke)\s*:?\s*([^\n–—>→-]{2,40}?)\s*[–—>→-]+\s*([^\n]{2,40})/i)
      || text.match(/(?:^|\n)\s*(?:z|od|from|von)\s*:?\s+([^\n]{2,40}?)\s*(?:\n|\s)\s*(?:do|to|nach)\s*:?\s+([^\n]{2,40})/i);
    const lines = text.split(/\n/).map(x => x.trim()).filter(Boolean);
    const timed = lines.filter(l => /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(l) && cleanPlace(l).length >= 3 && !/zameldowanie|check-?in|wymeldowanie|check-?out/i.test(l));
    if (rel) { seg.from = cleanPlace(rel[1]); seg.to = cleanPlace(rel[2]); }
    else if (timed.length >= 2) { seg.from = cleanPlace(timed[0]); seg.to = cleanPlace(timed[1]); }
    else {
      const arrow = lines.find(l => /\S\s*(?:→|->|–|—)\s*\S/.test(l));
      if (arrow) { const [a, b] = arrow.split(/\s*(?:→|->|–|—)\s*/); seg.from = cleanPlace(a); seg.to = cleanPlace(b || ""); }
    }
    const d = findDates(text)[0], times = findTimes(text);
    if (d && times[0]) seg.depart = `${d.date}T${times[0].time}`;
    if (d && times[1]) seg.arrive = `${times[1].time < times[0].time ? App.addDays(d.date, 1) : d.date}T${times[1].time}`;
    const car = text.match(/(?:wagon|wag\.|coach|car|wagen)\s*(?:nr\.?)?\s*[:#]?\s*(\d{1,3})\b/i);
    const seat = text.match(/(?:miejsce|m\.|seat|sitzplatz|platz)\s*(?:nr\.?)?\s*[:#]?\s*(\d{1,3}[A-Z]?)\b/i);
    const platform = text.match(/(?:peron|platform|gleis|stanowisko)\s*[:#]?\s*(\d{1,3}[A-Z]?)\b/i);
    if (car) seg.car = car[1];
    if (seat) seg.seat = seat[1];
    if (platform) seg.platform = platform[1];
    return seg;
  }

  /* ---------- nocleg ---------- */
  function parseStay(text) {
    const ci = text.search(/zameldowanie|check-?in|przyjazd|anreise|arrival/i), co = text.search(/wymeldowanie|check-?out|wyjazd|abreise|departure/i);
    if (ci < 0 || co < 0) return null;
    const dates = findDates(text), times = findTimes(text);
    const d1 = after(dates, ci), d2 = after(dates, co);
    if (!d1 || !d2) return null;
    const t1 = times.find(x => x.index >= ci && x.index < ci + 140), t2 = times.find(x => x.index >= co && x.index < co + 140);
    const lines = text.split(/\n/).map(x => x.trim()).filter(Boolean);
    const named = text.match(/(?:obiekt|hotel|property|zakwaterowanie|accommodation|unterkunft)\s*:\s*([^\n]{2,60})/i);
    const nameLine = lines.find(l => /\b(hotel|hostel|apartament\w*|apartment\w*|resort|guest ?house|pensjonat|villa|inn|motel|b&b)\b/i.test(l)
      && !/zameldowanie|wymeldowanie|check-?in|check-?out|booking\.com|airbnb|potwierdz|confirm|rezerwacj|reservation/i.test(l) && l.length <= 70);
    const addr = text.match(/(?:adres|address|anschrift)\s*:?\s*([^\n]{5,90})/i);
    return {
      type: "nocleg", name: (named ? named[1] : nameLine || "").replace(/^[\s:–-]+/, "").trim().slice(0, 60),
      address: addr ? addr[1].trim() : "",
      depart: `${d1.date}T${t1 ? t1.time : "15:00"}`, arrive: `${d2.date}T${t2 ? t2.time : "11:00"}`,
    };
  }

  /* ---------- całość ---------- */
  async function parse(raw) {
    const text = String(raw || "").replace(/\r/g, "").replace(/ /g, " ");
    const air = App.Stats ? await App.Stats.airports() : new Map();
    const out = [];
    const flights = parseFlights(text, air);
    out.push(...flights);
    const stay = parseStay(text);
    if (!flights.length) {
      if (/flix ?bus|autobus|\bbus\b|sindbad|przewóz osób/i.test(text) && !/pociąg|train|zug\b/i.test(text)) out.push(parseGround(stay ? text.slice(0, text.search(/zameldowanie|check-?in/i)) : text, "autobus"));
      else if (TRAIN_RE.test(text) || /pociąg|intercity|polregio|koleje|wagon|\btrain\b|\bzug\b|bahn|regiojet|trenitalia|renfe|sncf/i.test(text)) out.push(parseGround(text, "pociag"));
    }
    if (stay) out.push(stay);
    const c = common(text);
    for (const s of out) {
      if (c.booking && !s.booking) s.booking = c.booking;
      if (c.price && out.length === 1) { s.price = c.price; s.currency = c.currency || "PLN"; }
    }
    return out.filter(s => s.depart || s.from || s.to || s.name);
  }

  /* ================= EKRAN „WKLEJ Z MAILA” ================= */
  const TYPE_ICON = { lot: "✈️", pociag: "🚆", autobus: "🚌", nocleg: "🏨" };
  App.route(/^\/wklej$/, async (_, q) => {
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    const shared = App.sharedText || "";
    App.sharedText = null;
    let found = [];
    return {
      title: "Dodaj z maila",
      back: q.trip ? `#/podroze/${q.trip}` : "#/podroze",
      html: `
        <p class="small muted" style="margin-top:0">Skopiuj treść maila z potwierdzeniem (lot, pociąg, autobus, hotel) i wklej poniżej.
          Odczyt dzieje się w telefonie – nic nie jest nigdzie wysyłane. <b>Sprawdź dane przed zapisaniem.</b></p>
        <textarea id="em-text" class="em-text" rows="8" placeholder="Wklej tutaj treść maila…">${esc(shared)}</textarea>
        <div class="add-row">
          <button type="button" class="btn" id="em-paste">📋 Wklej ze schowka</button>
          <button type="button" class="btn primary" id="em-go">🔎 Odczytaj</button>
        </div>
        <div id="em-out"></div>`,
      after(view) {
        const ta = view.querySelector("#em-text"), out = view.querySelector("#em-out");
        const tripOpts = sel => trips.map(t => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)} · ${App.fmtRange(t.start, t.end)}</option>`).join("");

        function card(s, i) {
          const T = App.Trips.TYPES[s.type];
          const when = s.depart ? `${App.fmtDay(s.depart)} ${App.time(s.depart)}${s.arrive ? ` → ${s.arrive.slice(0, 10) !== s.depart.slice(0, 10) ? App.fmtDay(s.arrive) + " " : ""}${App.time(s.arrive)}` : ""}` : "❓ brak daty – uzupełnij";
          const title = s.type === "nocleg" ? (s.name || "Nocleg (bez nazwy)") : `${s.from || "?"} → ${s.to || "?"}`;
          const bits = [s.carrier, s.number, s.car ? `wagon ${s.car}` : "", s.seat ? `miejsce ${s.seat}` : "", s.gate ? `gate ${s.gate}` : "",
            s.booking ? `rez. ${s.booking}` : "", s.price ? `${s.price.replace(".", ",")} ${s.currency}` : "", s.address].filter(Boolean);
          return `
            <div class="em-card${s.depart ? "" : " em-bad"}">
              <div class="tl-ico" aria-hidden="true">${TYPE_ICON[s.type] || T.icon}</div>
              <div class="tl-main">
                <div class="muted small">${T.name}</div>
                <div class="tl-route"><b>${esc(title)}</b></div>
                <div class="tl-time">${when}</div>
                ${bits.length ? `<div class="chips">${bits.map(b => `<span>${esc(b)}</span>`).join("")}</div>` : ""}
                <button type="button" class="tv-link" data-edit="${i}">✏️ Popraw i dodaj</button>
              </div>
            </div>`;
        }

        async function run() {
          const text = ta.value.trim();
          if (!text) { App.toast("Najpierw wklej treść maila"); return; }
          found = await parse(text);
          if (!found.length) {
            out.innerHTML = `<p class="error">Nie rozpoznano lotu, pociągu ani noclegu. Dodaj odcinek ręcznie w podróży – i daj znać, z jakiego przewoźnika był mail, żeby można było to poprawić.</p>`;
            return;
          }
          const ok = found.filter(s => s.depart).length;
          const dates = found.filter(s => s.depart).flatMap(s => [s.depart.slice(0, 10), (s.arrive || s.depart).slice(0, 10)]).sort();
          const match = q.trip || (trips.find(t => dates[0] && t.start <= dates[dates.length - 1] && t.end >= dates[0]) || {}).id || "";
          const dest = found.find(s => s.type !== "nocleg" && s.to);
          out.innerHTML = `
            <h3 class="section">Znaleziono: ${found.length} ${plural(found.length, "pozycję", "pozycje", "pozycji")}</h3>
            ${found.map(card).join("")}
            <div class="card em-save">
              <label class="field"><span>Dodaj do podróży</span>
                <select id="em-trip">${tripOpts(match)}<option value="__new" ${match ? "" : "selected"}>➕ Nowa podróż${dest ? ` – ${esc(dest.to.replace(/\s[A-Z]{3}$/, ""))}` : ""}</option></select></label>
              <button type="button" class="btn primary wide" id="em-all" ${ok ? "" : "disabled"}>Dodaj ${ok === found.length ? "wszystko" : `${ok} z datą`}</button>
            </div>`;
          out.querySelector("#em-all").onclick = () => saveAll();
          out.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => {
            const tripId = await ensureTrip();
            App.prefill = { ...found[+b.dataset.edit] };
            location.hash = `#/podroze/${tripId}/dodaj?typ=${App.prefill.type}`;
          });
        }

        async function ensureTrip() {
          const sel = out.querySelector("#em-trip").value;
          if (sel !== "__new") return sel;
          const ds = found.filter(s => s.depart).flatMap(s => [s.depart.slice(0, 10), (s.arrive || s.depart).slice(0, 10)]).sort();
          const dest = found.find(s => s.type !== "nocleg" && s.to);
          const stay = found.find(s => s.type === "nocleg");
          const name = dest ? dest.to.replace(/\s[A-Z]{3}$/, "") : stay ? (stay.name || "Nowa podróż") : "Nowa podróż";
          const t = await DB.put("trips", { name, destination: dest ? dest.to.replace(/\s[A-Z]{3}$/, "") : "", start: ds[0] || App.todayStr(), end: ds[ds.length - 1] || ds[0] || App.todayStr(), color: "#0f6e6e" });
          trips.unshift(t);
          out.querySelector("#em-trip").innerHTML = tripOpts(t.id) + `<option value="__new">➕ Nowa podróż</option>`;
          return t.id;
        }

        async function saveAll() {
          const tripId = await ensureTrip();
          const trip = await DB.get("trips", tripId);
          let n = 0, start = trip.start, end = trip.end;
          for (const s of found) {
            if (!s.depart) continue;
            const { ...rec } = s;
            await DB.put("segments", { ...rec, tripId });
            n++;
            const d1 = s.depart.slice(0, 10), d2 = (s.arrive || s.depart).slice(0, 10);
            if (d1 < start) start = d1;
            if (d2 > end) end = d2;
          }
          if (start !== trip.start || end !== trip.end) await DB.put("trips", { ...trip, start, end });
          App.toast(`Dodano ${n} ${plural(n, "odcinek", "odcinki", "odcinków")} – sprawdź szczegóły`);
          location.replace(`#/podroze/${tripId}`);
        }

        view.querySelector("#em-go").onclick = run;
        view.querySelector("#em-paste").onclick = async () => {
          try { ta.value = await navigator.clipboard.readText(); run(); }
          catch (e) { App.toast("Brak dostępu do schowka – wklej ręcznie (przytrzymaj pole)"); ta.focus(); }
        };
        if (shared) run();
      },
    };
  });

  App.Email = { parse, findDates };
})();
