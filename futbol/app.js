/* Futbol – interfejs: mecze z prognozami, tabela z symulacją sezonu, karty klubów, typowanie, dane. */
(function () {
  "use strict";
  const M = window.FModel, D = window.FData;
  const LS = { fat: "futbol.fatigue", inj: "futbol.injuries", cache: "futbol.cache.v1", manual: "futbol.manual.v1", key: "futbol.fdkey", tab: "futbol.tab", filter: "futbol.filter" };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* pełna pamięć lub tryb prywatny */ } },
  };

  /* ---------- kluby: skróty, kolory ---------- */
  const CLUBS = {
    "Arsenal FC": ["Arsenal", "ARS", "#EF0107"], "Aston Villa FC": ["Aston Villa", "AVL", "#670E36"],
    "AFC Bournemouth": ["Bournemouth", "BOU", "#B50E12"], "Brentford FC": ["Brentford", "BRE", "#E30613"],
    "Brighton & Hove Albion FC": ["Brighton", "BHA", "#0057B8"], "Burnley": ["Burnley", "BUR", "#6C1D45"], "Burnley FC": ["Burnley", "BUR", "#6C1D45"],
    "Chelsea FC": ["Chelsea", "CHE", "#034694"], "Coventry City FC": ["Coventry", "COV", "#3a8fc9"],
    "Crystal Palace FC": ["Crystal Palace", "CRY", "#1B458F"], "Everton FC": ["Everton", "EVE", "#003399"],
    "Fulham FC": ["Fulham", "FUL", "#1a1a1a"], "Hull City AFC": ["Hull City", "HUL", "#d9861a"],
    "Ipswich Town FC": ["Ipswich", "IPS", "#0033A0"], "Leeds United FC": ["Leeds", "LEE", "#1D428A"],
    "Liverpool FC": ["Liverpool", "LIV", "#C8102E"], "Manchester City FC": ["Man City", "MCI", "#4a9bd6"],
    "Manchester United FC": ["Man United", "MUN", "#DA291C"], "Newcastle United FC": ["Newcastle", "NEW", "#241F20"],
    "Nottingham Forest FC": ["Nott'm Forest", "NFO", "#DD0000"], "Sunderland AFC": ["Sunderland", "SUN", "#EB172B"],
    "Tottenham Hotspur FC": ["Tottenham", "TOT", "#132257"], "West Ham United FC": ["West Ham", "WHU", "#7A263A"],
    "Wolverhampton Wanderers FC": ["Wolves", "WOL", "#c8900a"], "Leicester City FC": ["Leicester", "LEI", "#003090"],
    "Southampton FC": ["Southampton", "SOU", "#D71920"], "Sheffield United FC": ["Sheffield Utd", "SHU", "#EE2737"],
  };
  const SHORT = {
    "Paris Saint-Germain FC": "PSG", "Club Atlético de Madrid": "Atlético", "FC Bayern München": "Bayern",
    "FC Internazionale Milano": "Inter", "Sporting Clube de Portugal": "Sporting CP", "Sport Lisboa e Benfica": "Benfica",
    "Borussia Dortmund": "Dortmund", "Bayer 04 Leverkusen": "Leverkusen", "Real Madrid CF": "Real Madrid",
    "Eintracht Frankfurt": "Eintracht", "PAE Olympiakos SFP": "Olympiakos", "Royale Union Saint-Gilloise": "Union SG",
    "Qarabağ Ağdam FK": "Qarabağ", "Olympique de Marseille": "Marseille", "FC Porto": "Porto", "AC Milan": "Milan",
  };
  function short(t) {
    if (CLUBS[t]) return CLUBS[t][0];
    if (SHORT[t]) return SHORT[t];
    return t.replace(/\b(FC|AFC|CF|SC)\b/g, "").replace(/\s+/g, " ").trim();
  }
  function abbr(t) {
    if (CLUBS[t]) return CLUBS[t][1];
    const w = short(t).replace(/[^A-Za-zÀ-ž0-9 ]/g, "").split(" ").filter(x => x.length > 2 && !/^(de|del|the|club|real)$/i.test(x));
    return ((w[0] || short(t)).slice(0, 3)).toUpperCase();
  }
  function color(t) {
    if (CLUBS[t]) return CLUBS[t][2];
    let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 40%)`;
  }
  const badge = (t, cls = "") => `<i class="badge ${cls}" style="background:${color(t)}" aria-hidden="true">${esc(abbr(t))}</i>`;
  const teamEl = (t, right) => `<div class="team${right ? " r" : ""}">${badge(t)}<span>${esc(short(t))}</span></div>`;

  /* ---------- daty i nazwy rund ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d, withDay = true) => new Date(d + "T12:00:00").toLocaleDateString("pl-PL", withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
  function roundPl(r) {
    if (!r) return "";
    return r.replace(/^Matchday (\d+)$/i, "Kolejka $1").replace(/^Regular Season - (\d+)$/i, "Kolejka $1")
      .replace(/^League, Matchday (\d+)/i, "Faza ligowa, kolejka $1").replace(/^Playoffs, Matchday (\d+)/i, "Baraże, mecz $1")
      .replace(/^Finals, Round of 16/i, "1/8 finału").replace(/^Finals, Quarterfinals/i, "Ćwierćfinał")
      .replace(/^Finals, Semifinals/i, "Półfinał").replace(/^Finals, Final/i, "Finał")
      .replace(/^last 16/i, "1/8 finału").replace(/^quarter finals/i, "Ćwierćfinał").replace(/^semi finals/i, "Półfinał")
      .replace(/^final$/i, "Finał").replace(/^playoffs/i, "Baraże");
  }
  const compName = c => c === "PL" ? "Premier League" : "Liga Mistrzów";
  const isNeutral = m => /final$/i.test(m.round || "") && !/semi|quarter/i.test(m.round || "");

  /* ---------- stan ---------- */
  const S = {
    of: null, fd: null, fpl: null, players: [], manual: store.get(LS.manual, []), countries: {}, status: [],
    matches: [], model: null, elo: null, sim: null, bt: null, btMap: new Map(),
    tab: store.get(LS.tab, "mecze"), filter: store.get(LS.filter, "all"), season: null, tableSeason: null,
  };
  const curSeason = () => D.seasonLabel(D.seasonStart());
  const prevSeason = () => D.seasonLabel(D.seasonStart() - 1);

  function compute() {
    const lists = [];
    if (S.of) lists.push(S.of.matches.map(m => ({ ...m })));
    if (S.fd) lists.push(S.fd.matches.map(m => ({ ...m })));
    if (S.fpl) lists.push(S.fpl.matches.map(m => ({ ...m })));
    lists.push(S.manual.map(m => ({ ...m, src: "manual" })));
    S.matches = D.merge(lists);
    S.matches.forEach(m => { m.neutral = isNeutral(m); });
    // beniaminkowie: drużyny z PL w tym sezonie, których nie było w poprzednim – start z niższą oceną
    const plNow = teamsOf("PL", curSeason()), plPrev = new Set(teamsOf("PL", prevSeason()));
    const priors = {}, eloStart = {};
    if (plPrev.size) for (const t of plNow) if (!plPrev.has(t)) { priors[t] = { att: -0.25, def: -0.25 }; eloStart[t] = 1420; }
    S.priors = priors;
    S.model = M.fit(S.matches, { asOf: today(), priors, shrink: 6, halfLife: 240 });
    S.elo = M.elo(S.matches, { start: eloStart });
    S.players = (S.fpl?.players || []).map(p => ({ ...p, team: D.canon(p.team) }));
    S.absCache = new Map();
    S.rest = M.restDays(S.matches);
    S.sim = null; S.bt = null; S.btMap = new Map();
  }
  function teamsOf(comp, season) {
    return [...new Set(S.matches.filter(m => m.comp === comp && m.season === season).flatMap(m => [m.home, m.away]))].sort();
  }
  function englishClubs() {
    const set = new Set(teamsOf("PL", curSeason())), prevPl = new Set(teamsOf("PL", prevSeason()));
    for (const m of S.matches) if (m.comp === "CL" && m.season >= prevSeason())
      for (const t of [m.home, m.away]) if (S.countries[t] === "ENG" || prevPl.has(t)) set.add(t);
    return [...set].sort((a, b) => short(a).localeCompare(short(b)));
  }
  const isEnglish = (() => { let cache = null, at = null; return t => { if (at !== S.matches) { cache = new Set(englishClubs()); at = S.matches; } return cache.has(t); }; })();

  function ensureBacktest() {
    if (S.bt) return S.bt;
    const from = `${D.seasonStart() - 1}-09-15`;
    S.bt = M.backtest(S.matches, { from, fit: { priors: S.priors, shrink: 6, halfLife: 240 }, adjFn: fatOn() ? m => M.fatigueAdj(S.rest.get(m)) : null });
    for (const r of S.bt.records) S.btMap.set(r.m.id, r);
    return S.bt;
  }
  function ensureSim() {
    if (S.sim) return S.sim;
    const pl = S.matches.filter(m => m.comp === "PL" && m.season === curSeason());
    S.sim = pl.some(m => !M.played(m)) ? M.simulateSeason(S.model, pl, { runs: 5000 }) : [];
    return S.sim;
  }

  /* ---------- ładowanie danych ---------- */
  async function load(force) {
    const cache = store.get(LS.cache, null);
    if (cache && !S.of) {
      S.of = cache.of; S.fd = cache.fd; S.fpl = cache.fpl || null; S.countries = cache.countries || {}; S.status = cache.status || []; S.fetchedAt = cache.at;
      // nazwy z pamięci podręcznej trzeba „nauczyć” moduł danych, żeby ujednolicanie działało tak samo
      for (const m of [...(S.of?.matches || []), ...(S.fd?.matches || []), ...(S.fpl?.matches || [])]) { D.canon(m.home); D.canon(m.away); }
      compute(); render();
    }
    const fresh = !cache || force || Date.now() - (cache.at || 0) > 30 * 60 * 1000;
    if (!fresh) return;
    $("#refresh").classList.add("spin");
    try {
      const of = await D.loadOpenfootball();
      const key = store.get(LS.key, "");
      const fd = key ? await D.loadFootballData(key) : { matches: [], status: [] };
      let fpl = null, fplStatus = [];
      try { fpl = await D.loadFpl(); fplStatus = fpl.status; }
      catch (e) { fplStatus = [{ comp: "PL", season: curSeason(), ok: false, err: String(e.message || e) }]; }
      if (!of.matches.length && !fd.matches.length && !fpl && S.of) throw new Error("offline");
      S.of = { matches: of.matches }; S.fd = { matches: fd.matches };
      if (fpl) S.fpl = { matches: fpl.matches, players: fpl.players, updated: fpl.updated };
      S.countries = { ...S.countries, ...of.countries };
      S.status = [...of.status.map(s => ({ ...s, src: "openfootball" })), ...fd.status.map(s => ({ ...s, src: "football-data" })), ...fplStatus.map(s => ({ ...s, src: "Fantasy Premier League" }))];
      S.fetchedAt = Date.now();
      store.set(LS.cache, { of: S.of, fd: S.fd, fpl: S.fpl, countries: S.countries, status: S.status, at: S.fetchedAt });
      compute(); render();
    } catch (e) {
      if (!S.of) $("#view").innerHTML = `<div class="empty">Nie udało się pobrać danych. Sprawdź internet i spróbuj ponownie.<div class="row" style="justify-content:center"><button class="btn" onclick="location.reload()">Spróbuj ponownie</button></div></div>`;
      else toastNotice("Brak połączenia – pokazuję zapisane dane z " + new Date(S.fetchedAt).toLocaleString("pl-PL"));
    } finally {
      $("#refresh").classList.remove("spin");
    }
  }

  function toastNotice(html) { const n = $("#notice"); n.innerHTML = html; n.hidden = false; }
  function freshness() {
    const t = today();
    const pl = S.matches.filter(m => m.comp === "PL" && m.season === curSeason());
    const overdue = pl.filter(m => !M.played(m) && m.date < t);
    const last = S.matches.filter(M.played).map(m => m.date).sort().pop();
    const n = $("#notice");
    if (overdue.length >= 3) {
      n.innerHTML = `Dane z wynikami kończą się na <b>${last ? fmtDate(last, false) : "?"}</b> – ${overdue.length} meczów PL czeka na wynik. ` +
        `Dodaj darmowy klucz <b>football-data.org</b> albo wpisz wyniki ręcznie. <button class="link" style="background:none;border:0;padding:0;cursor:pointer;text-decoration:underline" data-go="dane">Przejdź do Danych</button>`;
      n.hidden = false;
    } else n.hidden = true;
  }

  /* ---------- elementy wspólne ---------- */
  function probBar(p) {
    return `<div class="bar"><i class="w" style="width:${p.win * 100}%"></i><i class="d" style="width:${p.draw * 100}%"></i><i class="l" style="width:${p.loss * 100}%"></i></div>
      <div class="bar-l"><span>1 <b>${pct(p.win)}</b></span><span>X <b>${pct(p.draw)}</b></span><span>2 <b>${pct(p.loss)}</b></span></div>`;
  }
  const pred = m => M.predict(S.model, m.home, m.away, { neutral: m.neutral, adj: adjFor(m) });

  /* ---------- zawodnicy: kontuzje, zawieszenia, forma (Fantasy Premier League) ---------- */
  const POS = { 1: "BR", 2: "OBR", 3: "POM", 4: "NAP" };
  const injOn = () => store.get(LS.inj, true);
  // szansa gry w najbliższym meczu: status FPL a – dostępny, d – wątpliwy, i – kontuzja, s – zawieszenie, n – nie może grać,
  // u – niedostępny (zwykle odszedł lub wypożyczony – pomijamy, bo nie należy już do kadry)
  function availability(p) {
    if (p.st === "a") return 1;
    if (p.st === "u") return null;
    if (p.ch !== null && p.ch !== undefined) return p.ch / 100;
    return p.st === "d" ? 0.5 : 0;
  }
  /* Wpływ nieobecnych na drużynę.
     Atak: jaki udział w xG + xA drużyny mają brakujący zawodnicy (zmiennicy odrabiają ok. 40%).
     Obrona: jaki udział w minutach bramkarzy i obrońców mają brakujący. */
  function absences(team) {
    if (S.absCache.has(team)) return S.absCache.get(team);
    const ps = S.players.filter(p => p.team === team && p.st !== "u");
    let res = null;
    if (ps.length) {
      const xgiAll = ps.reduce((a, p) => a + (p.xg || 0) + (p.xa || 0), 0) || 1;
      const defMin = ps.filter(p => p.pos <= 2).reduce((a, p) => a + p.min, 0) || 1;
      const out = [];
      let attLoss = 0, defLoss = 0;
      for (const p of ps) {
        const av = availability(p);
        if (av === null || av >= 1) continue;
        const miss = 1 - av;
        const xgiShare = ((p.xg || 0) + (p.xa || 0)) / xgiAll;
        const defShare = p.pos <= 2 ? p.min / defMin : 0;
        attLoss += miss * xgiShare; defLoss += miss * defShare;
        out.push({ p, av, xgiShare, defShare, weight: Math.max(xgiShare, defShare, p.min / 3000 / 4) });
      }
      out.sort((a, b) => b.weight - a.weight);
      res = {
        list: out, attLoss, defLoss,
        att: 1 - Math.min(0.25, 0.6 * attLoss),
        def: 1 + Math.min(0.2, 0.3 * defLoss),
      };
    }
    S.absCache.set(team, res);
    return res;
  }
  // poprawka tylko dla meczów w najbliższych 10 dniach – dalej stan kadry jest nieznany
  function injAdj(m, force) {
    if (!injOn() || M.played(m)) return null;
    if (!force) {
      const d = (new Date(m.date) - new Date(today())) / 86400000;
      if (d < 0 || d > 10) return null;
    }
    const h = absences(m.home), a = absences(m.away);
    if (!h && !a) return null;
    return { home: h ? { att: h.att, def: h.def } : {}, away: a ? { att: a.att, def: a.def } : {} };
  }
  // zmęczenie: znane z terminarza, więc działa dla wszystkich przyszłych meczów
  const fatOn = () => store.get(LS.fat, true);
  function fatAdj(m) {
    if (!fatOn() || M.played(m) || !S.rest) return null;
    return M.fatigueAdj(S.rest.get(m));
  }
  const adjFor = (m, force) => M.combineAdj(injAdj(m, force), fatAdj(m));
  const PL_WORDS = [
    [/Expected back (\d+ \w+)/i, "powrót ok. $1"], [/Unknown return date/i, "nieznany termin powrotu"],
    [/(\d+)% chance of playing/i, "$1% szans na grę"], [/Suspended until (.+)/i, "zawieszony do $1"],
    [/Suspended for (\d+) match(es)?/i, "zawieszony na $1 mecz(e)"], [/Muscular injury/i, "uraz mięśniowy"], [/Hamstring/i, "ścięgno podkolanowe"], [/Knee/i, "kolano"],
    [/Ankle/i, "kostka"], [/Thigh/i, "udo"], [/Groin/i, "pachwina"], [/Calf/i, "łydka"], [/Shoulder/i, "bark"], [/Back injury/i, "uraz pleców"],
    [/Foot/i, "stopa"], [/Hip/i, "biodro"], [/Illness/i, "choroba"], [/Muscle/i, "mięsień"], [/Achilles/i, "ścięgno Achillesa"],
    [/Knock/i, "stłuczenie"], [/Head injury/i, "uraz głowy"], [/Concussion/i, "wstrząśnienie mózgu"], [/Lack of match fitness/i, "brak formy meczowej"],
    [/ injury/i, " – uraz"], [/ - /g, " · "], [/Broken (\w+)/i, "złamanie: $1"],
  ];
  const plNews = t => PL_WORDS.reduce((s, [re, r]) => s.replace(re, r), t || "");
  function statusTag(x) {
    const p = x.p;
    if (p.st === "s") return `<span class="tag bad">zawieszony</span>`;
    if (x.av === 0) return `<span class="tag bad">nie zagra</span>`;
    return `<span class="tag wait">${Math.round(x.av * 100)}% szans</span>`;
  }
  function absenceHtml(team, limit = 8) {
    const a = absences(team);
    if (!a) return `<div class="muted small">Brak danych o kadrze (dane FPL są tylko dla klubów Premier League).</div>`;
    if (!a.list.length) return `<div class="muted small">Wszyscy zawodnicy dostępni.</div>`;
    const rows = a.list.slice(0, limit).map(x => `<div class="list-row" style="cursor:default;align-items:flex-start">
        <span class="res N" style="width:auto;padding:0 5px">${POS[x.p.pos]}</span>
        <span class="x" style="white-space:normal"><b>${esc(x.p.n)}</b> ${statusTag(x)}<br><span class="small muted">${esc(plNews(x.p.news))}${x.xgiShare > 0.03 ? ` · ${pct(x.xgiShare)} xG+xA drużyny` : ""}</span></span></div>`).join("");
    const more = a.list.length > limit ? `<div class="small muted" style="padding-top:6px">i ${a.list.length - limit} innych (mało grających)</div>` : "";
    return rows + more + `<div class="small muted" style="padding-top:8px">Wpływ na prognozę: atak ${a.att < 0.995 ? "−" + pct(1 - a.att) : "bez zmian"}, obrona ${a.def > 1.005 ? "+" + pct(a.def - 1) + " straconych goli" : "bez zmian"}.</div>`;
  }
  function restHtml(m) {
    const r = S.rest?.get(m);
    if (!r || r.h === null || r.a === null) return "";
    const f = M.fatigueAdj(r), F = M.FATIGUE;
    const tired = f ? (f.home.att ? m.home : m.away) : null;
    return `<h2>Odpoczynek przed meczem</h2><div class="card small">${esc(short(m.home))}: <b>${r.h} dni</b> od poprzedniego meczu · ${esc(short(m.away))}: <b>${r.a} dni</b>
      ${tired ? `<br><b>${esc(short(tired))}</b> gra po krótkiej przerwie, a rywal odpoczywał dłużej${M.played(m) ? "." : fatOn() ? ` – w prognozie: atak −${pct(F.att)}, +${pct(F.def)} straconych goli.` : " (zmęczenie wyłączone w Danych)."}` : ""}
      <div class="muted" style="margin-top:4px">Liczone z meczów PL i LM – bez pucharów krajowych, więc przerwa bywa krótsza niż tu widać.</div></div>`;
  }


  function matchCard(m) {
    const done = M.played(m);
    const p = pred(m);
    const bt = done ? S.btMap.get(m.id) : null;
    const t = today();
    let mid;
    if (done) mid = `<div class="score">${m.hg}–${m.ag}${m.pens ? `<small>k. ${m.pens[0]}–${m.pens[1]}</small>` : m.aet ? `<small>po dogr. ${m.aet[0]}–${m.aet[1]}</small>` : ""}</div>`;
    else mid = `<div class="score pred">${p.top[0].hg}–${p.top[0].ag}<small>${m.live ? "na żywo" : "typ"}</small></div>`;
    let tag = "";
    if (bt) tag = bt.hit ? `<span class="tag ok">model trafił</span>` : `<span class="tag bad">model nie trafił</span>`;
    else if (!done && m.date < t) tag = `<span class="tag wait">czeka na wynik</span>`;
    return `<button class="card match" data-match="${esc(m.id)}">
      <div class="m-meta"><span><span class="comp ${m.comp}">${m.comp === "PL" ? "PL" : "LM"}</span> ${esc(roundPl(m.round))}</span><span>${tag} ${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="m-row">${teamEl(m.home)}${mid}${teamEl(m.away, true)}</div>
      ${done && !bt ? "" : probBar(bt ? { win: bt.probs[0], draw: bt.probs[1], loss: bt.probs[2] } : p)}
      ${!done && adjFor(m) ? (() => { const n = t => (absences(t)?.list || []).filter(x => x.weight > 0.04).map(x => x.p.n); const k = [...n(m.home), ...n(m.away)]; return k.length ? `<div class="small muted" style="margin-top:6px">Brakuje: ${esc(k.slice(0, 4).join(", "))}${k.length > 4 ? ` i ${k.length - 4} innych` : ""}</div>` : ""; })() : ""}
    </button>`;
  }

  function formOf(team, n = 5, before) {
    return S.matches.filter(m => M.played(m) && (m.home === team || m.away === team) && (!before || m.date < before))
      .slice(-n).map(m => {
        const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg;
        return { m, r: gf > ga ? "W" : gf === ga ? "R" : "P", gf, ga };
      });
  }
  const formHtml = f => `<span class="form">${f.map(x => `<i class="${x.r}" title="${esc(short(x.m.home))} ${x.m.hg}–${x.m.ag} ${esc(short(x.m.away))}">${x.r}</i>`).join("")}</span>`;

  /* ---------- szczegóły meczu / prognoza ---------- */
  function predictionHtml(home, away, opts = {}) {
    const p = M.predict(S.model, home, away, { neutral: opts.neutral, adj: opts.adj });
    const er = S.elo.ratings;
    const N = 6;
    let grid = `<div class="sgrid"><div class="h">${esc(abbr(home))}↓</div>${[...Array(N).keys()].map(j => `<div class="h">${j}</div>`).join("")}`;
    const mx = Math.max(...p.grid.slice(0, N).flatMap(r => r.slice(0, N)));
    for (let i = 0; i < N; i++) {
      grid += `<div class="h">${i}</div>`;
      for (let j = 0; j < N; j++) {
        const v = p.grid[i][j], a = Math.round(v / mx * 70);
        const c = i > j ? "var(--win)" : i === j ? "var(--draw)" : "var(--loss)";
        grid += `<div style="background:color-mix(in srgb, ${c} ${a}%, transparent)" title="${i}–${j}">${(v * 100).toFixed(1)}</div>`;
      }
    }
    grid += `</div><p class="small muted">Wiersze: gole ${esc(short(home))}, kolumny: gole ${esc(short(away))}. Wartości w %.</p>`;
    const fh = formOf(home, 5, opts.before), fa = formOf(away, 5, opts.before);
    const h2h = S.matches.filter(m => M.played(m) && ((m.home === home && m.away === away) || (m.home === away && m.away === home)) && (!opts.before || m.date < opts.before)).slice(-6).reverse();
    const lowData = [home, away].filter(t => !(t in S.model.att) || (S.model.games[t] || 0) < 4);
    return `
      <div class="big3"><div><b>${pct(p.win)}</b><span>wygrana ${esc(short(home))}</span></div><div><b>${pct(p.draw)}</b><span>remis</span></div><div><b>${pct(p.loss)}</b><span>wygrana ${esc(short(away))}</span></div></div>
      ${probBar(p)}
      <div class="kv">
        <div class="stat"><b>${p.xg.home.toFixed(2)} : ${p.xg.away.toFixed(2)}</b><span>oczekiwane gole</span></div>
        <div class="stat"><b>${pct(p.over25)}</b><span>powyżej 2,5 gola</span></div>
        <div class="stat"><b>${pct(p.btts)}</b><span>obie strzelą</span></div>
        <div class="stat"><b>${Math.round(er[home] || 1500)} : ${Math.round(er[away] || 1500)}</b><span>ranking Elo</span></div>
      </div>
      ${lowData.length ? `<p class="small muted">Mało danych o: ${lowData.map(t => esc(short(t))).join(", ")} – prognoza mniej pewna.</p>` : ""}
      <h2>Najbardziej prawdopodobne wyniki</h2>
      <div class="card">${p.top.map(s => `<div class="list-row" style="cursor:default"><span class="x">${esc(short(home))} <b>${s.hg}–${s.ag}</b> ${esc(short(away))}</span><span class="s">${pct(s.p, 1)}</span></div>`).join("")}</div>
      <h2>Rozkład wyników</h2><div class="card">${grid}</div>
      ${opts.squad !== false ? `<h2>Kadra przed meczem${opts.injApplied ? "" : injOn() ? " (poza oknem 10 dni – nieuwzględniona)" : " (wyłączone w Danych)"}</h2>
      <div class="card"><div class="list-row" style="cursor:default">${badge(home)}<b class="x">${esc(short(home))}</b></div>${absenceHtml(home, 6)}</div>
      <div class="card"><div class="list-row" style="cursor:default">${badge(away)}<b class="x">${esc(short(away))}</b></div>${absenceHtml(away, 6)}</div>` : ""}
      ${opts.match ? restHtml(opts.match) : ""}
      <h2>Forma (ostatnie 5)</h2>
      <div class="card">
        <div class="list-row" style="cursor:default">${badge(home)}<span class="x">${esc(short(home))}</span>${formHtml(fh)}</div>
        <div class="list-row" style="cursor:default">${badge(away)}<span class="x">${esc(short(away))}</span>${formHtml(fa)}</div>
      </div>
      ${h2h.length ? `<h2>Bezpośrednie mecze</h2><div class="card">${h2h.map(m => resultRow(m)).join("")}</div>` : ""}`;
  }

  function resultRow(m, team) {
    const done = M.played(m);
    let r = "N";
    if (done && team) { const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg; r = gf > ga ? "W" : gf === ga ? "R" : "P"; }
    const right = done ? `<span class="s">${m.hg}–${m.ag}</span>` : (() => { const p = pred(m); return `<span class="small muted">${pct(p.win)} / ${pct(p.draw)} / ${pct(p.loss)}</span>`; })();
    return `<div class="list-row" data-match="${esc(m.id)}">${team ? `<span class="res ${r}">${done ? r : "–"}</span>` : ""}<span class="d">${fmtDate(m.date, false)}</span><span class="comp ${m.comp}">${m.comp === "PL" ? "PL" : "LM"}</span><span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span>${right}</div>`;
  }

  function openMatch(id) {
    const m = S.matches.find(x => x.id === id);
    if (!m) return;
    ensureBacktest();
    const done = M.played(m), bt = S.btMap.get(m.id);
    const p = pred(m);
    let html = `<div class="m-meta" style="padding-right:36px"><span><span class="comp ${m.comp}">${compName(m.comp)}</span> ${esc(roundPl(m.round))}</span><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="vs"><div class="tm" data-club="${esc(m.home)}">${badge(m.home, "lg")}${esc(short(m.home))}</div>
      <div class="sc">${done ? `${m.hg}–${m.ag}` : `<span style="color:var(--accent)">${p.top[0].hg}–${p.top[0].ag}</span>`}<div class="small muted">${done ? (m.pens ? `karne ${m.pens[0]}–${m.pens[1]}` : m.aet ? `po dogrywce ${m.aet[0]}–${m.aet[1]}` : "wynik") : "najbardziej prawdopodobny"}</div></div>
      <div class="tm" data-club="${esc(m.away)}">${badge(m.away, "lg")}${esc(short(m.away))}</div></div>`;
    if (done && bt) {
      html += `<div class="card"><b>Przed meczem model dawał:</b> 1 ${pct(bt.probs[0])} · X ${pct(bt.probs[1])} · 2 ${pct(bt.probs[2])}, typ ${bt.top.hg}–${bt.top.ag}. ${bt.hit ? `<span class="tag ok">trafiony</span>` : `<span class="tag bad">nietrafiony</span>`}</div>`;
    }
    html += done ? `<h2>Gdyby zagrali teraz</h2>` : "";
    html += predictionHtml(m.home, m.away, { neutral: m.neutral, adj: adjFor(m), injApplied: !!injAdj(m), match: m, squad: !done });
    html += `<h2>${done ? "Popraw wynik" : "Wpisz wynik"}</h2>
      <form class="card" id="resForm"><div class="two"><div><label>${esc(short(m.home))}</label><input type="number" min="0" max="20" name="hg" value="${done ? m.hg : ""}" required></div>
      <div><label>${esc(short(m.away))}</label><input type="number" min="0" max="20" name="ag" value="${done ? m.ag : ""}" required></div></div>
      <div class="row"><button class="btn">Zapisz wynik</button><span class="small muted">Wynik po 90 minutach. Zostaje w tej przeglądarce.</span></div></form>`;
    openSheet(html);
    $("#resForm").onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      addManual({ comp: m.comp, season: m.season, round: m.round, date: m.date, time: m.time, home: m.home, away: m.away, hg: +f.get("hg"), ag: +f.get("ag") });
      closeSheet();
    };
  }

  function addManual(e) {
    S.manual = S.manual.filter(x => !(x.comp === e.comp && x.home === e.home && x.away === e.away && x.date === e.date));
    S.manual.push(e);
    store.set(LS.manual, S.manual);
    compute(); render();
  }

  /* ---------- widoki ---------- */
  function viewMecze() {
    ensureBacktest();
    const t = today();
    const f = S.filter;
    const ok = m => (f === "all" || m.comp === f) && (m.comp === "PL" ? m.season === curSeason() || (!M.played(m) && m.date >= t) : (isEnglish(m.home) || isEnglish(m.away)));
    const up = S.matches.filter(m => ok(m) && !M.played(m) && m.date >= t);
    const horizon = up.length ? new Date(new Date(up[0].date).getTime() + 16 * 86400000).toISOString().slice(0, 10) : t;
    const next = up.filter(m => m.date <= horizon);
    const overdue = S.matches.filter(m => ok(m) && !M.played(m) && m.date < t && m.season === curSeason());
    const recent = S.matches.filter(m => ok(m) && M.played(m)).slice(-12).reverse();
    let h = `<div class="chips">${[["all", "Wszystkie"], ["PL", "Premier League"], ["CL", "Liga Mistrzów"]].map(([k, l]) => `<button class="chip${f === k ? " on" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>`;
    h += `<h2>Najbliższe mecze</h2>`;
    h += next.length ? next.map(matchCard).join("") : `<div class="card empty">Brak zaplanowanych meczów w danych.${f !== "PL" ? " Terminarz Ligi Mistrzów 2026/27 pojawi się po dodaniu klucza football-data.org lub możesz dodać mecz ręcznie w zakładce Dane." : ""}</div>`;
    if (overdue.length) {
      const showAll = S.showOverdue;
      h += `<h2>Czekają na wynik (${overdue.length})</h2>`;
      h += overdue.slice(-(showAll ? overdue.length : 6)).reverse().map(matchCard).join("");
      if (overdue.length > 6 && !showAll) h += `<button class="btn sec" data-more="overdue" style="width:100%">Pokaż wszystkie</button>`;
    }
    h += `<h2>Ostatnie wyniki</h2>` + (recent.length ? recent.map(matchCard).join("") : `<div class="card empty">Brak wyników.</div>`);
    return h;
  }

  function viewTabela() {
    const seasons = [curSeason(), prevSeason()].filter(s => S.matches.some(m => m.comp === "PL" && m.season === s));
    const sea = seasons.includes(S.tableSeason) ? S.tableSeason : seasons[0];
    if (!sea) return `<div class="empty">Brak danych Premier League.</div>`;
    const pl = S.matches.filter(m => m.comp === "PL" && m.season === sea);
    const tab = M.table(pl, teamsOf("PL", sea));
    let h = `<div class="chips">${seasons.map(s => `<button class="chip${s === sea ? " on" : ""}" data-season="${s}">Sezon ${s.replace("-", "/")}</button>`).join("")}</div>`;
    h += `<h2>Premier League ${sea.replace("-", "/")}</h2><div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th class="t">Klub</th><th>M</th><th>W</th><th>R</th><th>P</th><th>Bramki</th><th>+/−</th><th>Pkt</th><th class="t">Forma</th></tr></thead><tbody>`;
    tab.forEach((r, i) => {
      const z = i < 4 ? "z-cl" : i === 4 ? "z-el" : i >= tab.length - 3 ? "z-rel" : "";
      h += `<tr class="click ${z}" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td>
        <td class="t"><span class="form">${r.form.slice(-5).map(x => `<i class="${x}">${x}</i>`).join("")}</span></td></tr>`;
    });
    h += `</tbody></table></div><div class="legend"><span><i style="background:var(--cl)"></i>Liga Mistrzów</span><span><i style="background:#f28c28"></i>miejsce 5 (często też LM)</span><span><i style="background:var(--loss)"></i>spadek</span></div></div>`;
    if (sea === curSeason()) {
      const sim = ensureSim();
      if (sim.length) {
        const left = pl.filter(m => !M.played(m)).length;
        h += `<h2>Prognoza końca sezonu</h2><div class="card"><p class="small muted" style="margin-top:0">5000 symulacji pozostałych ${left} meczów modelem Poissona.</p><div class="tbl-wrap"><table>
          <thead><tr><th>#</th><th class="t">Klub</th><th>Pkt (śr.)</th><th>Mistrz</th><th>Top 4</th><th>Top 5</th><th>Spadek</th></tr></thead><tbody>`;
        const cell = (x, c) => `<td class="pct" style="background:color-mix(in srgb, ${c} ${Math.round(x * 55)}%, transparent)">${x < 0.005 ? "–" : x > 0.995 ? ">99%" : pct(x)}</td>`;
        sim.forEach((r, i) => {
          h += `<tr class="click" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td><b>${r.expPts.toFixed(1)}</b></td>${cell(r.title, "var(--accent)")}${cell(r.top4, "var(--cl)")}${cell(r.top5, "var(--cl)")}${cell(r.releg, "var(--loss)")}</tr>`;
        });
        h += `</tbody></table></div></div>`;
      }
    }
    return h;
  }

  function viewKluby() {
    const clubs = englishClubs();
    const er = S.elo.ratings;
    const plNow = new Set(teamsOf("PL", curSeason()));
    const cl = new Set(S.matches.filter(m => m.comp === "CL" && m.season === curSeason()).flatMap(m => [m.home, m.away]));
    const sorted = clubs.slice().sort((a, b) => (er[b] || 0) - (er[a] || 0));
    let h = `<h2>Angielskie kluby · ranking Elo</h2><div class="grid">`;
    for (const t of sorted) {
      h += `<button class="card club" data-club="${esc(t)}">${badge(t, "lg")}<span>${esc(short(t))}</span><span class="muted">Elo ${Math.round(er[t] || 1500)}${cl.has(t) ? " · LM" : ""}${plNow.has(t) ? "" : " · poza PL"}</span></button>`;
    }
    return h + `</div>`;
  }

  function spark(hist) {
    if (!hist || hist.length < 2) return "";
    const W = 600, H = 90, P = 6;
    const ys = hist.map(x => x.r), mn = Math.min(...ys) - 10, mx = Math.max(...ys) + 10;
    const pts = hist.map((x, i) => [P + i / (hist.length - 1) * (W - 2 * P), H - P - (x.r - mn) / (mx - mn) * (H - 2 * P)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Wykres Elo">
      <path d="${d} L${W - P} ${H} L${P} ${H}Z" fill="var(--accent)" opacity=".12"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="bar-l"><span>${fmtDate(hist[0].date, false)} · ${Math.round(hist[0].r)}</span><span>min ${Math.round(Math.min(...ys))} · max ${Math.round(Math.max(...ys))}</span><span>teraz ${Math.round(ys[ys.length - 1])}</span></div>`;
  }

  /* Kontuzje, xG drużyny i forma zawodników (FPL). */
  function playersHtml(t, row) {
    const ps = S.players.filter(p => p.team === t && p.st !== "u");
    if (!ps.length) return `<h2>Kadra</h2><div class="card muted small">Dane o zawodnikach (kontuzje, forma, xG) są dostępne tylko dla klubów Premier League.</div>`;
    const xg = ps.reduce((a, p) => a + (p.xg || 0), 0), g = ps.reduce((a, p) => a + p.g, 0);
    const xga = ps.filter(p => p.pos === 1).reduce((a, p) => a + (p.xgc || 0), 0);
    const ga = row ? row.ga : null;
    const luck = (real, exp, inv) => { const d = real - exp; if (Math.abs(d) < 2) return "zgodnie z oczekiwaniami"; return (d > 0) !== !!inv ? "lepiej niż wskazują sytuacje – może się wyrównać w dół" : "gorzej niż wskazują sytuacje – może się poprawić"; };
    const form = ps.filter(p => p.min >= 90).sort((a, b) => (b.form || 0) - (a.form || 0) || (b.xg + b.xa) - (a.xg + a.xa)).slice(0, 10);
    return `<h2>Gole a xG (sezon ligowy)</h2><div class="card">
        <div class="stats" style="margin-top:0"><div class="stat"><b>${g} / ${xg.toFixed(1)}</b><span>gole / xG – atak ${luck(g, xg)}</span></div>
        ${ga !== null ? `<div class="stat"><b>${ga} / ${xga.toFixed(1)}</b><span>stracone / xGA – obrona ${luck(ga, xga, true)}</span></div>` : ""}</div>
        <p class="small muted" style="margin-bottom:0">xG (gole oczekiwane) mierzy jakość stworzonych sytuacji. Na dłuższą metę lepiej przewiduje przyszłe wyniki niż same gole.</p></div>
      <h2>Kontuzje i zawieszenia</h2><div class="card">${absenceHtml(t, 12)}</div>
      <h2>Forma zawodników</h2><div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th class="t">Zawodnik</th><th>Poz.</th><th>Min</th><th>G</th><th>A</th><th>xG</th><th>xA</th><th title="średnia punktów FPL z ostatnich 30 dni">Forma</th></tr></thead><tbody>
        ${form.map(p => `<tr><td class="t">${esc(p.n)}${p.st !== "a" ? ` <span class="tag ${p.st === "d" ? "wait" : "bad"}">${p.st === "d" ? "?" : "✚"}</span>` : ""}</td><td>${POS[p.pos]}</td><td>${p.min}</td><td>${p.g}</td><td>${p.as}</td><td>${(p.xg || 0).toFixed(1)}</td><td>${(p.xa || 0).toFixed(1)}</td><td><b>${(p.form || 0).toFixed(1)}</b></td></tr>`).join("")}
        </tbody></table></div><p class="small muted" style="margin-bottom:0">Forma = średnia punktów Fantasy Premier League z ostatnich 30 dni (gole, asysty, czyste konta, minuty). Źródło: FPL${S.fpl?.updated ? `, stan z ${new Date(S.fpl.updated).toLocaleString("pl-PL")}` : ""}.</p></div>`;
  }

  function openClub(t) {
    ensureBacktest();
    const mdl = S.model, er = S.elo.ratings;
    const pl = teamsOf("PL", curSeason());
    const rankOf = (arr, f) => arr.slice().sort((a, b) => f(b) - f(a)).indexOf(t) + 1;
    const attR = pl.includes(t) ? rankOf(pl, x => mdl.att[x] ?? -9) : null;
    const defR = pl.includes(t) ? rankOf(pl, x => mdl.def[x] ?? -9) : null;
    const tbl = pl.includes(t) ? M.table(S.matches.filter(m => m.comp === "PL" && m.season === curSeason()), pl) : [];
    const row = tbl.find(r => r.team === t);
    const pos = row ? tbl.indexOf(row) + 1 : null;
    const clAll = S.matches.filter(m => m.comp === "CL" && (m.home === t || m.away === t));
    const clPlayed = clAll.filter(M.played);
    const clW = clPlayed.filter(m => (m.home === t ? m.hg > m.ag : m.ag > m.hg)).length;
    const mine = S.matches.filter(m => m.home === t || m.away === t);
    const t0 = today();
    const next = mine.filter(m => !M.played(m) && m.date >= t0).slice(0, 5);
    const last = mine.filter(M.played).slice(-10).reverse();
    const xgFor = t in mdl.att ? Math.exp(mdl.mu + mdl.att[t] + mdl.home / 2) : null;
    const xgAg = t in mdl.def ? Math.exp(mdl.mu - mdl.def[t] + mdl.home / 2) : null;
    let h = `<div class="vs" style="grid-template-columns:auto 1fr;text-align:left">${badge(t, "lg")}<div><h3>${esc(t)}</h3><div class="muted small">${pos ? `${pos}. miejsce w Premier League` : "Poza Premier League w tym sezonie"} · Elo ${Math.round(er[t] || 1500)}</div></div></div>
      <div class="stats">
        ${row ? `<div class="stat"><b>${row.pts}</b><span>punkty (${row.p} m.)</span></div><div class="stat"><b>${row.w}-${row.d}-${row.l}</b><span>W-R-P w lidze</span></div><div class="stat"><b>${row.gf}:${row.ga}</b><span>bramki w lidze</span></div>` : ""}
        ${xgFor ? `<div class="stat"><b>${xgFor.toFixed(2)}</b><span>siła ataku (gole/mecz)${attR ? ` · ${attR}. w PL` : ""}</span></div><div class="stat"><b>${xgAg.toFixed(2)}</b><span>siła obrony (stracone/mecz)${defR ? ` · ${defR}. w PL` : ""}</span></div>` : ""}
        ${clPlayed.length ? `<div class="stat"><b>${clW}/${clPlayed.length}</b><span>wygrane w LM (2 sezony)</span></div>` : ""}
      </div>
      <h2>Forma</h2><div class="card">${formHtml(formOf(t, 10))}</div>
      ${playersHtml(t, row)}
      <h2>Ranking Elo w czasie</h2><div class="card">${spark(S.elo.history[t])}</div>
      <h2>Najbliższe mecze · szanse 1 / X / 2</h2><div class="card">${next.length ? next.map(m => resultRow(m, t)).join("") : `<div class="muted">Brak meczów w terminarzu.</div>`}</div>
      <h2>Ostatnie wyniki</h2><div class="card">${last.map(m => resultRow(m, t)).join("") || `<div class="muted">Brak.</div>`}</div>`;
    const sim = S.sim || (pl.includes(t) ? ensureSim() : []);
    const sr = sim.find(r => r.team === t);
    if (sr) {
      const mx = Math.max(...sr.pos);
      h += `<h2>Prognozowane miejsce na koniec sezonu</h2><div class="card"><div style="display:flex;align-items:flex-end;gap:3px;height:90px">${sr.pos.map((p, i) => `<div title="${i + 1}. miejsce: ${pct(p, 1)}" style="flex:1;background:${i < 4 ? "var(--cl)" : i >= sr.pos.length - 3 ? "var(--loss)" : "var(--draw)"};height:${Math.max(1, p / mx * 100)}%;border-radius:3px 3px 0 0;opacity:${p > 0 ? 1 : .25}"></div>`).join("")}</div>
        <div class="bar-l"><span>1.</span><span>średnio ${sr.expPts.toFixed(1)} pkt · TOP 4: ${pct(sr.top4)} · spadek: ${pct(sr.releg)}</span><span>${sr.pos.length}.</span></div></div>`;
    }
    openSheet(h);
  }

  function viewTypuj() {
    const eng = englishClubs();
    const others = [...new Set(S.matches.flatMap(m => [m.home, m.away]))].filter(t => !eng.includes(t)).sort((a, b) => short(a).localeCompare(short(b)));
    const opt = sel => `<optgroup label="Angielskie kluby">${eng.map(t => `<option value="${esc(t)}"${t === sel ? " selected" : ""}>${esc(short(t))}</option>`).join("")}</optgroup>
      <optgroup label="Rywale z Ligi Mistrzów">${others.map(t => `<option value="${esc(t)}"${t === sel ? " selected" : ""}>${esc(short(t))}</option>`).join("")}</optgroup>`;
    const st = S.typ || (S.typ = { home: eng[0], away: eng[1], neutral: false });
    return `<h2>Typuj dowolny mecz</h2><div class="card">
      <div class="two"><div><label for="th">Gospodarz</label><select id="th">${opt(st.home)}</select></div><div><label for="ta">Gość</label><select id="ta">${opt(st.away)}</select></div></div>
      <div class="row"><label class="check" style="margin:0"><input type="checkbox" id="tn"${st.neutral ? " checked" : ""}> Teren neutralny (np. finał)</label><button class="btn sec" id="tswap">⇄ Zamień</button></div></div>
      <div class="vs">${`<div class="tm">${badge(st.home, "lg")}${esc(short(st.home))}</div><div class="sc" style="color:var(--accent)">${(() => { const p = M.predict(S.model, st.home, st.away, { neutral: st.neutral, adj: adjFor({ home: st.home, away: st.away, date: today() }, true) }); return `${p.top[0].hg}–${p.top[0].ag}`; })()}<div class="small muted">najbardziej prawdopodobny</div></div><div class="tm">${badge(st.away, "lg")}${esc(short(st.away))}</div>`}</div>
      ${st.home === st.away ? `<div class="empty">Wybierz dwie różne drużyny.</div>` : predictionHtml(st.home, st.away, { neutral: st.neutral, adj: adjFor({ home: st.home, away: st.away, date: today() }, true) })}`;
  }

  function viewDane() {
    ensureBacktest();
    const key = store.get(LS.key, "");
    const bt = S.bt;
    const homeRate = (() => { const r = bt.records; return r.length ? r.filter(x => x.res === 0).length / r.length : 0; })();
    const all = [...new Set(S.matches.flatMap(m => [m.home, m.away]))].sort((a, b) => short(a).localeCompare(short(b)));
    const sopt = all.map(t => `<option value="${esc(t)}">${esc(short(t))}</option>`).join("");
    let h = `<h2>Źródła danych</h2><div class="card">`;
    for (const s of S.status.slice().sort((a, b) => (a.src + a.comp + b.season).localeCompare(b.src + b.comp + a.season))) {
      h += `<div class="list-row" style="cursor:default"><span class="res ${s.ok ? "W" : "P"}">${s.ok ? "✓" : "!"}</span><span class="x"><b>${esc(s.src)}</b> · ${compName(s.comp)} ${esc((s.season || "").replace("-", "/"))}<br><span class="small muted">${s.ok ? `${s.played} wyników z ${s.n} meczów${s.last ? `, ostatni ${fmtDate(s.last, false)}` : ""}${s.players ? ` · ${s.players} zawodników (kontuzje, forma, xG), stan z ${new Date(s.updated).toLocaleString("pl-PL")}` : ""}` : (/404/.test(s.err || "") ? "jeszcze niedostępne" : esc(s.err))}</span></span></div>`;
    }
    const manualCount = S.manual.length;
    h += `<div class="row"><button class="btn" id="dRefresh">Odśwież teraz</button><span class="small muted">Pobrano: ${S.fetchedAt ? new Date(S.fetchedAt).toLocaleString("pl-PL") : "–"}${manualCount ? ` · wpisanych ręcznie: ${manualCount}` : ""}</span></div></div>`;

    h += `<h2>Świeże wyniki: football-data.org</h2><div class="card">
      <p class="small" style="margin-top:0">Darmowe dane openfootball bywają opóźnione. Darmowy klucz z <a href="https://www.football-data.org/client/register" target="_blank" rel="noopener">football-data.org</a> daje aktualne wyniki i terminarz Premier League oraz Ligi Mistrzów. Klucz zostaje tylko w tej przeglądarce.</p>
      <label for="fdk">Klucz API</label><input type="password" id="fdk" value="${esc(key)}" placeholder="np. 1a2b3c…" autocomplete="off">
      <div class="row"><button class="btn" id="fdSave">Zapisz i pobierz</button>${key ? `<button class="btn sec" id="fdDel">Usuń klucz</button>` : ""}</div></div>`;

    h += `<h2>Dodaj mecz lub wynik ręcznie</h2><form class="card" id="manForm">
      <div class="two"><div><label>Rozgrywki</label><select name="comp"><option value="PL">Premier League</option><option value="CL">Liga Mistrzów</option></select></div><div><label>Data</label><input type="date" name="date" value="${today()}" required></div></div>
      <div class="two"><div><label>Gospodarz</label><select name="home">${sopt}</select></div><div><label>Gość</label><select name="away">${sopt}</select></div></div>
      <div class="two"><div><label>Gole gospodarza (puste = mecz przyszły)</label><input type="number" name="hg" min="0" max="20"></div><div><label>Gole gościa</label><input type="number" name="ag" min="0" max="20"></div></div>
      <div class="row"><button class="btn">Dodaj</button><span class="small muted">Wynik wpisany do meczu z terminarza zastępuje brakujący wynik.</span></div></form>`;
    if (manualCount) {
      h += `<div class="card">${S.manual.slice().reverse().map((m, i) => `<div class="list-row" style="cursor:default"><span class="d">${fmtDate(m.date, false)}</span><span class="comp ${m.comp}">${m.comp === "PL" ? "PL" : "LM"}</span><span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span><span class="s">${Number.isInteger(m.hg) ? `${m.hg}–${m.ag}` : "—"}</span><button class="icon-btn" data-delman="${S.manual.length - 1 - i}" aria-label="Usuń">✕</button></div>`).join("")}</div>`;
    }

    h += `<h2>Kontuzje w prognozach</h2><div class="card"><label class="check" style="margin:0"><input type="checkbox" id="injT"${injOn() ? " checked" : ""}> Uwzględniaj nieobecnych zawodników w meczach na najbliższe 10 dni</label>
      <p class="small muted" style="margin-bottom:0">Źródło: oficjalne Fantasy Premier League (tylko kluby PL), odświeżane co 3 godziny.</p>
      <label class="check" style="margin:12px 0 0"><input type="checkbox" id="fatT"${fatOn() ? " checked" : ""}> Uwzględniaj zmęczenie (mecz po ≤ ${M.FATIGUE.maxDays} dniach przerwy, gdy rywal odpoczywał dłużej)</label></div>`;
    h += `<h2>Skuteczność modelu</h2><div class="card">
      <p class="small muted" style="margin-top:0">Test „w ciemno”: każdy mecz od ${fmtDate(`${D.seasonStart() - 1}-09-15`, false)} przewidziany wyłącznie z danych sprzed niego (PL i LM).</p>
      <div class="stats"><div class="stat"><b>${bt.n}</b><span>meczów</span></div><div class="stat"><b>${pct(bt.accuracy, 1)}</b><span>trafiony typ 1X2</span></div>
      <div class="stat"><b>${pct(homeRate, 1)}</b><span>dla porównania: zawsze „1”</span></div><div class="stat"><b>${pct(bt.exact, 1)}</b><span>dokładny wynik</span></div>
      <div class="stat"><b>${bt.brier.toFixed(3)}</b><span>wynik Briera (mniej = lepiej; losowo 0,667)</span></div></div></div>`;

    h += `<h2>Jak działa prognoza</h2><div class="card small">
      <p style="margin-top:0"><b>Siła ataku i obrony.</b> Każda drużyna dostaje ocenę ataku i obrony dopasowaną do wszystkich meczów Premier League i Ligi Mistrzów z dwóch sezonów (regresja Poissona). Nowsze mecze ważą więcej – mecz sprzed 8 miesięcy liczy się w połowie. Drużyny z małą liczbą meczów są ściągane do średniej, a beniaminkowie startują z niższą oceną.</p>
      <p><b>Wynik meczu.</b> Z ocen wychodzą oczekiwane gole obu drużyn (z przewagą własnego boiska, ok. ${Math.round((Math.exp(S.model.home) - 1) * 100)}% więcej goli gospodarza). Rozkład Poissona z poprawką Dixona-Colesa daje szansę każdego wyniku, a z nich – 1/X/2, powyżej 2,5 gola i „obie strzelą”.</p>
      <p><b>Tabela końcowa.</b> Pozostałe mecze sezonu losowane 5000 razy.</p>
      <p><b>Nieobecni.</b> Dla meczów w najbliższych 10 dniach model obniża atak drużyny o udział brakujących zawodników w jej xG i asystach oczekiwanych (zmiennicy odrabiają ok. 40%, najwyżej −25%) i podnosi liczbę traconych goli, gdy brakuje bramkarza lub obrońców (najwyżej +20%).</p>
      <p><b>Zmęczenie.</b> Drużyna grająca po najwyżej ${M.FATIGUE.maxDays} dniach przerwy przeciw rywalowi, który odpoczywał dłużej, ma atak niższy o ${pct(M.FATIGUE.att)} i traci o ${pct(M.FATIGUE.def)} więcej goli. Siłę poprawki dobrano testem na ponad 600 meczach – poprawia trafność nieznacznie (ok. 0,7 pkt proc.).</p>
      <p><b>Elo</b> to osobny ranking formy, aktualizowany po każdym meczu.</p>
      <p class="muted" style="margin-bottom:0">Model nie zna potwierdzonych składów, zmian trenera ani motywacji – traktuj prognozy jako punkt wyjścia, nie pewniak.</p></div>`;
    return h;
  }

  /* ---------- renderowanie i zdarzenia ---------- */
  const VIEWS = { mecze: viewMecze, tabela: viewTabela, kluby: viewKluby, typuj: viewTypuj, dane: viewDane };
  function render() {
    if (!S.model) return;
    freshness();
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("#view").innerHTML = (VIEWS[S.tab] || viewMecze)();
    bindView();
  }
  function bindView() {
    const v = $("#view");
    if (S.tab === "typuj") {
      const upd = () => { S.typ = { home: $("#th").value, away: $("#ta").value, neutral: $("#tn").checked }; render(); };
      $("#th").onchange = upd; $("#ta").onchange = upd; $("#tn").onchange = upd;
      $("#tswap").onclick = () => { S.typ = { ...S.typ, home: S.typ.away, away: S.typ.home }; render(); };
    }
    if (S.tab === "dane") {
      $("#dRefresh").onclick = () => load(true);
      $("#injT").onchange = e => { store.set(LS.inj, e.target.checked); render(); };
      $("#fatT").onchange = e => { store.set(LS.fat, e.target.checked); S.bt = null; S.btMap = new Map(); render(); };
      $("#fdSave").onclick = () => { store.set(LS.key, $("#fdk").value.trim()); load(true).then(render); };
      const del = $("#fdDel"); if (del) del.onclick = () => { localStorage.removeItem(LS.key); S.fd = { matches: [] }; S.status = S.status.filter(s => s.src !== "football-data"); compute(); render(); };
      $("#manForm").onsubmit = e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const home = f.get("home"), away = f.get("away");
        if (home === away) { alert("Wybierz dwie różne drużyny."); return; }
        const hg = f.get("hg"), ag = f.get("ag");
        if ((hg === "") !== (ag === "")) { alert("Wpisz gole obu drużyn albo zostaw oba pola puste."); return; }
        const date = f.get("date"), comp = f.get("comp");
        // jeśli w terminarzu jest już ten mecz (±3 dni), dopisz wynik do niego
        const ex = S.matches.find(m => m.comp === comp && m.home === home && m.away === away && Math.abs(new Date(m.date) - new Date(date)) <= 3 * 86400000);
        const season = D.seasonLabel(D.seasonStart(new Date(date)));
        addManual({ comp, season: ex?.season || season, round: ex?.round || "", date: ex?.date || date, time: ex?.time || "", home, away, hg: hg === "" ? null : +hg, ag: ag === "" ? null : +ag });
      };
      v.querySelectorAll("[data-delman]").forEach(b => b.onclick = () => { S.manual.splice(+b.dataset.delman, 1); store.set(LS.manual, S.manual); compute(); render(); });
    }
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-tab],[data-filter],[data-season],[data-more],[data-match],[data-club],[data-close],[data-go]");
    if (!el) return;
    const d = el.dataset;
    if (d.close !== undefined) return closeSheet();
    if (d.tab || d.go) { S.tab = d.tab || d.go; store.set(LS.tab, S.tab); closeSheet(); render(); scrollTo(0, 0); return; }
    if (d.filter) { S.filter = d.filter; store.set(LS.filter, S.filter); render(); return; }
    if (d.season) { S.tableSeason = d.season; render(); return; }
    if (d.more) { S.showOverdue = true; render(); return; }
    if (d.match) return openMatch(d.match);
    if (d.club) return openClub(d.club);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  function openSheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").hidden = false; $(".sheet-card").scrollTop = 0; document.body.style.overflow = "hidden"; }
  function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; }
  $("#refresh").onclick = () => load(true);

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load(false);
})();
