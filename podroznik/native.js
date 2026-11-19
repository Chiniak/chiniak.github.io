/* Tripwillow – most do aplikacji na Androida (Capacitor).
   W przeglądarce i w starym APK (TWA) nic nie robi.
   W aplikacji (podroznik-app/) zastępuje to, czego WebView nie umie:
   - navigator.share / canShare z plikami (kopia zapasowa, .ics, podróż, rozliczenie) → wtyczka Share,
   - otwieranie plików z blob: (np. skan PDF w Dokumentach) → zapis w pamięci podręcznej i „Otwórz w…”,
   - link zaproszenia do wspólnej podróży otwarty z WhatsAppa itp. → wtyczka App (appUrlOpen),
   - pliki i tekst udostępnione z innych aplikacji → wtyczka ShareIn (udostepnione.js),
   - dotknięcie powiadomienia o wiadomości → wtyczka Push (push.js). */
(function () {
  "use strict";
  const C = window.Capacitor;
  const isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
  window.PodroznikNative = { isNative, platform: isNative ? C.getPlatform() : "web" };
  if (!isNative) return;
  document.documentElement.classList.add("native-app");

  const P = C.Plugins;

  // link zaproszenia otwarty w aplikacji (intent-filter w AndroidManifest): dolacz.html#POKOJ.KLUCZ → ekran „Dołącz”
  const openLink = url => {
    const u = String(url || "");
    let m;
    if ((m = /\/podroznik\/dolacz(?:\.html)?#z\.([A-Za-z0-9]{20,40})(?![\w-])/.exec(u))) location.hash = `#/znajomi/dodaj/${m[1]}`; // znajomy (QR)
    else if ((m = /\/podroznik\/dolacz(?:\.html)?#p\.([A-Za-z0-9]{20,40})\.([\w-]{12})\.([\w-]{43})/.exec(u))) location.hash = `#/publiczna/${m[1]}/${m[2]}/${m[3]}`; // podróż publiczna
    else if ((m = /\/podroznik\/dolacz(?:\.html)?#([\w-]+\.[\w-]+)/.exec(u))) location.hash = `#/dolacz/${m[1]}`;
  };
  if (P.App) {
    P.App.addListener("appUrlOpen", e => openLink(e.url));
    P.App.getLaunchUrl().then(r => r && openLink(r.url)).catch(() => {});
  }
  // „Udostępnij → Tripwillow” z innej aplikacji (ShareInPlugin): pliki z pamięci podręcznej → File → udostepnione.js
  if (P.ShareIn) P.ShareIn.addListener("shared", async d => {
    const files = [];
    for (const f of (d && d.files) || []) {
      try {
        const blob = await (await fetch(C.convertFileSrc(f.path))).blob();
        files.push(new File([blob], f.name || "plik", { type: f.mime || blob.type || "" }));
      } catch (e) { console.warn("udostępniony plik:", e); }
    }
    const data = { text: (d && d.text) || "", files };
    if (window.App && App.Shared) App.Shared.receive(data); else window.PodroznikNative.pendingShare = data;
  });
  // dotknięte powiadomienie o wiadomości (PushPlugin) → czat
  if (P.Push) P.Push.addListener("open", d => { if (d && /^#\/[\w/?=&-]+$/.test(d.route || "")) location.hash = d.route; });
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
