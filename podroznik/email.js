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
  // godziny 24 h i 12 h (3:00 PM → 15:00)
  const findTimes = text => [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)(?!\d)(?:\s?([AaPp])\.?\s?[Mm]\b\.?)?/g)].map(m => {
    let h = +m[1];
    if (m[3]) { const pm = /p/i.test(m[3]); h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h; }
    return { time: `${pad(h)}:${m[2]}`, index: m.index, end: m.index + m[0].length };
  });
  const after = (list, i) => list.find(x => x.index >= i);

  /* ---------- tekst maila: HTML → zwykły tekst, bez niewidocznych znaków ---------- */
  function htmlToText(h) {
    const doc = new DOMParser().parseFromString(h, "text/html");
    doc.querySelectorAll("style,script,head,title").forEach(e => e.remove());
    doc.querySelectorAll("br").forEach(e => e.replaceWith("\n"));
    doc.querySelectorAll("p,div,tr,li,h1,h2,h3,h4,h5,td,th,table").forEach(e => e.append("\n"));
    return doc.body ? doc.body.textContent : h;
  }
  function normalize(raw) {
    let s = String(raw || "");
    if (/<(html|body|table|div|p|br|span)\b[^>]*>/i.test(s)) s = htmlToText(s);
    return s.replace(/\r/g, "").replace(/[   ]/g, " ").replace(/[​-‏‪-‮⁠﻿͏­]/g, "")
      .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- wspólne pola: nr rezerwacji, cena ---------- */
  const BOOKING_RE = /(?:airline booking reference(?:\s*\(PNR\))?|airline reference|booking reference|booking ref\.?|\bPNR\b|kod(?:u)? rezerwacji|numer rezerwacji|nr\.? rezerwacji|numer potwierdzenia|potwierdzenie|booking (?:code|number|no\.?|id)|confirmation (?:code|number)|reservation (?:code|number)|(?:ticket )?collection reference|order reference|buchungsnummer)\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{4,17})\b/gi;
  const CURS = "PLN|zł|EUR|€|USD|US\\$|\\$|GBP|£|CHF|CZK|Kč|CNY|RMB|¥|THB|฿|VND|₫|LAK|₭|KHR|JPY|HKD|SGD|MYR|IDR";
  const PRICE_LABEL = "razem|suma|łącznie|do zapłaty|zapłacono|całkowity koszt|cena(?: całkowita)?|total(?: amount| price| charge| cost)?(?: paid)?|amount paid|gesamt";
  const PRICE_RES = [
    new RegExp(`(?:${PRICE_LABEL})[^\\d\\n]{0,25}?(?:\\n\\s*)?(\\d[\\d\\s.,]*\\d|\\d)\\s*(${CURS})`, "i"),   // 179,00 zł
    new RegExp(`(?:${PRICE_LABEL})[^\\d\\n]{0,25}?(?:\\n\\s*)?(${CURS})\\s*(\\d[\\d\\s.,]*\\d|\\d)`, "i"),   // £61.89, CNY 242,89
  ];
  const CUR = { "zł": "PLN", "€": "EUR", "$": "USD", "US$": "USD", "£": "GBP", "Kč": "CZK", "RMB": "CNY", "¥": "CNY", "฿": "THB", "₫": "VND", "₭": "LAK" };
  function amount(s) {
    s = s.replace(/\s/g, "");
    if (/,\d{3}(\.|$)/.test(s) && s.includes(".")) s = s.replace(/,/g, "");        // 1,590.00
    else if (/\.\d{3},/.test(s)) s = s.replace(/\./g, "").replace(",", ".");        // 1.590,00
    else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");                          // 242,89
    else if (/,\d{3}$/.test(s)) s = s.replace(/,/g, "");                            // 1,590
    return String(+s || "");
  }
  function common(text) {
    // kod linii lotniczej (PNR) ważniejszy niż numer zamówienia w serwisie (Trip.com: „Booking No.” + „PNR”)
    let booking = "", best = 9;
    for (const m of text.matchAll(BOOKING_RE)) {
      const v = m[1];
      if (!/\d/.test(v) && v !== v.toUpperCase()) continue; // słowo („number”, „is”), nie kod
      const rank = /pnr|airline/i.test(m[0]) ? 0 : /booking ref|confirmation code|collection/i.test(m[0]) ? 1 : 2;
      if (rank < best) { best = rank; booking = v.toUpperCase(); }
    }
    let price = "", currency = "";
    for (const re of PRICE_RES) {
      const p = text.match(re);
      if (!p) continue;
      const [num, cur] = /\d/.test(p[1]) ? [p[1], p[2]] : [p[2], p[1]];
      price = amount(num); currency = CUR[cur] || cur.toUpperCase();
      if (price) break;
    }
    return { booking, price, currency };
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
    ["Nakhonchai Air", /nakhonchai/i], ["Green Bus", /green bus/i], ["Lomprayah", /lomprayah/i], ["Vietnam Railways", /vietnam railways|đường sắt/i],
    ["China Railway", /china railway|12306|high-speed rail/i], ["SRT", /state railway of thailand|\bSRT\b/i], ["12Go", /12go/i],
    ["East Midlands Railway", /east midlands railway/i], ["Heathrow Express", /heathrow express/i], ["Avanti West Coast", /avanti west coast/i],
    ["LNER", /\bLNER\b/], ["GWR", /\bGWR\b|great western railway/i], ["CrossCountry", /crosscountry/i], ["Thameslink", /thameslink/i],
    ["Elizabeth line", /elizabeth line/i], ["ScotRail", /scotrail/i], ["Southern", /southern railway|\bsouthern\b/i], ["Southeastern", /southeastern/i],
    ["South Western Railway", /south western railway/i], ["TransPennine Express", /transpennine/i], ["Chiltern Railways", /chiltern/i], ["Gatwick Express", /gatwick express/i], ["Northern", /northern rail/i], ["Eurostar", /eurostar/i],
    ["Trip.com", /trip\.com/i], ["Agoda", /agoda/i], ["Trainline", /trainline/i], ["Gotogate", /gotogate/i],
  ];
  const carrierIn = text => (CARRIERS.find(([, re]) => re.test(text)) || [""])[0];
  const AIRLINE_NAMES = {
 LO: "LOT", FR: "Ryanair", RK: "Ryanair", W6: "Wizz Air", W4: "Wizz Air", W9: "Wizz Air", LH: "Lufthansa", U2: "easyJet", EC: "easyJet",
    BA: "British Airways", KL: "KLM", AF: "Air France", OS: "Austrian", LX: "Swiss", SK: "SAS", AY: "Finnair", TP: "TAP", IB: "Iberia", VY: "Vueling",
    EW: "Eurowings", DY: "Norwegian", D8: "Norwegian", TK: "Turkish Airlines", EK: "Emirates", QR: "Qatar Airways", A3: "Aegean", RO: "Tarom", OK: "Czech Airlines",
    JU: "Air Serbia", BT: "airBaltic", "4U": "Eurowings", HV: "Transavia", TO: "Transavia", E4: "Enter Air", ENT: "Enter Air", PC: "Pegasus", SN: "Brussels Airlines",
    LG: "Luxair", EI: "Aer Lingus", AZ: "ITA Airways", FI: "Icelandair", AA: "American Airlines", DL: "Delta", UA: "United", AC: "Air Canada", ET: "Ethiopian",
    MS: "EgyptAir", EY: "Etihad", LY: "El Al", PS: "UIA",
    // Azja (Chiny, Tajlandia, Wietnam, Laos i okolice)
    ZH: "Shenzhen Airlines", CA: "Air China", CZ: "China Southern", MU: "China Eastern", HU: "Hainan Airlines", "3U": "Sichuan Airlines",
    MF: "Xiamen Airlines", FM: "Shanghai Airlines", HO: "Juneyao Air", "9C": "Spring Airlines", KN: "China United", GS: "Tianjin Airlines",
    SC: "Shandong Airlines", "8L": "Lucky Air", JD: "Capital Airlines", CX: "Cathay Pacific", UO: "HK Express", HX: "Hong Kong Airlines",
    NX: "Air Macau", BR: "EVA Air", CI: "China Airlines", AK: "AirAsia", FD: "Thai AirAsia", D7: "AirAsia X", XJ: "Thai AirAsia X",
    QZ: "Indonesia AirAsia", Z2: "Philippines AirAsia", VJ: "VietJet Air", VZ: "Thai Vietjet", VN: "Vietnam Airlines", QH: "Bamboo Airways",
    VU: "Vietravel Airlines", BL: "Pacific Airlines", TG: "Thai Airways", PG: "Bangkok Airways", WE: "Thai Smile", SL: "Thai Lion Air",
    DD: "Nok Air", QV: "Lao Airlines", LK: "Lao Skyway", K6: "Cambodia Angkor Air", KR: "Cambodia Airways", "8M": "Myanmar Airways",
    SQ: "Singapore Airlines", TR: "Scoot", "3K": "Jetstar Asia", MH: "Malaysia Airlines", OD: "Batik Air", JL: "Japan Airlines", NH: "ANA",
    KE: "Korean Air", OZ: "Asiana", "7C": "Jeju Air", TW: "T'way Air", MM: "Peach", GK: "Jetstar Japan", JQ: "Jetstar", AI: "Air India",
    "6E": "IndiGo", WY: "Oman Air", GF: "Gulf Air", SV: "Saudia", FZ: "flydubai", G9: "Air Arabia", KC: "Air Astana", HY: "Uzbekistan Airways",
    PR: "Philippine Airlines", "5J": "Cebu Pacific", GA: "Garuda Indonesia", JT: "Lion Air", VS: "Virgin Atlantic", LS: "Jet2", BY: "TUI",
  };

  /* ---------- loty ---------- */
  const AIRLINES = [...new Set("LO|FR|RK|W6|W4|W9|LH|U2|EC|BA|KL|AF|OS|LX|SK|AY|TP|IB|VY|EW|DY|D8|TK|EK|QR|A3|RO|OK|JU|BT|4U|HV|TO|V7|ENT|E4|PC|SN|LG|EI|AZ|UX|FI|AA|DL|UA|AC|ET|MS|QS|OU|EY|LY|PS"
    .split("|").concat(Object.keys(AIRLINE_NAMES)))].sort((a, b) => b.length - a.length).join("|");
  // numer lotu – nie fragment dłuższej liczby („FR 58 512 277 450” to numer VAT, „EC4A” to kod pocztowy)
  const FLIGHT_RE = new RegExp(`(?<![\\w-])(${AIRLINES})\\s?(\\d{1,4})\\b(?!\\s?\\d)(?![.,]\\d)`, "g");
  const NOT_AIRPORT = new Set(["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "CNY", "RMB", "THB", "VND", "LAK", "KHR", "JPY", "HKD", "SGD", "MYR", "IDR",
    "PNR", "LOT", "THE", "AND", "FOR", "VIA", "PDF", "SMS", "VAT", "NIP", "ZIP", "FAQ", "WWW", "ADT", "CHD", "INF", "OUT", "RET", "DEP", "ARR", "PAX",
    "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "BAG", "PLL", "MRS", "ETK", "EMD", "BIC", "IBA", "VIP", "NCA",
    "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "ALL", "ONE", "NEW", "BUS", "CAR", "SEA", "AIR", "PIN", "ATM", "DOB", "UTC", "GMT", "CET", "EST", "MRS"]);
  const FLIGHT_CTX = /\b(flights?|lot[uy]?|boarding|airlines?|linie lotnicze|odprawa|e-?ticket|samolot|przelot|itinerary)\b/i;

  function placeName(text, code, air) {
    const m = text.match(new RegExp(`([${L}][${L} .'-]{1,28}?)\\s*[(\\[]\\s*${code}\\s*[)\\]]`));
    if (m) return `${m[1].trim().replace(/^(?:(?:to|do|z|ze|from|von|nach|a|à|->)\s+)+/i, "")} ${code}`;
    const a = air.get(code);
    return a && a.name ? `${a.name} ${code}` : code;
  }

  // godzina „przy” lotnisku: najbliższa, bez innego lotniska tego lotu po drodze; kilka godzin pod rząd (zmiana rozkładu) → ostatnia
  function timeNear(text, times, tok, others, lo, hi, used) {
    let best = null;
    for (const t of times) {
      if (t.index < lo || t.index >= hi || used.has(t)) continue;
      const a = Math.min(t.index, tok.index), b = Math.max(t.end, tok.end);
      if (others.some(o => o !== tok && o.index > a && o.index < b)) continue;
      const d = t.index > tok.index ? t.index - tok.end : tok.index - t.end;
      if (d > 220) continue;
      if (!best || d < best.d) best = { t, d };
    }
    if (!best) return null;
    let t = best.t;
    for (let n = times.indexOf(t) + 1; n < times.length && /^[\s\-–]*$/.test(text.slice(t.end, times[n].index)) && times[n].index < hi; n++) t = times[n];
    return t;
  }

  function parseFlights(text, air) {
    const ap = [];
    for (const m of text.matchAll(/\b[A-Z]{3}\b/g)) {
      if (NOT_AIRPORT.has(m[0]) || !air.has(m[0])) continue;
      ap.push({ code: m[0], index: m.index, end: m.index + 3 });
    }
    const fl = [];
    for (const m of text.matchAll(FLIGHT_RE)) {
      const number = `${m[1]} ${m[2]}`;
      if (/(?:airbus|boeing|embraer|aircraft|samolot|airplane|typ)\W{0,3}$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue; // „Airbus A320” to nie lot A3 20
      if (!fl.some(f => f.number === number)) fl.push({ number, air: m[1], index: m.index, end: m.index + m[0].length });
    }
    // bez żadnego lotniska to nie lot (np. chiński pociąg „D8661” to nie Norwegian D8 661)
    if (!fl.length || !ap.length || (!FLIGHT_CTX.test(text) && ap.length < 2)) return [];
    // przesiadka w jednym wierszu: „TG950, LO336” – jedna podróż, kilka numerów
    const groups = [];
    for (const f of fl) {
      const g = groups[groups.length - 1];
      if (g && /^[\s,/&+]*$/.test(text.slice(g.end, f.index))) { g.list.push(f); g.end = f.end; }
      else groups.push({ list: [f], index: f.index, end: f.end });
    }
    // lotniska lotu: dwa ostatnie przed numerem (od poprzedniego lotu), brakujące – zaraz po numerze
    const used = new Set();
    groups.forEach((g, i) => {
      const prev = i ? groups[i - 1].end : 0, next = groups[i + 1] ? groups[i + 1].index : text.length;
      const fresh = a => !used.has(a) && (!g.from || a.code !== g.from.code);
      const before = ap.filter(a => a.index >= prev && a.index < g.index && !used.has(a));
      // ten sam kod kilka razy pod rząd (nazwa + kod) – liczy się jako jedno lotnisko
      const uniq = before.filter((a, k) => !k || a.code !== before[k - 1].code);
      if (uniq.length >= 2) { g.from = uniq[uniq.length - 2]; g.to = uniq[uniq.length - 1]; }
      else {
        if (uniq.length) g.from = uniq[0];
        for (const a of ap) {
          if (a.index < g.end || a.index >= next || !fresh(a)) continue;
          if (!g.from) g.from = a; else if (!g.to) { g.to = a; break; }
        }
      }
      [g.from, g.to].forEach(a => a && used.add(a));
    });
    const times = findTimes(text), dates = findDates(text);
    const out = [];
    groups.forEach((g, i) => {
      g.lo = Math.min(g.index, g.from ? g.from.index : g.index);
      g.hi = Math.max(g.end, g.to ? g.to.end : g.end);
    });
    groups.forEach((g, i) => {
      const lo = i ? groups[i - 1].hi : 0, hi = groups[i + 1] ? groups[i + 1].lo : text.length;
      const f0 = g.list[0];
      const seg = { type: "lot", number: g.list.map(f => f.number).join(", "), carrier: AIRLINE_NAMES[f0.air] || carrierIn(text) || "",
        from: g.from ? placeName(text, g.from.code, air) : "", to: g.to ? placeName(text, g.to.code, air) : "" };
      // godziny
      const usedT = new Set();
      let t1 = null, t2 = null;
      const close = g.from && g.to && g.to.index - g.from.end < 60 && !times.some(t => t.index > g.from.end && t.index < g.to.index);
      if (close) { // „Warsaw (WAW) to Bangkok (BKK)” – obie godziny dalej, po kolei
        const ts = times.filter(t => t.index > g.to.end && t.index < hi);
        t1 = ts[0] || null; t2 = ts[1] || null;
      } else {
        const toks = [g.from, g.to].filter(Boolean);
        if (g.from) { t1 = timeNear(text, times, g.from, toks, lo, hi, usedT); if (t1) usedT.add(t1); }
        if (g.to) t2 = timeNear(text, times, g.to, toks, lo, hi, usedT);
        if (!g.from && !g.to) { const ts = times.filter(t => t.index > lo && t.index < hi); t1 = ts[0]; t2 = ts[1]; }
      }
      // daty: tuż przed godziną w tym samym wierszu („Tue 15 Dec · 21:10”) albo w nawiasie po niej („15:40 (17 Dec)”)
      const inline = t => {
        if (!t) return null;
        const lineStart = text.lastIndexOf("\n", t.index) + 1;
        const b = dates.filter(d => d.index >= lineStart && d.end <= t.index && t.index - d.end < 25).pop();
        if (b) return b;
        const a = dates.find(d => d.index >= t.end && d.index - t.end < 4 && /^\s*\(/.test(text.slice(t.end, d.index + 1)));
        return a || null;
      };
      const plus1 = t => t && /^\s*\+\s?1\b/.test(text.slice(t.end, t.end + 4));
      const marker = d => /^\s*\(/.test(text.slice(Math.max(0, d.index - 2), d.index)) || /\(\s*$/.test(text.slice(Math.max(0, d.index - 2), d.index));
      let d1 = inline(t1);
      if (!d1 && t1) {
        const inWin = dates.filter(d => d.index >= lo && d.index < hi && !marker(d));
        d1 = inWin.filter(d => d.index < t1.index).pop() || inWin.find(d => d.index > t1.index) || dates.filter(d => d.index < t1.index && !marker(d)).pop() || null;
      }
      if (d1 && t1) seg.depart = `${d1.date}T${t1.time}`;
      if (d1 && t2) {
        const d2 = inline(t2);
        seg.arrive = `${d2 && d2 !== d1 ? d2.date : (t2.time < t1.time || plus1(t2)) ? App.addDays(d1.date, 1) : d1.date}T${t2.time}`;
      }
      // miejsce, terminal
      const win = text.slice(g.lo, hi);
      const seat = (g.to && text.slice(g.lo, hi).match(new RegExp(`\\b${g.to.code}\\s*:\\s*(\\d{1,2}[A-L])\\b`)))
        || win.match(/(?:seats?|miejsce|siedzenie|sitzplatz)\s*[:#]?\s*(\d{1,2}[A-L])\b/i);
      if (seat) seg.seat = seat[1].toUpperCase();
      const termSrc = g.from ? text.slice(g.from.index, Math.min(hi, g.from.end + 90)) + (t1 ? " " + text.slice(t1.index, t1.index + 90) : "") : "";
      const term = termSrc.match(/\bterminal\s*[:#]?\s*([A-Z0-9]{1,3})\b/i) || termSrc.match(/\bT([1-9])\b/);
      if (term) seg.terminal = term[1].toUpperCase();
      const gate = win.match(/\bgate\s*[:#]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
      if (gate) seg.gate = gate[1].toUpperCase();
      out.push(seg);
    });
    return out;
  }

  /* ---------- pociąg / autobus / prom ---------- */
  const TRAIN_RE = /\b(EIP|EIC|EC|EN|IC|TLK|ICE|IR|RE|RJ|NJ|TGV|FLX)\s?(\d{2,5})\b|(?:^|[\s·(])([GDCKTZ]\d{1,4}|SE\d{1,2})\b|#([A-Z]{2}\d{3,5})\b/;
  const LABELS = /\b(odjazd|przyjazd|departure|arrival|abfahrt|ankunft|godz\.?|from|to|od|do|z|ze|stacja|station|przystanek|stop|data|date|dnia|peron|tor|platform|wagon|miejsce|seat|klasa|class)\b\.?:?/gi;
  function cleanPlace(line) {
    let s = line.replace(/\b([01]?\d|2[0-3]):[0-5]\d(\s?[AaPp]\.?[Mm]\.?)?/g, " ");
    for (const d of findDates(s).reverse()) s = s.slice(0, d.index) + " " + s.slice(d.end);
    return s.replace(LABELS, " ")
      .replace(/[|→>–—\-:,;()*•]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  }
  const trainNo = s => { const n = s.match(TRAIN_RE); return n ? (n[1] ? `${n[1]} ${n[2]}` : n[3] || n[4]) : ""; };
  const lineNo = s => { const b = s.match(/(?:linia|line|kurs|course|bus)\s*(?:nr\.?)?\s*[:#]?\s*([A-Z]?\d{2,5})\b/i); return b ? b[1] : ""; };
  // przejazd z przesiadkami: wiersze „09:15 Manchester Piccadilly”, „- Departure: 10:30 Edinburgh Waverley” → odcinki parami
  const STOP_RE = /^(?:[-*•]\s*)?(?:(?:departure|arrival|odjazd|przyjazd|abfahrt|ankunft|dep\.?|arr\.?)\s*:?\s*)?((?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[AaPp]\.?[Mm]\.?)?)\s+([^\d\s].{2,60})$/i;
  function parseLegs(text, type) {
    const lines = text.split("\n");
    let pos = 0;
    const stops = [];
    for (const l of lines) {
      const m = l.trim().match(STOP_RE);
      if (m && !/zameldowanie|check-?in|wymeldowanie|check-?out|transaction/i.test(l)) stops.push({ time: findTimes(m[1])[0].time, place: cleanPlace(m[2]), index: pos + l.indexOf(m[1]) });
      pos += l.length + 1;
    }
    if (stops.length < 2) return [];
    const dates = findDates(text), out = [];
    for (let i = 0; i + 1 < stops.length; i += 2) {
      const a = stops[i], b = stops[i + 1];
      const d = dates.filter(x => x.index < a.index).pop() || dates.find(x => x.index > a.index);
      const lineA = text.lastIndexOf("\n", a.index) + 1;
      const ctx = text.slice(Math.max(lineA - 160, i ? stops[i - 1].index + 1 : 0), b.index); // wiersze przed odjazdem i między przystankami
      const seg = { type, from: a.place, to: b.place, carrier: carrierIn(ctx) || (i ? "" : carrierIn(text)), number: trainNo(ctx) || (type === "autobus" ? lineNo(ctx) || lineNo(text) : "") };
      if (d) { seg.depart = `${d.date}T${a.time}`; seg.arrive = `${b.time < a.time ? App.addDays(d.date, 1) : d.date}T${b.time}`; }
      out.push(seg);
    }
    // wagon / miejsce (np. pociągi w Chinach) – do pierwszego odcinka
    const car = text.match(/(?:wagon|wag\.|coach|car(?:riage)?|wagen)\s*(?:nr\.?|no\.?)?\s*[:#]?\s*(\d{1,3})\b/i);
    const seat = text.match(/(?:miejsce|seat|sitzplatz|platz)\s*(?:nr\.?|no\.?)?\s*[:#]?\s*(\d{1,3}[A-F]?)\b/i);
    if (car) out[0].car = String(+car[1]);
    if (seat) out[0].seat = seat[1];
    return out;
  }
  function parseGround(text, type) {
    const seg = { type, carrier: carrierIn(text) || "" };
    const n = trainNo(text);
    if (n) seg.number = n;
    else if (lineNo(text)) seg.number = lineNo(text);
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
    // odjazd / przyjazd z etykietą i własną datą („Departure: 14 Dec 2026, 20:00”)
    const lab = (re) => { const m = text.match(re); if (!m) return null; const s = text.slice(m.index, m.index + 60); const d = findDates(s)[0], t = findTimes(s)[0]; return d && t ? `${d.date}T${t.time}` : null; };
    const dep = lab(/(?:odjazd|departure|abfahrt)\s*:/i), arr = lab(/(?:przyjazd|arrival|ankunft)\s*:/i);
    if (dep) { seg.depart = dep; if (arr) seg.arrive = arr; }
    else {
      const d = findDates(text)[0], times = findTimes(text);
      if (d && times[0]) seg.depart = `${d.date}T${times[0].time}`;
      if (d && times[1]) seg.arrive = `${times[1].time < times[0].time ? App.addDays(d.date, 1) : d.date}T${times[1].time}`;
    }
    const car = text.match(/(?:wagon|wag\.|coach|car(?:riage)?|wagen)\s*(?:nr\.?)?\s*[:#]?\s*(\d{1,3})\b/i);
    const seat = text.match(/(?:miejsce|m\.|seat|sitzplatz|platz)\s*(?:nr\.?)?\s*[:#]?\s*(\d{1,3}[A-Z]?)\b/i);
    const platform = text.match(/(?:peron|platform|gleis|stanowisko)\s*[:#]?\s*(\d{1,3}[A-Z]?)\b/i);
    if (car) seg.car = String(+car[1]);
    if (seat) seg.seat = seat[1];
    if (platform) seg.platform = platform[1];
    return seg;
  }

  /* ---------- nocleg ---------- */
  const STAY_IN = /zameldowanie|check-?in|przyjazd|anreise/i, STAY_OUT = /wymeldowanie|check-?out|wyjazd|abreise/i;
  function parseStay(text) {
    // „check-in” w mailu lotniczym to odprawa – nocleg tylko, gdy jest też wymeldowanie
    const ci = text.search(/zameldowanie|check-?in\b(?!\s+(?:online|opens|closes|desk|counter))|anreise/i), co = text.search(STAY_OUT);
    if (ci < 0 || co < 0) return null;
    const dates = findDates(text), times = findTimes(text);
    const d1 = after(dates, ci), d2 = after(dates, co);
    if (!d1 || !d2 || d2.date < d1.date) return null;
    const t1 = times.find(x => x.index >= ci && x.index < ci + 140), t2 = times.find(x => x.index >= co && x.index < co + 140);
    const lines = text.split(/\n/).map(x => x.trim()).filter(Boolean);
    const named = text.match(/(?:obiekt|hotel|property|zakwaterowanie|accommodation|unterkunft)\s*:\s*([^\n]{2,60})/i)
      || text.match(/(?:rezerwacja w obiekcie|booking at|reservation at|your stay at)\s+([^\n]{2,60}?)\s+(?:jest|została|is|has)\b/i);
    const hosted = lines.findIndex(l => /\bhosted by\b|gospodarz:/i.test(l));
    const nameLine = lines.find(l => /\b(hotel|hostel|apartament\w*|apartment\w*|resort|guest ?house|guesthouse|homestay|pensjonat|villa|inn|motel|b&b|residences?|lodge|bungalow)\b/i.test(l)
      && !/zameldowanie|wymeldowanie|check-?in|check-?out|booking\.com|airbnb|agoda|potwierdz|confirm|rezerwacj|reservation|zapłacisz|pay|płatn|kontakt|contact|room type|pokój/i.test(l) && l.length <= 70);
    // adres: „Adres: …” albo etykieta w osobnym wierszu („Lokalizacja” / „Address”) i adres poniżej
    let address = "";
    const al = text.match(/(?:^|\n)\s*(?:adres|address|anschrift|lokalizacja|location)\s*:?\s*([^\n]*)\n?([^\n]*)\n?([^\n]*)/i);
    if (al) {
      address = al[1].trim();
      if (!address || address.endsWith(",")) address = [address, al[2].trim(), al[2].trim().endsWith(",") ? al[3].trim() : ""].filter(Boolean).join(" ");
    }
    const phone = text.match(/(?:telefon|phone|tel\.?)\s*:?\s*(\+?\d[\d ()-]{6,20}\d)/i);
    const seg = {
      type: "nocleg", name: (named ? named[1] : hosted > 0 ? lines[hosted - 1] : nameLine || "").replace(/^[\s:–-]+/, "").trim().slice(0, 60),
      address: address.slice(0, 120),
      depart: `${d1.date}T${t1 ? t1.time : "15:00"}`, arrive: `${d2.date}T${t2 ? t2.time : "11:00"}`,
    };
    if (phone) seg.phone = phone[1].trim();
    return seg;
  }

  /* ---------- całość ---------- */
  async function parse(raw) {
    const text = normalize(raw);
    const air = App.Stats ? await App.Stats.airports() : new Map();
    const out = [];
    const flights = parseFlights(text, air);
    out.push(...flights);
    const stay = (!flights.length || /zameldowanie|wymeldowanie|check-?out|checkout/i.test(text)) ? parseStay(text) : null;
    if (!flights.length) {
      const ground = stay ? text.slice(0, text.search(STAY_IN)) : text;
      const type = /ferry|\bprom\b|speedboat|lomprayah|boat\b/i.test(text) ? "prom"
        : /flix ?bus|autobus|\bbus\b|sindbad|przewóz osób|minivan|nakhonchai|green bus/i.test(text) && !/pociąg|\btrains?\b|\bzug\b|railway|rail\b/i.test(text) ? "autobus"
        : TRAIN_RE.test(text) || /pociąg|intercity|polregio|koleje|wagon|\btrains?\b|\bzug\b|bahn|regiojet|trenitalia|renfe|sncf|railway|rail\b|carriage|trainline|rail ?europe|national rail|\bstation\b|stacja|dworzec|bahnhof|underground|\btube\b/i.test(text) ? "pociag" : "";
      if (type) {
        const legs = parseLegs(ground, type);
        out.push(...(legs.length ? legs : [parseGround(ground, type)]));
      }
    }
    if (stay) out.push(stay);
    const c = common(text);
    out.forEach((s, i) => {
      if (c.booking && !s.booking) s.booking = c.booking;
      if (c.price && i === 0) { s.price = c.price; s.currency = c.currency || "PLN"; } // cena całej rezerwacji – przy pierwszym odcinku
    });
    // ten sam odcinek dwa razy (np. wklejone dwa takie same maile) – raz
    const seen = new Set();
    return out.filter(s => s.depart || s.from || s.to || s.name).filter(s => {
      const k = [s.type, s.from, s.to, s.name, s.depart].join("|");
      return !seen.has(k) && seen.add(k);
    });
  }

  /* ---------- pliki: PDF, kalendarz (.ics), mail (.eml) ---------- */
  function decodeQP(s) { return s.replace(/=\r?\n/g, "").replace(/(=[0-9A-F]{2})+/gi, m => { try { return new TextDecoder().decode(new Uint8Array(m.slice(1).split("=").map(h => parseInt(h, 16)))); } catch (e) { return m; } }); }
  function decodeB64(s) { try { return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0))); } catch (e) { return ""; } }
  function emlText(raw) {
    // części maila: najpierw text/plain, inaczej text/html
    const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
    const pick = type => parts.map(p => {
      const [head, ...body] = p.split(/\r?\n\r?\n/);
      if (!new RegExp(`content-type:\\s*${type}`, "i").test(head)) return "";
      const b = body.join("\n\n");
      return /content-transfer-encoding:\s*base64/i.test(head) ? decodeB64(b) : /quoted-printable/i.test(head) ? decodeQP(b) : b;
    }).filter(Boolean).join("\n");
    const subject = (raw.match(/^subject:\s*(.+)$/im) || [, ""])[1];
    return `${subject}\n${pick("text/plain") || pick("text/html") || raw}`;
  }
  function icsText(raw) {
    const s = raw.replace(/\r?\n[ \t]/g, "");
    const val = (blk, k) => { const m = blk.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "m")); return m ? m[1].replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1").trim() : ""; };
    const when = v => { const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?(Z)?/); if (!m) return "";
      if (m[6]) { const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
      return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`; };
    return s.split("BEGIN:VEVENT").slice(1).map(b => [val(b, "SUMMARY"), `${when(val(b, "DTSTART"))} ${val(b, "LOCATION")}`.trim(),
      `${when(val(b, "DTEND"))}`, val(b, "DESCRIPTION")].filter(Boolean).join("\n")).join("\n\n");
  }
  async function fileText(file) {
    const name = (file.name || "").toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return App.Tickets && App.Tickets.pdfText ? App.Tickets.pdfText(file, 4) : "";
    const raw = await file.text();
    if (name.endsWith(".ics") || /text\/calendar/.test(file.type) || /BEGIN:VCALENDAR/.test(raw.slice(0, 200))) return icsText(raw);
    if (name.endsWith(".eml") || /message\/rfc822/.test(file.type) || /^(?:received|from|subject|mime-version):/im.test(raw.slice(0, 2000))) return emlText(raw);
    return raw;
  }

  /* ================= EKRAN „WKLEJ Z MAILA” ================= */
  const TYPE_ICON = { lot: "✈️", pociag: "🚆", autobus: "🚌", nocleg: "🏨" };
  App.route(/^\/wklej$/, async (_, q) => {
    const trips = (await DB.all("trips")).sort((a, b) => b.start.localeCompare(a.start));
    const shared = App.sharedText || "";
    App.sharedText = null;
    let found = [], srcFile = null; // PDF z biletem – dołączany do pierwszego odcinka
    return {
      title: "Dodaj z maila",
      back: q.trip ? `#/podroze/${q.trip}` : "#/podroze",
      html: `
        <p class="small muted" style="margin-top:0">Skopiuj treść maila z potwierdzeniem (lot, pociąg, autobus, prom, hotel) i wklej poniżej – albo wczytaj plik:
          PDF z biletem, zaproszenie do kalendarza (.ics) lub zapisany mail (.eml).
          Odczyt dzieje się w telefonie – nic nie jest nigdzie wysyłane. <b>Sprawdź dane przed zapisaniem.</b></p>
        <p class="small muted em-src">Rozpoznaje m.in.: Booking.com, Trip.com, Agoda, Airbnb, Gotogate, 12Go, Trainline, Rail Europe, AirAsia, VietJet, linie chińskie i europejskie, PKP, FlixBus.</p>
        <textarea id="em-text" class="em-text" rows="8" placeholder="Wklej tutaj treść maila…">${esc(shared)}</textarea>
        <div class="add-row">
          <button type="button" class="btn" id="em-paste">📋 Wklej ze schowka</button>
          <label class="btn">📎 Z pliku<input type="file" id="em-file" accept=".pdf,.ics,.eml,.txt,.html,.htm,application/pdf,text/calendar,message/rfc822,text/plain,text/html" hidden></label>
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
          if (!text) { App.toast("Najpierw wklej treść maila albo wczytaj plik"); return; }
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
            const saved = await DB.put("segments", { ...rec, tripId });
            // PDF, z którego to odczytano – od razu jako bilet pierwszego odcinka
            if (!n && srcFile && App.Tickets && App.Tickets.addFiles) await App.Tickets.addFiles(saved, [srcFile]);
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
        ta.addEventListener("input", () => { srcFile = null; });
        view.querySelector("#em-file").onchange = async e => {
          const file = e.target.files[0];
          e.target.value = "";
          if (!file) return;
          out.innerHTML = `<p class="muted small">Czytam plik…</p>`;
          try {
            const text = (await fileText(file)).trim();
            if (!text) { out.innerHTML = `<p class="error">W pliku nie ma tekstu (to może być skan albo zdjęcie). Dodaj bilet w odcinku jako plik, a dane wpisz ręcznie.</p>`; return; }
            ta.value = text.slice(0, 30000);
            srcFile = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? file : null;
            run();
          } catch (err) { out.innerHTML = `<p class="error">Nie udało się odczytać pliku: ${esc(err.message || err)}</p>`; }
        };
        view.querySelector("#em-paste").onclick = async () => {
          try { ta.value = await navigator.clipboard.readText(); run(); }
          catch (e) { App.toast("Brak dostępu do schowka – wklej ręcznie (przytrzymaj pole)"); ta.focus(); }
        };
        if (shared) run();
      },
    };
  });

  App.Email = { parse, findDates, normalize, fileText };
})();
