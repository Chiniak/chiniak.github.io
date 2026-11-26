/* Futbol – zbieranie danych.
   1) openfootball (domena publiczna, bez klucza): Premier League i Liga Mistrzów, bieżący i poprzedni sezon.
   2) football-data.org (opcjonalnie, darmowy klucz): świeże wyniki i terminarz PL i LM.
   3) Wyniki i mecze wpisane ręcznie (zapisane w przeglądarce).
   Wszystko łączone w jedną listę meczów { id, date, time, home, away, hg, ag, comp, round, season, src }. */
(function (root) {
  "use strict";

  const OF = "https://raw.githubusercontent.com/openfootball";
  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

  // sezon zaczyna się w lipcu: listopad 2026 → 2026, marzec 2027 → 2026
  function seasonStart(d = new Date()) { return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }
  function seasonLabel(y) { return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }

  /* Nazwy klubów z różnych źródeł → jedna nazwa. */
  const ALIAS = {
    "brighton hove albion": "Brighton & Hove Albion FC", "brighton": "Brighton & Hove Albion FC",
    "wolverhampton wanderers": "Wolverhampton Wanderers FC", "wolves": "Wolverhampton Wanderers FC",
    "tottenham hotspur": "Tottenham Hotspur FC", "spurs": "Tottenham Hotspur FC", "tottenham": "Tottenham Hotspur FC",
    "manchester united": "Manchester United FC", "man united": "Manchester United FC", "man utd": "Manchester United FC",
    "manchester city": "Manchester City FC", "man city": "Manchester City FC",
    "nott m forest": "Nottingham Forest FC",
    "newcastle united": "Newcastle United FC", "newcastle": "Newcastle United FC",
    "nottingham forest": "Nottingham Forest FC", "nottm forest": "Nottingham Forest FC",
    "west ham united": "West Ham United FC", "west ham": "West Ham United FC",
    "bournemouth": "AFC Bournemouth", "afc bournemouth": "AFC Bournemouth",
    "leeds united": "Leeds United FC", "leeds": "Leeds United FC",
    "ipswich town": "Ipswich Town FC", "ipswich": "Ipswich Town FC",
    "hull city": "Hull City AFC", "hull": "Hull City AFC",
    "coventry city": "Coventry City FC", "coventry": "Coventry City FC",
    "leicester city": "Leicester City FC", "leicester": "Leicester City FC",
    "sheffield united": "Sheffield United FC", "sunderland": "Sunderland AFC",
    "aston villa": "Aston Villa FC", "crystal palace": "Crystal Palace FC",
  };
  function key(name) {
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " ").replace(/\b(fc|afc|cf|sc|ac|sk|fk|cp|sad)\b/g, " ").replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  const known = new Map(); // klucz → nazwa kanoniczna
  function canon(name) {
    const raw = name.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
    const k = key(raw);
    if (ALIAS[k]) return ALIAS[k];
    const prev = known.get(k);
    if (!prev || raw.length > prev.length) known.set(k, raw); // „Liverpool” → „Liverpool FC”
    return known.get(k);
  }

  /* Parser formatu football.txt (openfootball) – PL i LM. */
  function parseTxt(text, { comp, season }) {
    const y0 = parseInt(season, 10);
    const out = [];
    let date = null, round = "", time = "";
    const countries = {};
    for (const line0 of text.split("\n")) {
      const line = line0.replace(/\s+$/, "");
      if (!line.trim() || line.trim().startsWith("#") || line.startsWith("=")) continue;
      const st = line.match(/^\s*▪\s*(.+)$/);
      if (st) { round = st[1].trim(); continue; }
      const dl = line.match(/^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/);
      if (dl) {
        const mon = MONTHS[dl[1]], day = +dl[2];
        const y = dl[3] ? +dl[3] : (mon >= 7 ? y0 : y0 + 1);
        date = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        time = "";
        continue;
      }
      if (!date || /^\s*\(/.test(line)) continue; // linie ze strzelcami
      let rest = line.trim();
      const tm = rest.match(/^(\d{1,2}:\d{2})\s+(.*)$/);
      if (tm) { time = tm[1]; rest = tm[2]; }
      rest = rest.replace(/\s+@\s.*$/, "").trim();
      let left, away, sc = null;
      const vi = rest.search(/\s+v\s+/);
      if (vi >= 0) {
        // „Drużyna A  v Drużyna B   2-1 (1-0)”
        left = rest.slice(0, vi).trim();
        const right = rest.slice(vi).replace(/^\s+v\s+/, "");
        const sm = right.match(/^(.+?)\s+(\d+-\d+.*)$/);
        if (sm) { away = sm[1].trim(); sc = sm[2]; } else away = right.trim();
      } else {
        // „Drużyna A  2-1 (1-0)  Drużyna B”
        const bm = rest.match(/^(.+?)\s+(\d+-\d+(?:\s+pen\.\s+\d+-\d+)?(?:\s+a\.e\.t\.)?(?:\s+\([\d\s,-]*\))?)\s+(\D.*)$/);
        if (!bm) continue;
        left = bm[1].trim(); sc = bm[2]; away = bm[3].trim();
      }
      let hg = null, ag = null, aet = null, pens = null;
      if (sc) {
        if (/a\.e\.t\./.test(sc)) {
          // „4-3 pen. 1-1 a.e.t. (1-1, 0-1)” albo „3-2 a.e.t. (3-0, 1-0)” – do modelu bierzemy wynik po 90 min
          const a = sc.match(/(\d+)-(\d+)\s+a\.e\.t\./); aet = a ? [+a[1], +a[2]] : null;
          const p = sc.match(/^(\d+)-(\d+)\s+pen\./); pens = p ? [+p[1], +p[2]] : null;
          const r90 = sc.match(/\((\d+)-(\d+)/);
          if (r90 && (!aet || (+r90[1] <= aet[0] && +r90[2] <= aet[1]))) { hg = +r90[1]; ag = +r90[2]; }
          else if (aet) { [hg, ag] = aet; }
        } else {
          const r = sc.match(/^(\d+)-(\d+)/); hg = +r[1]; ag = +r[2];
        }
      }
      if (!left || !away) continue;
      const cc1 = left.match(/\(([A-Z]{3})\)$/), cc2 = away.match(/\(([A-Z]{3})\)$/);
      const home = canon(left), aw = canon(away);
      if (cc1) countries[home] = cc1[1];
      if (cc2) countries[aw] = cc2[1];
      out.push({ date, time, home, away: aw, hg, ag, aet, pens, comp, round, season, src: "openfootball" });
    }
    return { matches: out, countries };
  }

  async function getText(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }

  /* openfootball: bieżący i poprzedni sezon PL i LM. Brakujące pliki są pomijane. */
  async function loadOpenfootball(log = () => {}) {
    const y = seasonStart();
    const jobs = [];
    for (const yy of [y, y - 1]) {
      const s = seasonLabel(yy);
      jobs.push({ url: `${OF}/england/master/${s}/1-premierleague.txt`, comp: "PL", season: s });
      jobs.push({ url: `${OF}/champions-league/master/${s}/cl.txt`, comp: "CL", season: s });
    }
    const all = [], countries = {}, status = [];
    await Promise.all(jobs.map(async j => {
      try {
        const res = parseTxt(await getText(j.url), j);
        all.push(...res.matches); Object.assign(countries, res.countries);
        const last = res.matches.filter(m => m.hg !== null).map(m => m.date).sort().pop();
        status.push({ ...j, ok: true, n: res.matches.length, played: res.matches.filter(m => m.hg !== null).length, last });
      } catch (e) {
        status.push({ ...j, ok: false, err: String(e.message || e) });
      }
    }));
    log(status);
    return { matches: all, countries, status };
  }

  /* football-data.org v4 (darmowy klucz: PL i CL). */
  async function loadFootballData(token, log = () => {}) {
    if (!token) return { matches: [], status: [] };
    const y = seasonStart();
    const status = [], all = [];
    for (const comp of ["PL", "CL"]) {
      const url = `https://api.football-data.org/v4/competitions/${comp}/matches?season=${y}`;
      try {
        const r = await fetch(url, { headers: { "X-Auth-Token": token } });
        if (!r.ok) throw new Error(r.status === 403 ? "403 – klucz nie ma dostępu" : r.status === 429 ? "429 – za dużo zapytań, spróbuj za minutę" : String(r.status));
        const js = await r.json();
        const ms = (js.matches || []).map(m => {
          const ft = m.score?.fullTime || {}, rt = m.score?.regularTime;
          const done = m.status === "FINISHED";
          const g = done ? (rt && rt.home !== null ? rt : ft) : {};
          return {
            date: m.utcDate.slice(0, 10), time: new Date(m.utcDate).toTimeString().slice(0, 5),
            home: canon(m.homeTeam?.name || "?"), away: canon(m.awayTeam?.name || "?"),
            hg: done ? g.home : null, ag: done ? g.away : null,
            comp, round: m.stage === "REGULAR_SEASON" || m.stage === "LEAGUE_STAGE" ? `${comp === "CL" ? "League, " : ""}Matchday ${m.matchday}` : (m.stage || "").replace(/_/g, " ").toLowerCase(),
            season: seasonLabel(y), src: "football-data", live: ["IN_PLAY", "PAUSED"].includes(m.status),
          };
        }).filter(m => m.home !== "?" && m.away !== "?");
        all.push(...ms);
        status.push({ comp, url, ok: true, n: ms.length, played: ms.filter(m => m.hg !== null).length });
      } catch (e) {
        status.push({ comp, url, ok: false, err: e instanceof TypeError ? "brak połączenia lub przeglądarka zablokowała zapytanie" : String(e.message || e) });
      }
    }
    log(status);
    return { matches: all, status };
  }

  /* Fantasy Premier League – plik dane/fpl.json odświeżany co 3 godziny przez GitHub Action
     (FPL nie pozwala pobierać danych bezpośrednio z przeglądarki).
     Daje aktualne wyniki i terminarz PL oraz zawodników: kontuzje, zawieszenia, formę, xG. */
  async function loadFpl(url = "dane/fpl.json") {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const js = await r.json();
    const team = Object.fromEntries(js.teams.map(t => [t.id, canon(t.name)]));
    const season = seasonLabel(seasonStart());
    const matches = js.fixtures.filter(f => f.ko && team[f.h] && team[f.a]).map(f => {
      const d = new Date(f.ko);
      const ld = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return {
        date: ld, time: d.toTimeString().slice(0, 5), home: team[f.h], away: team[f.a],
        hg: f.hs ?? null, ag: f.as ?? null, comp: "PL", round: f.ev ? `Matchday ${f.ev}` : "", season, src: "fpl", live: !!f.live,
      };
    });
    const players = js.players.map(p => ({ ...p, team: team[p.t] })).filter(p => p.team);
    const status = [{ comp: "PL", season, url, ok: true, n: matches.length, played: matches.filter(m => m.hg !== null).length,
      last: matches.filter(m => m.hg !== null).map(m => m.date).sort().pop(), players: players.length, updated: js.updated }];
    return { matches, players, updated: js.updated, nextDeadline: js.nextDeadline, status };
  }

  /* Łączenie źródeł: ten sam mecz (rozgrywki + drużyny + data ±3 dni) występuje raz.
     Pierwszeństwo: wynik ręczny > football-data > openfootball. */
  const RANK = { manual: 4, "football-data": 3, fpl: 2, openfootball: 1 };
  function merge(lists) {
    const map = new Map();
    const dayNum = d => Math.round(new Date(d).getTime() / 86400000);
    const byPair = new Map();
    const fix = n => ALIAS[key(n)] || known.get(key(n)) || n;
    for (const m of lists.flat()) {
      m.home = fix(m.home); m.away = fix(m.away);
      const pk = `${m.comp}|${m.home}|${m.away}`;
      const cands = byPair.get(pk) || [];
      const same = cands.find(c => Math.abs(dayNum(c.date) - dayNum(m.date)) <= 3 || (m.comp === "PL" && c.season === m.season));
      if (!same) { cands.push(m); byPair.set(pk, cands); map.set(m, m); continue; }
      const better = (RANK[m.src] || 0) >= (RANK[same.src] || 0);
      const hasScore = x => x.hg !== null && x.hg !== undefined;
      // nowsze źródło wygrywa, ale wynik nie znika, jeśli lepsze źródło go jeszcze nie ma
      if (better && (hasScore(m) || !hasScore(same))) Object.assign(same, { ...m });
      else if (!hasScore(same) && hasScore(m)) Object.assign(same, { hg: m.hg, ag: m.ag, src: m.src });
      else if (better && !hasScore(m)) Object.assign(same, { date: m.date, time: m.time || same.time });
    }
    const out = [...map.keys()];
    out.forEach((m, i) => { m.id = `${m.comp}-${m.season}-${key(m.home)}-${key(m.away)}-${m.date}`.replace(/\s/g, "_"); });
    return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }

  const api = { parseTxt, loadOpenfootball, loadFootballData, loadFpl, merge, canon, key, seasonStart, seasonLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FData = api;
})(typeof self !== "undefined" ? self : this);
