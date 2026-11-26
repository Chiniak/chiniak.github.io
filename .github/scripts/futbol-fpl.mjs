// Pobiera dane Fantasy Premier League (oficjalne, darmowe) i zapisuje skrót do futbol/dane/fpl.json.
// FPL nie pozwala przeglądarce pobierać danych z innej strony (brak CORS), dlatego robi to GitHub Action.
// Uruchomienie: node .github/scripts/futbol-fpl.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";

const API = "https://fantasy.premierleague.com/api";
const OUT = new URL("../../futbol/dane/fpl.json", import.meta.url);

async function get(path) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(API + path, { headers: { "User-Agent": "futbol-app" } });
      if (r.ok) return r.json();
      throw new Error(`${r.status} ${path}`);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
}

const num = x => (x === null || x === undefined || x === "" ? null : Number(x));
const [boot, fixtures] = await Promise.all([get("/bootstrap-static/"), get("/fixtures/")]);

const out = {
  teams: boot.teams.map(t => ({ id: t.id, name: t.name, short: t.short_name })),
  nextEvent: boot.events.find(e => e.is_next)?.id ?? null,
  nextDeadline: boot.events.find(e => e.is_next)?.deadline_time ?? null,
  fixtures: fixtures.map(f => ({
    ev: f.event, ko: f.kickoff_time, h: f.team_h, a: f.team_a,
    hs: f.finished ? f.team_h_score : null, as: f.finished ? f.team_a_score : null,
    live: f.started && !f.finished,
  })),
  // pozycje: 1 bramkarz, 2 obrońca, 3 pomocnik, 4 napastnik
  // status: a dostępny, d wątpliwy, i kontuzja, s zawieszenie, u niedostępny (np. wypożyczony), n nie może grać
  players: boot.elements.map(p => ({
    id: p.id, n: p.web_name, full: `${p.first_name} ${p.second_name}`, t: p.team, pos: p.element_type,
    st: p.status, ch: num(p.chance_of_playing_next_round), news: p.news || "", na: p.news_added,
    form: num(p.form), min: p.minutes, starts: p.starts, g: p.goals_scored, as: p.assists,
    xg: num(p.expected_goals), xa: num(p.expected_assists), xgc: num(p.expected_goals_conceded),
    yc: p.yellow_cards, rc: p.red_cards, ppg: num(p.points_per_game),
  })).filter(p => p.min > 0 || p.st !== "a"),
};

// zapis tylko przy zmianie danych (bez znacznika czasu), żeby nie tworzyć pustych commitów
const body = JSON.stringify(out);
let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); delete prev.updated; } catch { /* brak pliku */ }
if (prev && JSON.stringify(prev) === body) { console.log("bez zmian"); process.exit(0); }
await mkdir(new URL(".", OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), ...out }));
console.log(`zapisano: ${out.players.length} zawodników, ${out.fixtures.filter(f => f.hs !== null).length} wyników`);
