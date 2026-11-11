/* Podróżnik – etap 2: bilety.
   Trasy:
     #/bilety          wszystkie bilety: najbliższy, nadchodzące, archiwum
     #/odcinek/:id     szczegóły odcinka + jego bilety + dodawanie (plik / skaner)
     #/bilet/:id       bilet na pełnym ekranie (białe tło, ekran nie gaśnie)
     #/skanuj/:segId   skaner kodu aparatem lub ze zrzutu ekranu
   Bilet = rekord w magazynie "files":
     { id, tripId, segmentId, label, kind: "image" | "pdf" | "code", mime, name, blob?, code?: { text, format } }
   Kod (QR, Aztec, PDF417, kreskowy) jest zapisywany jako tekst i rysowany od nowa – ostro, w każdym rozmiarze.
   Biblioteki (w lib/, wczytywane dopiero gdy potrzebne): pdf.js, bwip-js (rysowanie), ZXing (odczyt bez BarcodeDetector). */
(function () {
  const { esc } = App;
  const Tr = () => App.Trips;
  const pad = n => String(n).padStart(2, "0");
  const nowStr = () => { const d = new Date(); return `${App.todayStr()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const byCreated = (a, b) => (a.created || "").localeCompare(b.created || "");
  // do kiedy bilet jest "aktualny": do przyjazdu, a bez godziny przyjazdu – do końca dnia odjazdu
  const endOf = s => s.arrive || `${s.depart.slice(0, 10)}T23:59`;

  /* ---------- formaty kodów ---------- */
  const FORMATS = {
    qr_code: { name: "QR", bcid: "qrcode" },
    aztec: { name: "Aztec", bcid: "azteccode" },
    pdf417: { name: "PDF417", bcid: "pdf417" },
    data_matrix: { name: "Data Matrix", bcid: "datamatrix" },
    code_128: { name: "Code 128", bcid: "code128", linear: true },
    code_39: { name: "Code 39", bcid: "code39", linear: true },
    code_93: { name: "Code 93", bcid: "code93", linear: true },
    ean_13: { name: "EAN-13", bcid: "ean13", linear: true },
    ean_8: { name: "EAN-8", bcid: "ean8", linear: true },
    upc_a: { name: "UPC-A", bcid: "upca", linear: true },
    itf: { name: "ITF", bcid: "interleaved2of5", linear: true },
    codabar: { name: "Codabar", bcid: "rationalizedCodabar", linear: true },
  };
  const fmtName = f => (FORMATS[f] || { name: "kod" }).name;

  /* ---------- opis odcinka ---------- */
  const segTitle = s => s.type === "nocleg" ? (s.name || "Nocleg") : `${s.from || "?"} → ${s.to || "?"}`;
  function segWhen(s) {
    if (!s.depart) return "";
    let t = `${App.fmtDay(s.depart)} · ${App.time(s.depart)}`;
    if (s.arrive) t += ` → ${s.arrive.slice(0, 10) !== s.depart.slice(0, 10) ? App.fmtDay(s.arrive) + " " : ""}${App.time(s.arrive)}`;
    return t;
  }
  function segSeat(s) {
    const parts = [];
    if (s.number) parts.push(s.number);
    if (s.car) parts.push(`wagon ${s.car}`);
    if (s.seat) parts.push(`miejsce ${s.seat}`);
    if (s.gate) parts.push(`gate ${s.gate}`);
    if (s.platform) parts.push(`peron ${s.platform}`);
    if (s.room) parts.push(`pokój ${s.room}`);
    if (s.booking) parts.push(`rez. ${s.booking}`);
    return parts.join(" · ");
  }

  /* ---------- PDF ---------- */
  async function pdfDoc(blob) {
    await App.loadScript("lib/pdf.min.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
    return pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  }
  async function pdfPage(doc, n, width) {
    const page = await doc.getPage(n);
    const scale = width / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }

  /* ---------- odczyt kodu ---------- */
  let detectorP = null;
  function detector() {
    if (!("BarcodeDetector" in window)) return Promise.resolve(null);
    return detectorP || (detectorP = BarcodeDetector.getSupportedFormats()
      .then(sup => { const f = sup.filter(x => FORMATS[x]); return f.length ? new BarcodeDetector({ formats: f }) : null; })
      .catch(() => null));
  }

  // przeglądarka dekoduje "ISO-8859-1" jako Windows-1252 – cofamy to, by każdy znak znów odpowiadał jednemu bajtowi
  const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88,
    0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94,
    0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
  function toByteString(text) {
    let out = "";
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c <= 0xff) out += ch;
      else if (CP1252[c]) out += String.fromCharCode(CP1252[c]);
      else return text; // prawdziwy tekst Unicode (np. kod z deklaracją UTF-8) – zostawiamy
    }
    return out;
  }

  let zxReader = null;
  function zxingDecode(canvas) {
    if (!zxReader) {
      zxReader = new ZXing.MultiFormatReader();
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      // znak = bajt: kod narysowany od nowa ma dokładnie te same bajty co oryginał (ważne dla biletów z danymi binarnymi)
      hints.set(ZXing.DecodeHintType.CHARACTER_SET, "ISO-8859-1");
      zxReader.setHints(hints);
    }
    const { width, height } = canvas;
    const { data } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
    const lum = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    try {
      const res = zxReader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(lum, width, height))));
      let f = String(ZXing.BarcodeFormat[res.getBarcodeFormat()] || "").toLowerCase();
      if (f === "pdf_417") f = "pdf417";
      return FORMATS[f] ? { text: toByteString(res.getText()), format: f } : null;
    } catch (e) {
      return null; // brak kodu na obrazie
    } finally {
      zxReader.reset();
    }
  }

  // źródło: canvas (obraz, strona PDF) albo <video> (aparat)
  async function detect(source, { fallback = true } = {}) {
    const d = await detector();
    if (d) {
      try {
        const r = await d.detect(source);
        const hit = r.find(x => FORMATS[x.format] && x.rawValue);
        if (hit) return { text: hit.rawValue, format: hit.format };
      } catch (e) { /* spróbuj ZXing */ }
    }
    if (!fallback) return null;
    let canvas = source;
    if (source instanceof HTMLVideoElement) {
      if (!source.videoWidth) return null;
      canvas = document.createElement("canvas");
      const k = Math.min(1, 1280 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.round(source.videoWidth * k); canvas.height = Math.round(source.videoHeight * k);
      canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    try { await App.loadScript("lib/zxing.min.js"); } catch (e) { return null; }
    return zxingDecode(canvas);
  }

  async function imageCanvas(blob, max = 2000) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return c;
  }

  // szukanie kodu w zdjęciu / zrzucie ekranu / pierwszych stronach PDF
  async function detectInFile(blob, kind) {
    try {
      if (kind === "image") {
        const c = await imageCanvas(blob);
        return (await detect(c)) || (c.width > 1000 ? await detect(await imageCanvas(blob, 1000)) : null);
      }
      if (kind === "pdf") {
        const doc = await pdfDoc(blob);
        for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
          const hit = await detect(await pdfPage(doc, n, 1600));
          if (hit) return hit;
        }
      }
    } catch (e) { console.warn("Szukanie kodu:", e); }
    return null;
  }

  /* ---------- rysowanie kodu ---------- */
  async function drawCode(canvas, code, scale = 5) {
    await App.loadScript("lib/bwip-js.min.js");
    const F = FORMATS[code.format] || FORMATS.qr_code;
    // znak = bajt (binarytext), więc kod ma dokładnie te bajty, które odczytano; prawdziwy Unicode bwip-js zapisze jako UTF-8
    // biały margines wokół kodu – bez niego czytniki na bramkach (i ZXing) często go nie łapią
    const opts = { bcid: F.bcid, text: code.text, scale, padding: F.linear ? 8 : 4, backgroundcolor: "FFFFFF",
      binarytext: !/[^\x00-\xff]/.test(code.text) };
    if (F.linear) Object.assign(opts, { height: 20, includetext: true, textxalign: "center" });
    if (F.bcid === "pdf417") Object.assign(opts, { scaleX: scale, scaleY: scale, rowmult: 4 }); // wyższe wiersze = łatwiej odczytać
    bwipjs.toCanvas(canvas, opts);
  }

  /* ---------- karty .pkpass (Apple Wallet; wiele linii i przewoźników wysyła je mailem) – etap 9 ----------
     .pkpass to archiwum ZIP z plikiem pass.json: kod (barcodes[0]) i pola karty (miejsce, gate, nr lotu…) */
  async function zipEntry(buf, wanted) {
    const v = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("To nie jest plik .pkpass (uszkodzone archiwum).");
    let p = v.getUint32(eocd + 16, true);
    const n = v.getUint16(eocd + 10, true);
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name !== wanted) continue;
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8 || !self.DecompressionStream) throw new Error("Ten telefon nie umie rozpakować pliku .pkpass.");
      return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    throw new Error("W pliku .pkpass brakuje pass.json.");
  }
  const PK_FORMATS = { PKBarcodeFormatQR: "qr_code", PKBarcodeFormatPDF417: "pdf417", PKBarcodeFormatAztec: "aztec", PKBarcodeFormatCode128: "code_128" };
  async function readPkpass(file) {
    const raw = new TextDecoder().decode(await zipEntry(await file.arrayBuffer(), "pass.json")).replace(/^\ufeff/, "");
    const pass = JSON.parse(raw);
    const bc = (pass.barcodes && pass.barcodes[0]) || pass.barcode;
    const style = ["boardingPass", "eventTicket", "generic", "coupon", "storeCard"].find(k => pass[k]);
    const fields = [];
    if (style) for (const g of ["headerFields", "primaryFields", "secondaryFields", "auxiliaryFields", "backFields"])
      for (const f of pass[style][g] || []) if (f && f.value != null && f.value !== "") fields.push({ key: String(f.key || ""), label: String(f.label || ""), value: String(f.value) });
    return {
      code: bc && bc.message ? { text: bc.message, format: PK_FORMATS[bc.format] || "qr_code" } : null,
      label: [pass.organizationName, pass.description].filter(Boolean).join(" · ").slice(0, 60) || "Karta Wallet",
      fields: fields.slice(0, 30),
    };
  }
  // pola karty → puste pola odcinka (miejsce, gate, numer, rezerwacja…); nic nie jest nadpisywane
  function fillFromPass(seg, fields) {
    const MAP = [["seat", /seat|miejsce/i], ["gate", /gate|bramk/i], ["terminal", /terminal/i], ["number", /flight|lot\b|train|pociąg|nr/i],
      ["booking", /pnr|confirmation|booking|reserv|rezerw/i], ["car", /coach|car\b|wagon/i], ["platform", /platform|peron|track|tor\b/i]];
    const keys = new Set(Tr().typeOf(seg).extra.map(x => x[0]).concat("booking"));
    const out = {};
    for (const [field, re] of MAP) {
      if (!keys.has(field) || seg[field]) continue;
      const f = fields.find(x => re.test(x.key) || re.test(x.label));
      if (f && f.value.length <= 40) out[field] = f.value;
    }
    return out;
  }

  /* ---------- dodawanie plików ---------- */
  const kindOf = file => /\.pkpass$/i.test(file.name) || file.type === "application/vnd.apple.pkpass" ? "pkpass"
    : file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : file.type.startsWith("image/") ? "image" : null;
  const baseName = n => (n || "").replace(/\.[^.]+$/, "").slice(0, 40);

  async function addFiles(seg, fileList) {
    let added = 0, codes = 0, skipped = 0, pkErr = "";
    for (const file of fileList) {
      const kind = kindOf(file);
      if (!kind) { skipped++; continue; }
      if (kind === "pkpass") {
        try {
          const pk = await readPkpass(file);
          if (!pk.code) throw new Error("Karta nie ma kodu.");
          await DB.put("files", { tripId: seg.tripId, segmentId: seg.id, kind: "code", label: pk.label, code: pk.code, passFields: pk.fields });
          const fill = fillFromPass(seg, pk.fields);
          if (Object.keys(fill).length) { Object.assign(seg, fill); await DB.put("segments", { ...(await DB.get("segments", seg.id)), ...fill }); }
          added++; codes++;
        } catch (e) { pkErr = e.message || "Nie udało się odczytać karty .pkpass"; }
        continue;
      }
      App.toast(`Zapisuję ${fileList.length > 1 ? `${added + 1}/${fileList.length}` : "bilet"}…`);
      const rec = await DB.put("files", {
        tripId: seg.tripId, segmentId: seg.id, kind, mime: file.type, name: file.name,
        label: baseName(file.name) || (kind === "pdf" ? "Bilet PDF" : "Bilet"), blob: file,
      });
      added++;
      const code = await detectInFile(file, kind);
      if (code) { await DB.put("files", { ...rec, code }); codes++; }
    }
    let msg = added ? `Dodano ${added} ${App.plural(added, "bilet", "bilety", "biletów")}` : "Nie dodano żadnego pliku";
    if (codes) msg += ` · wykryto ${codes === 1 ? "kod" : codes + " kody"}`;
    if (skipped) msg += ` · pominięto ${skipped} (tylko zdjęcia, PDF i .pkpass)`;
    if (pkErr) msg = added ? `${msg} · ${pkErr}` : pkErr;
    App.toast(msg);
  }

  /* ---------- "Najbliższy bilet" (ekran główny i zakładka Bilety) ---------- */
  async function upcomingWithTickets() {
    const files = await DB.all("files");
    if (!files.length) return { upcoming: [], past: [], bySeg: {} };
    const bySeg = {};
    files.sort(byCreated).forEach(f => (bySeg[f.segmentId] = bySeg[f.segmentId] || []).push(f));
    const segs = (await DB.all("segments")).filter(s => bySeg[s.id] && s.depart);
    const now = nowStr();
    return {
      upcoming: segs.filter(s => endOf(s) >= now).sort(Tr().bySegTime),
      past: segs.filter(s => endOf(s) < now).sort((a, b) => b.depart.localeCompare(a.depart)),
      bySeg,
    };
  }

  function relTime(s) {
    // strefa lotniska wylotu znana → licznik dokładny, nawet gdy telefon jest jeszcze w innej strefie
    const min = Math.round((App.instant(s.depart, s.tzFrom) - Date.now()) / 60000);
    if (min <= 0) return s.type === "nocleg" ? "trwa pobyt" : "w drodze";
    if (min < 60) return `za ${min} min`;
    if (min < 24 * 60) return `za ${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + " min" : ""}`.trim();
    const d = App.dayDiff(App.todayStr(), s.depart);
    return d === 1 ? "jutro" : `za ${d} ${App.plural(d, "dzień", "dni", "dni")}`;
  }

  // skipSeg: nie pokazuj, gdy ten sam odcinek jest już w liczniku na ekranie głównym (tam jest przycisk „Bilet”)
  async function nearestCard({ skipSeg } = {}) {
    const { upcoming, bySeg } = await upcomingWithTickets();
    if (!upcoming.length || upcoming[0].id === skipSeg) return "";
    const s = upcoming[0], T = Tr().typeOf(s);
    return `
      <a class="next-ticket" href="#/bilet/${bySeg[s.id][0].id}">
        <div class="nt-ico" aria-hidden="true">${T.icon}</div>
        <div class="nt-main">
          <div class="nt-label">Najbliższy bilet · ${relTime(s)}</div>
          <div class="nt-title">${esc(segTitle(s))}</div>
          <div class="nt-when">${segWhen(s)}</div>
        </div>
        <div class="nt-go" aria-hidden="true">🎫</div>
      </a>`;
  }
  App.Tickets = { nearestCard };

  /* ================= ZAKŁADKA BILETY ================= */
  // link do dokumentów (etap 8) – z ostrzeżeniem, gdy coś wygasło albo zaraz wygaśnie
  async function docsLink() {
    if (!App.Docs) return "";
    const s = await App.Docs.summary();
    const txt = !s.total ? "paszport, dowód, ubezpieczenie – z datą ważności"
      : s.expired ? `❗ wygasłe: ${s.expired}` : s.soon ? `⚠️ wygasa wkrótce: ${s.soon}` : `${s.total} · wszystkie ważne`;
    return `<a class="plan-link${s.expired || s.soon ? " warn" : ""}" href="#/dokumenty" style="margin-bottom:10px"><span aria-hidden="true">🛂</span> Dokumenty <span class="muted">– ${txt}</span><b aria-hidden="true">›</b></a>`;
  }

  App.route(/^\/bilety$/, async () => {
    const { upcoming, past, bySeg } = await upcomingWithTickets();
    const docs = await docsLink();
    if (!upcoming.length && !past.length) {
      return docs + App.empty("🎫", "Nie masz jeszcze biletów",
        "Otwórz podróż, kliknij lot, pociąg albo nocleg i dodaj zdjęcie, PDF lub zeskanuj kod biletu.",
        `<a class="btn primary" href="#/podroze">Przejdź do podróży</a>`);
    }
    const trips = Object.fromEntries((await DB.all("trips")).map(t => [t.id, t]));
    const row = s => {
      const T = Tr().typeOf(s), n = bySeg[s.id].length;
      return `
        <div class="tk-row">
          <a class="tk-row-main" href="#/bilet/${bySeg[s.id][0].id}">
            <div class="tl-ico" aria-hidden="true">${T.icon}</div>
            <div class="tl-main">
              <div class="tl-time">${segWhen(s)}</div>
              <div class="tl-route">${esc(segTitle(s))}</div>
              <div class="muted small">${esc(trips[s.tripId] ? trips[s.tripId].name : "")}</div>
            </div>
            <span class="tk-count">🎫${n > 1 ? " " + n : ""}</span>
          </a>
          <a class="tk-row-more" href="#/odcinek/${s.id}" aria-label="Szczegóły odcinka">›</a>
        </div>`;
    };
    let html = docs + await nearestCard();
    if (upcoming.length > 1) html += `<h3 class="section">Nadchodzące</h3>${upcoming.slice(1).map(row).join("")}`;
    if (past.length) html += `
      <details class="archive">
        <summary><h3 class="section">Wykorzystane <span class="muted">(${past.length})</span></h3></summary>
        ${past.map(row).join("")}
      </details>`;
    return { html };
  });

  /* ================= SZCZEGÓŁY ODCINKA ================= */
  const camIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><path d="M7 12h10"/></svg>`;
  const clipIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/></svg>`;

  App.route(/^\/odcinek\/([\w-]+)$/, async ([id]) => {
    const s = await DB.get("segments", id);
    if (!s) { location.replace("#/podroze"); return ""; }
    const trip = await DB.get("trips", s.tripId);
    const files = (await DB.byIndex("files", "segmentId", id)).sort(byCreated);
    const T = Tr().typeOf(s);
    const urls = [];

    if (App.Stats && s.type !== "nocleg") await App.Stats.fillTz([s]).catch(() => {});
    const dur = s.arrive && s.type !== "nocleg" ? App.duration(App.segMinutes(s)) : "";
    const shift = s.type !== "nocleg" ? App.tzShiftText(s) : "";
    const nights = s.type === "nocleg" && s.arrive ? App.dayDiff(s.depart, s.arrive) : 0;
    // „Nawiguj”: do noclegu albo na miejsce odjazdu (lotnisko, dworzec, przystanek)
    const navTo = s.type === "nocleg" ? (s.address || s.name) : s.from;
    const mapLink = navTo
      ? `<a class="map-link" href="${esc(App.mapsUrl(navTo))}" target="_blank" rel="noopener">📍 Nawiguj: ${esc(navTo)}</a>` : "";

    const tiles = files.map(f => `
      <a class="tk-tile" href="#/bilet/${f.id}">
        <div class="tk-thumb" data-thumb="${f.id}">${f.kind === "pdf" ? "📄" : f.kind === "code" ? "" : "🖼️"}</div>
        <span class="tk-name">${esc(f.label || "Bilet")}</span>
        ${f.code ? `<span class="tk-badge">${fmtName(f.code.format)}</span>` : ""}
      </a>`).join("");

    return {
      title: `${T.icon} ${T.name}`,
      back: `#/podroze/${s.tripId}`,
      action: `<a class="icon-btn" href="#/odcinek/${id}/edytuj" aria-label="Edytuj">${Tr().editIcon}</a>`,
      html: `
        <div class="seg-head">
          <div class="seg-route">${esc(segTitle(s))}</div>
          <div class="seg-when">${s.depart ? App.fmtDayLong(s.depart) : ""}</div>
          <div class="seg-times">${s.type === "nocleg"
            ? `Zameldowanie ${App.time(s.depart)}${s.arrive ? ` · wymeldowanie ${App.fmtDay(s.arrive)} ${App.time(s.arrive)}` : ""}${nights > 0 ? ` · ${nights} ${App.plural(nights, "noc", "noce", "nocy")}` : ""}`
            : `${App.time(s.depart)}${s.arrive ? ` → ${App.time(s.arrive)}` : ""}${dur ? ` · ${dur}` : ""}`}</div>
          ${shift ? `<div class="muted small">${shift} · godziny podane w czasie lokalnym lotnisk</div>` : ""}
          ${mapLink}
          ${s.type === "nocleg" && s.lat != null ? `<a class="map-link" href="#/karty/${s.tripId}?k=s:${s.id}">🚕 Pokaż kierowcy (adres w lokalnym piśmie)</a>` : ""}
          ${s.depart && App.Reminders ? `<a class="map-link" href="${esc(App.Reminders.gcalUrl(s))}" target="_blank" rel="noopener">📅 Dodaj do Google Kalendarza</a>` : ""}
          ${Tr().chips(s)}
          ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
          ${trip ? `<a class="muted small trip-link" href="#/podroze/${trip.id}">Podróż: ${esc(trip.name)}</a>` : ""}
        </div>

        <h3 class="section">Bilety</h3>
        ${files.length ? `<div class="tk-grid">${tiles}</div>` : `<p class="muted small">Dodaj zdjęcie, zrzut ekranu, PDF lub kartę .pkpass (Apple Wallet) biletu albo zeskanuj jego kod – będzie dostępny bez internetu.</p>`}
        <div class="add-row">
          <a class="btn" href="#/skanuj/${id}">${camIcon} Skanuj kod</a>
          <label class="btn primary">${clipIcon} Zdjęcie / PDF
            <input type="file" id="pick" accept="image/*,application/pdf,.pdf,.pkpass,application/vnd.apple.pkpass" multiple hidden></label>
        </div>`,
      after(view) {
        view.querySelector("#pick").addEventListener("change", async e => {
          if (!e.target.files.length) return;
          await addFiles(s, [...e.target.files]);
          App.render();
        });
        // miniatury
        for (const f of files) {
          const box = view.querySelector(`[data-thumb="${f.id}"]`);
          if (f.kind === "image" && f.blob) {
            const u = URL.createObjectURL(f.blob); urls.push(u);
            box.innerHTML = `<img src="${u}" alt="">`;
          } else if (f.kind === "code" && f.code) {
            const c = document.createElement("canvas");
            drawCode(c, f.code, 2).then(() => box.appendChild(c)).catch(() => { box.textContent = "▦"; });
          }
        }
      },
      cleanup() { urls.forEach(u => URL.revokeObjectURL(u)); },
    };
  });

  /* ================= BILET NA PEŁNYM EKRANIE ================= */
  const xIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

  App.route(/^\/bilet\/([\w-]+)$/, async ([id]) => {
    const f = await DB.get("files", id);
    if (!f) { location.replace("#/bilety"); return ""; }
    const s = await DB.get("segments", f.segmentId);
    const all = (await DB.byIndex("files", "segmentId", f.segmentId)).sort(byCreated);
    const idx = all.findIndex(x => x.id === id);
    const T = s ? Tr().typeOf(s) : { icon: "🎫" };
    const both = !!(f.code && f.blob);
    let mode = f.code ? "kod" : "oryginal";
    let lock = null;
    const urls = [];

    const seatLine = s ? segSeat(s) : "";
    const nav = all.length > 1 ? `
      <div class="tv-nav">
        <button type="button" class="tv-arrow" data-go="-1" ${idx === 0 ? "disabled" : ""} aria-label="Poprzedni bilet">‹</button>
        <span>${idx + 1} / ${all.length}</span>
        <button type="button" class="tv-arrow" data-go="1" ${idx === all.length - 1 ? "disabled" : ""} aria-label="Następny bilet">›</button>
      </div>` : "";

    async function paint(view) {
      const body = view.querySelector("#tv-body");
      body.innerHTML = `<p class="tv-wait">Wczytuję…</p>`;
      try {
        if (mode === "kod") {
          const c = document.createElement("canvas");
          c.className = "tv-code" + ((FORMATS[f.code.format] || {}).linear ? " linear" : "");
          await drawCode(c, f.code);
          body.innerHTML = "";
          body.appendChild(c);
          body.insertAdjacentHTML("beforeend", `<div class="tv-fmt">${fmtName(f.code.format)}</div>`);
        } else if (f.kind === "image") {
          const u = URL.createObjectURL(f.blob); urls.push(u);
          body.innerHTML = `<img class="tv-img" src="${u}" alt="${esc(f.label || "Bilet")}">`;
        } else if (f.kind === "pdf") {
          const doc = await pdfDoc(f.blob);
          const w = Math.min(1800, Math.round(body.clientWidth * Math.min(2.5, devicePixelRatio || 1)));
          body.innerHTML = "";
          for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
            const c = await pdfPage(doc, n, w);
            c.className = "tv-pdf";
            body.appendChild(c);
          }
        }
      } catch (e) {
        console.error(e);
        body.innerHTML = `<p class="tv-wait">Nie udało się wyświetlić biletu.<br><small>${esc(e.message || e)}</small></p>`;
      }
    }

    const go = d => { const o = all[idx + d]; if (o) location.replace(`#/bilet/${o.id}`); };
    const onVis = async () => { if (document.visibilityState === "visible" && navigator.wakeLock) { try { lock = await navigator.wakeLock.request("screen"); } catch (e) { /* brak zgody */ } } };

    return {
      title: f.label || "Bilet",
      html: `
        <div class="tv" role="dialog" aria-modal="true" aria-label="Bilet">
          <div class="tv-top">
            <button type="button" class="tv-btn" id="tv-close" aria-label="Zamknij">${xIcon}</button>
            <div class="tv-title">
              <b>${T.icon} ${esc(s ? segTitle(s) : "Bilet")}</b>
              <span>${s ? segWhen(s) : ""}</span>
            </div>
          </div>
          ${seatLine ? `<div class="tv-seat">${esc(seatLine)}</div>` : ""}
          <div class="tv-label">${esc(f.label || "Bilet")}</div>
          ${both ? `<div class="seg tv-switch" role="group" aria-label="Widok">
              <button type="button" data-mode="kod" aria-pressed="true">Kod</button>
              <button type="button" data-mode="oryginal" aria-pressed="false">Oryginał</button>
            </div>` : ""}
          <div class="tv-body" id="tv-body"></div>
          ${f.passFields && f.passFields.length ? `<details class="tv-pass"><summary>Dane z karty Wallet (${f.passFields.length})</summary>
            ${f.passFields.map(x => `<div class="row"><span>${esc(x.label || x.key)}</span><b>${esc(x.value)}</b></div>`).join("")}</details>` : ""}
          ${nav}
          <div class="tv-foot">
            <button type="button" class="tv-link" id="tv-rename">Zmień nazwę</button>
            ${s ? `<a class="tv-link" href="#/odcinek/${s.id}">Szczegóły</a>` : ""}
            <button type="button" class="tv-link danger" id="tv-del">Usuń</button>
          </div>
        </div>`,
      after(view) {
        paint(view);
        onVis();
        document.addEventListener("visibilitychange", onVis);
        view.querySelector("#tv-close").onclick = () => App.back(s ? `#/odcinek/${s.id}` : "#/bilety");
        view.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
          mode = b.dataset.mode;
          view.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b));
          paint(view);
        });
        view.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(+b.dataset.go));
        // przesunięcie palcem w lewo / prawo = następny / poprzedni bilet
        const tv = view.querySelector(".tv");
        let x0 = null, y0 = null;
        tv.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
        tv.addEventListener("touchend", e => {
          if (x0 == null) return;
          const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          x0 = null;
        });
        view.querySelector("#tv-rename").onclick = async () => {
          const name = prompt("Nazwa biletu (np. „Bilet – Ania”, „Karta pokładowa”):", f.label || "");
          if (name == null) return;
          f.label = name.trim().slice(0, 60) || f.label;
          await DB.put("files", f);
          view.querySelector(".tv-label").textContent = f.label;
          App.toast("Zapisano");
        };
        view.querySelector("#tv-del").onclick = async () => {
          if (!confirm(`Usunąć bilet „${f.label || "Bilet"}”?`)) return;
          await DB.del("files", f.id);
          App.toast("Bilet usunięty");
          const other = all[idx + 1] || all[idx - 1];
          location.replace(other ? `#/bilet/${other.id}` : s ? `#/odcinek/${s.id}` : "#/bilety");
        };
      },
      cleanup() {
        document.removeEventListener("visibilitychange", onVis);
        if (lock) lock.release().catch(() => {});
        urls.forEach(u => URL.revokeObjectURL(u));
      },
    };
  });

  /* ================= SKANER ================= */
  App.route(/^\/skanuj\/([\w-]+)$/, async ([segId]) => {
    const s = await DB.get("segments", segId);
    if (!s) { location.replace("#/bilety"); return ""; }
    let stream = null, timer = null, busy = false, found = null, foundBlob = null, stopped = false;

    function stopCam() {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    return {
      title: "Skanuj kod",
      html: `
        <div class="tv scan">
          <div class="tv-top">
            <button type="button" class="tv-btn" id="sc-close" aria-label="Zamknij">${xIcon}</button>
            <div class="tv-title"><b>Zeskanuj kod biletu</b><span>${esc(segTitle(s))}</span></div>
          </div>
          <div id="sc-live">
            <div class="scan-box"><video id="sc-video" playsinline muted></video><div class="scan-frame"></div></div>
            <p class="scan-msg" id="sc-msg">Uruchamiam aparat…</p>
          </div>
          <div id="sc-result" hidden>
            <div class="tv-body"><canvas id="sc-code" class="tv-code"></canvas></div>
            <p class="scan-msg" id="sc-fmt"></p>
            <label class="field"><span>Nazwa biletu</span><input id="sc-label" maxlength="60"></label>
            <button type="button" class="btn primary wide" id="sc-save">Zapisz bilet</button>
            <button type="button" class="btn wide" id="sc-again">Skanuj ponownie</button>
          </div>
          <label class="btn wide" id="sc-file-btn">🖼️ Wybierz zrzut ekranu lub PDF
            <input type="file" id="sc-file" accept="image/*,application/pdf,.pdf" hidden></label>
          <p class="scan-tip">Zachowaj też oryginał biletu. Niektóre kody (np. część biletów kolejowych) zawierają dane binarne
            – jeśli bramka nie przyjmie odtworzonego kodu, przełącz na „Oryginał”.</p>
        </div>`,
      after(view) {
        const $ = sel => view.querySelector(sel);
        const video = $("#sc-video"), msg = $("#sc-msg");

        function showResult(code, blob) {
          found = code; foundBlob = blob || null;
          stopCam();
          $("#sc-live").hidden = true;
          $("#sc-result").hidden = false;
          $("#sc-fmt").textContent = `Odczytano kod ${fmtName(code.format)}`;
          $("#sc-label").value = blob && blob.name ? baseName(blob.name) : `Bilet (${fmtName(code.format)})`;
          drawCode($("#sc-code"), code).catch(e => { $("#sc-fmt").textContent = "Odczytano kod, ale nie da się go narysować: " + e.message; });
          if (navigator.vibrate) navigator.vibrate(60);
        }

        async function loop() {
          if (stopped || found) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            const hit = await detect(video);
            busy = false;
            if (hit && !stopped) return showResult(hit);
          }
          timer = setTimeout(loop, 250);
        }

        async function startCam() {
          stopped = false; found = null;
          $("#sc-live").hidden = false; $("#sc-result").hidden = true;
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            msg.textContent = "Ten telefon/przeglądarka nie udostępnia aparatu. Wybierz zrzut ekranu biletu poniżej.";
            return;
          }
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
            if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
            video.srcObject = stream;
            await video.play();
            msg.textContent = "Skieruj aparat na kod QR, Aztec lub kreskowy";
            loop();
          } catch (e) {
            msg.textContent = e.name === "NotAllowedError"
              ? "Brak zgody na aparat. Zezwól w ustawieniach przeglądarki albo wybierz zrzut ekranu poniżej."
              : "Nie udało się uruchomić aparatu. Wybierz zrzut ekranu biletu poniżej.";
          }
        }

        $("#sc-close").onclick = () => { stopCam(); App.back(`#/odcinek/${segId}`); };
        $("#sc-again").onclick = startCam;
        $("#sc-file").addEventListener("change", async e => {
          const file = e.target.files[0];
          if (!file) return;
          const kind = kindOf(file);
          if (!kind) return App.toast("Wybierz zdjęcie lub PDF");
          App.toast("Szukam kodu…");
          const code = await detectInFile(file, kind);
          if (code) return showResult(code, file);
          if (confirm("Nie znaleziono kodu na tym pliku. Dodać go jako zwykły bilet (zdjęcie/PDF)?")) {
            stopCam();
            await addFiles(s, [file]);
            location.replace(`#/odcinek/${segId}`);
          }
          e.target.value = "";
        });
        $("#sc-save").onclick = async () => {
          const label = $("#sc-label").value.trim() || `Bilet (${fmtName(found.format)})`;
          const rec = foundBlob
            ? { kind: kindOf(foundBlob), mime: foundBlob.type, name: foundBlob.name, blob: foundBlob }
            : { kind: "code" };
          const saved = await DB.put("files", { ...rec, tripId: s.tripId, segmentId: s.id, label, code: found });
          App.toast("Bilet zapisany");
          location.replace(`#/bilet/${saved.id}`);
        };
        startCam();
      },
      cleanup: stopCam,
    };
  });

  // do testów
  App.Tickets._ = { detect, detectInFile, drawCode, FORMATS };
})();
