/* Podróżnik – odczyt tekstu ze zdjęć i screenów (OCR) – do biletów dodawanych w planie („📎 Z biletu lub screena”).
   Tesseract.js (lib/ocr/, polski + angielski) działa w telefonie, bez wysyłania zdjęć gdziekolwiek.
   Pliki (~6 MB) pobierane przy pierwszym użyciu albo w „📥 Przygotuj offline”; sw.js trzyma je w pamięci „ocr-pliki”,
   która nie jest kasowana przy nowej wersji aplikacji. */
(function () {
  const DIR = "lib/ocr/";
  // SIMD w WebAssembly (prawie każdy nowy telefon) – szybsza wersja silnika
  const simd = (() => {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
    catch (e) { return false; }
  })();
  const core = `tesseract-core-${simd ? "simd-" : ""}lstm`;
  const FILES = ["tesseract.min.js", "worker.min.js", `${core}.js`, `${core}.wasm`, "pol.traineddata.gz", "eng.traineddata.gz"].map(f => DIR + f);

  const abs = p => new URL(p, location.href).href;
  async function worker(onProgress) {
    await App.loadScript(DIR + "tesseract.min.js");
    return Tesseract.createWorker(["pol", "eng"], 1, {
      workerPath: abs(DIR + "worker.min.js"),
      corePath: abs(DIR + core + ".js"),
      langPath: abs(DIR.replace(/\/$/, "")),
      cacheMethod: "none", // pliki trzyma service worker (ocr-pliki) – bez drugiej kopii w IndexedDB
      workerBlobURL: false,
      logger: m => { if (onProgress && m.status === "recognizing text") onProgress(m.progress); },
    });
  }

  /* przygotowanie zdjęcia: rozmiar ~1000–2200 px (małe powiększone, duże zmniejszone), odcienie szarości,
     ciemny motyw (jasny tekst na ciemnym tle – np. karty Google, aplikacje przewoźników) odwrócony na czarne na białym,
     rozciągnięty kontrast. Bez tego OCR prawie nic nie czyta ze screenów w trybie ciemnym. */
  async function prepare(blob) {
    if (!self.createImageBitmap) return blob;
    const bmp = await createImageBitmap(blob);
    const big = Math.max(bmp.width, bmp.height);
    const k = big > 2600 ? 2600 / big : bmp.width < 1600 ? Math.min(2, 2000 / bmp.width, 2600 / big) : 1;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high";
    x.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    const n = d.length / 4;
    let acc = 0, lo = 0, hi = 255, sum = 0;
    for (let g = 0; g < 256; g++) sum += g * hist[g];
    const dark = sum / n < 110; // przeważnie ciemne tło
    for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc <= n * 0.01) lo = g; if (acc <= n * 0.99) hi = g; }
    if (hi - lo < 40) { lo = 0; hi = 255; }
    const map = new Uint8ClampedArray(256);
    for (let g = 0; g < 256; g++) { let v = (g - lo) * 255 / (hi - lo); if (dark) v = 255 - v; map[g] = v; }
    for (let i = 0; i < d.length; i += 4) { const v = map[d[i]]; d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(img, 0, 0);
    return new Promise(r => c.toBlob(b => r(b || blob), "image/png"));
  }

  // tekst ze zdjęcia; onProgress(0..1)
  async function text(blob, onProgress) {
    const w = await worker(onProgress);
    try {
      const { data } = await w.recognize(await prepare(blob));
      return data.text || "";
    } finally { w.terminate(); }
  }

  // pobranie plików na zapas (Przygotuj offline); true = wszystko jest w telefonie
  async function cached() {
    if (!self.caches) return false;
    const c = await caches.open("ocr-pliki");
    for (const f of FILES) if (!(await c.match(abs(f)))) return false;
    return true;
  }
  async function prefetch() {
    for (const f of FILES) { const r = await fetch(f); if (!r.ok) throw new Error(f); await r.arrayBuffer(); }
    return cached();
  }

  App.Ocr = { text, cached, prefetch, FILES };
})();
