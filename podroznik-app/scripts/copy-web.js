// Kopiuje aplikację z ../podroznik do www/ (to wkłada Capacitor do APK).
// Pomija pliki, które w APK są zbędne: stare APK, notatki .md, strona o aplikacji i polityka prywatności (są w sieci).
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..", "..", "podroznik");
const dst = path.join(__dirname, "..", "www");
const skip = name => /\.(apk|md)$/i.test(name) || ["strona", "strona.css", "aplikacja.html", "prywatnosc.html", "usun-konto.html"].includes(name);
fs.rmSync(dst, { recursive: true, force: true });
let n = 0;
(function copy(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const s = path.join(a, e.name), d = path.join(b, e.name);
    if (e.isDirectory()) copy(s, d); else { fs.copyFileSync(s, d); n++; }
  }
})(src, dst);
console.log(`www/: ${n} plików z ${path.relative(process.cwd(), src)}`);
