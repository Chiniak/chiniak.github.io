/* Podróżnik – wizy i zezwolenia na wjazd (polski paszport).
   Ten plik działa i w aplikacji, i w service workerze (przypomnienia w tle) – bez DOM i bez App.
   Kraje podróży (offline): lotniska przylotu i wylotu (kody IATA, lib/airports.js), cel i nazwa podróży, noclegi (nazwa, adres),
   stacje / porty innych odcinków, miejsca z planu – po nazwach krajów (pl, en) i większych miast. Przesiadka (< 24 h na lotnisku,
   bez noclegu i bez wzmianki w tekstach) liczy się tylko w USA i Kanadzie (ESTA / eTA także w tranzycie).
   Ręcznie w podróży (trip.visa): { add: ["LA"], skip: ["TH"], done: ["VN"] }. Wiza w Dokumentach (rodzaj „wiza”, kraj, ważna do końca
   podróży) = „mam”.
   DANE ORIENTACYJNE – stan wiedzy z 1. połowy 2026 r. Przepisy się zmieniają: zawsze link do MSZ „Informacje dla podróżujących”. */
(function (root) {
  const AS_OF = "2026";
  const MSZ = "https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych";

  /* rodzaje:
     eu    – UE / EOG / Szwajcaria i mikropaństwa – wystarczy dowód osobisty (nie pokazujemy)
     free  – bez wizy (days = najdłuższy pobyt)
     form  – bez wizy, ale formularz przyjazdu online przed przylotem (permit = nazwa)
     eta   – elektroniczne zezwolenie na podróż przed wylotem (ESTA, eTA, ETA…)
     evisa – e-wiza przez internet
     voa   – wiza po przylocie (zwykle można też wcześniej przez internet)
     visa  – wiza z ambasady / przez biuro podróży
     check – zasady czasowe albo niepewne – sprawdź przed wyjazdem
     [rodzaj, dni, nazwa zezwolenia, oficjalna strona, „do kiedy” (czasowe zwolnienie), tranzyt wymaga zezwolenia] */
  const D = {
    // Europa poza UE
    GB: ["eta", 180, "UK ETA", "https://www.gov.uk/eta"],
    AL: ["free", 90], BA: ["free", 90], ME: ["free", 90], MK: ["free", 90], RS: ["free", 90], XK: ["free", 90],
    MD: ["free", 90], UA: ["free", 90], TR: ["free", 90], GE: ["free", 365], AM: ["free", 180],
    AZ: ["evisa", 30, "ASAN Visa", "https://evisa.gov.az"],
    BY: ["check", 30, "", "", "", false], RU: ["visa", 0, "", "https://evisa.kdmid.ru"],
    // Azja Środkowa
    KZ: ["free", 30], UZ: ["free", 30], KG: ["free", 60], TJ: ["evisa", 60, "e-wiza", "https://www.evisa.tj"], TM: ["visa", 0], MN: ["check", 30],
    // Azja Wschodnia i Południowo-Wschodnia
    CN: ["free", 30, "", "", "2026-12-31"], HK: ["free", 90], MO: ["free", 90], TW: ["free", 90], JP: ["free", 90],
    KR: ["check", 90, "K-ETA", "https://www.k-eta.go.kr"],
    VN: ["free", 45, "", "https://evisa.gov.vn", "2028-12-31"],
    LA: ["voa", 30, "", "https://laoevisa.gov.la"],
    KH: ["evisa", 30, "e-wiza", "https://www.evisa.gov.kh"],
    TH: ["form", 60, "TDAC", "https://tdac.immigration.go.th"],
    MY: ["form", 90, "MDAC", "https://imigresen-online.imi.gov.my/mdac/main"],
    SG: ["form", 90, "SG Arrival Card", "https://eservices.ica.gov.sg/sgarrivalcard/"],
    ID: ["voa", 30, "e-VOA", "https://evisa.imigrasi.go.id"],
    PH: ["form", 30, "eTravel", "https://etravel.gov.ph"],
    MM: ["evisa", 28, "e-wiza", "https://evisa.moip.gov.mm"],
    // Azja Południowa
    IN: ["evisa", 30, "e-Tourist Visa", "https://indianvisaonline.gov.in/evisa/"],
    LK: ["eta", 30, "ETA", "https://www.eta.gov.lk"],
    NP: ["voa", 30, "", "https://nepaliport.immigration.gov.np"],
    MV: ["form", 30, "IMUGA", "https://imuga.immigration.gov.mv"],
    BT: ["visa", 0, "wiza przez biuro podróży", "https://visit.doi.gov.bt"],
    PK: ["eta", 90, "ETA", "https://visa.nadra.gov.pk"],
    // Bliski Wschód
    AE: ["free", 90], QA: ["free", 90], OM: ["free", 14], BH: ["evisa", 14, "e-wiza", "https://www.evisa.gov.bh"],
    KW: ["voa", 90, "", "https://evisa.moi.gov.kw"], SA: ["evisa", 90, "e-wiza", "https://visa.visitsaudi.com"],
    JO: ["voa", 30, "Jordan Pass", "https://www.jordanpass.jo"],
    IL: ["eta", 90, "ETA-IL", "https://israel-entry.piba.gov.il"],
    EG: ["voa", 30, "", "https://visa2egypt.gov.eg"],
    IR: ["visa", 0, "", "https://evisatraveller.mfa.ir"],
    // Afryka
    MA: ["free", 90], TN: ["free", 90], ZA: ["free", 90], BW: ["free", 90], ZM: ["free", 90], MU: ["free", 90], SN: ["free", 90],
    KE: ["eta", 90, "eTA", "https://www.etakenya.go.ke"],
    TZ: ["evisa", 90, "e-wiza (także Zanzibar)", "https://visa.immigration.go.tz"],
    UG: ["evisa", 90, "e-wiza", "https://visas.immigration.go.ug"], RW: ["voa", 30, "", "https://irembo.gov.rw"],
    ET: ["evisa", 30, "e-wiza", "https://www.evisa.gov.et"], NA: ["evisa", 90, "e-wiza", "https://eservices.mhaiss.gov.na"],
    ZW: ["voa", 30, "KAZA Univisa", "https://www.evisa.gov.zw"], MG: ["voa", 30, "", "https://evisamada.mg"],
    SC: ["eta", 90, "Seychelles Travel Authorisation", "https://seychelles.govtas.com"],
    CV: ["form", 30, "EASE", "https://www.ease.gov.cv"],
    DZ: ["visa", 0], GH: ["visa", 0], NG: ["visa", 0],
    // Ameryki
    US: ["eta", 90, "ESTA", "https://esta.cbp.dhs.gov", "", true],
    CA: ["eta", 180, "eTA", "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html", "", true],
    MX: ["free", 180], CU: ["evisa", 90, "e-wiza / karta turysty + D'Viajeros", "https://evisacuba.cu"],
    DO: ["form", 30, "e-Ticket", "https://eticket.migracion.gob.do"], JM: ["free", 90], BS: ["free", 90],
    CR: ["free", 90], PA: ["free", 90], GT: ["free", 90], HN: ["free", 90], SV: ["free", 90], NI: ["free", 90],
    CO: ["form", 90, "Check-MIG", "https://apps.migracioncolombia.gov.co/pre-registro/"],
    EC: ["free", 90], PE: ["free", 90], BO: ["free", 90], BR: ["free", 90], AR: ["free", 90], CL: ["free", 90], UY: ["free", 90], PY: ["free", 90],
    // Oceania
    AU: ["eta", 90, "eVisitor (651)", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651"],
    NZ: ["eta", 90, "NZeTA", "https://www.immigration.govt.nz/nzeta"], FJ: ["free", 120],
  };
  for (const cc of "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PT RO SK SI ES SE IS LI NO CH AD MC SM VA PF NC".split(" ")) D[cc] = ["eu", 0];
  const HOME = "PL";

  // ile dni przed przylotem przypomnieć (i jeszcze raz bliżej)
  const LEAD = { eta: [30, 7], evisa: [45, 14], visa: [75, 30], voa: [14], form: [3], check: [30, 7] };

  /* ---------- nazwy krajów i miast (do rozpoznania w tekstach) ---------- */
  const NAME_FIX = { HK: "Hongkong", MO: "Makau", US: "USA", GB: "Wielka Brytania", CV: "Wyspy Zielonego Przylądka" };
  const ALIAS = {
    VN: "hanoi|ha noi|sajgon|saigon|ho chi minh|da nang|danang|hoi an|hue|ha long|halong|nha trang|phu quoc|sapa|ninh binh|dalat|da lat|viet nam",
    LA: "wientian|vientiane|luang prabang|vang vieng|pakse", KH: "phnom penh|siem reap|angkor|sihanoukville|kampot|kambodza|cambodia",
    TH: "bangkok|phuket|chiang mai|krabi|pattaya|koh samui|ko samui|ayutthaya|chiang rai|koh phangan|koh tao",
    MY: "kuala lumpur|penang|langkawi|malakka|melaka|kota kinabalu", ID: "bali|dzakarta|jakarta|yogyakarta|lombok|ubud|komodo",
    PH: "manila|cebu|palawan|boracay|el nido|filipiny|philippines", JP: "tokio|tokyo|kioto|kyoto|osaka|hiroszima|hiroshima|nara",
    KR: "seul|seoul|busan|jeju", CN: "pekin|beijing|szanghaj|shanghai|xian|chengdu|guilin|kanton|guangzhou|shenzhen|chiny",
    HK: "hongkong|hong kong", MO: "makau|macau|macao", TW: "tajpej|taipei", IN: "delhi|mumbaj|mumbai|goa|agra|dzajpur|jaipur|kerala|waranasi|varanasi|indie",
    LK: "kolombo|colombo|kandy|sri lanka", NP: "katmandu|kathmandu|pokhara", MV: "malediwy|maldives", MM: "rangun|yangon|bagan|mandalay|birma",
    BT: "thimphu", MN: "ulan bator|ulaanbaatar", AE: "dubaj|dubai|abu zabi|abu dhabi|emiraty|uae", QA: "doha", OM: "maskat|muscat",
    SA: "rijad|riyadh|dzudda|jeddah", TR: "stambul|istanbul|antalya|kapadocja|cappadocia|ankara|izmir|bodrum|alanya|turcja",
    EG: "kair|cairo|hurghada|szarm|sharm|luksor|luxor|marsa alam", JO: "amman|petra|akaba|aqaba|wadi rum", IL: "tel awiw|tel aviv|jerozolima|jerusalem|ejlat|eilat",
    GB: "londyn|london|edynburg|edinburgh|manchester|liverpool|anglia|england|szkocja|scotland|walia|wales|uk|united kingdom",
    US: "nowy jork|new york|los angeles|san francisco|las vegas|miami|chicago|waszyngton|washington dc|hawaje|hawaii|stany zjednoczone",
    CA: "toronto|vancouver|montreal|kanada", MX: "cancun|tulum|mexico city|meksyk", CU: "hawana|havana|varadero|kuba", DO: "punta cana|dominikana",
    CO: "bogota|cartagena|medellin", PE: "cusco|machu picchu", BR: "rio de janeiro|sao paulo", AR: "buenos aires", AU: "sydney|melbourne|brisbane|perth|australia",
    NZ: "auckland|queenstown|wellington|nowa zelandia", KE: "nairobi|mombasa", TZ: "zanzibar|dar es salaam|arusha|kilimandzaro|kilimanjaro|serengeti",
    ZA: "kapsztad|cape town|johannesburg|rpa", MA: "marrakesz|marrakech|casablanca|fez|agadir|maroko", TN: "dzerba|djerba|hammamet|sousse|monastir",
    GE: "tbilisi|batumi|kutaisi|gruzja", AM: "erywan|yerevan", AZ: "baku", UZ: "taszkent|tashkent|samarkanda|samarkand|buchara|bukhara",
    KZ: "almaty|astana", RU: "moskwa|moscow|petersburg", BY: "minsk|bialorus", UA: "kijow|kyiv|lwow|lviv|odessa", SC: "mahe|praslin|la digue",
    CV: "cabo verde|cape verde|zielonego przyladka", MU: "mauritius", IS: "reykjavik", NO: "oslo|bergen|tromso",
  };
  const NO_EN = new Set(["GE", "JO"]); // „Georgia” = też stan USA, „Jordan” = imię
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();
  let dnPl = null, dnEn = null;
  try { dnPl = new Intl.DisplayNames(["pl"], { type: "region" }); dnEn = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { /* stara przeglądarka */ }
  const name = (cc, lang) => {
    const en = lang === "en" || (lang == null && root.I18N && I18N.lang === "en");
    if (!en && NAME_FIX[cc]) return NAME_FIX[cc];
    try { return (en ? dnEn : dnPl).of(cc); } catch (e) { return cc; }
  };
  let matcher = null;
  function textCountries(text) {
    if (!matcher) {
      matcher = [];
      for (const cc of Object.keys(D).concat(HOME)) {
        const words = new Set((ALIAS[cc] || "").split("|").filter(Boolean));
        if (dnPl) { words.add(norm(name(cc, "pl"))); if (!NO_EN.has(cc)) words.add(norm(name(cc, "en"))); }
        if (NAME_FIX[cc]) words.add(norm(NAME_FIX[cc]));
        const list = [...words].filter(w => w && w.length >= 3).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        if (list.length) matcher.push([cc, new RegExp(`(^|[^a-z])(${list.join("|")})($|[^a-z])`)]);
      }
    }
    const t = norm(text), out = new Set();
    if (!t.trim()) return out;
    for (const [cc, re] of matcher) if (re.test(t)) out.add(cc);
    return out;
  }

  /* ---------- lotniska (lib/airports.js – w oknie wczytywane przez ready(), w service workerze przez importScripts) ---------- */
  let AIR = null;
  function airCC(text) {
    if (!AIR) {
      if (!root.AIRPORT_DATA) return null;
      AIR = new Map();
      for (const l of root.AIRPORT_DATA.split("\n")) { const p = l.split("|"); AIR.set(p[0], p[3]); }
    }
    const m = String(text || "").match(/\b[A-Z]{3}\b/g);
    if (!m) return null;
    for (let i = m.length - 1; i >= 0; i--) if (AIR.has(m[i])) return AIR.get(m[i]);
    return null;
  }
  async function ready() {
    if (root.AIRPORT_DATA || typeof document === "undefined") return;
    await new Promise(res => {
      const el = document.createElement("script");
      el.src = "lib/airports.js"; el.onload = res; el.onerror = res;
      document.head.appendChild(el);
    });
  }

  const day = s => String(s || "").slice(0, 10);
  const hours = (a, b) => (new Date(b) - new Date(a)) / 3600000;
  const addDays = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  /* kraje jednej podróży z wymaganiami:
     [{ cc, name, kind, days, permit, url, until, arrive, leave, stay, over, transit, done, doneBy, manual }] */
  // kraje podróży: cc → { arrive, leave, text, stay, air } (air bez stay i text = tylko przesiadka)
  function detect(trip, segs = [], items = []) {
    const seen = {};
    const note = (cc, at, how) => {
      if (!cc || cc === HOME) return;
      const s = seen[cc] || (seen[cc] = { arrive: null, leave: null, text: false, stay: false, air: false });
      if (at && (!s.arrive || at < s.arrive)) s.arrive = at;
      s[how] = true;
    };
    const flights = segs.filter(s => s.type === "lot" && s.depart).sort((a, b) => a.depart.localeCompare(b.depart));
    flights.forEach((f, i) => {
      const to = airCC(f.to), from = airCC(f.from);
      if (from && i > 0) note(from, null, "air");
      if (!to) return;
      const next = flights[i + 1];
      const tr = next && airCC(next.from) === to && f.arrive && hours(f.arrive, next.depart) < 24;
      note(to, day(f.arrive || f.depart), tr ? "air" : "stay");
      if (!tr && next && airCC(next.from) === to && seen[to] && (!seen[to].leave || next.depart > seen[to].leave)) seen[to].leave = day(next.depart);
    });
    // teksty: cel, nazwa, noclegi, inne odcinki, plan
    for (const cc of textCountries(`${trip.destination || ""} | ${trip.name || ""}`)) note(cc, null, "text");
    for (const s of segs) {
      if (s.type === "lot") continue;
      for (const cc of textCountries(s.type === "nocleg" ? `${s.name || ""} | ${s.address || ""}` : `${s.from || ""} | ${s.to || ""}`)) note(cc, day(s.depart), "text");
    }
    for (const i of items) for (const cc of textCountries(i.place && !/^https?:/i.test(i.place) ? i.place : "")) note(cc, i.date || null, "text");
    for (const cc of (trip.visa || {}).add || []) note(cc, null, "text");
    return seen;
  }
  // kraje, w których się bywa (bez samych przesiadek i bez „Nie jadę”) – np. do walut (waluty.js)
  function countries(trip, segs = [], items = []) {
    const seen = detect(trip, segs, items), skip = (trip.visa || {}).skip || [];
    return Object.keys(seen).filter(cc => (seen[cc].stay || seen[cc].text) && !skip.includes(cc));
  }

  function analyze(trip, segs = [], items = [], docs = []) {
    const seen = detect(trip, segs, items);
    const V = trip.visa || {};

    const total = Math.round((new Date(trip.end) - new Date(trip.start)) / 86400000) + 1;
    const stayCountries = Object.keys(seen).filter(cc => seen[cc].stay || seen[cc].text);
    const out = [];
    for (const [cc, s] of Object.entries(seen)) {
      if ((V.skip || []).includes(cc)) continue;
      const row = D[cc];
      if (!row) { out.push({ cc, name: name(cc), kind: "unknown", arrive: s.arrive || trip.start, manual: (V.add || []).includes(cc) }); continue; }
      const [kind, days, permit = "", url = "", until = "", transitNeeds = false] = row;
      if (kind === "eu") continue;
      const transit = !s.stay && !s.text;
      if (transit && !transitNeeds) continue;
      const arriveKnown = !!s.arrive && s.arrive >= day(trip.start);
      const arrive = arriveKnown ? s.arrive : trip.start;
      const leave = s.leave || trip.end;
      // długość pobytu – tylko gdy wiadomo: jeden kraj w podróży albo znany przylot (lot) i wylot z kraju
      const stay = transit ? 0 : stayCountries.length === 1 ? total
        : s.stay && s.leave ? Math.round((new Date(leave) - new Date(arrive)) / 86400000) + 1 : 0;
      const doc = docs.find(d => d.type === "wiza" && textCountries(d.country || "").has(cc) && (!d.expires || d.expires >= trip.end));
      const done = (V.done || []).includes(cc) || !!doc;
      out.push({ cc, name: name(cc), kind, days, permit, url, until, arrive, arriveKnown, leave, stay, transit,
        over: kind !== "visa" && days > 0 && stay > days, untilPassed: !!until && until < trip.end,
        done, doneBy: doc ? "doc" : done ? "manual" : "", docId: doc ? doc.id : null, manual: (V.add || []).includes(cc) });
    }
    const rank = { visa: 0, evisa: 1, eta: 2, check: 3, voa: 4, form: 5, unknown: 6, free: 7 };
    return out.sort((a, b) => (a.done - b.done) || rank[a.kind] - rank[b.kind] || a.arrive.localeCompare(b.arrive));
  }
  // czy kraj wymaga działania przed wyjazdem (do przypomnień i ostrzeżeń)
  const needsAction = v => !v.done && (["eta", "evisa", "visa", "voa", "form", "check"].includes(v.kind) || v.over || v.untilPassed);

  const KIND_TXT = {
    eta: "elektroniczne zezwolenie", evisa: "e-wiza", visa: "wiza", voa: "wiza po przylocie", form: "formularz przyjazdu online",
    check: "sprawdź zasady", free: "bez wizy", unknown: "brak danych",
  };

  /* przypomnienia (reminders-core.js): N dni przed przylotem do kraju, o 10:00 */
  function reminders(data, today) {
    const out = [];
    for (const t of data.trips) {
      if (t.end < today) continue;
      const list = analyze(t, data.segments.filter(s => s.tripId === t.id), (data.planItems || []).filter(i => i.tripId === t.id), data.docs || []);
      for (const v of list) {
        if (!needsAction(v)) continue;
        const kind = v.over || v.untilPassed ? (v.kind === "free" ? "check" : v.kind) : v.kind;
        const leads = LEAD[kind] || [30];
        for (const n of leads) {
          const at = `${addDays(v.arrive, -n)}T10:00`;
          const what = kind === "voa" ? `Wiza po przylocie: ${v.name}` : kind === "form" ? `Formularz przyjazdu: ${v.name}` : kind === "check" ? `Wjazd do kraju: ${v.name} – sprawdź zasady`
            : `${v.permit && kind !== "visa" ? v.permit : KIND_TXT[kind]}: ${v.name}`;
          const body = kind === "form" ? `${v.permit} – wypełnij online najwcześniej 3 dni przed przylotem${v.arriveKnown ? ` (${+v.arrive.slice(8)}.${v.arrive.slice(5, 7)})` : ""}. Tylko oficjalna strona.`
            : v.over ? `Podróż trwa ${v.stay} dni, a bez wizy można zostać ${v.days}. Sprawdź, jaka wiza jest potrzebna.`
            : v.untilPassed ? `Zwolnienie z wiz obowiązuje do ${+v.until.slice(8)}.${v.until.slice(5, 7)}.${v.until.slice(0, 4)} – podróż kończy się później. Sprawdź, czy przedłużono.`
            : kind === "check" ? "Zasady wjazdu są czasowe albo niepewne – sprawdź na stronie MSZ przed wyjazdem."
            : kind === "voa" ? `Wizę dostaniesz po przylocie – przygotuj zdjęcie paszportowe i gotówkę (zwykle USD) albo złóż e-wizę wcześniej. Podróż „${t.name}”.`
            : `„${t.name}”: wniosek tylko na oficjalnej stronie (pośrednicy biorą kilka razy więcej). Zaznacz „Mam” w podróży, gdy gotowe.`;
          out.push({ id: `visa:${t.id}:${v.cc}:${n}`, tripId: t.id, href: `/podroze/${t.id}`, at, eventAt: `${v.arrive}T00:00`, title: what, body });
        }
      }
    }
    return out;
  }

  root.Visas = { detect, countries, D, AS_OF, MSZ, LEAD, KIND_TXT, analyze, needsAction, reminders, textCountries, name, ready, airCC };
})(self);
