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
    { code: "EK", name: "Ekstraklasa", short: "Ekstraklasa", logo: null, cc: "POL", rr: true, src: "football-data", zones: { top: [1, "el. Ligi Mistrzów"], mid: [2, 4, "el. pucharów europejskich"], bottom: [3, "spadek"] } },
    { code: "ES1", name: "LaLiga", short: "LaLiga", logo: 15, cc: "ESP", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [3, "spadek"] } },
    { code: "DE1", name: "Bundesliga", short: "Bundesliga", logo: 10, cc: "GER", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "IT1", name: "Serie A", short: "Serie A", logo: 12, cc: "ITA", zones: { top: [4, "Liga Mistrzów"], mid: [5, 6, "Liga Europy"], bottom: [3, "spadek"] } },
    { code: "FR1", name: "Ligue 1", short: "Ligue 1", logo: 9, cc: "FRA", zones: { top: [3, "Liga Mistrzów"], mid: [4, 5, "el. LM / Liga Europy"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "NL1", name: "Eredivisie", short: "Eredivisie", logo: 11, cc: "NED", zones: { top: [2, "Liga Mistrzów"], mid: [3, 3, "el. LM"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "PT1", name: "Liga Portugal", short: "Portugalia", logo: 14, cc: "POR", zones: { top: [2, "Liga Mistrzów"], mid: [3, 3, "el. LM"], bottom: [2, "spadek (16. – baraż)"] } },
    { code: "EN2", name: "Championship", short: "Championship", logo: 24, cc: "ENG", zones: { top: [2, "awans"], mid: [3, 6, "baraże o awans"], bottom: [3, "spadek"] } },
    { code: "CL", name: "Liga Mistrzów", short: "Liga Mistrzów", logo: 2, cup: true, zones: { top: [8, "1/8 finału"], mid: [9, 24, "baraże"], bottom: [12, "odpada"] } },
    { code: "EL", name: "Liga Europy", short: "Liga Europy", logo: 2310, cup: true, zones: { top: [8, "1/8 finału"], mid: [9, 24, "baraże"], bottom: [12, "odpada"] } },
    { code: "ECL", name: "Liga Konferencji", short: "Liga Konferencji", logo: 20296, cup: true, zones: { top: [8, "1/8 finału"], mid: [9, 24, "baraże"], bottom: [12, "odpada"] } },
  ];
  const COMP = Object.fromEntries(COMPS.map(c => [c.code, c]));
  const ESPN_SLUG = { PL: "eng.1", ES1: "esp.1", DE1: "ger.1", IT1: "ita.1", FR1: "fra.1", NL1: "ned.1", PT1: "por.1", EN2: "eng.2", CL: "uefa.champions", EL: "uefa.europa", ECL: "uefa.europa.conf" };
  // kursy amerykańskie → dziesiętne (+150 → 2,50; −200 → 1,50)
  const amDec = v => { const x = parseFloat(v); return isFinite(x) && x ? Math.round((x > 0 ? 1 + x / 100 : 1 + 100 / -x) * 100) / 100 : null; };
  /* Szczegóły meczu z ESPN na żywo (przeglądarka, CORS dozwolony): potwierdzone składy i najnowsze kursy. */
  async function loadLive(m) {
    // zwykłe zapytanie bez dodatkowych nagłówków (z nimi przeglądarka pyta najpierw OPTIONS, którego ESPN nie obsługuje)
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUG[m.comp]}/summary?event=${m.eid}&_=${Math.floor(Date.now() / 60000)}`);
    if (!r.ok) throw new Error(`${r.status} ESPN`);
    const js = await r.json();
    const pc = (js.pickcenter || []).find(x => x.moneyline);
    let odds = null;
    if (pc) {
      const ml = pc.moneyline, t = pc.total || {}, c = v => amDec(v?.close?.odds ?? v?.open?.odds);
      const line = parseFloat(String(t.over?.close?.line ?? t.over?.open?.line ?? "").replace(/^[ou]/, "")) || pc.overUnder || null;
      odds = { h: c(ml.home), d: c(ml.draw), a: c(ml.away), line, over: c(t.over), under: c(t.under), book: pc.provider?.name || "",
        open: { h: amDec(ml.home?.open?.odds), d: amDec(ml.draw?.open?.odds), a: amDec(ml.away?.open?.odds) } };
      if (!odds.h || !odds.d || !odds.a) odds = null;
    }
    const lineups = (js.rosters || []).map(r => ({
      side: r.homeAway, team: canon(r.team?.displayName || ""), formation: r.formation || "",
      xi: (r.roster || []).filter(p => p.starter).map(p => ({ n: p.athlete?.displayName || "", pos: p.position?.abbreviation || "", nr: p.jersey || "" })),
      bench: (r.roster || []).filter(p => !p.starter).map(p => p.athlete?.displayName || ""),
    })).filter(r => r.xi.length);
    return { odds, lineups, at: Date.now() };
  }
  const leagueLogo = code => COMP[code]?.logo ? `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/${COMP[code].logo}.png&w=64&h=64` : null;

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
    "legia warszawa": "legia warsaw", "legia": "legia warsaw", // Ekstraklasa (football-data) ↔ puchary (ESPN)
  };
  function key(name) {
    const k = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[łŁ]/g, "l").toLowerCase()
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
  /* fd – dane z football-data.co.uk (kursy bet365): { m: { klucz: [xG gosp., xG gość, 1, X, 2, >2.5, <2.5] } – rozegrane,
     n: { klucz: [1, X, 2, >2.5, <2.5] } – nadchodzące } */
  function parseEspn(js, kursy, fd) {
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
        const k = `${comp}|${r.k}|${r.h}|${r.a}`, x = fd?.m?.[k];
        // kursy: bet365 z football-data (po meczu – zamknięcia), a gdy ich brak – DraftKings z ESPN (przed meczem) lub z archiwum
        const b365 = v => v && v[0] && v[1] && v[2] ? { h: v[0], d: v[1], a: v[2], line: v[3] && v[4] ? 2.5 : null, over: v[3], under: v[4], book: "bet365" } : null;
        const fdOdds = played ? b365(x?.slice(2)) : b365(fd?.n?.[k]);
        matches.push({
          date, time: d.toTimeString().slice(0, 5), home: byId[r.h], away: byId[r.a],
          hg: played ? reg[0] : null, ag: played ? reg[1] : null,
          aet: r.x ? r.f : null, pens: r.p && r.p[0] !== null ? r.p : null, live: r.live || null,
          comp, round: ROUND[r.st] || "", season: seasonOf(date), neutral: r.st === "final", src: "espn",
          odds: fdOdds || oddsObj(r.o || kursy?.[k]) || null,
          ...(x && x[0] !== null && x[1] !== null ? { xhg: x[0], xag: x[1] } : {}),
          eid: r.i || null, // id meczu w ESPN (tylko nierozegrane)
          shots: r.s || null, // [gosp. strzały, gosp. celne, gość strzały, gość celne]
        });
      }
      const pl = rows.filter(r => r.f);
      status.push({ comp, n: rows.length, played: pl.length, last: pl.length ? localDate(new Date(pl[pl.length - 1].k)) : null });
    }
    return { matches, teams, status, updated: js.updated };
  }

  /* Ekstraklasa (football-data.co.uk): nazwy z plików → pełna nazwa, skrót, barwy. Lech i Jagiellonia mają już nazwy z ESPN (puchary). */
  const EK_TEAMS = {
    "Arka Gdynia": ["Arka Gdynia", "Arka", "ARK", "#ffd600"], "Cracovia": ["Cracovia", "Cracovia", "CRA", "#c8102e"],
    "GKS Katowice": ["GKS Katowice", "GKS Katowice", "GKS", "#f4c300"], "Gornik Zabrze": ["Górnik Zabrze", "Górnik", "GÓR", "#0055a5"],
    "Jagiellonia": ["Jagiellonia Białystok", "Jagiellonia", "JAG", "#ffed00"], "Korona Kielce": ["Korona Kielce", "Korona", "KOR", "#e30613"],
    "Lech Poznan": ["Lech Poznań", "Lech", "LECH", "#004b92"], "Lechia Gdansk": ["Lechia Gdańsk", "Lechia", "LGD", "#008d3f"],
    "Legia": ["Legia Warszawa", "Legia", "LEG", "#00843d"], "Motor Lublin": ["Motor Lublin", "Motor", "MOT", "#ffd200"],
    "Piast Gliwice": ["Piast Gliwice", "Piast", "PIA", "#0033a0"], "Pogon Szczecin": ["Pogoń Szczecin", "Pogoń", "POG", "#00285e"],
    "Radomiak Radom": ["Radomiak Radom", "Radomiak", "RAD", "#007a3d"], "Rakow": ["Raków Częstochowa", "Raków", "RAK", "#c8102e"],
    "Slask Wroclaw": ["Śląsk Wrocław", "Śląsk", "ŚLĄ", "#00843d"], "Termalica B-B.": ["Bruk-Bet Termalica", "Termalica", "TER", "#f58220"],
    "Widzew Lodz": ["Widzew Łódź", "Widzew", "WID", "#c8102e"], "Wieczysta Krakow": ["Wieczysta Kraków", "Wieczysta", "WIE", "#ffd700"],
    "Wisla": ["Wisła Kraków", "Wisła K.", "WIS", "#d40000"], "Wisla Plock": ["Wisła Płock", "Wisła P.", "WPŁ", "#0055a5"],
    "Zaglebie": ["Zagłębie Lubin", "Zagłębie", "ZAG", "#f37021"], "Stal Mielec": ["Stal Mielec", "Stal", "STA", "#0055a5"],
    "Puszcza": ["Puszcza Niepołomice", "Puszcza", "PUS", "#00843d"],
  };
  // polskie nazwy klubów Ekstraklasy mają pierwszeństwo także w danych ESPN (puchary: „Legia Warsaw” → „Legia Warszawa”)
  for (const x of Object.values(EK_TEAMS)) canon(x[0]);
  const loadEk = async (url = "dane/ekstraklasa.json") => parseEk(await getJson(url));
  function parseEk(js) {
    const teams = {}, matches = [];
    const nameOf = n => {
      const x = EK_TEAMS[n], name = canon(x ? x[0] : n);
      if (!teams[name]) teams[name] = { short: x ? x[1] : n, abbr: x ? x[2] : n.slice(0, 3).toUpperCase(), color: x ? x[3] : null, logo: null };
      return name;
    };
    for (const r of js.rows) {
      const d = new Date(r.k), date = localDate(d), played = Array.isArray(r.f);
      matches.push({
        date, time: d.toTimeString().slice(0, 5), home: nameOf(r.h), away: nameOf(r.a), hg: played ? r.f[0] : null, ag: played ? r.f[1] : null,
        comp: "EK", round: r.r ? `${r.r}. kolejka` : "", season: seasonOf(date), src: "espn",
        odds: r.o ? { h: r.o[0], d: r.o[1], a: r.o[2], line: null, over: null, under: null, book: r.o[3] } : null,
      });
    }
    const pl = matches.filter(m => m.hg !== null);
    return { matches, teams, status: { comp: "EK", n: matches.length, played: pl.length, last: pl.length ? pl[pl.length - 1].date : null }, updated: js.updated };
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
      if (m.xhg !== undefined) { n++; continue; } // xG z football-data ma pierwszeństwo (to samo źródło dla wszystkich lig)
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

  const api = { parseEk, loadEk, loadLive, amDec, getJson, parseEspn, parseFpl, parseXg, COMPS, COMP, leagueLogo, loadEspn, loadFpl, loadXg, attachXg, merge, canon, key, seasonStart, seasonLabel, seasonOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FData = api;
})(typeof self !== "undefined" ? self : this);
