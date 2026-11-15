/* Podróżnik – most do aplikacji na Androida (Capacitor).
   W przeglądarce i w starym APK (TWA) nic nie robi.
   W aplikacji (podroznik-app/) zastępuje to, czego WebView nie umie:
   - navigator.share / canShare z plikami (kopia zapasowa, .ics, podróż, rozliczenie) → wtyczka Share,
   - otwieranie plików z blob: (np. skan PDF w Dokumentach) → zapis w pamięci podręcznej i „Otwórz w…”. */
(function () {
  "use strict";
  const C = window.Capacitor;
  const isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
  window.PodroznikNative = { isNative, platform: isNative ? C.getPlatform() : "web" };
  if (!isNative) return;
  document.documentElement.classList.add("native-app");

  const P = C.Plugins;
  const abort = () => new DOMException("Share canceled", "AbortError");
  const isCancel = e => /cancel/i.test(String(e && (e.message || e.errorMessage || e)));

  const toBase64 = blob => new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
  const safeName = name => (String(name || "plik").replace(/[\\/:*?"<>|]+/g, "-").trim() || "plik");

  // zapis pliku w pamięci podręcznej aplikacji → adres file://, który rozumie wtyczka Share
  async function cacheFile(blob, name) {
    const path = `udostepnione/${Date.now()}-${safeName(name)}`;
    const res = await P.Filesystem.writeFile({ path, data: await toBase64(blob), directory: "CACHE", recursive: true });
    return res.uri;
  }

  async function share({ title, text, url, files } = {}) {
    const opts = { dialogTitle: title || "Udostępnij" };
    if (title) opts.title = title;
    if (text) opts.text = text;
    if (url) opts.url = url;
    if (files && files.length) opts.files = await Promise.all(Array.from(files).map(f => cacheFile(f, f.name)));
    try { await P.Share.share(opts); } catch (e) { throw isCancel(e) ? abort() : e; }
  }

  try {
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  } catch (e) { console.warn("native share:", e); }

  // stare pliki do udostępnienia – sprzątanie przy starcie
  P.Filesystem.rmdir({ path: "udostepnione", directory: "CACHE", recursive: true }).catch(() => {});

  // linki do plików w pamięci strony (blob:) – WebView ich nie otworzy w nowym oknie
  document.addEventListener("click", async e => {
    const a = e.target.closest && e.target.closest("a[href^='blob:']");
    if (!a || (!a.target && !a.hasAttribute("download"))) return;
    e.preventDefault();
    try {
      const blob = await (await fetch(a.href)).blob();
      const ext = (blob.type.split("/")[1] || "bin").replace("jpeg", "jpg").split("+")[0];
      const name = a.getAttribute("download") || `plik.${ext}`;
      const file = new File([blob], name, { type: blob.type });
      await share({ title: name, files: [file] });
    } catch (err) {
      if (err.name !== "AbortError") console.warn("native open:", err);
    }
  }, true);
})();
