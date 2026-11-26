// xG drużyn mecz po meczu w bieżącym sezonie Premier League.
// FPL (statystyki od Opta) podaje xG każdego zawodnika w każdym meczu; suma zawodników drużyny = xG drużyny.
// Wynik: futbol/dane/xg.json – [{ ko, h, a, hg, ag, hxg, axg }] (h, a – nazwy drużyn z FPL).
// Uruchomienie: node .github/scripts/futbol-xg.mjs  (ok. 600 zapytań, kilka minut)
import { writeFile, mkdir, readFile } from "node:fs/promises";

const API = "https://fantasy.premierleague.com/api";
const OUT = new URL("../../futbol/dane/xg.json", import.meta.url);

async function get(path) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(API + path, { headers: { "User-Agent": "futbol-app" } });
      if (r.ok) return r.json();
      throw new Error(`${r.status} ${path}`);
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(res => setTimeout(res, 1500 * 2 ** i));
    }
  }
}

const [boot, fixtures] = await Promise.all([get("/bootstrap-static/"), get("/fixtures/")]);
const teamName = Object.fromEntries(boot.teams.map(t => [t.id, t.name]));
const done = new Map(fixtures.filter(f => f.finished).map(f => [f.id, f]));
const players = boot.elements.filter(p => p.minutes > 0);

// bez nowych rozegranych meczów nie ma czego pobierać (oszczędza ok. 600 zapytań)
try {
  const old = JSON.parse(await readFile(OUT, "utf8"));
  if (old.length === done.size) { console.log("brak nowych meczów"); process.exit(0); }
} catch { /* brak pliku */ }

// xG na mecz i drużynę
const xg = new Map(); // fixture → { h: sum, a: sum }
let i = 0;
async function worker() {
  while (i < players.length) {
    const p = players[i++];
    const s = await get(`/element-summary/${p.id}/`);
    for (const h of s.history || []) {
      if (!done.has(h.fixture) || !h.minutes) continue;
      const v = Number(h.expected_goals) || 0;
      const e = xg.get(h.fixture) || { h: 0, a: 0 };
      if (h.was_home) e.h += v; else e.a += v;
      xg.set(h.fixture, e);
    }
    await new Promise(res => setTimeout(res, 100)); // grzecznie dla serwera FPL
  }
}
await Promise.all(Array.from({ length: 5 }, worker));

const out = [...done.values()].filter(f => xg.has(f.id)).sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time)).map(f => ({
  ko: f.kickoff_time, h: teamName[f.team_h], a: teamName[f.team_a], hg: f.team_h_score, ag: f.team_a_score,
  hxg: Math.round(xg.get(f.id).h * 100) / 100, axg: Math.round(xg.get(f.id).a * 100) / 100,
}));
if (out.length < done.size * 0.9) throw new Error(`xG tylko dla ${out.length} z ${done.size} meczów – nie zapisuję`);

const body = JSON.stringify(out);
let prev = null;
try { prev = await readFile(OUT, "utf8"); } catch { /* brak pliku */ }
if (prev === body) { console.log("bez zmian"); process.exit(0); }
await mkdir(new URL(".", OUT), { recursive: true });
await writeFile(OUT, body);
console.log(`zapisano xG dla ${out.length} meczów`);
