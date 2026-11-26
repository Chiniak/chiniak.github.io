/* Futbol – zbieranie danych. Wszystkie pliki są na tej samej stronie (dane/), odświeża je GitHub Action:
   1) dane/espn.json – wyniki, terminarze i kluby z logami: 8 lig i 2 puchary europejskie (publiczne API ESPN)
   2) dane/fpl.json  – Fantasy Premier League: kontuzje, zawieszenia, forma zawodników PL, wyniki PL
   3) dane/xg.json   – xG drużyn mecz po meczu w PL (statystyki Opta przez FPL)
   4) wyniki i mecze wpisane ręcznie (zapisane w przeglądarce)
   Wszystko łączone w jedną listę meczów { id, date, time, home, away, hg, ag, comp, round, season, src }. */
(function (root) {
  "use strict";

  /* Rozgrywki: kod, nazwa, skrót, id logo ESPN, strefy tabeli (top – awans/LM, mid – baraże/puchary, bottom – spadek). */
  const COMPS = [
    { code: "PL", name: "Premier League", short: "Premier League", logo: 23, cc: "ENG", zones: { top: [4, "Liga Mistrzów"], mid: [5, 5, "miejsce 5 (często też LM)"], bottom: [3, "spadek"] } },
    { code: "ES1", name: "LaLiga", short: "LaLiga", logo: 15, cc: "ESP", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [3, "spadek"] } },
    { code: "DE1", name: "Bundesliga", short: "Bundesliga", logo: 10, cc: "GER", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "IT1", name: "Serie A", short: "Serie A", logo: 12, cc: "ITA", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [3, "spadek"] } },
    { code: "FR1", name: "Ligue 1", short: "Ligue 1", logo: 9, cc: "FRA", zones: { top: [3, "Liga Mistrzów"], mid: [4, 5, "el. LM / Liga Europy"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "NL1", name: "Eredivisie", short: "Eredivisie", logo: 11, cc: "NED", zones: { top: [2, "Liga Mistrzów"], mid: [3, 3, "el. LM"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "PT1", name: "Liga Portugal", short: "Portugalia", logo: 14, cc: "POR", zones: { top: [2, "Liga Mistrzów"], mid: [3, 3, "el. LM"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "EN2", name: "Championship", short: "Championship", logo: 24, cc: "ENG", zones: { top: [2, "awans"], mid: [3, 6, "baraże o awans"], bottom: [3, "spadek"] } },
    { code: "CL", name: "Liga Mistrzów", short: "Liga Mistrzów", logo: 2, cup: true, zones: { top: [8, "1/8 finału"], mid: [9, 24, "baraże"], bottom: [12, "odpada"] } },
    { code: "EL", name: "Liga Europy", short: "Liga Europy", logo: 2310, cup: true, zones: { top: [8, "1/8 finału"], mid: [9, 24, "baraże"], bottom: [12, "odpada"] } },
  ];
  const COMP = Object.fromEntries(COMPS.map(c => [c.code, c]));
  const leagueLogo = code => `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/${COMP[code]?.logo}.png&w=64&h=64`;

  // sezon zaczyna się w lipcu: listopad 2026 → 2026, marzec 2027 → 2026
  function seasonStart(d = new Date()) { return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }
  function seasonLabel(y) { return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
  const seasonOf = date => seasonLabel(seasonStart(new Date(date + "T12:00:00")));

  /* Nazwy klubów z różnych źródeł → jedna nazwa (nazwa z ESPN, wczytywanego jako pierwszy). */
  const ALIAS = { // klucz → klucz
    "brighton": "brighton hove albion", "wolves": "wolverhampton wanderers", "spurs": "tottenham hotspur", "tottenham": "tottenham hotspur",
    "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city",
    "nott m forest": "nottingham forest", "nottm forest": "nottingham forest", "newcastle": "newcastle united",
    "west ham": "west ham united", "leeds": "leeds united", "ipswich": "ipswich town", "hull": "hull city", "coventry": "coventry city",
    "leicester": "leicester city", "sheffield utd": "sheffield united",
  };
  function key(name) {
    const k = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " ").replace(/\b(fc|afc|cf|sc|ac|sk|fk|cp|sad)\b/g, " ").replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ").trim();
    return ALIAS[k] || k;
  }
  const known = new Map(); // klucz → nazwa
  function canon(name) {
    const k = key(name);
    if (!known.has(k)) known.set(k, String(name).trim());
    return known.get(k);
  }

  async function getJson(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  const pad = n => String(n).padStart(2, "0");
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const ROUND = {
    "league-phase": "Faza ligowa", "knockout-round-playoffs": "Baraże", "round-of-16": "1/8 finału",
    "quarterfinals": "Ćwierćfinał", "semifinals": "Półfinał", "final": "Finał",
  };

  /* ESPN: { updated, teams: { id: { n, s, a, c, l } }, comps: { kod: [ { k, h, a, f?, r?, x?, p?, live?, st? } ] } } */
  const loadEspn = async (url = "dane/espn.json") => parseEspn(await getJson(url));
  // kursy: [1, X, 2, linia gola, powyżej, poniżej, bukmacher] → obiekt
  const oddsObj = o => o && { h: o[0], d: o[1], a: o[2], line: o[3], over: o[4], under: o[5], book: o[6] || "" };
  function parseEspn(js, kursy) {
    const teams = {}, byId = {};
    for (const [id, t] of Object.entries(js.teams)) {
      const name = canon(t.n);
      byId[id] = name;
      teams[name] = {
        short: t.s || t.n, abbr: t.a || t.n.slice(0, 3).toUpperCase(), color: t.c ? "#" + t.c : null,
        logo: t.l ? t.l.replace("https://a.espncdn.com/i/", "https://a.espncdn.com/combiner/i?img=/i/") + "&w=80&h=80" : null,
      };
    }
    const matches = [], status = [];
    for (const [comp, rows] of Object.entries(js.comps)) {
      for (const r of rows) {
        const d = new Date(r.k);
        const date = localDate(d);
        const played = Array.isArray(r.f);
        const reg = r.r || r.f;
        matches.push({
          date, time: d.toTimeString().slice(0, 5), home: byId[r.h], away: byId[r.a],
          hg: played ? reg[0] : null, ag: played ? reg[1] : null,
          aet: r.x ? r.f : null, pens: r.p && r.p[0] !== null ? r.p : null, live: r.live || null,
          comp, round: ROUND[r.st] || "", season: seasonOf(date), neutral: r.st === "final", src: "espn",
          odds: oddsObj(r.o || kursy?.[`${comp}|${r.k}|${r.h}|${r.a}`]) || null,
        });
      }
      const pl = rows.filter(r => r.f);
      status.push({ comp, n: rows.length, played: pl.length, last: pl.length ? localDate(new Date(pl[pl.length - 1].k)) : null });
    }
    return { matches, teams, status, updated: js.updated };
  }

  /* Fantasy Premier League: kontuzje, forma, wyniki PL. */
  const loadFpl = async (url = "dane/fpl.json") => parseFpl(await getJson(url));
  function parseFpl(js) {
    const team = Object.fromEntries(js.teams.map(t => [t.id, canon(t.name)]));
    const matches = js.fixtures.filter(f => f.ko && team[f.h] && team[f.a]).map(f => {
      const d = new Date(f.ko), date = localDate(d);
      return {
        date, time: d.toTimeString().slice(0, 5), home: team[f.h], away: team[f.a],
        hg: f.hs ?? null, ag: f.as ?? null, comp: "PL", round: "", season: seasonOf(date), src: "fpl", live: f.live ? [0, 0] : null,
      };
    });
    const players = js.players.map(p => ({ ...p, team: team[p.t] })).filter(p => p.team);
    return { matches, players, updated: js.updated, played: matches.filter(m => m.hg !== null).length };
  }

  /* xG mecz po meczu (PL, bieżący sezon). */
  const loadXg = async (url = "dane/xg.json") => parseXg(await getJson(url));
  function parseXg(js) {
    return js.map(x => ({ ...x, home: canon(x.h), away: canon(x.a) }));
  }
  // dopisuje xhg/xag do meczów PL z tego sezonu (ta sama para drużyn gra u siebie raz w sezonie)
  function attachXg(matches, xg) {
    const season = seasonLabel(seasonStart());
    const by = new Map(xg.map(x => [`${x.home}|${x.away}`, x]));
    let n = 0;
    for (const m of matches) {
      if (m.comp !== "PL" || m.season !== season) continue;
      const x = by.get(`${m.home}|${m.away}`);
      if (x && m.hg === x.hg && m.ag === x.ag) { m.xhg = x.hxg; m.xag = x.axg; n++; }
    }
    return n;
  }

  /* Łączenie źródeł: ten sam mecz (rozgrywki + drużyny + data ±3 dni; w lidze – ta sama para w sezonie) występuje raz.
     Pierwszeństwo wyniku: ręczny > FPL > ESPN; wynik nie znika, jeśli lepsze źródło go jeszcze nie ma. */
  const RANK = { manual: 3, fpl: 2, espn: 1 };
  function merge(lists) {
    const out = [], byPair = new Map();
    const dayNum = d => Math.round(new Date(d).getTime() / 86400000);
    const has = x => x.hg !== null && x.hg !== undefined;
    for (const m of lists.flat()) {
      if (!m.home || !m.away) continue;
      m.home = canon(m.home); m.away = canon(m.away);
      const pk = `${m.comp}|${m.home}|${m.away}`;
      const cands = byPair.get(pk) || [];
      const same = cands.find(c => Math.abs(dayNum(c.date) - dayNum(m.date)) <= 3 || (!COMP[m.comp]?.cup && c.season === m.season));
      if (!same) { cands.push(m); byPair.set(pk, cands); out.push(m); continue; }
      const better = (RANK[m.src] || 0) >= (RANK[same.src] || 0);
      if (better && (has(m) || !has(same))) Object.assign(same, { ...m, round: m.round || same.round, neutral: m.neutral ?? same.neutral, aet: m.aet ?? same.aet, pens: m.pens ?? same.pens, odds: m.odds || same.odds });
      else if (!has(same) && has(m)) Object.assign(same, { hg: m.hg, ag: m.ag, src: m.src });
    }
    for (const m of out) m.id = `${m.comp}-${m.season}-${key(m.home)}-${key(m.away)}-${m.date}`.replace(/\s/g, "_");
    return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }

  const api = { getJson, parseEspn, parseFpl, parseXg, COMPS, COMP, leagueLogo, loadEspn, loadFpl, loadXg, attachXg, merge, canon, key, seasonStart, seasonLabel, seasonOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FData = api;
})(typeof self !== "undefined" ? self : this);
