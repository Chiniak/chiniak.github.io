// Pobiera ranking siły klubów ClubElo (darmowy, tylko HTTP – dlatego przez GitHub Action) do futbol/dane/.
//   clubelo.json        – stan na dziś (prognozy w aplikacji)
//   clubelo-start.json  – stan na dzień przed początkiem testu skuteczności (uczciwy test wsteczny, bez wiedzy z przyszłości)
// Zostają kluby z najwyższych lig oraz angielskie z 2. ligi (beniaminkowie).
import { writeFile, mkdir, readFile, access } from "node:fs/promises";

const DIR = new URL("../../futbol/dane/", import.meta.url);
const START = "2025-09-14"; // musi się zgadzać z początkiem testu wstecznego w futbol/app.js

async function snapshot(date) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`http://api.clubelo.com/${date}`, { headers: { "User-Agent": "futbol-app" } });
      if (!r.ok) throw new Error(`${r.status} ${date}`);
      const rows = (await r.text()).trim().split("\n").slice(1).map(l => l.split(","));
      // Rank,Club,Country,Level,Elo,From,To
      const clubs = rows.filter(c => c.length >= 5 && (c[3] === "1" || (c[2] === "ENG" && c[3] === "2")))
        .map(c => [c[1], c[2], +c[3], Math.round(+c[4])]);
      if (clubs.length < 100) throw new Error(`za mało klubów (${clubs.length}) dla ${date}`);
      return { date, clubs };
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
  throw lastErr;
}

await mkdir(DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const now = await snapshot(today);
const file = new URL("clubelo.json", DIR);
let prev = null;
try { prev = JSON.parse(await readFile(file, "utf8")); } catch { /* brak pliku */ }
if (!prev || JSON.stringify(prev.clubs) !== JSON.stringify(now.clubs)) {
  await writeFile(file, JSON.stringify(now));
  console.log(`clubelo.json: ${now.clubs.length} klubów`);
} else console.log("clubelo.json bez zmian");

const startFile = new URL("clubelo-start.json", DIR);
try { await access(startFile); } catch {
  await writeFile(startFile, JSON.stringify(await snapshot(START)));
  console.log(`clubelo-start.json (${START}) zapisany`);
}
