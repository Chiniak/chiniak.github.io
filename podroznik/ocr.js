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

  // duże zdjęcie (aparat 4000 px) zmniejszone do ~2000 px – szybciej i mniej pamięci; screen bez zmian
  async function prepare(blob) {
    if (!self.createImageBitmap) return blob;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    if (k === 1) { bmp.close && bmp.close(); return blob; }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return new Promise(r => c.toBlob(b => r(b || blob), "image/jpeg", 0.92));
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
