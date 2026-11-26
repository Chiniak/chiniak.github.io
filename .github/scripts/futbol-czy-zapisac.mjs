// Czy zapisać nowe dane (workflow „Futbol – dane” działa co godzinę)? Zapis, gdy:
//  - jest nowy wynik (więcej rozegranych meczów niż w ostatnim zapisie),
//  - w ciągu 6 godzin zaczyna się mecz (świeże kursy przed meczem są najtrafniejsze),
//  - albo to pełne uruchomienie (co 3 godziny lub ręcznie: FULL=1).
// Wynik: kod 0 = zapisać, 1 = nie zapisywać. Uruchomienie: node .github/scripts/futbol-czy-zapisac.mjs
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

if (process.env.FULL === "1") { console.log("pełne uruchomienie – zapis"); process.exit(0); }
const file = "futbol/dane/espn.json";
const now = JSON.parse(await readFile(file, "utf8"));
let old = null;
try { old = JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { maxBuffer: 64 << 20 }).toString()); } catch { /* brak poprzedniej wersji */ }
const played = js => Object.values(js?.comps || {}).reduce((s, rows) => s + rows.filter(r => r.f).length, 0);
if (!old || played(now) !== played(old)) { console.log("nowe wyniki – zapis"); process.exit(0); }
const t = Date.now(), soon = Object.values(now.comps).flat().some(r => !r.f && new Date(r.k) - t > -2 * 3600e3 && new Date(r.k) - t < 6 * 3600e3);
let ek = false;
try { ek = JSON.parse(await readFile("futbol/dane/ekstraklasa.json", "utf8")).rows.some(r => !r.f && new Date(r.k) - t > -2 * 3600e3 && new Date(r.k) - t < 6 * 3600e3); } catch { /* brak pliku */ }
if (soon || ek) { console.log("mecz w ciągu 6 godzin – zapis świeżych kursów"); process.exit(0); }
console.log("bez meczów w najbliższych godzinach i bez nowych wyników – nie zapisuję (pełny zapis co 3 godziny)");
process.exit(1);
