// xG i kursy bet365 z football-data.co.uk (darmowe pliki CSV, bez klucza) dla 8 lig, bieżący i poprzedni sezon.
// Mecze dopasowane do danych ESPN (musi być już pobrany futbol/dane/espn.json).
// Zapis: futbol/dane/fd.json = { updated, m: { "kod|start|idGosp|idGość": [xG gosp., xG gość, 1, X, 2, >2.5, <2.5, gole z kursów gosp., gość] },
//                               n: { ten sam klucz: [1, X, 2, >2.5, <2.5] } }
// m – rozegrane: kursy bet365 zamknięcia (tuż przed meczem), a gdy ich brak – wcześniejsze. Brak wartości = null.
// n – nadchodzące: aktualne kursy bet365 z fixtures.csv (plik uzupełniany ok. 2 razy w tygodniu).
// Uruchomienie: node .github/scripts/futbol-fd.mjs
import { writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const M = createRequire(import.meta.url)("../../futbol/model.js");
// oczekiwane gole z kursów (do nauki modelu): liczone tutaj, bo w telefonie trwałoby to kilka sekund
const r2 = x => Math.round(x * 100) / 100;
function mktGoals(v) {
  if (!v[2] || !v[3] || !v[4]) return [];
  const f = M.fromOdds({ h: v[2], d: v[3], a: v[4], line: v[5] && v[6] ? 2.5 : null, over: v[5], under: v[6] }, { total: 2.7 });
  return f ? [r2(f.xg.home), r2(f.xg.away)] : [];
}

const ESPN = new URL("../../futbol/dane/espn.json", import.meta.url);
const OUT = new URL("../../futbol/dane/fd.json", import.meta.url);
const LEAGUES = [["E0", "PL"], ["SP1", "ES1"], ["D1", "DE1"], ["I1", "IT1"], ["F1", "FR1"], ["N1", "NL1"], ["P1", "PT1"], ["E1", "EN2"]];

const now = new Date();
const y0 = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const code = y => String(y % 100).padStart(2, "0") + String((y + 1) % 100).padStart(2, "0");
const seasons = [code(y0 - 1), code(y0)];

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "futbol-app" } });
      if (r.status === 404) return "";
      if (r.ok) return r.text();
      throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
}
// prosty parser CSV (pola bez cudzysłowów z przecinkami – tak wyglądają te pliki, ale obsługujemy cudzysłowy)
function csv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  const split = l => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0] || "");
  return lines.slice(1).map(l => { const v = split(l), o = {}; head.forEach((h, i) => { o[h] = v[i]; }); return o; });
}
const num = v => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; };
const xgNum = v => { const x = parseFloat(v); return isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : null; };
const day = s => Math.round(new Date(s).getTime() / 86400000);
const fdDay = d => { const [dd, mm, yy] = d.split("/"); return day(`${yy.length === 2 ? "20" + yy : yy}-${mm}-${dd}T12:00:00Z`); };

const espn = JSON.parse(await readFile(ESPN, "utf8"));
const out = { updated: null, m: {}, n: {} };
const ids = {}; // kod ligi → { nazwa w football-data → id ESPN }
const upcoming = {}; // kod ligi → nierozegrane mecze ESPN
let total = 0, matched = 0;
for (const [fd, comp] of LEAGUES) {
  const rows = [];
  for (const s of seasons) {
    const t = await get(`https://football-data.co.uk/mmz4281/${s}/${fd}.csv`);
    if (t) rows.push(...csv(t).filter(r => r.HomeTeam && r.Date && r.FTHG !== undefined && r.FTHG !== ""));
  }
  const em = (espn.comps[comp] || []).filter(r => r.f).map(r => ({ ...r, d: day(r.k) }));
  const byDay = new Map();
  for (const r of em) for (const d of [r.d - 1, r.d, r.d + 1]) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }
  // nazwy klubów: głosowanie – mecz w tym samym dniu (±1) z tym samym wynikiem
  const votes = {};
  const vote = (n, id, w) => { const v = votes[n] || (votes[n] = {}); v[id] = (v[id] || 0) + w; };
  for (const r of rows) {
    const c = (byDay.get(fdDay(r.Date)) || []).filter(e => e.f[0] === +r.FTHG && e.f[1] === +r.FTAG);
    for (const e of c) { vote(r.HomeTeam, e.h, 1 / c.length); vote(r.AwayTeam, e.a, 1 / c.length); }
  }
  const idOf = ids[comp] = {};
  upcoming[comp] = (espn.comps[comp] || []).filter(r => !r.f).map(r => ({ ...r, d: day(r.k) }));
  for (const [n, v] of Object.entries(votes)) idOf[n] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  for (const r of rows) {
    total++;
    const h = idOf[r.HomeTeam], a = idOf[r.AwayTeam], d = fdDay(r.Date);
    const e = em.find(x => x.h === h && x.a === a && Math.abs(x.d - d) <= 3);
    if (!e) continue;
    matched++;
    const pick = (c, o) => num(r[c]) ?? num(r[o]);
    const v = [xgNum(r.HxG), xgNum(r.AxG), pick("B365CH", "B365H"), pick("B365CD", "B365D"), pick("B365CA", "B365A"), pick("B365C>2.5", "B365>2.5"), pick("B365C<2.5", "B365<2.5")];
    if (v.some(x => x !== null)) out.m[`${comp}|${e.k}|${e.h}|${e.a}`] = [...v, ...mktGoals(v)];
  }
  console.log(`${comp}: ${rows.length} meczów w CSV, kluby ${Object.keys(idOf).length}`);
}
console.log(`dopasowano ${matched}/${total}`);

// nadchodzące mecze z kursami bet365
const FD = Object.fromEntries(LEAGUES);
const fx = csv(await get("https://football-data.co.uk/fixtures.csv"));
let nf = 0, nm = 0;
for (const r of fx) {
  const comp = FD[r.Div];
  if (!comp || !r.HomeTeam || !r.Date) continue;
  nf++;
  const h = ids[comp][r.HomeTeam], a = ids[comp][r.AwayTeam], d = fdDay(r.Date);
  const e = h && a && upcoming[comp].find(x => x.h === h && x.a === a && Math.abs(x.d - d) <= 2);
  const v = [num(r.B365H), num(r.B365D), num(r.B365A), num(r["B365>2.5"]), num(r["B365<2.5"])];
  if (e && v[0] && v[1] && v[2]) { out.n[`${comp}|${e.k}|${e.h}|${e.a}`] = v; nm++; }
}
console.log(`nadchodzące z kursami bet365: ${nm}/${nf}`);
if (total < 1000 || matched / total < 0.95) throw new Error("za mało dopasowanych meczów – nie zapisuję");

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* brak pliku */ }
if (prev && JSON.stringify([prev.m, prev.n]) === JSON.stringify([out.m, out.n])) { console.log("bez zmian"); process.exit(0); }
out.updated = new Date().toISOString();
await writeFile(OUT, JSON.stringify(out));
console.log(`zapisano: ${Object.keys(out.m).length} meczów`);
