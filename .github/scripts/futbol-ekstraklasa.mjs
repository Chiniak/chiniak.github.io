// Ekstraklasa z football-data.co.uk (darmowe CSV, bez klucza) – ESPN jej nie ma.
// new/POL.csv – wyniki i kursy zamknięcia (bet365, a gdy ich brak – średnia rynku) z kolejnych sezonów;
// new_league_fixtures.csv – najbliższe mecze z kursami (plik uzupełniany ok. 2 razy w tygodniu).
// TheSportsDB (darmowy klucz 123) – terminarz 3 najbliższych kolejek, żeby mecze były widoczne wcześniej (bez kursów;
// darmowy klucz nie oddaje całego sezonu, ale oddaje pełne kolejki). Daty dalszych kolejek bywają orientacyjne.
// Zapis: futbol/dane/ekstraklasa.json = { updated, league: logo ligi, badges: { klub: herb }, rows: [ { k: start UTC, h, a, f?: [gole gosp., gole gościa], o?: [1, X, 2, bukmacher], r?: kolejka } ] }
// Nazwy klubów jak w football-data; ładne nazwy nadaje futbol/data.js. Godziny w plikach są czasu brytyjskiego.
// Uruchomienie: node .github/scripts/futbol-ekstraklasa.mjs
import { writeFile, readFile } from "node:fs/promises";

const OUT = new URL("../../futbol/dane/ekstraklasa.json", import.meta.url);
const now = new Date();
const y0 = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const seasons = new Set([`${y0 - 1}/${y0}`, `${y0}/${y0 + 1}`]);

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "futbol-app" } });
      if (r.ok) return r.text();
      throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
}
function csv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  const split = l => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0] || "");
  return lines.slice(1).map(l => { const v = split(l), o = {}; head.forEach((h, i) => { if (h) o[h] = v[i]; }); return o; });
}
const num = v => { const x = parseFloat(v); return isFinite(x) && x > 1 ? x : null; };
// czas brytyjski → UTC (ISO, jak w danych ESPN: RRRR-MM-DDTGG:MMZ)
function ukToUtc(date, time) {
  const [dd, mm, yy] = date.split("/"), [H, M] = (time || "15:00").split(":").map(Number);
  const guess = Date.UTC(+(yy.length === 2 ? "20" + yy : yy), +mm - 1, +dd, H, M);
  const london = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/London" })).getTime();
  const utc = new Date(guess).getTime() - (london - new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime());
  return new Date(utc).toISOString().slice(0, 16) + "Z";
}
// kursy: bet365, a gdy ich brak – średnia rynku
function odds(r, closing) {
  const c = closing ? "C" : "";
  const b = [num(r[`B365${c}H`]), num(r[`B365${c}D`]), num(r[`B365${c}A`])];
  if (b.every(Boolean)) return [...b, "bet365"];
  const a = [num(r[`Avg${c}H`]), num(r[`Avg${c}D`]), num(r[`Avg${c}A`])];
  return a.every(Boolean) ? [...a, "średnia rynku"] : null;
}

const rows = [];
const res = csv(await get("https://football-data.co.uk/new/POL.csv")).filter(r => seasons.has(r.Season) && r.Home && r.Date);
for (const r of res) {
  const row = { k: ukToUtc(r.Date, r.Time), h: r.Home, a: r.Away };
  if (r.HG !== "" && r.AG !== "" && r.HG !== undefined) row.f = [+r.HG, +r.AG];
  const o = odds(r, true);
  if (o) row.o = o;
  rows.push(row);
}
let nf = 0;
try {
  for (const r of csv(await get("https://football-data.co.uk/new_league_fixtures.csv"))) {
    if (r.Country !== "Poland" || !r.Home || !r.Date) continue;
    const k = ukToUtc(r.Date, r.Time);
    if (rows.some(x => x.h === r.Home && x.a === r.Away && Math.abs(new Date(x.k) - new Date(k)) < 3 * 86400000)) continue;
    const row = { k, h: r.Home, a: r.Away }, o = odds(r, false);
    if (o) row.o = o;
    rows.push(row); nf++;
  }
} catch (e) { console.log("terminarz niedostępny:", e.message); }
// terminarz z TheSportsDB: nazwy klubów → nazwy z football-data (wszystkie słowa nazwy z football-data są w nazwie TheSportsDB)
const plain = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[łŁ]/g, "l").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const fdNames = [...new Set(rows.flatMap(r => [r.h, r.a]))];
function toFd(n) {
  const w = plain(n);
  const c = fdNames.filter(f => plain(f).every(x => w.includes(x))).sort((a, b) => plain(b).length - plain(a).length);
  return c[0] || n;
}
let ns = 0;
const badges = {}; let leagueBadge = null; // herby klubów i logo ligi z TheSportsDB (z meczów w terminarzu)
try {
  const DB = "https://www.thesportsdb.com/api/v1/json/123", season = `${y0}-${y0 + 1}`;
  const nx = JSON.parse(await get(`${DB}/eventsnextleague.php?id=4422`)).events?.[0];
  const r0 = +nx?.intRound;
  if (r0) for (let r = r0; r < r0 + 3; r++) {
    const ev = JSON.parse(await get(`${DB}/eventsround.php?id=4422&r=${r}&s=${season}`)).events || [];
    for (const e of ev) {
      if (e.strHomeTeamBadge) badges[toFd(e.strHomeTeam)] = e.strHomeTeamBadge;
      if (e.strAwayTeamBadge) badges[toFd(e.strAwayTeam)] = e.strAwayTeamBadge;
      if (e.strLeagueBadge) leagueBadge = e.strLeagueBadge;
      if (e.intHomeScore !== null && e.intHomeScore !== "" && e.intHomeScore !== undefined) continue; // rozegrane – wynik jest z football-data
      if (!e.dateEvent) continue;
      const k = `${e.dateEvent}T${(e.strTime || "12:00").slice(0, 5)}Z`, h = toFd(e.strHomeTeam), a = toFd(e.strAwayTeam);
      if (rows.some(x => x.h === h && x.a === a && Math.abs(new Date(x.k) - new Date(k)) < 10 * 86400000)) continue;
      rows.push({ k, h, a, r }); ns++;
    }
  }
} catch (e) { console.log("TheSportsDB niedostępne:", e.message); }
console.log(`terminarz z TheSportsDB: ${ns} meczów`);
rows.sort((a, b) => a.k.localeCompare(b.k));
const played = rows.filter(r => r.f).length;
console.log(`Ekstraklasa: ${played} rozegranych, ${nf} nadchodzących, kursy dla ${rows.filter(r => r.o).length}`);
if (played < 200) throw new Error("za mało meczów – nie zapisuję");

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* brak pliku */ }
// herby z poprzednich pobrań zostają (klub może nie grać w najbliższych kolejkach)
const allBadges = { ...(prev?.badges || {}), ...badges }, league = leagueBadge || prev?.league || null;
// kluby bez herbu (np. spadkowicze z poprzedniego sezonu) – wyszukiwanie po nazwie, a potem po najdłuższym słowie nazwy
for (const n of [...new Set(rows.flatMap(r => [r.h, r.a]))].filter(n => !allBadges[n])) {
  const words = n.replace(/[^\p{L} ]/gu, " ").split(/\s+/).filter(w => w.length >= 5).sort((a, b) => b.length - a.length);
  for (const q of [n, ...words]) {
    try {
      const t = (JSON.parse(await get(`https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(q)}`)).teams || [])
        .find(x => x.strSport === "Soccer" && x.strCountry === "Poland" && x.strBadge);
      if (t) { allBadges[n] = t.strBadge; console.log(`herb: ${n} ← ${t.strTeam}`); break; }
    } catch (e) { console.log(`herb ${n}: ${e.message}`); break; }
  }
}
if (prev && JSON.stringify([prev.rows, prev.badges, prev.league]) === JSON.stringify([rows, allBadges, league])) { console.log("bez zmian"); process.exit(0); }
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), league, badges: allBadges, rows }));
console.log(`herby: ${Object.keys(allBadges).length} klubów`);
console.log("zapisano");
