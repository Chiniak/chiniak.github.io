// Futbol – szybki test przed scaleniem zmian: dane się wczytują i łączą, model nie traci trafności, prognoza z kursów działa.
// Uruchomienie: node .github/scripts/futbol-test.mjs   (bez sieci; czyta pliki z futbol/ i futbol/dane/)
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const R = new URL("../../futbol/", import.meta.url);
const M = require(new URL("model.js", R).pathname), D = require(new URL("data.js", R).pathname);
const J = async f => JSON.parse(await readFile(new URL("dane/" + f, R), "utf8"));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failed++; };

// 1. pliki aplikacji się kompilują
for (const f of ["app.js", "model.js", "data.js", "sw.js"]) {
  try { execFileSync(process.execPath, ["--check", new URL(f, R).pathname]); check(true, `${f} – składnia`); }
  catch (e) { check(false, `${f} – składnia: ${e.stderr?.toString().split("\n")[4] || e.message}`); }
}

// 2. dane: wczytanie i łączenie jak w aplikacji (app.js → compute)
const es = D.parseEspn(await J("espn.json"), await J("kursy.json"), await J("fd.json"));
const ek = D.parseEk(await J("ekstraklasa.json"));
const fpl = D.parseFpl(await J("fpl.json"));
const matches = D.merge([es.matches, ek.matches, fpl.matches]);
D.attachXg(matches, D.parseXg(await J("xg.json")));
const played = c => matches.filter(m => m.comp === c && M.played(m)).length;
for (const c of D.COMPS) check(played(c.code) >= (c.cup ? 100 : 250), `${c.name}: ${played(c.code)} rozegranych meczów`);
const names = new Set(matches.flatMap(m => [m.home, m.away]));
for (const t of ["Legia Warszawa", "Raków Częstochowa", "Lech Poznań", "Jagiellonia Białystok"]) {
  const comps = new Set(matches.filter(m => m.home === t || m.away === t).map(m => m.comp));
  check(comps.has("EK") && [...comps].some(c => D.COMP[c]?.cup), `${t}: mecze w Ekstraklasie i w pucharach pod jedną nazwą`);
}
check(![...names].some(n => /Legia Warsaw$|Lech Poznan$/.test(n)), "brak angielskich duplikatów polskich klubów");
// każda drużyna ma herb (ESPN albo – w Ekstraklasie – TheSportsDB)
const teams = { ...ek.teams, ...es.teams };
const noLogo = [...names].filter(n => !teams[n]?.logo);
check(!noLogo.length, `herby: ${names.size - noLogo.length}/${names.size} drużyn${noLogo.length ? ` – brak: ${noLogo.join(", ")}` : ""}`);
const withOdds = matches.filter(m => M.played(m) && m.odds?.book === "bet365").length;
check(withOdds >= 3000, `kursy bet365 dla ${withOdds} rozegranych meczów`);
const withXg = matches.filter(m => m.xhg !== undefined).length;
check(withXg >= 800, `xG dla ${withXg} meczów`);

// 3. model: test wsteczny jak w aplikacji (te same ustawienia co FIT w app.js) – PL, LaLiga, Ekstraklasa
const EURO = new Set(["CL", "EL", "ECL"]);
const cur = D.seasonLabel(D.seasonStart()), prev = D.seasonLabel(D.seasonStart() - 1);
const teamsOf = (c, s) => new Set(matches.filter(m => m.comp === c && m.season === s).flatMap(m => [m.home, m.away]));
const priors = c => { const p = teamsOf(c, prev), pr = {}; for (const t of teamsOf(c, cur)) if (!p.has(t)) pr[t] = { att: -0.25, def: -0.25 }; return pr; };
const rest = new Map([...M.restDays(matches)].map(([m, x]) => [m.id, x]));
// gole z kursów dla meczów, których nie policzył serwer – tak samo jak app.js → compute
let onTheFly = 0;
for (const m of matches) if (m.mxh === undefined && M.played(m) && m.odds?.h) { const f = M.fromOdds(m.odds, { total: 2.7 }); if (f) { m.mxh = f.xg.home; m.mxa = f.xg.away; onTheFly++; } }
const withMkt = matches.filter(m => m.mxh !== undefined).length;
check(withMkt >= 3500 && onTheFly < 600, `gole z kursów: ${withMkt} meczów, w tym ${onTheFly} liczonych w aplikacji (reszta z serwera)`);
const FIT = { shrink: 3, halfLife: 320, xg: 0.7, sxg: 0.4, mkt: 0.5 };
// progi: wynik z 27.11.2026 (z golami z kursów) minus zapas na zmiany danych z tygodnia na tydzień
const MIN = { PL: [0.45, 0.630], ES1: [0.51, 0.585], EK: [0.43, 0.650] };
for (const [c, [acc, brier]] of Object.entries(MIN)) {
  const data = matches.filter(m => m.comp === c || EURO.has(m.comp));
  const b = M.backtest(data, { from: `${D.seasonStart() - 1}-09-15`, filter: m => m.comp === c, fit: { ...FIT, priors: priors(c) }, adjFn: m => M.fatigueAdj(rest.get(m.id)) });
  check(b.accuracy >= acc && b.brier <= brier, `${c}: test wsteczny ${b.n} meczów, trafność ${(b.accuracy * 100).toFixed(1)}% (min ${acc * 100}%), Brier ${b.brier.toFixed(3)} (maks ${brier})`);
}

// 4. prognoza z kursów odtwarza szanse z kursów
const o = { h: 2.1, d: 3.4, a: 3.6, line: 2.5, over: 1.9, under: 1.95 };
const f = M.fromOdds(o, { total: 2.7 }), s = 1 / o.h + 1 / o.d + 1 / o.a;
const err = Math.max(Math.abs(f.win - 1 / o.h / s), Math.abs(f.draw - 1 / o.d / s), Math.abs(f.loss - 1 / o.a / s));
check(err < 0.02, `prognoza z kursów: odchylenie od kursów ${(err * 100).toFixed(2)} pkt proc.`);
const g = f.grid.flat().reduce((a, b) => a + b, 0);
check(Math.abs(g - 1) < 1e-6, "rozkład wyników sumuje się do 100%");

console.log(failed ? `\n${failed} test(y) nie przeszły` : "\nWszystko w porządku");
process.exit(failed ? 1 : 0);
