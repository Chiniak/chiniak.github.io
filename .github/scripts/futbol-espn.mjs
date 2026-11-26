// Wyniki, terminarze i kluby (z logami) najważniejszych lig i pucharów europejskich z publicznego API ESPN.
// Zapis: futbol/dane/espn.json (zwarty format, żeby telefon nie pobierał kilku MB).
// Uruchomienie: node .github/scripts/futbol-espn.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";

const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const OUT = new URL("../../futbol/dane/espn.json", import.meta.url);
// [kod ESPN, nasz kod] – nazwy i kolejność wyświetlania są w futbol/app.js
const COMPS = [
  ["eng.1", "PL"], ["esp.1", "ES1"], ["ger.1", "DE1"], ["ita.1", "IT1"], ["fra.1", "FR1"],
  ["ned.1", "NL1"], ["por.1", "PT1"], ["eng.2", "EN2"], ["uefa.champions", "CL"], ["uefa.europa", "EL"],
];

async function get(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "futbol-app" } });
      if (r.ok) return r.json();
      throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
}

// sezon zaczyna się w lipcu; bierzemy bieżący i poprzedni
const now = new Date();
const y0 = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const from = `${y0 - 1}-07-01`;
const years = [y0 - 1, y0, y0 + 1];

// gole do 90. minuty (z doliczonym czasem) – do modelu; dogrywka i karne osobno
const minute = s => parseInt(String(s || "").replace(/[^\d].*$/, ""), 10);
function regulation(c, homeId) {
  let h = 0, a = 0;
  for (const d of c.details || []) {
    if (!d.scoringPlay || minute(d.clock?.displayValue) > 90) continue;
    if (d.team?.id === homeId) h++; else a++;
  }
  return [h, a];
}

const teams = {};
const out = { updated: null, from, teams, comps: {} };
for (const [slug, code] of COMPS) {
  const seen = new Set(), rows = [];
  for (const y of years) {
    const js = await get(`${API}/${slug}/scoreboard?dates=${y}&limit=1000`);
    for (const e of js.events || []) {
      if (seen.has(e.id) || e.date < from) continue;
      seen.add(e.id);
      const c = e.competitions?.[0];
      const H = c?.competitors?.find(x => x.homeAway === "home"), A = c?.competitors?.find(x => x.homeAway === "away");
      if (!H || !A) continue;
      for (const t of [H.team, A.team]) {
        if (!teams[t.id]) teams[t.id] = { n: t.displayName, s: t.shortDisplayName, a: t.abbreviation, c: t.color || null, l: t.logo || null };
      }
      const st = e.status?.type || {};
      const name = st.name || "";
      if (/POSTPONED|CANCELED|CANCELLED|ABANDONED|DELAYED/.test(name)) continue;
      const row = { k: e.date, h: H.team.id, a: A.team.id };
      if (st.completed) {
        row.f = [+H.score, +A.score];
        if (/AET|PEN/.test(name)) { row.r = regulation(c, H.team.id); row.x = 1; }
        if (/PEN/.test(name)) row.p = [H.shootoutScore ?? null, A.shootoutScore ?? null];
      } else if (st.state === "in") row.live = [+H.score || 0, +A.score || 0];
      if (e.season?.slug && !/regular-season/.test(e.season.slug)) row.st = e.season.slug;
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.k.localeCompare(b.k));
  out.comps[code] = rows;
  console.log(`${code}: ${rows.length} meczów, ${rows.filter(r => r.f).length} rozegranych`);
}
if (Object.values(out.comps).reduce((s, r) => s + r.length, 0) < 2000) throw new Error("za mało meczów – nie zapisuję");

// zapis tylko przy zmianie danych
let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); prev.updated = null; } catch { /* brak pliku */ }
if (prev && JSON.stringify(prev) === JSON.stringify(out)) { console.log("bez zmian"); process.exit(0); }
out.updated = new Date().toISOString();
await mkdir(new URL(".", OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`zapisano: ${Object.keys(teams).length} klubów`);
