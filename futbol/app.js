/* Futbol – interfejs: najważniejsze ligi i puchary europejskie – mecze z prognozami, tabele z symulacją sezonu,
   karty klubów z logami, typowanie dowolnego meczu, źródła danych i skuteczność modelu. */
(function () {
  "use strict";
  const M = window.FModel, D = window.FData;
  const LS = { tips: "futbol.tips.v1", fat: "futbol.fatigue", inj: "futbol.injuries", cache: "futbol.cache.v2", manual: "futbol.manual.v1", tab: "futbol.tab", comp: "futbol.comp", mkt: "futbol.market", fav: "futbol.fav", lang: "futbol.lang" };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  /* ---------- język: polski (domyślnie) / angielski – wybór w zakładce Dane, zapamiętany w przeglądarce ---------- */
  let LANG = store.get(LS.lang, "pl");
  if (LANG !== "en") LANG = "pl";
  const L = (pl, en) => LANG === "en" ? en : pl;
  const LOC = () => L("pl-PL", "en-GB");
  const dec = t => LANG === "en" ? t : t.replace(".", ",");          // separator dziesiętny
  const pct = (x, d = 0) => dec((x * 100).toFixed(d)) + "%";
  const dt = d => new Date(d).toLocaleString(LOC());
  try { localStorage.removeItem("futbol.cache.v1"); localStorage.removeItem("futbol.fdkey"); localStorage.removeItem("futbol.filter"); } catch { /* stare klucze */ }

  const XG = 0.7;              // udział xG w ocenie siły (reszta – gole); dobrane testem wstecznym
  const EURO = new Set(["CL", "EL", "ECL"]);
  const SXG = 0.4;             // udział zastępczego xG ze strzałów (gdy prawdziwego brak); test wsteczny
  const MKT = 0.5;             // udział goli z kursów zamknięcia w nauce modelu (test wsteczny: 50,9% → 52,0%, Ekstraklasa 42,5% → 46,2%)
  const FIT = { shrink: 3, halfLife: 320, xg: XG, sxg: SXG, mkt: MKT };

  /* ---------- kluby: nazwy, skróty, loga ---------- */
  const short = t => S.teams[t]?.short || t;
  function abbr(t) {
    if (S.teams[t]?.abbr) return S.teams[t].abbr;
    const w = t.replace(/[^A-Za-zÀ-ž0-9 ]/g, "").split(" ").filter(x => x.length > 2);
    return (w[0] || t).slice(0, 3).toUpperCase();
  }
  function color(t) {
    const c = S.teams[t]?.color;
    if (c && !/^#(f{6}|fefefe|ffffff)$/i.test(c)) return c;
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 40%)`;
  }
  // logo klubu; gdy się nie wczyta – kółko w barwach klubu ze skrótem
  function badge(t, cls = "") {
    const logo = S.teams[t]?.logo;
    return `<i class="badge ${cls}${logo ? " has-logo" : ""}" style="background:${color(t)}" aria-hidden="true"><b>${esc(abbr(t))}</b>${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.remove('has-logo');this.remove()">` : ""}</i>`;
  }
  const teamEl = (t, right) => `<div class="team${right ? " r" : ""}">${badge(t)}<span>${esc(short(t))}</span></div>`;
  const compLogo = (c, cls = "") => D.leagueLogo(c) ? `<img class="clogo ${cls}" src="${D.leagueLogo(c)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  const compShort = c => (LANG === "en" && D.COMP[c]?.shortEn) || D.COMP[c]?.short || c;
  const compTag = c => `<span class="ctag">${compLogo(c)}${esc(compShort(c))}</span>`;
  const compName = c => (LANG === "en" && D.COMP[c]?.nameEn) || D.COMP[c]?.name || c;
  // etap / kolejka (w danych po polsku)
  const ROUND_EN = { "Faza ligowa": "League phase", "Baraże": "Play-offs", "1/8 finału": "Round of 16", "Ćwierćfinał": "Quarter-final", "Półfinał": "Semi-final", "Finał": "Final" };
  const roundName = r => !r || LANG !== "en" ? r : ROUND_EN[r] || r.replace(/^(\d+)\. kolejka$/, "Matchday $1");

  /* ---------- daty ---------- */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const fmtDate = (d, withDay = true) => new Date(d + "T12:00:00").toLocaleDateString(LOC(), withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
  const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  /* ---------- stan ---------- */
  const S = {
    raw: null, teams: {}, players: [], manual: store.get(LS.manual, []), matches: [], status: [],
    elo: null, models: {}, bts: {}, btMap: new Map(), sims: {}, rest: new Map(), absCache: new Map(),
    tab: store.get(LS.tab, "mecze"), comp: store.get(LS.comp, "PL"), tableSeason: null, typ: null,
    tips: store.get(LS.tips, null), tipFilter: "all", typySub: "zaklady", betDays: 3,
    live: {}, liveAt: 0, histSeason: null, histIdx: null,
  };
  if (!D.COMP[S.comp]) S.comp = "PL";
  const curSeason = () => D.seasonLabel(D.seasonStart());
  const prevSeason = () => D.seasonLabel(D.seasonStart() - 1);
  const isCup = c => !!D.COMP[c]?.cup;

  function compute() {
    const r = S.raw;
    const es = D.parseEspn(r.espn, r.kursy, r.fd);          // najpierw ESPN – jego nazwy klubów są wzorcowe
    const ek = r.ek ? D.parseEk(r.ek) : null;              // Ekstraklasa z football-data
    const fpl = r.fpl ? D.parseFpl(r.fpl) : null;
    const xg = r.xg ? D.parseXg(r.xg) : null;
    S.teams = { ...(ek ? ek.teams : {}), ...es.teams };
    // kluby Ekstraklasy znane też z pucharów (ESPN): logo z ESPN, polski skrót
    if (ek) for (const [n, t] of Object.entries(ek.teams)) if (es.teams[n]) S.teams[n] = { ...es.teams[n], short: t.short };
    S.status = ek ? [es.status[0], ek.status, ...es.status.slice(1)] : es.status; S.updated = es.updated; S.fplInfo = fpl ? { updated: fpl.updated, players: fpl.players.length, played: fpl.played } : null;
    S.matches = D.merge([es.matches, ek ? ek.matches : [], fpl ? fpl.matches : [], S.manual.map(m => ({ ...m, src: "manual" }))]);
    S.xgCount = xg ? D.attachXg(S.matches, xg) : 0;
    // gole z kursów dla rozegranych meczów, których nie policzył serwer (np. puchary z archiwum kursów ESPN – kilkaset)
    for (const m of S.matches) if (m.mxh === undefined && M.played(m) && m.odds?.h) { const f = M.fromOdds(m.odds, { total: 2.7 }); if (f) { m.mxh = f.xg.home; m.mxa = f.xg.away; } }
    assignRounds(S.matches);
    S.players = fpl ? fpl.players.map(p => ({ ...p, team: D.canon(p.team) })) : [];
    S.elo = M.elo(S.matches);
    S.rest = new Map([...M.restDays(S.matches)].map(([m, x]) => [m.id, x]));
    S.calib = null;
    S.models = {}; S.bts = {}; S.btMap = new Map(); S.sims = {}; S.absCache = new Map(); S._teamsOf = {}; S._league = null; S.predCache = new Map(); S.pmCache = new Map(); S._expl = new Map(); S._tbl = {};
  }
  function teamsOf(comp, season) {
    const k = comp + season;
    return S._teamsOf[k] || (S._teamsOf[k] = [...new Set(S.matches.filter(m => m.comp === comp && m.season === season).flatMap(m => [m.home, m.away]))].sort((a, b) => short(a).localeCompare(short(b))));
  }
  // liga, w której klub gra w tym sezonie (albo grał w poprzednim)
  function leagueOf(t) {
    if (!S._league) {
      S._league = {};
      for (const s of [prevSeason(), curSeason()]) for (const m of S.matches) if (m.season === s && !isCup(m.comp)) { S._league[m.home] = m.comp; S._league[m.away] = m.comp; }
    }
    return S._league[t] || null;
  }

  /* ---------- modele: liga = jej mecze + puchary europejskie; puchary = wszystkie mecze ---------- */
  function dataFor(comp) { return isCup(comp) ? S.matches : S.matches.filter(m => m.comp === comp || EURO.has(m.comp)); }
  function priorsFor(comp) {
    // beniaminkowie: start z niższą oceną
    if (isCup(comp)) return {};
    const prev = new Set(teamsOf(comp, prevSeason())), pr = {};
    if (prev.size) for (const t of teamsOf(comp, curSeason())) if (!prev.has(t)) pr[t] = { att: -0.25, def: -0.25 };
    return pr;
  }
  // puchary: bez poprawki Dixona-Colesa na remisy (test wsteczny: Brier LM 0,552 → 0,549, LE 0,587 → 0,583)
  const rhoFor = comp => isCup(comp) ? { rho: 0 } : {};
  function modelFor(comp) {
    return S.models[comp] || (S.models[comp] = M.fit(dataFor(comp), { ...FIT, ...rhoFor(comp), asOf: today(), priors: priorsFor(comp) }));
  }
  function modelForPair(h, a) {
    const lh = leagueOf(h), la = leagueOf(a);
    return lh && lh === la ? modelFor(lh) : modelFor("CL");
  }
  const modelPred = m => M.predict(modelFor(m.comp), m.home, m.away, { neutral: m.neutral, adj: adjFor(m) });
  /* Prognoza meczu: z kursów bukmachera, gdy są (w teście na 3527 meczach trafniejsza od modelu na każdym rynku,
     a każda domieszka modelu ją pogarszała), inaczej z modelu. p.model – zdanie modelu do porównania. */
  const mktOn = () => store.get(LS.mkt, true);
  function pred(m) {
    if (S.predCache.has(m.id)) return S.predCache.get(m.id);
    const mp = modelPred(m);
    let p = mp;
    if (!M.played(m) && m.odds && mktOn()) {
      const f = M.fromOdds(m.odds, { total: mp.xg.home + mp.xg.away });
      if (f) { f.home = m.home; f.away = m.away; f.src = "rynek"; f.book = m.odds.book || L("bukmacher", "bookmaker"); f.model = mp; p = f; }
    }
    S.predCache.set(m.id, p);
    return p;
  }

  function btFor(comp) {
    if (S.bts[comp]) return S.bts[comp];
    const b = M.backtest(dataFor(comp), {
      from: `${D.seasonStart() - 1}-09-15`, filter: m => m.comp === comp,
      fit: { ...FIT, ...rhoFor(comp), priors: priorsFor(comp) }, adjFn: fatOn() ? m => M.fatigueAdj(S.rest.get(m.id)) : null,
    });
    for (const r of b.records) S.btMap.set(r.m.id, r);
    return (S.bts[comp] = b);
  }
  function simFor(comp) {
    if (S.sims[comp] !== undefined) return S.sims[comp];
    let lm = S.matches.filter(m => m.comp === comp && m.season === curSeason());
    if (D.COMP[comp]?.rr) {
      // terminarz nieznany (Ekstraklasa): każda para gra raz u siebie i raz na wyjeździe – dopisujemy brakujące mecze bez daty
      const ts = [...new Set(lm.flatMap(m => [m.home, m.away]))], have = new Set(lm.map(m => m.home + "|" + m.away)), extra = [];
      for (const h of ts) for (const a of ts) if (h !== a && !have.has(h + "|" + a)) extra.push({ home: h, away: a, hg: null, ag: null, comp });
      lm = lm.concat(extra);
    }
    return (S.sims[comp] = !isCup(comp) && lm.some(m => !M.played(m)) ? M.simulateSeason(modelFor(comp), lm, { runs: 3000 }) : null);
  }

  /* ---------- ładowanie danych ---------- */
  async function load(force) {
    const cache = store.get(LS.cache, null);
    if (cache?.espn && !S.raw) { S.raw = cache; S.fetchedAt = cache.at; compute(); render(); pollLive(); }
    const fresh = !cache || force || Date.now() - (cache.at || 0) > 20 * 60 * 1000;
    if (!fresh) return;
    $("#refresh").classList.add("spin");
    try {
      const [espn, fpl, xg, kursy, fd, ek] = await Promise.all([D.getJson("dane/espn.json"), D.getJson("dane/fpl.json").catch(() => null), D.getJson("dane/xg.json").catch(() => null), D.getJson("dane/kursy.json").catch(() => null), D.getJson("dane/fd.json").catch(() => null), D.getJson("dane/ekstraklasa.json").catch(() => null)]);
      S.raw = { espn, fpl, xg, kursy, fd, ek, at: Date.now() };
      S.fetchedAt = S.raw.at;
      if (!store.set(LS.cache, S.raw)) store.set(LS.cache, { espn, at: S.raw.at }); // za mało miejsca – przynajmniej wyniki
      compute(); render(); pollLive();
    } catch (e) {
      if (!S.raw) $("#view").innerHTML = `<div class="empty">${L("Nie udało się pobrać danych. Sprawdź internet i spróbuj ponownie.", "Could not load the data. Check your connection and try again.")}<div class="row" style="justify-content:center"><button class="btn" onclick="location.reload()">${L("Spróbuj ponownie", "Try again")}</button></div></div>`;
      else toastNotice(L("Brak połączenia – pokazuję zapisane dane z ", "No connection – showing saved data from ") + dt(S.fetchedAt));
    } finally {
      $("#refresh").classList.remove("spin");
    }
  }
  function toastNotice(html) { const n = $("#notice"); n.innerHTML = html; n.hidden = false; }
  function freshness() {
    const n = $("#notice");
    const age = S.updated ? (Date.now() - new Date(S.updated)) / 3600000 : 0;
    if (age > 24) { n.innerHTML = L(`Dane są z <b>${dt(S.updated)}</b> – automatyczne odświeżanie mogło się zatrzymać.`, `Data is from <b>${dt(S.updated)}</b> – automatic updates may have stopped.`); n.hidden = false; }
    else n.hidden = true;
  }

  /* ---------- zawodnicy: kontuzje, zawieszenia, forma (Fantasy Premier League) ---------- */
  const POS = { 1: ["BR", "GK"], 2: ["OBR", "DEF"], 3: ["POM", "MID"], 4: ["NAP", "FWD"] };
  const injOn = () => store.get(LS.inj, true);
  // status FPL: a dostępny, d wątpliwy, i kontuzja, s zawieszenie, n nie może grać, u niedostępny (odszedł / wypożyczony – pomijamy)
  function availability(p) {
    if (p.st === "a") return 1;
    if (p.st === "u") return null;
    if (p.ch !== null && p.ch !== undefined) return p.ch / 100;
    return p.st === "d" ? 0.5 : 0;
  }
  /* Wpływ nieobecnych: atak – udział brakujących w xG + xA drużyny (zmiennicy odrabiają ok. 40%);
     obrona – udział brakujących w minutach bramkarzy i obrońców. */
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
        const miss = 1 - av, xgiShare = ((p.xg || 0) + (p.xa || 0)) / xgiAll, defShare = p.pos <= 2 ? p.min / defMin : 0;
        attLoss += miss * xgiShare; defLoss += miss * defShare;
        out.push({ p, av, xgiShare, defShare, weight: Math.max(xgiShare, defShare, p.min / 3000 / 4) });
      }
      out.sort((a, b) => b.weight - a.weight);
      res = { list: out, attLoss, defLoss, att: 1 - Math.min(0.25, 0.6 * attLoss), def: 1 + Math.min(0.2, 0.3 * defLoss) };
    }
    S.absCache.set(team, res);
    return res;
  }
  // kontuzje – tylko mecze w najbliższych 10 dniach (dalej stan kadry jest nieznany)
  function injAdj(m, force) {
    if (!injOn() || M.played(m)) return null;
    if (!force) { const d = (new Date(m.date) - new Date(today())) / 86400000; if (d < 0 || d > 10) return null; }
    const h = absences(m.home), a = absences(m.away);
    if (!h && !a) return null;
    return { home: h ? { att: h.att, def: h.def } : {}, away: a ? { att: a.att, def: a.def } : {} };
  }
  const fatOn = () => store.get(LS.fat, true);
  const fatAdj = m => (!fatOn() || M.played(m) || !m.id) ? null : M.fatigueAdj(S.rest.get(m.id));
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
  const plNews = t => LANG === "en" ? t || "" : PL_WORDS.reduce((s, [re, r]) => s.replace(re, r), t || "");
  function statusTag(x) {
    if (x.p.st === "s") return `<span class="tag bad">${L("zawieszony", "suspended")}</span>`;
    if (x.av === 0) return `<span class="tag bad">${L("nie zagra", "out")}</span>`;
    return `<span class="tag wait">${Math.round(x.av * 100)}% ${L("szans", "chance")}</span>`;
  }
  function absenceHtml(team, limit = 8) {
    const a = absences(team);
    if (!a) return `<div class="muted small">${L("Brak danych o kadrze – kontuzje są dostępne tylko dla klubów Premier League.", "No squad data – injuries are only available for Premier League clubs.")}</div>`;
    if (!a.list.length) return `<div class="muted small">${L("Wszyscy zawodnicy dostępni.", "All players available.")}</div>`;
    const rows = a.list.slice(0, limit).map(x => `<div class="list-row" style="cursor:default;align-items:flex-start">
        <span class="res N" style="width:auto;padding:0 5px">${L(...POS[x.p.pos])}</span>
        <span class="x" style="white-space:normal"><b>${esc(x.p.n)}</b> ${statusTag(x)}<br><span class="small muted">${esc(plNews(x.p.news))}${x.xgiShare > 0.03 ? ` · ${pct(x.xgiShare)} ${L("xG+xA drużyny", "of team xG+xA")}` : ""}</span></span></div>`).join("");
    const more = a.list.length > limit ? `<div class="small muted" style="padding-top:6px">${L(`i ${a.list.length - limit} innych (mało grających)`, `and ${a.list.length - limit} more (fringe players)`)}</div>` : "";
    return rows + more + `<div class="small muted" style="padding-top:8px">${L("Wpływ na prognozę: atak", "Effect on the forecast: attack")} ${a.att < 0.995 ? "−" + pct(1 - a.att) : L("bez zmian", "unchanged")}, ${L("obrona", "defence")} ${a.def > 1.005 ? "+" + pct(a.def - 1) + L(" straconych goli", " goals conceded") : L("bez zmian", "unchanged")}.</div>`;
  }
  function restHtml(m) {
    const r = S.rest.get(m.id);
    if (!r || r.h === null || r.a === null) return "";
    const f = M.fatigueAdj(r), F = M.FATIGUE;
    const tired = f ? (f.home.att ? m.home : m.away) : null;
    return `<h2>${L("Odpoczynek przed meczem", "Rest before the match")}</h2><div class="card small">${esc(short(m.home))}: <b>${r.h} ${L("dni", "days")}</b> ${L("od poprzedniego meczu", "since the previous match")} · ${esc(short(m.away))}: <b>${r.a} ${L("dni", "days")}</b>
      ${tired ? `<br><b>${esc(short(tired))}</b> ${L("gra po krótkiej przerwie, a rywal odpoczywał dłużej", "plays after a short break while the opponent had longer to rest")}${M.played(m) ? "." : fatOn() ? L(` – w prognozie: atak −${pct(F.att)}, +${pct(F.def)} straconych goli.`, ` – in the forecast: attack −${pct(F.att)}, +${pct(F.def)} goals conceded.`) : L(" (zmęczenie wyłączone w Danych).", " (fatigue switched off in Data).")}` : ""}
      <div class="muted" style="margin-top:4px">${L("Liczone z meczów ligowych i europejskich – bez pucharów krajowych, więc przerwa bywa krótsza niż tu widać.", "Counted from league and European matches – domestic cups are not included, so the real break may be shorter.")}</div></div>`;
  }

  /* ---------- elementy wspólne ---------- */
  function probBar(p) {
    return `<div class="bar"><i class="w" style="width:${p.win * 100}%"></i><i class="d" style="width:${p.draw * 100}%"></i><i class="l" style="width:${p.loss * 100}%"></i></div>
      <div class="bar-l"><span>1 <b>${pct(p.win)}</b></span><span>X <b>${pct(p.draw)}</b></span><span>2 <b>${pct(p.loss)}</b></span></div>`;
  }
  function compBar(sel, opts = {}) {
    const list = D.COMPS.filter(c => !opts.leaguesOnly || !c.cup);
    return `<div class="cbar" role="tablist">${list.map(c => `<button class="cchip${c.code === sel ? " on" : ""}" data-comp="${c.code}" role="tab" aria-selected="${c.code === sel}">${compLogo(c.code)}<span>${esc(compShort(c.code))}</span></button>`).join("")}</div>`;
  }

  /* ---------- kolejki: ESPN nie podaje numerów kolejek w ligach, więc liczymy je z kolejności meczów każdej drużyny
     (kolejka = o jeden więcej niż dotąd rozegrała którakolwiek z drużyn). Mecz przełożony dostaje późniejszy numer. ---------- */
  function assignRounds(ms) {
    const groups = new Map();
    for (const m of ms) {
      const cup = isCup(m.comp);
      if (cup && m.round !== "Faza ligowa") continue;
      const k = m.comp + "|" + m.season;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      const cnt = {};
      for (const m of list) { const r = Math.max(cnt[m.home] || 0, cnt[m.away] || 0) + 1; m.rd = r; cnt[m.home] = cnt[m.away] = r; }
    }
  }

  /* ---------- na żywo: tablica wyników ESPN co minutę, gdy aplikacja jest otwarta i trwają (albo zaraz zaczną się) mecze ---------- */
  const kickoff = m => new Date(`${m.date}T${m.time || "12:00"}`);
  const liveKey = (comp, h, a) => `${comp}|${h}|${a}`;
  function liveOf(m) {
    const h = S.teams[m.home]?.id, a = S.teams[m.away]?.id, x = h && a ? S.live[liveKey(m.comp, h, a)] : null;
    return x && Math.abs(new Date(x.k) - kickoff(m)) < 36 * 3600e3 ? x : null;
  }
  // mecze, dla których warto pytać ESPN: od 15 min przed początkiem do 2,5 godz. po (lub trwające wg danych)
  function liveCandidates() {
    const now = Date.now();
    return S.matches.filter(m => D.ESPN_SLUG[m.comp] && !M.played(m) && m.time && (m.live || (now - kickoff(m) > -15 * 60e3 && now - kickoff(m) < 150 * 60e3)));
  }
  async function pollLive() {
    if (document.visibilityState !== "visible" || !S.raw) return;
    const cands = liveCandidates();
    if (!cands.length) return;
    const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    const jobs = new Map();
    for (const m of cands) { const k = kickoff(m), d1 = ymd(new Date(k - 5 * 3600e3)), d2 = ymd(k); for (const d of new Set([d1, d2])) jobs.set(m.comp + d, [m.comp, d]); }
    const res = await Promise.allSettled([...jobs.values()].map(([c, d]) => D.loadScoreboard(c, d)));
    let changed = false;
    for (const r of res) if (r.status === "fulfilled") for (const x of r.value) {
      const k = liveKey(x.comp, x.h, x.a), old = S.live[k];
      if (!old || old.hs !== x.hs || old.as !== x.as || old.detail !== x.detail || old.state !== x.state) changed = true;
      S.live[k] = x;
    }
    S.liveAt = Date.now();
    if (changed && S.tab === "mecze" && $("#sheet").hidden) { const y = scrollY; render(); scrollTo(0, y); }
  }
  const evIcon = { goal: "⚽", pen: "⚽", og: "⚽", red: "🟥" };
  function liveEvents(m, x) {
    if (!x.ev.length) return "";
    const hid = S.teams[m.home]?.id;
    const side = t => x.ev.filter(e => (e.team === hid) === t).map(e => `${evIcon[e.kind]} ${esc(e.min)} ${esc(e.who)}${e.kind === "pen" ? L(" (k.)", " (pen)") : e.kind === "og" ? L(" (sam.)", " (og)") : ""}`).join(", ");
    const hs = side(true), as = side(false);
    return `<div class="live-ev small">${hs ? `<div><b>${esc(short(m.home))}:</b> ${hs}</div>` : ""}${as ? `<div><b>${esc(short(m.away))}:</b> ${as}</div>` : ""}</div>`;
  }

  function matchCard(m) {
    const done = M.played(m);
    const lv = !done ? liveOf(m) : null, isLive = lv && lv.state === "in", justEnded = lv && lv.state === "post";
    const p = pred(m);
    const bt = done ? S.btMap.get(m.id) : null;
    let mid;
    if (done) mid = `<div class="score">${m.hg}–${m.ag}${m.pens ? `<small>${L("k.", "pens")} ${m.pens[0]}–${m.pens[1]}</small>` : m.aet ? `<small>${L("po dogr.", "a.e.t.")} ${m.aet[0]}–${m.aet[1]}</small>` : ""}</div>`;
    else if (isLive) mid = `<div class="score live">${lv.hs}–${lv.as}<small>${esc(lv.detail || L("na żywo", "live"))}</small></div>`;
    else if (justEnded) mid = `<div class="score">${lv.hs}–${lv.as}<small>${L("koniec", "full time")}</small></div>`;
    else if (m.live) mid = `<div class="score live">${m.live[0]}–${m.live[1]}<small>${L("na żywo", "live")}</small></div>`;
    else mid = `<div class="score pred">${p.top[0].hg}–${p.top[0].ag}<small>${L("typ", "pick")}</small></div>`;
    let tag = "";
    if (bt) tag = bt.hit ? `<span class="tag ok">${L("model trafił", "model right")}</span>` : `<span class="tag bad">${L("model nie trafił", "model wrong")}</span>`;
    else if (isLive) tag = `<span class="tag live-tag">● ${L("na żywo", "live")}</span>`;
    else if (!done && !m.live && !justEnded && m.date < today()) tag = `<span class="tag wait">${L("czeka na wynik", "awaiting result")}</span>`;
    const miss = !done && injAdj(m) ? (() => { const n = t => (absences(t)?.list || []).filter(x => x.weight > 0.04).map(x => x.p.n); const k = [...n(m.home), ...n(m.away)]; return k.length ? `<div class="small muted" style="margin-top:6px">${L("Brakuje", "Missing")}: ${esc(k.slice(0, 4).join(", "))}${k.length > 4 ? L(` i ${k.length - 4} innych`, ` and ${k.length - 4} more`) : ""}</div>` : ""; })() : "";
    return `<button class="card match" data-match="${esc(m.id)}">
      <div class="m-meta"><span>${compTag(m.comp)}${m.round ? ` · ${esc(roundName(m.round))}` : ""}</span><span>${tag} ${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="m-row">${teamEl(m.home)}${mid}${teamEl(m.away, true)}</div>
      ${done && !bt ? "" : probBar(bt ? { win: bt.probs[0], draw: bt.probs[1], loss: bt.probs[2] } : p)}
      ${lv && (isLive || justEnded) ? liveEvents(m, lv) : !done && !m.live ? explainLine(m) : ""}
      ${miss}
      ${!done && m.odds ? `<div class="oddsline">${L("Kursy", "Odds")}${m.odds.book ? ` ${esc(m.odds.book)}` : ""}: 1 <b>${fx(m.odds.h)}</b> · X <b>${fx(m.odds.d)}</b> · 2 <b>${fx(m.odds.a)}</b>${p.src ? L(" · prognoza z kursów", " · forecast from odds") : ""}</div>` : ""}
      ${tipLine(m)}
    </button>`;
  }

  function formOf(team, n = 5) {
    return S.matches.filter(m => M.played(m) && (m.home === team || m.away === team)).slice(-n).map(m => {
      const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg;
      return { m, r: gf > ga ? "W" : gf === ga ? "R" : "P" };
    });
  }
  // litera wyniku: W/R/P po polsku, W/D/L po angielsku (klasy CSS zostają W/R/P)
  const resL = r => LANG === "en" ? ({ W: "W", R: "D", P: "L" }[r] || r) : r;
  const formHtml = f => `<span class="form">${f.map(x => `<i class="${x.r}" title="${esc(short(x.m.home))} ${x.m.hg}–${x.m.ag} ${esc(short(x.m.away))} (${esc(compShort(x.m.comp))})">${resL(x.r)}</i>`).join("")}</span>`;

  /* ---------- prognoza meczu ---------- */
  function predictionHtml(home, away, opts = {}) {
    const mdl = opts.model || modelForPair(home, away);
    const p = opts.p || M.predict(mdl, home, away, { neutral: opts.neutral, adj: opts.adj });
    const er = S.elo.ratings;
    const pm = p.model, gap = pm ? Math.max(Math.abs(pm.win - p.win), Math.abs(pm.draw - p.draw), Math.abs(pm.loss - p.loss)) : 0;
    const srcNote = pm ? `<p class="small muted">${L(`Prognoza z kursów ${esc(p.book)} po zdjęciu marży – w teście na 3527 meczach trafniejsza niż sam model. Model:`, `Forecast from ${esc(p.book)} odds with the margin removed – more accurate than the model alone in a test on 3,527 matches. Model:`)} 1 ${pct(pm.win)} · X ${pct(pm.draw)} · 2 ${pct(pm.loss)}, ${L("oczekiwane gole", "expected goals")} ${dec(pm.xg.home.toFixed(2))} : ${dec(pm.xg.away.toFixed(2))}.${gap >= 0.1 ? ` <span class="tag wait">${L("model i rynek mocno się różnią", "model and market differ a lot")}</span> ${L("Zwykle rynek wie więcej – np. o składzie lub kontuzjach.", "Usually the market knows more – e.g. about the line-up or injuries.")}` : ""}</p>` : "";
    const N = 6;
    let grid = `<div class="sgrid"><div class="h">${esc(abbr(home))}↓</div>${[...Array(N).keys()].map(j => `<div class="h">${j}</div>`).join("")}`;
    const mx = Math.max(...p.grid.slice(0, N).flatMap(r => r.slice(0, N)));
    for (let i = 0; i < N; i++) {
      grid += `<div class="h">${i}</div>`;
      for (let j = 0; j < N; j++) {
        const v = p.grid[i][j], a = Math.round(v / mx * 70);
        const c = i > j ? "var(--win)" : i === j ? "var(--draw)" : "var(--loss)";
        grid += `<div style="background:color-mix(in srgb, ${c} ${a}%, transparent)" title="${i}–${j}">${dec((v * 100).toFixed(1))}</div>`;
      }
    }
    grid += `</div><p class="small muted">${L(`Wiersze: gole ${esc(short(home))}, kolumny: gole ${esc(short(away))}. Wartości w %.`, `Rows: ${esc(short(home))} goals, columns: ${esc(short(away))} goals. Values in %.`)}</p>`;
    const h2h = S.matches.filter(m => M.played(m) && ((m.home === home && m.away === away) || (m.home === away && m.away === home))).slice(-6).reverse();
    const lowData = [home, away].filter(t => !(t in mdl.att) || (mdl.games[t] || 0) < 4);
    const squad = opts.squad !== false && (absences(home) || absences(away));
    return `
      <div class="big3"><div><b>${pct(p.win)}</b><span>${L(`wygrana ${esc(short(home))}`, `${esc(short(home))} win`)}</span></div><div><b>${pct(p.draw)}</b><span>${L("remis", "draw")}</span></div><div><b>${pct(p.loss)}</b><span>${L(`wygrana ${esc(short(away))}`, `${esc(short(away))} win`)}</span></div></div>
      ${probBar(p)}
      ${srcNote}
      <div class="kv">
        <div class="stat"><b>${dec(p.xg.home.toFixed(2))} : ${dec(p.xg.away.toFixed(2))}</b><span>${L("oczekiwane gole", "expected goals")}</span></div>
        <div class="stat"><b>${pct(p.over25)}</b><span>${L("powyżej 2,5 gola", "over 2.5 goals")}</span></div>
        <div class="stat"><b>${pct(p.btts)}</b><span>${L("obie strzelą", "both teams score")}</span></div>
        <div class="stat"><b>${Math.round(er[home] || 1500)} : ${Math.round(er[away] || 1500)}</b><span>${L("ranking Elo", "Elo rating")}</span></div>
      </div>
      ${lowData.length ? `<p class="small muted">${L("Mało danych o", "Little data on")}: ${lowData.map(t => esc(short(t))).join(", ")} – ${L("prognoza mniej pewna.", "the forecast is less certain.")}</p>` : ""}
      <h2>${L("Najbardziej prawdopodobne wyniki", "Most likely scores")}</h2>
      <div class="card">${p.top.map(s => `<div class="list-row" style="cursor:default"><span class="x">${esc(short(home))} <b>${s.hg}–${s.ag}</b> ${esc(short(away))}</span><span class="s">${pct(s.p, 1)}</span></div>`).join("")}</div>
      <h2>${L("Rozkład wyników", "Score distribution")}</h2><div class="card">${grid}</div>
      ${squad ? `<h2>${L("Kadra przed meczem", "Squad news")}${opts.injApplied ? "" : injOn() ? L(" (poza oknem 10 dni – nieuwzględniona)", " (more than 10 days away – not applied)") : L(" (wyłączone w Danych)", " (switched off in Data)")}</h2>
      <div class="card"><div class="list-row" style="cursor:default">${badge(home)}<b class="x">${esc(short(home))}</b></div>${absenceHtml(home, 6)}</div>
      <div class="card"><div class="list-row" style="cursor:default">${badge(away)}<b class="x">${esc(short(away))}</b></div>${absenceHtml(away, 6)}</div>` : ""}
      ${opts.match ? restHtml(opts.match) : ""}
      <h2>${L("Forma (ostatnie 5)", "Form (last 5)")}</h2>
      <div class="card">
        <div class="list-row" style="cursor:default">${badge(home)}<span class="x">${esc(short(home))}</span>${formHtml(formOf(home))}</div>
        <div class="list-row" style="cursor:default">${badge(away)}<span class="x">${esc(short(away))}</span>${formHtml(formOf(away))}</div>
      </div>
      ${h2h.length ? `<h2>${L("Bezpośrednie mecze", "Head to head")}</h2><div class="card">${h2h.map(m => resultRow(m)).join("")}</div>` : ""}`;
  }

  function resultRow(m, team) {
    const done = M.played(m);
    let r = "N";
    if (done && team) { const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg; r = gf > ga ? "W" : gf === ga ? "R" : "P"; }
    const right = done ? `${m.xhg !== undefined ? `<span class="small muted">xG ${dec(m.xhg.toFixed(1))}–${dec(m.xag.toFixed(1))}</span>` : ""}<span class="s">${m.hg}–${m.ag}</span>`
      : (() => { const p = pred(m); return `<span class="small muted">${pct(p.win)} / ${pct(p.draw)} / ${pct(p.loss)}</span>`; })();
    return `<div class="list-row" data-match="${esc(m.id)}">${team ? `<span class="res ${r}">${done ? resL(r) : "–"}</span>` : ""}<span class="d">${fmtDate(m.date, false)}</span>${compLogo(m.comp, "sm")}<span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span>${right}</div>`;
  }

  function openMatch(id) {
    const m = S.matches.find(x => x.id === id);
    if (!m) return;
    btFor(m.comp);
    const done = M.played(m), bt = S.btMap.get(m.id);
    const p = pred(m);
    let html = `<div class="m-meta" style="padding-right:36px"><span>${compTag(m.comp)}${m.round ? ` · ${esc(roundName(m.round))}` : ""}</span><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="vs"><div class="tm" data-club="${esc(m.home)}">${badge(m.home, "lg")}${esc(short(m.home))}</div>
      <div class="sc">${done ? `${m.hg}–${m.ag}` : m.live ? `${m.live[0]}–${m.live[1]}` : `<span style="color:var(--accent)">${p.top[0].hg}–${p.top[0].ag}</span>`}<div class="small muted">${done ? (m.pens ? `${L("karne", "penalties")} ${m.pens[0]}–${m.pens[1]}` : m.aet ? `${L("po dogrywce", "after extra time")} ${m.aet[0]}–${m.aet[1]}` : m.xhg !== undefined ? `xG ${dec(m.xhg.toFixed(2))} – ${dec(m.xag.toFixed(2))}` : L("wynik", "result")) : m.live ? L("na żywo", "live") : L("najbardziej prawdopodobny", "most likely")}</div></div>
      <div class="tm" data-club="${esc(m.away)}">${badge(m.away, "lg")}${esc(short(m.away))}</div></div>`;
    if (!done && m.eid) html += `<div id="live"><div class="card small muted">${L("Sprawdzam w ESPN potwierdzone składy i najnowsze kursy…", "Checking ESPN for confirmed line-ups and the latest odds…")}</div></div>`;
    if (done && bt) html += `<div class="card"><b>${L("Przed meczem model dawał:", "Before the match the model gave:")}</b> 1 ${pct(bt.probs[0])} · X ${pct(bt.probs[1])} · 2 ${pct(bt.probs[2])}, ${L("typ", "pick")} ${bt.top.hg}–${bt.top.ag}. ${bt.hit ? `<span class="tag ok">${L("trafiony", "correct")}</span>` : `<span class="tag bad">${L("nietrafiony", "wrong")}</span>`}</div>`;
    html += done ? `<h2>${L("Gdyby zagrali teraz", "If they played now")}</h2>` : "";
    if (!done) html += explainHtml(m);
    html += predictionHtml(m.home, m.away, { model: modelFor(m.comp), neutral: m.neutral, adj: adjFor(m), injApplied: !!injAdj(m), match: m, squad: !done, p: done ? null : p });
    html += oddsHtml(m, p);
    html += tipSectionHtml(m, p);
    html += `<h2>${done ? L("Popraw wynik", "Correct the result") : L("Wpisz wynik", "Enter the result")}</h2>
      <form class="card" id="resForm"><div class="two"><div><label>${esc(short(m.home))}</label><input type="number" min="0" max="20" name="hg" value="${done ? m.hg : ""}" required></div>
      <div><label>${esc(short(m.away))}</label><input type="number" min="0" max="20" name="ag" value="${done ? m.ag : ""}" required></div></div>
      <div class="row"><button class="btn">${L("Zapisz wynik", "Save result")}</button><span class="small muted">${L("Wynik po 90 minutach. Zostaje w tej przeglądarce.", "Score after 90 minutes. Stays in this browser.")}</span></div></form>`;
    openSheet(html);
    S.sheetId = m.id;
    bindTipForm(m, p);
    if (!done && m.eid) D.loadLive(m).then(x => { if (S.sheetId === m.id && $("#live")) { $("#live").innerHTML = liveHtml(m, p, x); fillMissing(m, x); } })
      .catch(() => { if (S.sheetId === m.id && $("#live")) $("#live").innerHTML = `<div class="card small muted">${L("Nie udało się pobrać składów i najnowszych kursów z ESPN – prognoza wyżej korzysta z ostatnio odświeżonych danych.", "Could not load line-ups and the latest odds from ESPN – the forecast above uses the last refreshed data.")}</div>`; });
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

  /* ---------- moje typy ---------- */
  const saveTips = () => store.set(LS.tips, S.tips);
  const near = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 3 * 86400000;
  const tipMatch = t => S.matches.find(m => m.comp === t.comp && m.home === t.home && m.away === t.away && near(m.date, t.date));
  const tipFor = m => (S.tips || []).find(t => t.kind !== "bet" && t.comp === m.comp && t.home === m.home && t.away === m.away && near(m.date, t.date));
  const betsFor = m => (S.tips || []).filter(t => t.kind === "bet" && t.comp === m.comp && t.home === m.home && t.away === m.away && near(m.date, t.date));
  const sign = (a, b) => Math.sign(a - b);
  // rozliczenie: 3 pkt za dokładny wynik, 1 pkt za trafiony 1X2
  function tipResult(t) {
    const m = tipMatch(t);
    if (!m || !M.played(m)) return { m, done: false };
    if (t.kind === "bet") { const win = M.settle(t.market, m.hg, m.ag); return { m, done: true, win, profit: win ? (t.odds - 1) * STAKE : -STAKE }; }
    const exact = t.hg === m.hg && t.ag === m.ag, outcome = sign(t.hg, t.ag) === sign(m.hg, m.ag);
    const modelOutcome = t.model ? sign(t.model.hg, t.model.ag) === sign(m.hg, m.ag) : null;
    return { m, done: true, exact, outcome, pts: exact ? 3 : outcome ? 1 : 0, modelOutcome };
  }
  function newTip(m, hg, ag, note, p, example) {
    p = p || M.predict(modelFor(m.comp), m.home, m.away, { neutral: m.neutral });
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), comp: m.comp, date: m.date, time: m.time || "",
      home: m.home, away: m.away, hg, ag, note: note || "", saved: new Date().toISOString(), example: !!example,
      model: { hg: p.top[0].hg, ag: p.top[0].ag, win: +p.win.toFixed(3), draw: +p.draw.toFixed(3), loss: +p.loss.toFixed(3) },
    };
  }
  /* Przykładowe typy przy pierwszym uruchomieniu: 3 najbliższe mecze i 2 rozegrane (z typem modelu sprzed meczu). */
  function ensureExamples() {
    if (S.tips !== null || !S.matches.length) return;
    const t = today(), out = [];
    const up = S.matches.filter(m => m.comp === "PL" && !M.played(m) && !m.live && m.date >= t).slice(0, 3);
    const notes = L(["Przykład: typuję wyżej niż model", "Przykładowy typ – możesz go zmienić lub usunąć", "Przykład: typ jak model"], ["Example: I pick higher than the model", "Example pick – you can change or delete it", "Example: same as the model"]);
    up.forEach((m, i) => { const p = pred(m), x = p.top[0]; out.push(newTip(m, i === 0 ? x.hg + 1 : x.hg, x.ag, notes[i], p, true)); });
    const bt = btFor("PL");
    const rec = bt.records.slice(-40);
    const ok = r => sign(r.top.hg, r.top.ag) === sign(r.m.hg, r.m.ag);
    const pick = [rec.filter(ok).pop(), rec.filter(r => !ok(r)).pop()].filter(Boolean);
    for (const r of pick) {
      const tip = newTip(r.m, r.top.hg, r.top.ag, L("Przykład: typ już rozliczony", "Example: already settled"), { top: [r.top], win: r.probs[0], draw: r.probs[1], loss: r.probs[2] }, true);
      tip.saved = new Date(r.m.date + "T09:00:00").toISOString();
      out.push(tip);
    }
    S.tips = out;
    saveTips();
  }
  function tipLine(m) {
    const t = tipFor(m);
    if (!t) return "";
    const r = tipResult(t);
    const tag = r.done ? (r.exact ? `<span class="tag ok">${L("dokładnie! +3", "exact! +3")}</span>` : r.outcome ? `<span class="tag ok">+1</span>` : `<span class="tag bad">0 ${L("pkt", "pts")}</span>`) : "";
    return `<div class="tipline">★ ${L("Mój typ", "My pick")}: <b>${t.hg}–${t.ag}</b> ${tag}</div>`;
  }
  function tipSectionHtml(m, p) {
    const t = tipFor(m), done = M.played(m);
    if (done || m.live) {
      if (!t) return "";
      const r = tipResult(t);
      return `<h2>${L("Mój typ", "My pick")}</h2><div class="card"><div class="list-row" style="cursor:default"><span class="x">${L("Typowałeś", "You picked")} <b>${t.hg}–${t.ag}</b>${t.note ? ` · ${esc(t.note)}` : ""}</span>
        ${r.done ? (r.exact ? `<span class="tag ok">${L("dokładny wynik · 3 pkt", "exact score · 3 pts")}</span>` : r.outcome ? `<span class="tag ok">${L("trafiony 1X2 · 1 pkt", "correct 1X2 · 1 pt")}</span>` : `<span class="tag bad">0 ${L("pkt", "pts")}</span>`) : `<span class="tag wait">${L("trwa", "in play")}</span>`}</div>
        <div class="row"><button class="btn sec" data-deltip="${t.id}">${L("Usuń typ", "Delete pick")}</button></div></div>`;
    }
    const hg = t ? t.hg : p.top[0].hg, ag = t ? t.ag : p.top[0].ag;
    return `<h2>${L("Mój typ", "My pick")}</h2><form class="card" id="tipForm">
      <div class="two"><div><label>${esc(short(m.home))}</label><input type="number" min="0" max="20" name="hg" value="${hg}" required></div>
      <div><label>${esc(short(m.away))}</label><input type="number" min="0" max="20" name="ag" value="${ag}" required></div></div>
      <label>${L("Notatka (opcjonalnie)", "Note (optional)")}</label><input type="text" name="note" maxlength="120" value="${esc(t?.note || "")}" placeholder="${L("np. bez Saki, gra po LM", "e.g. without Saka, after a CL game")}">
      <div class="row"><button class="btn">${t ? L("Zmień typ", "Change pick") : L("Zapisz mój typ", "Save my pick")}</button>${t ? `<button type="button" class="btn sec" data-deltip="${t.id}">${L("Usuń typ", "Delete pick")}</button>` : ""}
      <span class="small muted">${L(`Model typuje ${p.top[0].hg}–${p.top[0].ag}. Zapisane typy: zakładka Typy → Moje typy.`, `The model picks ${p.top[0].hg}–${p.top[0].ag}. Saved picks: Tips tab → My picks.`)}</span></div></form>`;
  }
  function bindTipForm(m, p) {
    const f = $("#tipForm");
    if (!f) return;
    f.onsubmit = e => {
      e.preventDefault();
      const d = new FormData(f), hg = +d.get("hg"), ag = +d.get("ag"), note = String(d.get("note") || "").trim();
      const old = tipFor(m);
      const tip = newTip(m, hg, ag, note, p, false);
      S.tips = (S.tips || []).filter(t => t !== old);
      S.tips.push(tip);
      saveTips();
      toast(old ? L("Typ zmieniony", "Pick changed") : L("Typ zapisany w Typy → Moje typy", "Pick saved in Tips → My picks"));
      closeSheet(); render();
    };
  }
  function deleteTip(id) {
    const t = (S.tips || []).find(x => x.id === id);
    if (!t) return;
    if (!confirm(t.kind === "bet" ? L(`Usunąć zakład „${t.label}” (${short(t.home)} – ${short(t.away)})?`, `Delete the bet "${t.label}" (${short(t.home)} – ${short(t.away)})?`) : L(`Usunąć typ ${short(t.home)} – ${short(t.away)} (${t.hg}–${t.ag})?`, `Delete the pick ${short(t.home)} – ${short(t.away)} (${t.hg}–${t.ag})?`))) return;
    S.tips = S.tips.filter(x => x.id !== id);
    saveTips(); closeSheet(); render();
  }
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2200);
  }

  /* ---------- na żywo: potwierdzone składy i najnowsze kursy z ESPN (w karcie meczu) ---------- */
  // bez polskich i innych znaków diakrytycznych („ł” nie rozkłada się w NFD, więc osobno)
  const norm = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ø/g, "o").replace(/ß/g, "ss").toLowerCase();
  // kluczowi zawodnicy PL (FPL), których nie ma w pierwszym składzie
  function keyMissing(team, xi) {
    const ps = S.players.filter(p => p.team === team && p.min > 0);
    if (!ps.length) return [];
    const names = xi.map(x => norm(x.n));
    const inXi = p => names.some(n => n === norm(p.full) || n.split(" ").includes(norm(p.n)) || n.endsWith(" " + norm(p.n)) || norm(p.full).includes(n));
    const xgi = ps.reduce((a, p) => a + (p.xg || 0) + (p.xa || 0), 0) || 1, mins = Math.max(...ps.map(p => p.min));
    return ps.map(p => ({ p, share: ((p.xg || 0) + (p.xa || 0)) / xgi, reg: p.min / mins }))
      .filter(x => (x.share >= 0.08 || x.reg >= 0.75) && !inXi(x.p)).sort((a, b) => b.share - a.share || b.reg - a.reg);
  }
  /* Kogo brakuje w składzie (wszystkie ligi z ESPN): ważni zawodnicy sezonu – podstawowi (≥ 60% meczów lidera kadry
     w 1. składzie) albo z dużym udziałem w golach i asystach (≥ 15%) – których nie ma w pierwszej jedenastce. */
  function rosterComp(m, team) {
    const lg = leagueOf(team);
    return lg && D.ESPN_SLUG[lg] ? lg : D.ESPN_SLUG[m.comp] ? m.comp : null;
  }
  function espnMissing(players, l) {
    const xi = new Set(l.xi.map(p => p.id)), bench = new Set(l.bench.map(p => p.id));
    const mx = Math.max(0, ...players.map(p => p.starts)), ga = players.reduce((s, p) => s + p.g + p.a, 0);
    if (mx < 3) return null; // za wcześnie w sezonie, żeby ocenić, kto jest podstawowy
    return players.filter(p => !xi.has(p.id) && (p.starts >= Math.max(3, 0.6 * mx) || p.g + p.a >= Math.max(3, 0.15 * ga)))
      .sort((a, b) => (b.g + b.a) - (a.g + a.a) || b.starts - a.starts)
      .map(p => ({ ...p, onBench: bench.has(p.id) }));
  }
  function fillMissing(m, x) {
    for (const side of ["home", "away"]) {
      const el = $(`#miss-${side}`), l = x.lineups.find(r => r.side === side);
      if (!el || !l) continue;
      const team = side === "home" ? m.home : m.away, comp = rosterComp(m, team);
      if (!comp) { el.remove(); continue; }
      D.loadRoster(comp, S.teams[team].id).then(ps => {
        if (S.sheetId !== m.id || !document.body.contains(el)) return;
        const miss = espnMissing(ps, l);
        if (miss === null) { el.remove(); return; }
        const desc = p => [p.starts ? `${p.starts} ${plural(p.starts, "mecz", "mecze", "meczów", "start", "starts")}${L(" w 1. składzie", "")}` : "", p.g ? `${p.g} ${plural(p.g, "gol", "gole", "goli", "goal", "goals")}` : "", p.a ? `${p.a} ${plural(p.a, "asysta", "asysty", "asyst", "assist", "assists")}` : ""].filter(Boolean).join(", ");
        el.innerHTML = miss.length
          ? `<span class="tag wait">${L("brakuje ważnych zawodników", "key players missing")}</span> ${miss.slice(0, 5).map(p => `<b>${esc(p.n)}</b> – ${p.onBench ? L("na ławce", "on the bench") : L("poza kadrą meczową", "not in the squad")} (${desc(p)})`).join("; ")}
             <div class="muted" style="margin-top:4px">${L(`„Poza kadrą meczową” zwykle oznacza kontuzję lub zawieszenie. Statystyki z ${esc(compName(comp))} w tym sezonie.`, `"Not in the squad" usually means injury or suspension. Stats from this season's ${esc(compName(comp))}.`)}</div>`
          : `<span class="muted">${L("W pierwszym składzie są wszyscy podstawowi zawodnicy i najlepsi strzelcy.", "All regular starters and top scorers are in the starting XI.")}</span>`;
      }).catch(() => el.remove());
    }
  }
  function liveHtml(m, p, x) {
    let h = "";
    if (x.lineups.length) {
      h += `<h2>${L("Potwierdzone składy", "Confirmed line-ups")}</h2>`;
      for (const side of ["home", "away"]) {
        const l = x.lineups.find(r => r.side === side); if (!l) continue;
        const team = side === "home" ? m.home : m.away, miss = m.comp === "PL" ? keyMissing(team, l.xi) : [];
        const espnMiss = m.comp !== "PL" && S.teams[team]?.id ? `<div class="small" id="miss-${side}" style="margin-top:6px"><span class="muted">${L("Sprawdzam, kogo brakuje w składzie…", "Checking who is missing…")}</span></div>` : "";
        h += `<div class="card"><div class="list-row" style="cursor:default">${badge(team)}<b class="x">${esc(short(team))}</b><span class="small muted">${esc(l.formation)}</span></div>
          <p class="small" style="margin:6px 0 0">${l.xi.map(z => esc(z.n)).join(", ")}</p>
          ${miss.length ? `<p class="small" style="margin:6px 0 0"><span class="tag wait">${L("poza pierwszym składem", "not starting")}</span> ${miss.slice(0, 5).map(z => `${esc(z.p.n)}${z.share >= 0.08 ? ` (${pct(z.share)} ${L("xG+xA drużyny", "of team xG+xA")})` : ""}`).join(", ")}</p>` : ""}${espnMiss}</div>`;
      }
    } else h += `<div class="card small muted">${L("Składy jeszcze nieogłoszone – zwykle pojawiają się ok. godzinę przed meczem.", "Line-ups not announced yet – they usually appear about an hour before kick-off.")}</div>`;
    const o = x.odds;
    if (o) {
      const total = (p.model || p).xg.home + (p.model || p).xg.away, f = M.fromOdds(o, { total });
      const was = m.odds, moved = was && Math.max(Math.abs(1 / was.h - 1 / o.h), Math.abs(1 / was.a - 1 / o.a)) >= 0.03;
      h += `<h2>${L("Najnowsze kursy", "Latest odds")} (${esc(o.book || "ESPN")})</h2><div class="card small">
        <div>1 <b>${fx(o.h)}</b> · X <b>${fx(o.d)}</b> · 2 <b>${fx(o.a)}</b>${o.open?.h ? `<span class="muted"> · ${L("na otwarciu", "opening")} ${fx(o.open.h)} / ${fx(o.open.d)} / ${fx(o.open.a)}</span>` : ""}</div>
        ${f ? `<div style="margin-top:6px">${L("Prognoza z nich", "Forecast from them")}: 1 <b>${pct(f.win)}</b> · X <b>${pct(f.draw)}</b> · 2 <b>${pct(f.loss)}</b> · ${L("typ", "pick")} ${f.top[0].hg}–${f.top[0].ag}</div>` : ""}
        <p class="muted" style="margin-bottom:0">${x.lineups.length ? L("Kursy po ogłoszeniu składów już je uwzględniają – to najświeższa prognoza.", "Odds after the line-ups are announced already reflect them – this is the freshest forecast.") : L("Pobrane przed chwilą.", "Just fetched.")}${moved ? ` <span class="tag wait">${L("kursy wyraźnie się zmieniły", "odds have moved clearly")}</span> ${L("od ostatniego odświeżenia danych", "since the last data refresh")} (${esc(was.book || "")} 1 ${fx(was.h)} · X ${fx(was.d)} · 2 ${fx(was.a)}).` : ""}</p></div>`;
    }
    return h;
  }

  /* ---------- opis prognozy: dlaczego ten faworyt (tylko z danych, które ma aplikacja) ---------- */
  function seasonTable(comp) {
    S._tbl = S._tbl || {};
    return S._tbl[comp] || (S._tbl[comp] = M.table(S.matches.filter(m => m.comp === comp && m.season === curSeason())));
  }
  const num1 = x => dec(x.toFixed(1));
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  // odmiana: polska (1 / 2–4 / 5+) albo angielska (1 / więcej)
  const plural = (n, a, b, c, e1, e2) => LANG === "en" ? (n === 1 ? e1 : e2) : n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;
  const winsTxt = n => `${n} ${plural(n, "zwycięstwo", "zwycięstwa", "zwycięstw", "win", "wins")}`;
  function explain(m) {
    S._expl = S._expl || new Map();
    if (S._expl.has(m.id)) return S._expl.get(m.id);
    const p = pred(m), H = m.home, A = m.away, pr = [p.win, p.draw, p.loss], i = pr.indexOf(Math.max(...pr));
    const fav = pr[i] >= 0.42 && i !== 1 ? (i === 0 ? H : A) : null, und = fav === H ? A : fav === A ? H : null;
    const R = []; // { team: za kim przemawia, w: waga, tag: krótko, t: zdanie }
    const add = (team, w, tag, t) => R.push({ team, w, tag, t });
    const other = t => t === H ? A : H;
    // tabela (ta sama liga, bieżący sezon)
    const lg = !isCup(m.comp) ? m.comp : null;
    if (lg) {
      const tb = seasonTable(lg), rh = tb.findIndex(r => r.team === H), ra = tb.findIndex(r => r.team === A);
      if (rh >= 0 && ra >= 0 && tb[rh].p >= 3 && Math.abs(rh - ra) >= 3) {
        const [b, w] = rh < ra ? [rh, ra] : [ra, rh];
        add(tb[b].team, Math.min(3, (w - b) / 4), L("wyżej w tabeli", "higher in the table"), L(`${short(tb[b].team)} jest ${b + 1}. w tabeli (${tb[b].pts} pkt), ${short(tb[w].team)} – ${w + 1}. (${tb[w].pts} pkt).`, `${short(tb[b].team)} are ${ord(b + 1)} in the table (${tb[b].pts} pts), ${short(tb[w].team)} ${ord(w + 1)} (${tb[w].pts} pts).`));
      }
      // bilans u siebie / na wyjeździe w tym sezonie
      const rec = (t, home) => { const ms = S.matches.filter(x => x.comp === lg && x.season === curSeason() && M.played(x) && (home ? x.home === t : x.away === t));
        const w = ms.filter(x => home ? x.hg > x.ag : x.ag > x.hg).length, l = ms.filter(x => home ? x.hg < x.ag : x.ag < x.hg).length; return { n: ms.length, w, d: ms.length - w - l, l }; };
      const hh = rec(H, true), aa = rec(A, false);
      if (hh.n >= 3 && hh.w / hh.n >= 0.6) add(H, 1.2, L("mocny u siebie", "strong at home"), L(`${short(H)} u siebie: ${winsTxt(hh.w)} w ${hh.n} meczach tego sezonu (${hh.w}-${hh.d}-${hh.l}).`, `${short(H)} at home: ${winsTxt(hh.w)} in ${hh.n} games this season (${hh.w}-${hh.d}-${hh.l}).`));
      else if (hh.n >= 4 && hh.w / hh.n <= 0.2) add(A, 1, L("słaby gospodarz", "weak at home"), L(`${short(H)} u siebie ma tylko ${winsTxt(hh.w)} w ${hh.n} meczach (${hh.w}-${hh.d}-${hh.l}).`, `${short(H)} have only ${winsTxt(hh.w)} in ${hh.n} home games (${hh.w}-${hh.d}-${hh.l}).`));
      if (aa.n >= 3 && aa.w / aa.n >= 0.5) add(A, 1.2, L("mocny na wyjazdach", "strong away"), L(`${short(A)} na wyjazdach: ${winsTxt(aa.w)} w ${aa.n} meczach (${aa.w}-${aa.d}-${aa.l}).`, `${short(A)} away: ${winsTxt(aa.w)} in ${aa.n} games (${aa.w}-${aa.d}-${aa.l}).`));
      else if (aa.n >= 4 && aa.w / aa.n <= 0.15) add(H, 1, L("słaby na wyjazdach", "weak away"), L(`${short(A)} na wyjazdach ma tylko ${winsTxt(aa.w)} w ${aa.n} meczach (${aa.w}-${aa.d}-${aa.l}).`, `${short(A)} have only ${winsTxt(aa.w)} in ${aa.n} away games (${aa.w}-${aa.d}-${aa.l}).`));
      // siła ataku i obrony według modelu (miejsce w lidze)
      const mdl = modelFor(lg), ts = teamsOf(lg, curSeason()).filter(t => t in mdl.att), n = ts.length;
      if (n >= 10) for (const t of [H, A]) {
        if (!(t in mdl.att)) continue;
        const ra2 = ts.slice().sort((x, y) => mdl.att[y] - mdl.att[x]).indexOf(t) + 1, rd = ts.slice().sort((x, y) => mdl.def[y] - mdl.def[x]).indexOf(t) + 1;
        const gf = Math.exp(mdl.mu + mdl.att[t] + mdl.home / 2), ga = Math.exp(mdl.mu - mdl.def[t] + mdl.home / 2);
        if (ra2 <= 3) add(t, 1.4 - ra2 * 0.2, L("mocny atak", "strong attack"), L(`${short(t)} ma ${ra2}. atak ligi według modelu (ok. ${num1(gf)} gola na mecz).`, `${short(t)} have the ${ord(ra2)} best attack in the league according to the model (about ${num1(gf)} goals per game).`));
        if (rd <= 3) add(t, 1.4 - rd * 0.2, L("szczelna obrona", "solid defence"), L(`${short(t)} ma ${rd}. obronę ligi według modelu (ok. ${num1(ga)} straconego gola na mecz).`, `${short(t)} have the ${ord(rd)} best defence in the league according to the model (about ${num1(ga)} goals conceded per game).`));
        if (ra2 > n - 3) add(other(t), 0.8, L("słaby atak rywala", "opponent's weak attack"), L(`${short(t)} ma jeden z najsłabszych ataków ligi (${ra2}. z ${n}).`, `${short(t)} have one of the weakest attacks in the league (${ord(ra2)} of ${n}).`));
        if (rd > n - 3) add(other(t), 0.8, L("słaba obrona rywala", "opponent's weak defence"), L(`${short(t)} ma jedną z najsłabszych obron ligi (${rd}. z ${n}).`, `${short(t)} have one of the weakest defences in the league (${ord(rd)} of ${n}).`));
      }
    }
    // forma: ostatnie 5 meczów we wszystkich rozgrywkach
    const fm = t => { const f = formOf(t, 5); const c = k => f.filter(x => x.r === k).length; return { n: f.length, w: c("W"), d: c("R"), l: c("P"), pts: c("W") * 3 + c("R") }; };
    const fh = fm(H), fa = fm(A);
    if (fh.n >= 4 && fa.n >= 4 && Math.abs(fh.pts - fa.pts) >= 4) {
      const [b, bf, w, wf] = fh.pts > fa.pts ? [H, fh, A, fa] : [A, fa, H, fh];
      add(b, Math.min(2.5, Math.abs(fh.pts - fa.pts) / 3), L("lepsza forma", "better form"), L(`Forma z 5 ostatnich meczów: ${short(b)} ${bf.w}W ${bf.d}R ${bf.l}P, ${short(w)} ${wf.w}W ${wf.d}R ${wf.l}P.`, `Form in the last 5 games: ${short(b)} ${bf.w}W ${bf.d}D ${bf.l}L, ${short(w)} ${wf.w}W ${wf.d}D ${wf.l}L.`));
    }
    // gole a xG (ostatnie mecze z xG): czy wyniki są „na kredyt”
    for (const t of [H, A]) {
      const xs = S.matches.filter(x => M.played(x) && x.xhg !== undefined && (x.home === t || x.away === t)).slice(-8);
      if (xs.length < 5) continue;
      const g = xs.reduce((s, x) => s + (x.home === t ? x.hg : x.ag), 0), xg = xs.reduce((s, x) => s + (x.home === t ? x.xhg : x.xag), 0), d = g - xg;
      if (d >= 3) add(other(t), 0.7, L("rywal strzela ponad stan", "opponent overperforming"), L(`${short(t)} strzela więcej, niż wskazują sytuacje: ${g} goli przy xG ${num1(xg)} w ${xs.length} ostatnich meczach – taka skuteczność zwykle nie trwa.`, `${short(t)} are scoring more than their chances suggest: ${g} goals from ${num1(xg)} xG in the last ${xs.length} games – such finishing rarely lasts.`));
      else if (d <= -3) add(t, 0.7, L("pech pod bramką", "unlucky in front of goal"), L(`${short(t)} strzela mniej, niż wskazują sytuacje: ${g} goli przy xG ${num1(xg)} w ${xs.length} ostatnich meczach – gra lepiej, niż mówią wyniki.`, `${short(t)} are scoring less than their chances suggest: ${g} goals from ${num1(xg)} xG in the last ${xs.length} games – they play better than results show.`));
    }
    // nieobecni (PL) i zmęczenie
    if (injAdj(m)) for (const t of [H, A]) {
      const k = (absences(t)?.list || []).filter(x => x.weight > 0.06).map(x => x.p.n);
      if (k.length) add(other(t), Math.min(2, k.length * 0.6), L("kontuzje rywala", "opponent's injuries"), L(`${short(t)} bez ważnych zawodników: ${k.slice(0, 3).join(", ")}${k.length > 3 ? ` i ${k.length - 3} innych` : ""}.`, `${short(t)} without key players: ${k.slice(0, 3).join(", ")}${k.length > 3 ? ` and ${k.length - 3} more` : ""}.`));
    }
    const fa2 = fatAdj(m), rs = S.rest.get(m.id);
    if (fa2 && rs) { const tired = fa2.home.att ? H : A; add(other(tired), 0.8, L("zmęczony rywal", "tired opponent"), L(`${short(tired)} gra po ${tired === H ? rs.h : rs.a} dniach przerwy, a rywal odpoczywał ${tired === H ? rs.a : rs.h} dni.`, `${short(tired)} play after ${tired === H ? rs.h : rs.a} days' rest, the opponent had ${tired === H ? rs.a : rs.h} days.`)); }
    // przewaga własnego boiska
    if (!m.neutral && fav === H) add(H, 0.6, L("gra u siebie", "home advantage"), L(`${short(H)} gra u siebie – gospodarze w tych rozgrywkach strzelają średnio ok. ${Math.round((Math.exp(modelFor(m.comp).home) - 1) * 100)}% więcej goli.`, `${short(H)} play at home – home teams in this competition score about ${Math.round((Math.exp(modelFor(m.comp).home) - 1) * 100)}% more goals on average.`));
    // bezpośrednie mecze (2 sezony)
    const h2h = S.matches.filter(x => M.played(x) && ((x.home === H && x.away === A) || (x.home === A && x.away === H))).slice(-5);
    if (h2h.length >= 3) {
      const wins = t => h2h.filter(x => (x.home === t ? x.hg > x.ag : x.ag > x.hg)).length, wh = wins(H), wa = wins(A);
      if (Math.abs(wh - wa) >= 2) { const b = wh > wa ? H : A; add(b, 0.5, L("bilans bezpośredni", "head-to-head record"), L(`Ostatnie ${h2h.length} spotkania: ${short(b)} ${Math.max(wh, wa)} wygranych, ${short(other(b))} ${Math.min(wh, wa)}.`, `Last ${h2h.length} meetings: ${short(b)} ${Math.max(wh, wa)} wins, ${short(other(b))} ${Math.min(wh, wa)}.`)); }
    }
    // ranking Elo (siła z wyników, wszystkie rozgrywki) – główny argument zwłaszcza w pucharach
    const eh = S.elo.ratings[H], ea = S.elo.ratings[A];
    if (eh && ea && Math.abs(eh - ea) >= 80) { const b = eh > ea ? H : A;
      add(b, Math.min(2.5, Math.abs(eh - ea) / 100), L("silniejszy wg rankingu", "higher rated"), L(`Ranking Elo (siła z wyników 2 sezonów): ${short(H)} ${Math.round(eh)}, ${short(A)} ${Math.round(ea)} – różnica ${Math.round(Math.abs(eh - ea))} pkt na korzyść ${short(b)}.`, `Elo rating (strength from 2 seasons of results): ${short(H)} ${Math.round(eh)}, ${short(A)} ${Math.round(ea)} – a ${Math.round(Math.abs(eh - ea))}-point gap in favour of ${short(b)}.`)); }
    // model a rynek
    const pm = p.model;
    if (pm) {
      const dh = pm.win - p.win, da = pm.loss - p.loss;
      if (Math.max(Math.abs(dh), Math.abs(da)) >= 0.1) { const t = Math.abs(dh) >= Math.abs(da) ? (dh > 0 ? H : A) : (da > 0 ? A : H);
        add(t, 0.4, "model", L(`Sam model daje ${short(t)} więcej szans (${pct(t === H ? pm.win : pm.loss)} zamiast ${pct(t === H ? p.win : p.loss)}) – ale rynek zwykle wie więcej, np. o składach.`, `The model alone gives ${short(t)} a better chance (${pct(t === H ? pm.win : pm.loss)} instead of ${pct(t === H ? p.win : p.loss)}) – but the market usually knows more, e.g. about line-ups.`)); }
    }
    // przewaga w oczekiwanych golach według modelu (siła ataku i obrony, także w pucharach)
    const mx = (p.model || p).xg;
    if (mx && mx.home > 0 && mx.away > 0) { const r = mx.home / mx.away;
      if (r >= 1.5 || r <= 1 / 1.5) { const b = r > 1 ? H : A;
        add(b, Math.min(2.6, Math.abs(Math.log(r)) * 1.6), L("dużo silniejszy", "much stronger"), L(`Model spodziewa się wyraźnej przewagi ${short(b)}: oczekiwane gole ${num1(mx.home)} : ${num1(mx.away)} (z siły ataku i obrony obu drużyn w ostatnich meczach).`, `The model expects ${short(b)} to dominate: expected goals ${num1(mx.home)} : ${num1(mx.away)} (from both teams' recent attacking and defensive strength).`)); } }
    // faworyt bez innych argumentów: zdanie rynku
    if (fav && p.src && !R.some(r => r.team === fav && r.w >= 0.6)) add(fav, 0.9, L("kursy bukmacherów", "bookmaker odds"), L(`Bukmacherzy (${p.book}) wyraźnie stawiają na ${short(fav)} – kursy uwzględniają też składy i wiadomości, których model nie zna.`, `Bookmakers (${p.book}) clearly back ${short(fav)} – odds also reflect line-ups and news the model does not know.`));
    R.sort((x, y) => y.w - x.w);
    let head;
    if (!fav) head = i === 1 ? L(`Wyrównany mecz – najbardziej prawdopodobny jest remis (${pct(p.draw)}).`, `Close match – a draw is the most likely result (${pct(p.draw)}).`) : L(`Wyrównany mecz – minimalnie bliżej ${short(i === 0 ? H : A)} (${pct(pr[i])}).`, `Close match – slightly in favour of ${short(i === 0 ? H : A)} (${pct(pr[i])}).`);
    else head = L(`${pr[i] >= 0.6 ? "Wyraźny faworyt" : "Lekki faworyt"}: ${short(fav)} – ${pct(pr[i])} szans na wygraną.`, `${pr[i] >= 0.6 ? "Clear favourite" : "Slight favourite"}: ${short(fav)} – ${pct(pr[i])} chance to win.`);
    // bez wyraźnego faworyta: argumenty grupowane według drużyn (najpierw ta, której daje się więcej szans)
    const first = fav || (p.win >= p.loss ? H : A), second = other(first);
    const pro = R.filter(r => r.team === first), con = R.filter(r => r.team === second);
    const res = { head, fav, first, second, pro, con, src: p.src ? p.book : null, p };
    S._expl.set(m.id, res);
    return res;
  }
  function explainLine(m) {
    const e = explain(m), tags = [...new Set(e.pro.slice(0, 2).map(r => r.tag))];
    return `<div class="why small">${esc(e.head)}${e.fav && tags.length ? ` ${L("Dlaczego", "Why")}: ${esc(tags.join(", "))}.` : ""}</div>`;
  }
  function explainHtml(m) {
    const e = explain(m), li = rs => rs.slice(0, 5).map(r => `<li>${esc(r.t)}</li>`).join("");
    const pf = Math.max(e.p.win, e.p.loss);
    return `<h2>${L("Dlaczego taka prognoza?", "Why this forecast?")}</h2><div class="card small why-card">
      <p style="margin-top:0"><b>${esc(e.head)}</b></p>
      ${e.pro.length ? `<p class="why-h">${L("Na korzyść:", "In favour of")} ${esc(short(e.first))}</p><ul>${li(e.pro)}</ul>` : ""}
      ${e.con.length ? `<p class="why-h">${L("Na korzyść:", "In favour of")} ${esc(short(e.second))}</p><ul>${li(e.con)}</ul>` : ""}
      ${!e.pro.length && !e.con.length ? `<p>${L("Brak wyraźnych różnic w tabeli, formie i sile drużyn.", "No clear differences in table position, form or strength.")}</p>` : ""}
      <p class="muted" style="margin-bottom:0">${e.src ? L(`Procenty pochodzą z kursów ${esc(e.src)} (bez marży) – rynek uwzględnia też składy i wiadomości, więc bywa trafniejszy niż powyższe liczby. `, `The percentages come from ${esc(e.src)} odds (margin removed) – the market also reflects line-ups and news, so it can be more accurate than the figures above. `) : L("Procenty pochodzą z modelu statystycznego (brak kursów). ", "The percentages come from the statistical model (no odds available). ")}${e.fav ? L(`Faworyt z ${pct(pf)} nie wygrywa średnio w ${Math.round((1 - pf) * 10)} meczach na 10.`, `A ${pct(pf)} favourite fails to win about ${Math.round((1 - pf) * 10)} times in 10.`) : L("W takim meczu każdy wynik jest realny – żadna drużyna nie ma nawet 45% szans.", "Any result is realistic here – neither team has even a 45% chance.")}</p></div>`;
  }

  /* ---------- kursy i zakłady ---------- */
  const STAKE = 10; // przykładowa stawka w funtach (£) do liczenia bilansu
  const money = x => `£${fx(Math.abs(x))}`;
  const fx = x => dec(x.toFixed(2));
  function mlabel(k, m) {
    const H = short(m.home), A = short(m.away);
    return (LANG === "en"
      ? { "1": `${H} win`, X: "Draw", "2": `${A} win`, "1X": `${H} win or draw`, X2: `${A} win or draw`, "12": `${H} or ${A} wins (no draw)`,
        "O1.5": "Over 1.5 goals", "U1.5": "Under 1.5 goals", "O2.5": "Over 2.5 goals", "U2.5": "Under 2.5 goals",
        "O3.5": "Over 3.5 goals", "U3.5": "Under 3.5 goals", BTTS: "Both teams to score", NBTTS: "Not both to score" }
      : { "1": `Wygrana ${H}`, X: "Remis", "2": `Wygrana ${A}`, "1X": `${H} wygra lub remis`, X2: `${A} wygra lub remis`, "12": `Wygra ${H} albo ${A} (bez remisu)`,
        "O1.5": "Powyżej 1,5 gola", "U1.5": "Poniżej 1,5 gola", "O2.5": "Powyżej 2,5 gola", "U2.5": "Poniżej 2,5 gola",
        "O3.5": "Powyżej 3,5 gola", "U3.5": "Poniżej 3,5 gola", BTTS: "Obie drużyny strzelą", NBTTS: "Nie obie strzelą" })[k] || k;
  }
  // kurs bukmachera na rynek: 1X2 i gole wprost, podwójna szansa – wyliczona z 1X2 (≈)
  function bookOdds(m, k) {
    const o = m.odds;
    if (!o) return null;
    // podwójna szansa: szansa po zdjęciu marży z 1X2 plus marża rynku podwójnej szansy – podobna łączna marża,
    // ale rozłożona na zdarzenia o sumie szans 2, więc na każde przypada jej połowa (zwykłe sumowanie kursów zawyża ją)
    const s = 1 / o.h + 1 / o.d + 1 / o.a;
    const dc = (a, b) => ({ v: Math.max(1.01, Math.round(100 / ((1 / a + 1 / b) / s * (1 + (s - 1) / 2))) / 100), approx: true });
    switch (k) {
      case "1": return { v: o.h }; case "X": return { v: o.d }; case "2": return { v: o.a };
      case "1X": return dc(o.h, o.d); case "X2": return dc(o.a, o.d); case "12": return dc(o.h, o.a);
    }
    const g = k.match(/^([OU])(\d\.5)$/);
    if (g && o.line === +g[2]) return { v: g[1] === "O" ? o.over : o.under };
    return null;
  }
  // marża bukmachera i prawdopodobieństwa z kursów (po zdjęciu marży)
  function implied(o) {
    const s = 1 / o.h + 1 / o.d + 1 / o.a;
    return { h: 1 / o.h / s, d: 1 / o.d / s, a: 1 / o.a / s, margin: s - 1 };
  }
  // szansa według bukmachera (po zdjęciu marży) dla rynku, gdy da się ją policzyć z kursów
  function marketProb(m, k) {
    const o = m.odds;
    if (!o?.h || !o.d || !o.a) return null;
    const i = implied(o);
    const v = { "1": i.h, X: i.d, "2": i.a, "1X": i.h + i.d, X2: i.a + i.d, "12": i.h + i.a }[k];
    if (v !== undefined) return v;
    const g = k.match(/^([OU])(\d\.5)$/);
    if (g && o.line === +g[2] && o.over && o.under) { const s = 1 / o.over + 1 / o.under; return (g[1] === "O" ? 1 / o.over : 1 / o.under) / s; }
    return null;
  }
  // kandydaci: najpewniejszy rozsądny zakład z każdego meczu (65–87% – wyżej kursy są za niskie, żeby miało to sens)
  function betCandidates(days) {
    const t = today(), end = addDays(t, days);
    const out = [];
    for (const m of S.matches) {
      if (M.played(m) || m.live || m.date < t || m.date > end) continue;
      const pp = pred(m), mk = M.markets(pp), mm = pp.model ? M.markets(pp.model) : null;
      const best = Object.entries(mk).filter(([, p]) => p >= 0.65 && p <= 0.87).sort((a, b) => b[1] - a[1])[0];
      if (best) { const bo = bookOdds(m, best[0]); out.push({ m, k: best[0], p: best[1], src: pp.src, pm: mm?.[best[0]], book: bo, edge: bo ? best[1] * bo.v - 1 : null }); }
    }
    return out.sort((a, b) => b.p - a.p);
  }
  // okazje: rynki z kursem bukmachera, gdzie model daje wyraźnie więcej niż kurs
  function valueBets(days) {
    const t = today(), end = addDays(t, days), out = [];
    for (const m of S.matches) {
      if (M.played(m) || m.live || m.date < t || m.date > end || !m.odds) continue;
      const mdl = modelFor(m.comp);
      if ((mdl.games[m.home] || 0) < 8 || (mdl.games[m.away] || 0) < 8) continue; // za mało danych o klubie
      const mk = M.markets(modelPred(m));
      for (const k of ["1", "X", "2", "O2.5", "U2.5"]) {
        const bo = bookOdds(m, k);
        if (!bo?.v) continue;
        const edge = mk[k] * bo.v - 1;
        if (edge >= 0.08 && edge <= 0.35 && mk[k] >= 0.3) out.push({ m, k, p: mk[k], book: bo, edge });
      }
    }
    return out.sort((a, b) => b.edge - a.edge);
  }
  function oddsTag(x) {
    if (!x.book) return `<span class="small muted">${L("brak kursu bukmachera", "no bookmaker odds")}</span>`;
    const e = x.edge, kurs = `<span class="small">${L("kurs", "odds")} ${x.book.approx ? "≈" : ""}<b>${fx(x.book.v)}</b></span>`;
    if (x.src) return `${kurs} <span class="tag ex">${e < -0.005 ? L(`marża w kursie ok. ${pct(-e)}`, `margin in the odds about ${pct(-e)}`) : L("kurs uczciwy", "fair odds")}</span>`;
    return `${kurs} ${e > 0.35 ? `<span class="tag wait">${L("duża rozbieżność z rynkiem", "big gap to the market")}</span>` : e >= 0.05 ? `<span class="tag ex">${L(`model +${pct(e)} ponad kurs`, `model +${pct(e)} above the odds`)}</span>` : e <= -0.05 ? `<span class="tag bad">${L("kurs poniżej szans", "odds below the chance")}</span>` : `<span class="tag ex">${L("kurs uczciwy", "fair odds")}</span>`}`;
  }
  function betRow(x, i) {
    const m = x.m, saved = betsFor(m).some(b => b.market === x.k), mp = marketProb(m, x.k);
    return `<div class="card bet">
      <div class="m-meta"><span>${compTag(m.comp)}</span><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="list-row bteams" data-match="${esc(m.id)}" style="border:0;padding:4px 0">${badge(m.home)}<b>${esc(short(m.home))}</b><span class="muted">–</span><b>${esc(short(m.away))}</b>${badge(m.away)}</div>
      <div class="betline"><div><div class="bmk">${esc(mlabel(x.k, m))}</div><div class="small muted">${x.src ? `${L("szansa z kursów", "chance from odds")}${x.pm !== undefined ? ` · ${L("wg modelu", "model")} ${pct(x.pm)}` : ""}` : `${L("szansa wg modelu", "model's chance")}${mp !== null ? ` · ${L("wg bukmachera", "bookmaker")} <b>${pct(mp)}</b>` : ""}`} · ${L("kurs uczciwy", "fair odds")} ${fx(1 / x.p)}</div></div><div class="bp">${pct(x.p)}<small>${L("szansa, że zakład wejdzie", "chance the bet wins")}</small></div></div>
      <div class="tipfoot">${oddsTag(x)}<button class="btn sec small-btn" data-savebet="${i}"${saved ? " disabled" : ""}>${saved ? L("Zapisany", "Saved") : L("Zapisz", "Save")}</button></div></div>`;
  }
  function viewBets() {
    const days = S.betDays;
    const cands = betCandidates(days), top = cands.slice(0, 10);
    const ako = []; for (const x of cands) { if (ako.length < 3 && !ako.some(y => y.m === x.m)) ako.push(x); }
    const akoP = ako.reduce((s, x) => s * x.p, 1), akoO = ako.reduce((s, x) => s * (x.book?.v || 1 / x.p), 1);
    const val = valueBets(days).slice(0, 8);
    S._betList = [...top, ...val];
    const help = `<a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a>`, gs = `<a href="https://www.gamstop.co.uk" target="_blank" rel="noopener">GAMSTOP</a>`;
    let h = `<div class="card warn small">${L(`<b>18+ · Zakłady to ryzyko.</b> Nawet zakład z szansą 80% przegrywa średnio co piąty raz, a bukmacher ma w kursach marżę (ok. 5–8%). W Wielkiej Brytanii graj tylko u bukmacherów z licencją UK Gambling Commission. Propozycje to przykłady z modelu, nie pewniaki – w teście na rozegranych meczach żadna z tych metod nie dawała zysku na kursach bet365 (wyniki niżej, w „Czy model mówi prawdę?”). Pomoc: ${help}, samowykluczenie: ${gs}.`,
        `<b>18+ · Betting is risky.</b> Even a bet with an 80% chance loses about one time in five, and bookmakers build a margin into the odds (about 5–8%). In the UK, only bet with operators licensed by the UK Gambling Commission. These are examples from the model, not sure things – in a test on played matches none of these methods made a profit at bet365 odds (results below, in "Is the model telling the truth?"). Help: ${help}, self-exclusion: ${gs}.`)}</div>
      <div class="chips">${[[1, L("Dziś i jutro", "Today and tomorrow")], [3, L("3 dni", "3 days")], [7, L("7 dni", "7 days")]].map(([d, l]) => `<button class="chip${days === d ? " on" : ""}" data-betdays="${d}">${l}</button>`).join("")}</div>
      <h2>${L(`Najpewniejsze zakłady (${cands.length} meczów)`, `Safest bets (${cands.length} matches)`)}</h2><div class="small muted" style="margin:-2px 2px 8px">${L("Szanse z kursów bukmachera, gdy są (trafniejsze), w innym wypadku z modelu. W teście takie zakłady z kursów wchodziły w 80,9% przypadków przy zapowiadanych 80,4%.", "Chances from bookmaker odds when available (more accurate), otherwise from the model. In testing, such bets from odds won 80.9% of the time against a predicted 80.4%.")}</div>`;
    h += top.length ? top.map((x, i) => betRow(x, i)).join("") : `<div class="card empty">${L("Brak meczów w tym okresie.", "No matches in this period.")}</div>`;
    if (ako.length === 3) {
      h += `<h2>${L("Przykładowy kupon – 3 najpewniejsze", "Example accumulator – the 3 safest")}</h2><div class="card">${ako.map(x => `<div class="list-row" data-match="${esc(x.m.id)}"><span class="x"><b>${esc(mlabel(x.k, x.m))}</b><br><span class="small muted">${esc(short(x.m.home))} – ${esc(short(x.m.away))} · ${fmtDate(x.m.date, false)}</span></span><span class="s">${pct(x.p)}</span></div>`).join("")}
        <div class="stats"><div class="stat"><b>${pct(akoP)}</b><span>${L("szansa, że wejdą wszystkie 3", "chance all 3 win")}</span></div><div class="stat"><b>${fx(akoO)}</b><span>${L("kurs łączny", "combined odds")}${ako.some(x => !x.book) ? L(" (część uczciwa)", " (partly fair odds)") : ""}</span></div><div class="stat"><b>${money(akoO * STAKE)}</b><span>${L("wypłata ze stawki", "return on a stake of")} ${money(STAKE)}</span></div></div>
        <p class="small muted" style="margin-bottom:0">${L("W teście na rozegranych meczach takie kupony (3 najpewniejsze zakłady z jednego dnia, szanse z kursów) wchodziły w ok. 61% przypadków przy zapowiadanych 59%; z samego modelu – 53% przy zapowiadanych 59% – każde dodatkowe zdarzenie mnoży ryzyko.", "In a test on played matches such accumulators (the 3 safest bets of a day, chances from odds) won about 61% of the time against a predicted 59%; from the model alone – 53% against 59%. Every extra selection multiplies the risk.")}</p></div>`;
    }
    const nRoi = S.calib?.roi ? S.calib.roi.n : L("ok. 3500", "about 3,500"), loss = S.calib?.roi?.B.n ? pct(-(S.calib.roi.B.ret / S.calib.roi.B.n - 1), 1) : L("ok. 11%", "about 11%");
    h += `<h2>${L("Okazje według modelu", "Model value picks")}</h2><div class="small muted" style="margin:-2px 2px 8px">${L(`Zakłady, w których model daje wyraźnie więcej szans niż wynika z kursu (przewaga 8–35%, tylko kluby z co najmniej 8 meczami w danych). Na ${nRoi} rozegranych meczach z kursami bet365 takie zakłady przynosiły <b>stratę ${loss}</b> – bukmacher zna składy i wiadomości, a jego kursy są trafniejsze niż model. To ciekawostka, nie przepis na zysk.`, `Bets where the model gives a clearly higher chance than the odds imply (edge 8–35%, only clubs with at least 8 matches in the data). On ${nRoi} played matches with bet365 odds such bets produced a <b>loss of ${loss}</b> – the bookmaker knows line-ups and news, and its odds are more accurate than the model. A curiosity, not a recipe for profit.`)}</div>`;
    h += val.length ? val.map((x, i) => betRow(x, top.length + i)).join("") : `<div class="card empty">${L("Brak wyraźnych okazji w tym okresie.", "No clear value picks in this period.")}</div>`;
    h += `<h2>${L("Czy model mówi prawdę?", "Is the model telling the truth?")}</h2><div class="card small" id="calib">${S.calib ? calibHtml(S.calib) : `<p style="margin-top:0">${L("Sprawdź na rozegranych meczach, jak często zakłady wchodziły w porównaniu z szansą podaną przez model.", "Check on played matches how often bets won compared with the chance the model gave.")}</p><button class="btn" id="calibBtn">${L("Sprawdź, także na prawdziwych kursach (kilka sekund)", "Check, including real odds (a few seconds)")}</button>`}</div>`;
    return h;
  }
  function computeCalib() {
    const bins = Array.from({ length: 10 }, () => ({ n: 0, w: 0, p: 0 }));
    let bn = 0, bw = 0, bp = 0;
    // zwrot na prawdziwych kursach (bet365 z football-data, w pucharach – zapisane kursy ESPN): stała stawka, wynik po 90 min
    const st = () => ({ n: 0, w: 0, ret: 0 });
    const roi = { n: 0, A: st(), B: st(), F: st(), K: st(), mBr: 0, bBr: 0, mHit: 0, bHit: 0, books: new Set(), from: null };
    const bet = (s, ok, o) => { s.n++; if (ok) { s.w++; s.ret += o; } };
    for (const c of D.COMPS) for (const r of btFor(c.code).records) {
      const mk = M.markets(M.fromXg(r.xg.home, r.xg.away));
      for (const [k, p] of Object.entries(mk)) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; if (M.settle(k, r.m.hg, r.m.ag)) b.w++; }
      const best = Object.entries(mk).filter(([, p]) => p >= 0.65 && p <= 0.87).sort((a, b) => b[1] - a[1])[0];
      if (best) { bn++; bp += best[1]; if (M.settle(best[0], r.m.hg, r.m.ag)) bw++; }
      const o = r.m.odds;
      if (!o?.h || !o.d || !o.a) continue;
      const im = implied(o), ip = [im.h, im.d, im.a];
      roi.n++; roi.books.add(o.book || "?"); if (!roi.from || r.m.date < roi.from) roi.from = r.m.date;
      roi.mBr += r.probs.reduce((x, q, i) => x + (q - (i === r.res ? 1 : 0)) ** 2, 0);
      roi.bBr += ip.reduce((x, q, i) => x + (q - (i === r.res ? 1 : 0)) ** 2, 0);
      if (r.pick === r.res) roi.mHit++;
      const fav = ip.indexOf(Math.max(...ip)); if (fav === r.res) roi.bHit++;
      bet(roi.F, fav === r.res, [o.h, o.d, o.a][fav]);
      if (best) { const bo = bookOdds(r.m, best[0]); if (bo?.v) bet(roi.A, M.settle(best[0], r.m.hg, r.m.ag), bo.v); }
      const fo = M.fromOdds(o, { total: r.xg.home + r.xg.away });
      const kb = Object.entries(M.markets(fo)).filter(([, p]) => p >= 0.65 && p <= 0.87).sort((a, b) => b[1] - a[1])[0];
      if (kb) { const bo = bookOdds(r.m, kb[0]); if (bo?.v) bet(roi.K, M.settle(kb[0], r.m.hg, r.m.ag), bo.v); }
      for (const k of ["1", "X", "2", "O2.5", "U2.5"]) {
        const bo = bookOdds(r.m, k); if (!bo?.v) continue;
        const e = mk[k] * bo.v - 1;
        if (e >= 0.08 && e <= 0.35 && mk[k] >= 0.3) bet(roi.B, M.settle(k, r.m.hg, r.m.ag), bo.v);
      }
    }
    return { bins, bn, bw, bp, roi };
  }
  function roiHtml(r) {
    if (!r.n) return `<p>${L("Brak jeszcze rozegranych meczów z zapisanymi kursami.", "No played matches with saved odds yet.")}</p>`;
    const row = (name, s) => {
      if (!s.n) return "";
      const prof = s.ret - s.n, cls = prof >= 0 ? "ok" : "bad", sg = prof >= 0 ? "+" : "−";
      return `<tr><td class="t">${name}</td><td>${s.n}</td><td>${pct(s.w / s.n)}</td><td><span class="tag ${cls}">${sg}${pct(Math.abs(prof) / s.n, 1)}</span></td><td>${sg}£${Math.round(Math.abs(prof) * STAKE)}</td></tr>`;
    };
    const bm = dec((r.mBr / r.n).toFixed(3)), bb = dec((r.bBr / r.n).toFixed(3));
    return `<h3 style="margin:16px 0 6px">${L("Zakłady na prawdziwych kursach", "Bets at real odds")}</h3>
      <p style="margin-top:0">${L(`${r.n} rozegranych meczów z kursami (${esc([...r.books].join(", "))}), od ${fmtDate(r.from, false)}. Każdy zakład za ${money(STAKE)}, typ wybrany tylko z danych sprzed meczu.`, `${r.n} played matches with odds (${esc([...r.books].join(", "))}), since ${fmtDate(r.from, false)}. Each bet ${money(STAKE)}, selection made only from pre-match data.`)}</p>
      <div class="tbl-wrap"><table><thead><tr><th class="t">${L("Zakład", "Bet")}</th><th>${L("Ile", "Bets")}</th><th>${L("Weszło", "Won")}</th><th>${L("Zwrot", "Return")}</th><th>${L("Bilans", "Profit")}</th></tr></thead><tbody>
      ${row(L("Najpewniejszy¹", "Safest¹"), r.K)}${row(L("Najpewn. model²", "Safest model²"), r.A)}${row(L("Okazje³", "Value³"), r.B)}${row(L("Faworyt⁴", "Favourite⁴"), r.F)}
      </tbody></table></div>
      <p class="muted">${L("¹ najpewniejszy zakład z meczu według kursów (tak wybiera lista wyżej) · ² to samo według samego modelu · ³ okazje według modelu, przewaga 8–35% · ⁴ zawsze faworyt bukmachera, dla porównania. Kurs podwójnej szansy wyliczony z 1X2 (≈); bez kursu na dany rynek zakład nie jest liczony.", "¹ the safest bet of each match according to the odds (how the list above chooses) · ² the same according to the model alone · ³ model value picks, edge 8–35% · ⁴ always the bookmaker's favourite, for comparison. Double-chance odds derived from 1X2 (≈); bets without odds for the market are not counted.")}</p>
      <p style="margin-bottom:0">${L(`Kto lepiej przewiduje wynik 1X2: <b>model</b> – trafność ${pct(r.mHit / r.n, 1)}, Brier ${bm}; <b>bukmacher</b> – trafność ${pct(r.bHit / r.n, 1)}, Brier ${bb} (mniej = lepiej). Ujemny zwrot to głównie marża bukmachera – żeby zarabiać, trzeba przewidywać lepiej niż rynek, a ten model tego nie robi.`, `Who predicts 1X2 better: <b>model</b> – accuracy ${pct(r.mHit / r.n, 1)}, Brier ${bm}; <b>bookmaker</b> – accuracy ${pct(r.bHit / r.n, 1)}, Brier ${bb} (lower = better). The negative return is mostly the bookmaker's margin – to make money you must predict better than the market, and this model does not.`)}</p>`;
  }
  function calibHtml(c) {
    return `<p style="margin-top:0">${L(`„Najpewniejszy zakład” w każdym z <b>${c.bn}</b> rozegranych meczów: model dawał średnio <b>${pct(c.bp / c.bn, 1)}</b>, a zakład wszedł w <b>${pct(c.bw / c.bn, 1)}</b> przypadków.`, `"Safest bet" in each of <b>${c.bn}</b> played matches: the model gave <b>${pct(c.bp / c.bn, 1)}</b> on average, and the bet won <b>${pct(c.bw / c.bn, 1)}</b> of the time.`)}</p>
      <div class="tbl-wrap"><table><thead><tr><th class="t">${L("Model mówił", "Model said")}</th><th>${L("Zakładów", "Bets")}</th><th>${L("Średnio model", "Model average")}</th><th>${L("Naprawdę weszło", "Actually won")}</th></tr></thead><tbody>
      ${c.bins.filter(b => b.n).map((b, i, arr) => `<tr><td class="t">${c.bins.indexOf(b) * 10}–${c.bins.indexOf(b) * 10 + 10}%</td><td>${b.n}</td><td>${pct(b.p / b.n, 1)}</td><td><b>${pct(b.w / b.n, 1)}</b></td></tr>`).join("")}
      </tbody></table></div><p class="muted" style="margin-bottom:0">${L("Wszystkie rynki (1X2, podwójna szansa, gole, obie strzelą), mecze od 15.09.2025 przewidziane tylko z danych sprzed meczu. Gdy liczby w dwóch ostatnich kolumnach są podobne, procenty modelu można traktować dosłownie.", "All markets (1X2, double chance, goals, both teams to score), matches since 15 Sep 2025 predicted only from pre-match data. When the last two columns are similar, the model's percentages can be taken literally.")}</p>${c.roi ? roiHtml(c.roi) : ""}`;
  }
  function saveBet(x) {
    const m = x.m;
    S.tips = S.tips || [];
    S.tips.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: "bet", comp: m.comp, date: m.date, time: m.time || "",
      home: m.home, away: m.away, market: x.k, label: mlabel(x.k, m), prob: +x.p.toFixed(3), odds: x.book?.v || +(1 / x.p).toFixed(2),
      bookOdds: !!x.book && !x.book.approx, saved: new Date().toISOString(), note: "",
    });
    saveTips(); toast(L("Zakład zapisany w Typy → Moje typy", "Bet saved in Tips → My picks")); render();
  }
  // kursy w szczegółach meczu
  function oddsHtml(m, p) {
    if (!m.odds || M.played(m)) return "";
    const o = m.odds, imp = implied(o), mk = M.markets(p.model || p);
    const row = (k, odd, ip) => { const e = mk[k] * odd - 1; return `<tr><td class="t" style="white-space:normal">${esc(mlabel(k, m))}</td><td><b>${fx(odd)}</b></td><td>${ip !== null ? pct(ip) : "–"}</td><td>${pct(mk[k])}</td><td>${e > 0.35 ? `<span class="tag wait">+${pct(e)}?</span>` : e >= 0.05 ? `<span class="tag ok">+${pct(e)}</span>` : e <= -0.05 ? `<span class="tag bad">${pct(e)}</span>` : "≈"}</td></tr>`; };
    const ou = o.line && o.over && o.under ? (() => { const s = 1 / o.over + 1 / o.under; const kk = `O${o.line}`, ku = `U${o.line}`; return mk[kk] !== undefined ? row(kk, o.over, 1 / o.over / s) + row(ku, o.under, 1 / o.under / s) : ""; })() : "";
    return `<h2>${L("Kursy bukmachera", "Bookmaker odds")}${o.book ? ` (${esc(o.book)})` : ""}</h2><div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th class="t">${L("Zakład", "Bet")}</th><th>${L("Kurs", "Odds")}</th><th title="${L("szansa z kursu po zdjęciu marży", "chance from the odds with the margin removed")}">${L("Rynek", "Market")}</th><th>Model</th><th title="${L("przewaga modelu", "model edge")}">±</th></tr></thead><tbody>
      ${row("1", o.h, imp.h)}${row("X", o.d, imp.d)}${row("2", o.a, imp.a)}${ou}</tbody></table></div>
      <p class="small muted" style="margin-bottom:0">${L(`„Rynek” – szansa wynikająca z kursu po zdjęciu marży (${pct(imp.margin, 1)}). „±” – przewaga modelu = szansa modelu × kurs − 1; dodatnia oznacza, że według modelu kurs jest zawyżony. Bardzo duża różnica (ze znakiem „?”) zwykle znaczy, że bukmacher wie coś, czego model nie zna – np. o składzie. Kursy odświeżane co godzinę przed meczami; najnowsze pobierają się też na żywo w tej karcie.`, `"Market" – the chance implied by the odds with the margin removed (${pct(imp.margin, 1)}). "±" – model edge = model chance × odds − 1; positive means the model thinks the odds are too long. A very large gap (marked "?") usually means the bookmaker knows something the model does not – e.g. about the line-up. Odds refresh hourly before matches; the latest ones also load live in this card.`)}</p></div>`;
  }

  function viewTypy() {
    const nb = (S.tips || []).length;
    const sub = S.typySub;
    const head = `<div class="chips">${[["zaklady", L("Najpewniejsze zakłady", "Safest bets")], ["moje", L(`Moje typy (${nb})`, `My picks (${nb})`)]].map(([k, l]) => `<button class="chip${sub === k ? " on" : ""}" data-typysub="${k}">${l}</button>`).join("")}</div>`;
    return head + (sub === "zaklady" ? viewBets() : viewMyTips());
  }

  function viewMyTips() {
    const all = (S.tips || []).map(t => ({ t, r: tipResult(t) }));
    const tips = all;
    const bets = all.filter(x => x.t.kind === "bet"), betsDone = bets.filter(x => x.r.done);
    const pend = tips.filter(x => !x.r.done).sort((a, b) => a.t.date.localeCompare(b.t.date));
    const done = tips.filter(x => x.r.done).sort((a, b) => b.t.date.localeCompare(a.t.date));
    const f = S.tipFilter;
    const sdone = done.filter(x => x.t.kind !== "bet");
    const pts = sdone.reduce((s, x) => s + x.r.pts, 0);
    const oc = sdone.filter(x => x.r.outcome).length, ex = sdone.filter(x => x.r.exact).length;
    const withModel = sdone.filter(x => x.r.modelOutcome !== null && x.r.modelOutcome !== undefined), mo = withModel.filter(x => x.r.modelOutcome).length;
    const bal = betsDone.reduce((s, x) => s + x.r.profit, 0);
    let h = `<h2>${L("Moje typy", "My picks")}</h2>
      <div class="stats" style="margin-top:0"><div class="stat"><b>${tips.length}</b><span>${L("zapisanych", "saved")}</span></div><div class="stat"><b>${pend.length}</b><span>${L("oczekuje", "pending")}</span></div>
      <div class="stat"><b>${pts}</b><span>${L("punkty (3 za wynik, 1 za 1X2)", "points (3 for the score, 1 for 1X2)")}</span></div>
      <div class="stat"><b>${sdone.length ? pct(oc / sdone.length) : "–"}</b><span>${L("trafione 1X2", "correct 1X2")}${withModel.length ? ` · model ${pct(mo / withModel.length)}` : ""}</span></div>
      <div class="stat"><b>${ex}</b><span>${L("dokładnych wyników", "exact scores")}</span></div>
      ${bets.length ? `<div class="stat"><b>${betsDone.filter(x => x.r.win).length}/${betsDone.length}</b><span>${L(`wygrane zakłady (${bets.length - betsDone.length} czeka)`, `bets won (${bets.length - betsDone.length} pending)`)}</span></div><div class="stat"><b style="color:${bal >= 0 ? "var(--win)" : "var(--loss)"}">${bal >= 0 ? "+" : "−"}${money(bal)}</b><span>${L("bilans przy stawce", "profit at a stake of")} ${money(STAKE)}</span></div>` : ""}</div>
      <div class="chips">${[["all", L("Wszystkie", "All")], ["pend", L(`Oczekujące (${pend.length})`, `Pending (${pend.length})`)], ["done", L(`Rozliczone (${done.length})`, `Settled (${done.length})`)]].map(([k, l]) => `<button class="chip${f === k ? " on" : ""}" data-tipf="${k}">${l}</button>`).join("")}</div>`;
    const card = ({ t, r }) => {
      const m = r.m;
      if (t.kind === "bet") {
        const st = r.done ? (r.win ? `<span class="tag ok">${L("wygrany", "won")} · +${money(r.profit)}</span>` : `<span class="tag bad">${L("przegrany", "lost")} · −${money(STAKE)}</span>`) : `<span class="tag wait">${m?.live ? `${L("na żywo", "live")} ${m.live[0]}–${m.live[1]}` : L("oczekuje", "pending")}</span>`;
        return `<div class="card tip">
          <div class="m-meta"><span>${compTag(t.comp)} <span class="tag ex">${L("zakład", "bet")}</span></span><span>${fmtDate(t.date)}${t.time ? " · " + esc(t.time) : ""}</span></div>
          <div class="list-row" ${m ? `data-match="${esc(m.id)}"` : ""} style="border:0;padding:4px 0">${badge(t.home)}<span class="x"><b>${esc(short(t.home))} – ${esc(short(t.away))}</b></span>${badge(t.away)}</div>
          <div class="betline"><div><div class="bmk">${esc(t.label)}</div><div class="small muted">${L("kurs", "odds")} ${fx(t.odds)}${t.bookOdds ? "" : L(" (uczciwy wg modelu)", " (model's fair odds)")} · model ${pct(t.prob)}</div></div>${r.done ? `<div class="bp" style="font-size:18px">${m.hg}–${m.ag}</div>` : ""}</div>
          <div class="tipfoot"><span>${st}</span><button class="btn sec small-btn" data-deltip="${t.id}">${L("Usuń", "Delete")}</button></div></div>`;
      }
      const status = r.done ? (r.exact ? `<span class="tag ok">${L("dokładny wynik · 3 pkt", "exact score · 3 pts")}</span>` : r.outcome ? `<span class="tag ok">${L("trafiony 1X2 · 1 pkt", "correct 1X2 · 1 pt")}</span>` : `<span class="tag bad">0 ${L("pkt", "pts")}</span>`)
        : m?.live ? `<span class="tag wait">${L("na żywo", "live")} ${m.live[0]}–${m.live[1]}</span>` : m && m.date < today() ? `<span class="tag wait">${L("czeka na wynik", "awaiting result")}</span>` : `<span class="tag wait">${L("oczekuje", "pending")}</span>`;
      return `<div class="card tip${t.example ? " ex" : ""}">
        <div class="m-meta"><span>${compTag(t.comp)}${t.example ? ` <span class="tag ex">${L("przykład", "example")}</span>` : ""}</span><span>${fmtDate(t.date)}${t.time ? " · " + esc(t.time) : ""}</span></div>
        <div class="m-row" ${m ? `data-match="${esc(m.id)}" style="cursor:pointer"` : ""}>${teamEl(t.home)}<div class="score pred">${t.hg}–${t.ag}<small>${L("mój typ", "my pick")}</small></div>${teamEl(t.away, true)}</div>
        <div class="tipfoot"><span>${status}${r.done ? ` <span class="small muted">${L("wynik", "result")} ${m.hg}–${m.ag}</span>` : ""}</span><span class="small muted">model: ${t.model.hg}–${t.model.ag} (${pct(t.model.win)}/${pct(t.model.draw)}/${pct(t.model.loss)})</span></div>
        ${t.note ? `<div class="small muted" style="margin-top:6px">„${esc(t.note)}”</div>` : ""}
        <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sec small-btn" data-deltip="${t.id}">${L("Usuń", "Delete")}</button></div></div>`;
    };
    const show = f === "pend" ? pend : f === "done" ? done : [...pend, ...done];
    if (!tips.length) h += `<div class="card empty">${L("Nie masz jeszcze typów. Otwórz dowolny mecz w zakładce Mecze i wybierz „Zapisz mój typ”.", "You have no picks yet. Open any match in the Matches tab and choose \"Save my pick\".")}</div>`;
    else if (!show.length) h += `<div class="card empty">${L("Brak typów w tym widoku.", "No picks in this view.")}</div>`;
    else h += show.map(card).join("");
    const exN = tips.filter(x => x.t.example).length;
    h += `<div class="row" style="justify-content:center;margin-top:16px">${exN ? `<button class="btn sec" id="delEx">${L(`Usuń przykłady (${exN})`, `Delete examples (${exN})`)}</button>` : ""}${tips.length ? `<button class="btn danger" id="delAllTips">${L("Usuń wszystkie typy", "Delete all picks")}</button>` : ""}</div>
      <p class="small muted" style="text-align:center">${L("Typy są zapisane w tej przeglądarce na tym urządzeniu.", "Picks are saved in this browser on this device.")}</p>`;
    return h;
  }

  /* ---------- widoki ---------- */
  function viewMecze() {
    const c = S.comp, t = today();
    btFor(c);
    const mine = S.matches.filter(m => m.comp === c);
    const up = mine.filter(m => !M.played(m) && (m.date >= t || m.live));
    const horizon = up.length ? addDays(up[0].date, 9) : t;
    const next = up.filter(m => m.date <= horizon && liveOf(m)?.state !== "in");
    const overdue = mine.filter(m => !M.played(m) && !m.live && m.date < t && m.season === curSeason());
    const recent = mine.filter(M.played).slice(-12).reverse();
    // na żywo – ze wszystkich rozgrywek
    const liveNow = S.matches.filter(m => !M.played(m) && liveOf(m)?.state === "in");
    let h = liveNow.length ? `<h2 class="live-h">● ${L("Na żywo", "Live now")} (${liveNow.length})</h2>${liveNow.map(matchCard).join("")}<p class="small muted" style="margin:-4px 2px 10px">${L("Wyniki z ESPN, odświeżane co minutę", "Scores from ESPN, refreshed every minute")}${S.liveAt ? ` · ${new Date(S.liveAt).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" })}` : ""}</p>` : "";
    h += weekendHtml() + compBar(c);
    h += `<h2>${L("Najbliższe mecze", "Upcoming matches")} · ${esc(compName(c))}</h2>`;
    h += next.length ? next.map(matchCard).join("") : `<div class="card empty">${D.COMP[c]?.src === "football-data"
      ? L(`Terminarz ${esc(compName(c))} chwilowo niedostępny. ESPN nie ma tej ligi – najbliższe kolejki pobieramy z TheSportsDB, a kursy z football-data.co.uk (ok. 1–2 dni przed kolejką). Mecze pojawią się tu same – dane odświeżane co 3 godziny.`, `${esc(compName(c))} fixtures are temporarily unavailable. ESPN does not cover this league – upcoming rounds come from TheSportsDB and odds from football-data.co.uk (about 1–2 days before each round). Matches will appear here automatically – data refreshes every 3 hours.`)
      : L("Brak zaplanowanych meczów w najbliższym czasie.", "No matches scheduled in the near future.")}</div>`;
    if (overdue.length) {
      h += `<h2>${L("Czekają na wynik", "Awaiting results")} (${overdue.length})</h2>`;
      h += overdue.slice(-(S.showOverdue ? overdue.length : 6)).reverse().map(matchCard).join("");
      if (overdue.length > 6 && !S.showOverdue) h += `<button class="btn sec" data-more="overdue" style="width:100%">${L("Pokaż wszystkie", "Show all")}</button>`;
    }
    h += roundsHtml(c);
    return h;
  }

  /* ---------- historia meczów: kolejka po kolejce (w pucharach – etapy), z prognozą sprzed meczu ---------- */
  const STAGES = ["Baraże", "1/8 finału", "Ćwierćfinał", "Półfinał", "Finał"];
  function roundGroups(c, sea) {
    const ms = S.matches.filter(m => m.comp === c && m.season === sea);
    const gs = new Map();
    for (const m of ms) {
      let key, label, order;
      if (m.rd) { key = "r" + m.rd; order = m.rd; label = isCup(c) ? `${L("Faza ligowa", "League phase")} · ${L(`kolejka ${m.rd}`, `matchday ${m.rd}`)}` : L(`Kolejka ${m.rd}`, `Matchday ${m.rd}`); }
      else if (m.round) { const i = STAGES.indexOf(m.round); key = "s" + m.round; order = 100 + (i < 0 ? 50 : i); label = roundName(m.round); }
      else continue;
      if (!gs.has(key)) gs.set(key, { key, label, order, ms: [] });
      gs.get(key).ms.push(m);
    }
    return [...gs.values()].sort((a, b) => a.order - b.order).map(g => ({ ...g, ms: g.ms.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))) }));
  }
  function roundsHtml(c) {
    const seasons = [curSeason(), prevSeason()].filter(x => S.matches.some(m => m.comp === c && m.season === x && M.played(m)));
    if (!seasons.length) return `<h2>${L("Wyniki", "Results")}</h2><div class="card empty">${L("Brak wyników.", "No results.")}</div>`;
    const sea = seasons.includes(S.histSeason) ? S.histSeason : seasons[0];
    const gs = roundGroups(c, sea);
    if (!gs.length) return "";
    // domyślnie: ostatnia kolejka z rozegranym meczem
    let idx = S.histIdx !== null && S.histIdx < gs.length && S.histFor === c + sea ? S.histIdx : (() => { let k = 0; gs.forEach((g, i) => { if (g.ms.some(M.played)) k = i; }); return k; })();
    S.histIdx = idx; S.histFor = c + sea;
    const g = gs[idx];
    const played = g.ms.filter(M.played), rows = played.map(m => ({ m, x: preMatch(m, true) })), ok = rows.filter(r => r.x), hits = ok.filter(r => r.x.hit).length;
    const dates = g.ms.map(m => m.date).sort(), span = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0], false) : `${fmtDate(dates[0], false)} – ${fmtDate(dates[dates.length - 1], false)}`) : "";
    const pickLab = (m, x) => { const i = x.main.probs.indexOf(Math.max(...x.main.probs)); return `${["1", "X", "2"][i]} ${pct(x.main.probs[i])}`; };
    const row = m => {
      const done = M.played(m), x = done ? preMatch(m, true) : null, lv = !done ? liveOf(m) : null;
      const score = done ? `${m.hg}–${m.ag}` : lv && lv.state !== "pre" ? `<span class="live-txt">${lv.hs}–${lv.as}</span>` : m.time ? esc(m.time) : "–";
      const mark = done ? (x ? `<span class="res ${x.hit ? "W" : "P"}">${x.hit ? "✓" : "✗"}</span>` : `<span class="res N">–</span>`) : `<span class="res N">·</span>`;
      const wd = new Date(m.date + "T12:00:00").toLocaleDateString(LOC(), { weekday: "short" });
      return `<div class="list-row rrow" data-match="${esc(m.id)}" title="${fmtDate(m.date)}">${mark}<span class="d">${wd}</span>
        <span class="x rteams"><span class="rt">${badge(m.home, "sm")}<span class="nm">${esc(short(m.home))}</span></span><b class="rs">${score}</b><span class="rt r"><span class="nm">${esc(short(m.away))}</span>${badge(m.away, "sm")}</span></span>
        <span class="small muted rp">${x ? pickLab(m, x) : !done ? (() => { const p = pred(m); const i = [p.win, p.draw, p.loss].indexOf(Math.max(p.win, p.draw, p.loss)); return `${["1", "X", "2"][i]} ${pct([p.win, p.draw, p.loss][i])}`; })() : ""}</span></div>`;
    };
    return `<h2>${L("Wyniki", "Results")} · ${esc(compName(c))}</h2>
      ${seasons.length > 1 ? `<div class="chips">${seasons.map(x => `<button class="chip${x === sea ? " on" : ""}" data-hseason="${x}">${L("Sezon", "Season")} ${x.replace("-", "/")}</button>`).join("")}</div>` : ""}
      <div class="card">
        <div class="rnav"><button class="btn sec small-btn" data-hround="${idx - 1}"${idx === 0 ? " disabled" : ""} aria-label="${L("Poprzednia", "Previous")}">‹</button>
          <div class="rtitle"><b>${esc(g.label)}</b><span class="small muted">${span}</span></div>
          <button class="btn sec small-btn" data-hround="${idx + 1}"${idx === gs.length - 1 ? " disabled" : ""} aria-label="${L("Następna", "Next")}">›</button></div>
        ${ok.length ? `<p class="small" style="margin:8px 0 4px">${L(`Prognoza trafiła <b>${hits} z ${ok.length}</b> meczów (${pct(hits / ok.length)})`, `Forecast right in <b>${hits} of ${ok.length}</b> matches (${pct(hits / ok.length)})`)}${played.length < g.ms.length ? L(` · ${g.ms.length - played.length} do rozegrania`, ` · ${g.ms.length - played.length} still to play`) : ""}</p>` : ""}
        ${g.ms.map(row).join("")}
        <p class="small muted" style="margin:8px 0 0">${L("Prawa kolumna: najbardziej prawdopodobny wynik 1/X/2 przed meczem (z kursów albo modelu) i jego szansa. ✓/✗ – czy się sprawdził.", "Right column: the most likely 1/X/2 result before the match (from odds or the model) and its chance. ✓/✗ – whether it came true.")}${!isCup(c) ? L(" Numery kolejek wyliczone z terminarza – przy przełożonych meczach mogą się różnić od oficjalnych.", " Matchday numbers are derived from the fixture order – postponed matches may differ from the official round.") : ""}</p>
      </div>`;
  }

  function zoneOf(c, i, n) {
    const z = D.COMP[c].zones;
    if (i < z.top[0]) return "z-top";
    if (z.mid && i + 1 >= z.mid[0] && i + 1 <= z.mid[1]) return "z-mid";
    if (i >= n - z.bottom[0]) return "z-rel";
    return "";
  }
  // nazwy stref tabeli (w danych po polsku)
  const ZONE_EN = { "Liga Mistrzów": "Champions League", "miejsce 5 (często też LM)": "5th place (often Champions League too)", "spadek": "relegation",
    "Liga Europy": "Europa League", "spadek (16. – baraż)": "relegation (16th – play-off)", "el. LM / Liga Europy": "CL qualifying / Europa League",
    "el. LM": "CL qualifying", "awans": "promotion", "baraże o awans": "promotion play-offs", "1/8 finału": "round of 16", "baraże": "play-offs",
    "odpada": "eliminated", "el. Ligi Mistrzów": "CL qualifying", "el. pucharów europejskich": "European qualifying" };
  const zl = x => LANG === "en" ? ZONE_EN[x] || x : x;
  function legendHtml(c) {
    const z = D.COMP[c].zones;
    return `<div class="legend"><span><i style="background:var(--cl)"></i>${esc(zl(z.top[1]))}</span>${z.mid ? `<span><i style="background:#f28c28"></i>${esc(zl(z.mid[2]))}</span>` : ""}<span><i style="background:var(--loss)"></i>${esc(zl(z.bottom[1]))}</span></div>`;
  }
  function tableHtml(c, rows, title) {
    let h = `<h2>${esc(title)}</h2><div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th class="t">${L("Klub", "Club")}</th><th>${L("M", "P")}</th><th>W</th><th>${L("R", "D")}</th><th>${L("P", "L")}</th><th>${L("Bramki", "Goals")}</th><th>+/−</th><th>${L("Pkt", "Pts")}</th><th class="t">${L("Forma", "Form")}</th></tr></thead><tbody>`;
    rows.forEach((r, i) => {
      h += `<tr class="click ${zoneOf(c, i, rows.length)}" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td>
        <td class="t"><span class="form">${r.form.slice(-5).map(x => `<i class="${x}">${resL(x)}</i>`).join("")}</span></td></tr>`;
    });
    return h + `</tbody></table></div>${legendHtml(c)}</div>`;
  }
  function viewTabela() {
    const c = S.comp;
    let h = compBar(c);
    const seasons = [curSeason(), prevSeason()].filter(s => S.matches.some(m => m.comp === c && m.season === s));
    const sea = seasons.includes(S.tableSeason) ? S.tableSeason : seasons[0];
    if (!sea) return h + `<div class="empty">${L("Brak danych.", "No data.")}</div>`;
    h += `<div class="chips">${seasons.map(s => `<button class="chip${s === sea ? " on" : ""}" data-season="${s}">${L("Sezon", "Season")} ${s.replace("-", "/")}</button>`).join("")}</div>`;
    if (isCup(c)) {
      const lp = S.matches.filter(m => m.comp === c && m.season === sea && m.round === "Faza ligowa");
      if (!lp.length) return h + `<div class="card empty">${L("Brak meczów fazy ligowej w tym sezonie.", "No league-phase matches this season.")}</div>`;
      h += tableHtml(c, M.table(lp), `${compName(c)} ${sea.replace("-", "/")} · ${L("faza ligowa", "league phase")}`);
      const ko = S.matches.filter(m => m.comp === c && m.season === sea && m.round && m.round !== "Faza ligowa").reverse();
      if (ko.length) h += `<h2>${L("Faza pucharowa", "Knockout stage")}</h2><div class="card">${ko.map(m => resultRow(m)).join("")}</div>`;
      return h;
    }
    const lm = S.matches.filter(m => m.comp === c && m.season === sea);
    h += tableHtml(c, M.table(lm, teamsOf(c, sea)), `${compName(c)} ${sea.replace("-", "/")}`);
    if (sea === curSeason()) {
      const sim = simFor(c);
      if (sim) {
        const z = D.COMP[c].zones, T = sim.length;
        const topN = z.top[0], botN = z.bottom[0];
        const sum = (a, from, to) => a.slice(from, to).reduce((x, y) => x + y, 0);
        const left = lm.filter(m => !M.played(m)).length;
        h += `<h2>${L("Prognoza końca sezonu", "Season forecast")}</h2><div class="card"><p class="small muted" style="margin-top:0">${L(`3000 symulacji pozostałych ${left} meczów modelem Poissona.`, `3,000 simulations of the remaining ${left} matches with a Poisson model.`)}</p><div class="tbl-wrap"><table>
          <thead><tr><th>#</th><th class="t">${L("Klub", "Club")}</th><th>${L("Pkt (śr.)", "Pts (avg)")}</th><th>${L("Mistrz", "Title")}</th><th>Top ${topN}</th><th>${L("Spadek", "Relegated")}</th></tr></thead><tbody>`;
        const cell = (x, col) => `<td class="pct" style="background:color-mix(in srgb, ${col} ${Math.round(x * 55)}%, transparent)">${x < 0.005 ? "–" : x > 0.995 ? ">99%" : pct(x)}</td>`;
        sim.forEach((r, i) => {
          h += `<tr class="click" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td><b>${dec(r.expPts.toFixed(1))}</b></td>${cell(r.pos[0], "var(--accent)")}${cell(sum(r.pos, 0, topN), "var(--cl)")}${cell(sum(r.pos, T - botN, T), "var(--loss)")}</tr>`;
        });
        h += `</tbody></table></div><p class="small muted" style="margin-bottom:0">Top ${topN}: ${esc(zl(z.top[1]))}. ${L(`Spadek: ostatnie ${botN} miejsca.`, `Relegation: bottom ${botN}.`)}</p></div>`;
      }
    }
    return h;
  }

  /* ---------- Moje kluby: ulubione z najbliższym meczem i prognozą, wyszukiwarka wszystkich klubów ---------- */
  const favs = () => store.get(LS.fav, []);
  const isFav = t => favs().includes(t);
  function toggleFav(t) {
    const f = favs(), i = f.indexOf(t);
    if (i >= 0) f.splice(i, 1); else f.push(t);
    store.set(LS.fav, f);
    toast(i >= 0 ? L(`Usunięto ${short(t)} z moich klubów`, `Removed ${short(t)} from My clubs`) : L(`Dodano ${short(t)} do moich klubów`, `Added ${short(t)} to My clubs`));
  }
  const favBtn = t => `<button class="icon-btn fav${isFav(t) ? " on" : ""}" data-fav="${esc(t)}" aria-label="${isFav(t) ? L("Usuń z moich klubów", "Remove from My clubs") : L("Dodaj do moich klubów", "Add to My clubs")}">${isFav(t) ? "★" : "☆"}</button>`;
  function favCard(t) {
    const t0 = today();
    const mine = S.matches.filter(m => m.home === t || m.away === t);
    const next = mine.find(m => !M.played(m) && m.date >= t0);
    const last = mine.filter(M.played).slice(-1)[0];
    const lg = leagueOf(t);
    const row = lg ? M.table(S.matches.filter(m => m.comp === lg && m.season === curSeason())).find(r => r.team === t) : null;
    const pos = row ? M.table(S.matches.filter(m => m.comp === lg && m.season === curSeason())).indexOf(row) + 1 : null;
    let nx = `<div class="small muted">${L("Brak meczów w terminarzu.", "No fixtures scheduled.")}</div>`;
    if (next) {
      const p = pred(next), home = next.home === t, w = home ? p.win : p.loss, l = home ? p.loss : p.win;
      nx = `<div class="list-row" data-match="${esc(next.id)}" style="border:0;padding:6px 0 0">
        <span class="x" style="white-space:normal"><span class="small muted">${fmtDate(next.date)}${next.time ? " · " + esc(next.time) : ""} · ${esc(compShort(next.comp))}</span><br>
        <b>${esc(short(next.home))} – ${esc(short(next.away))}</b><br>
        <span class="small">${L("wygrana", "win")} <b>${pct(w)}</b> · ${L("remis", "draw")} ${pct(p.draw)} · ${L("porażka", "loss")} ${pct(l)} · ${L("wynik", "score")} ${p.top[0].hg}–${p.top[0].ag}${p.src ? ` <span class="muted">${L("(z kursów)", "(from odds)")}</span>` : ""}</span></span></div>`;
    }
    const lr = last ? (() => { const gf = last.home === t ? last.hg : last.ag, ga = last.home === t ? last.ag : last.hg, r = gf > ga ? "W" : gf < ga ? "P" : "R";
      return `<span class="res ${r}">${resL(r)}</span> ${esc(short(last.home === t ? last.away : last.home))} ${gf}–${ga}`; })() : "";
    return `<div class="card">
      <div class="list-row" style="cursor:default;border:0;padding:0">${badge(t, "lg")}
        <span class="x" data-club="${esc(t)}" style="cursor:pointer"><b>${esc(short(t))}</b><br><span class="small muted">${pos ? L(`${pos}. miejsce · `, `${ord(pos)} place · `) : ""}${lg ? esc(compName(lg)) : ""}</span></span>${favBtn(t)}</div>
      <div class="row" style="margin:8px 0 0;gap:6px;align-items:center">${formHtml(formOf(t, 5))}<span class="small muted" style="margin-left:auto">${L("ostatnio", "last")}: ${lr}</span></div>
      ${nx}</div>`;
  }
  function clubSearchHtml(q) {
    const nq = norm(q.trim());
    if (!nq) return "";
    const rows = [];
    for (const [g, ts] of teamGroups()) for (const t of ts) if (norm(g).includes(nq) || norm(t).includes(nq) || norm(short(t)).includes(nq)) rows.push([g, t]);
    if (!rows.length) return `<div class="empty">${L(`Nie znaleziono klubu „${esc(q)}”.`, `No club found for "${esc(q)}".`)}</div>`;
    return `<div class="card" style="padding:2px 12px">${rows.slice(0, 40).map(([g, t]) => `<div class="list-row">${badge(t)}<span class="x" data-club="${esc(t)}" style="cursor:pointer">${esc(short(t))} <span class="small muted">${esc(g)}</span></span>${favBtn(t)}</div>`).join("")}</div>${rows.length > 40 ? `<p class="small muted">${L(`…i ${rows.length - 40} innych – wpisz więcej liter.`, `…and ${rows.length - 40} more – type more letters.`)}</p>` : ""}`;
  }
  function viewKluby() {
    const f = favs().filter(t => S.matches.some(m => m.home === t || m.away === t));
    let h = `<h2>${L("Moje kluby", "My clubs")}</h2>`;
    h += f.length ? f.map(favCard).join("") : `<div class="card small muted">${L("Dodaj ulubione kluby gwiazdką ☆ – w wyszukiwarce poniżej, w siatce klubów albo w karcie klubu. Tu zobaczysz ich najbliższy mecz z prognozą, formę i ostatni wynik.", "Add favourite clubs with the star ☆ – in the search below, in the club grid or on a club card. Here you will see their next match with a forecast, their form and last result.")}</div>`;
    h += `<h2>${L("Szukaj klubu", "Find a club")}</h2><input type="text" id="cq" placeholder="${L("Wpisz nazwę klubu lub ligi…", "Type a club or league name…")}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.clubQ || "")}"><div id="cres" style="margin-top:8px">${clubSearchHtml(S.clubQ || "")}</div>`;
    return h + viewClubGrid();
  }
  function viewClubGrid() {
    const c = S.comp;
    const er = S.elo.ratings;
    let teams = teamsOf(c, curSeason());
    if (!teams.length) teams = teamsOf(c, prevSeason());
    let order = teams.slice().sort((a, b) => (er[b] || 0) - (er[a] || 0));
    if (!isCup(c)) { const tb = M.table(S.matches.filter(m => m.comp === c && m.season === curSeason()), teams); if (tb.some(r => r.p)) order = tb.map(r => r.team); }
    let h = `<h2>${L("Przeglądaj rozgrywki", "Browse competitions")}</h2>` + compBar(c) + `<h2>${esc(compName(c))} · ${isCup(c) ? L("uczestnicy", "teams") : L("kolejność jak w tabeli", "in table order")}</h2><div class="grid">`;
    for (const t of order) h += `<div class="card club" data-club="${esc(t)}" role="button" tabindex="0">${favBtn(t)}${badge(t, "lg")}<span>${esc(short(t))}</span><span class="muted">${isFav(t) ? L("w moich klubach", "in My clubs") : `Elo ${Math.round(er[t] || 1500)}`}</span></div>`;
    return h + `</div>`;
  }

  function spark(hist) {
    if (!hist || hist.length < 2) return "";
    const W = 600, H = 90, P = 6;
    const ys = hist.map(x => x.r), mn = Math.min(...ys) - 10, mx = Math.max(...ys) + 10;
    const pts = hist.map((x, i) => [P + i / (hist.length - 1) * (W - 2 * P), H - P - (x.r - mn) / (mx - mn) * (H - 2 * P)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${L("Wykres Elo", "Elo chart")}">
      <path d="${d} L${W - P} ${H} L${P} ${H}Z" fill="var(--accent)" opacity=".12"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="bar-l"><span>${fmtDate(hist[0].date, false)} · ${Math.round(hist[0].r)}</span><span>min ${Math.round(Math.min(...ys))} · max ${Math.round(Math.max(...ys))}</span><span>${L("teraz", "now")} ${Math.round(ys[ys.length - 1])}</span></div>`;
  }

  /* Kontuzje, xG drużyny i forma zawodników (FPL – tylko Premier League). */
  function playersHtml(t, row) {
    const ps = S.players.filter(p => p.team === t && p.st !== "u");
    if (!ps.length) return "";
    const xg = ps.reduce((a, p) => a + (p.xg || 0), 0), g = ps.reduce((a, p) => a + p.g, 0);
    const xga = ps.filter(p => p.pos === 1).reduce((a, p) => a + (p.xgc || 0), 0);
    const ga = row ? row.ga : null;
    const luck = (real, exp, inv) => { const d = real - exp; if (Math.abs(d) < 2) return L("zgodnie z oczekiwaniami", "as expected"); return (d > 0) !== !!inv ? L("lepiej niż wskazują sytuacje – może się wyrównać w dół", "better than the chances suggest – may even out downwards") : L("gorzej niż wskazują sytuacje – może się poprawić", "worse than the chances suggest – may improve"); };
    const form = ps.filter(p => p.min >= 90).sort((a, b) => (b.form || 0) - (a.form || 0) || (b.xg + b.xa) - (a.xg + a.xa)).slice(0, 10);
    return `<h2>${L("Gole a xG (sezon ligowy)", "Goals vs xG (league season)")}</h2><div class="card">
        <div class="stats" style="margin-top:0"><div class="stat"><b>${g} / ${num1(xg)}</b><span>${L("gole / xG – atak", "goals / xG – attack")} ${luck(g, xg)}</span></div>
        ${ga !== null ? `<div class="stat"><b>${ga} / ${num1(xga)}</b><span>${L("stracone / xGA – obrona", "conceded / xGA – defence")} ${luck(ga, xga, true)}</span></div>` : ""}</div>
        <p class="small muted" style="margin-bottom:0">${L("xG (gole oczekiwane) mierzy jakość stworzonych sytuacji. Na dłuższą metę lepiej przewiduje przyszłe wyniki niż same gole.", "xG (expected goals) measures the quality of chances created. In the long run it predicts future results better than goals alone.")}</p></div>
      <h2>${L("Kontuzje i zawieszenia", "Injuries and suspensions")}</h2><div class="card">${absenceHtml(t, 12)}</div>
      <h2>${L("Forma zawodników", "Player form")}</h2><div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th class="t">${L("Zawodnik", "Player")}</th><th>${L("Poz.", "Pos")}</th><th>Min</th><th>G</th><th>A</th><th>xG</th><th>xA</th><th title="${L("średnia punktów FPL z ostatnich 30 dni", "average FPL points over the last 30 days")}">${L("Forma", "Form")}</th></tr></thead><tbody>
        ${form.map(p => `<tr><td class="t">${esc(p.n)}${p.st !== "a" ? ` <span class="tag ${p.st === "d" ? "wait" : "bad"}">${p.st === "d" ? "?" : "✚"}</span>` : ""}</td><td>${L(...POS[p.pos])}</td><td>${p.min}</td><td>${p.g}</td><td>${p.as}</td><td>${num1(p.xg || 0)}</td><td>${num1(p.xa || 0)}</td><td><b>${num1(p.form || 0)}</b></td></tr>`).join("")}
        </tbody></table></div><p class="small muted" style="margin-bottom:0">${L("Forma = średnia punktów Fantasy Premier League z ostatnich 30 dni (gole, asysty, czyste konta, minuty). Źródło: FPL", "Form = average Fantasy Premier League points over the last 30 days (goals, assists, clean sheets, minutes). Source: FPL")}${S.fplInfo?.updated ? `, ${L("stan z", "as of")} ${dt(S.fplInfo.updated)}` : ""}.</p></div>`;
  }

  /* Prognoza sprzed rozegranego meczu: z kursów zamknięcia (tak działa strona, gdy kursy są), a model z testu wstecznego
     (dopasowany tylko do meczów sprzed tego dnia). */
  // lazy: bez liczenia testu wstecznego (gdy go jeszcze nie ma, mecz bez kursów zostaje bez prognozy – doliczy się w tle)
  function preMatch(m, lazy) {
    const ck = m.id + (lazy && !S.bts[m.comp] ? "~" : "");
    if (S.pmCache.has(ck)) return S.pmCache.get(ck);
    const bt = (lazy ? S.bts[m.comp] : btFor(m.comp)) && S.btMap.get(m.id);
    const model = bt ? { probs: bt.probs, top: bt.top } : null;
    let main = null;
    if (m.odds?.h) {
      const f = M.fromOdds(m.odds, { total: bt ? bt.xg.home + bt.xg.away : 2.7 });
      if (f) main = { probs: [f.win, f.draw, f.loss], top: f.top[0], src: m.odds.book || L("kursy", "odds") };
    }
    if (!main && model) main = { ...model, src: "model" };
    if (!main) { S.pmCache.set(ck, null); return null; }
    const res = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, pick = r => r.probs.indexOf(Math.max(...r.probs));
    const out = { main, model, res, hit: pick(main) === res, exact: main.top.hg === m.hg && main.top.ag === m.ag, mHit: model ? pick(model) === res : null };
    S.pmCache.set(ck, out);
    return out;
  }

  /* ---------- podsumowanie ostatnich 7 dni (góra zakładki Mecze) ---------- */
  function recentPlayed() {
    const from = addDays(today(), -7);
    return S.matches.filter(m => M.played(m) && m.date >= from && m.date <= today());
  }
  function weekendHtml() {
    const ms = recentPlayed();
    if (!ms.length) return "";
    const rows = ms.map(m => ({ m, x: preMatch(m, true) }));
    const ok = rows.filter(r => r.x), hits = ok.filter(r => r.x.hit).length, missing = rows.length - ok.length;
    const byComp = D.COMPS.map(c => { const rs = ok.filter(r => r.m.comp === c.code); return { c, n: rs.length, h: rs.filter(r => r.x.hit).length }; }).filter(x => x.n);
    const outcomeLab = m => m.hg > m.ag ? L(`wygrana ${short(m.home)}`, `${short(m.home)} win`) : m.hg < m.ag ? L(`wygrana ${short(m.away)}`, `${short(m.away)} win`) : L("remis", "draw");
    const surprises = ok.map(r => ({ ...r, p: r.x.main.probs[r.x.res] })).filter(r => r.p <= 0.25).sort((a, b) => a.p - b.p).slice(0, 3);
    const fav = favs();
    const favRows = rows.filter(r => fav.includes(r.m.home) || fav.includes(r.m.away)).reverse();
    const line = (r, extra) => `<div class="list-row" data-match="${esc(r.m.id)}">${r.x ? `<span class="res ${r.x.hit ? "W" : "P"}">${r.x.hit ? "✓" : "✗"}</span>` : `<span class="res R">–</span>`}<span class="x" style="white-space:normal"><b>${esc(short(r.m.home))} ${r.m.hg}–${r.m.ag} ${esc(short(r.m.away))}</b> <span class="small muted">${fmtDate(r.m.date, false)} · ${esc(compShort(r.m.comp))}</span>${extra ? `<br><span class="small">${extra}</span>` : ""}</span></div>`;
    return `<details class="card weekend" id="weekend"${S.weekOpen ? " open" : ""}>
      <summary>${L(`<b>Ostatnie 7 dni:</b> prognoza trafiła <b>${hits} z ${ok.length}</b> meczów`, `<b>Last 7 days:</b> the forecast was right in <b>${hits} of ${ok.length}</b> matches`)}${ok.length ? ` (${pct(hits / ok.length)})` : ""}</summary>
      <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th class="t">${L("Rozgrywki", "Competition")}</th><th>${L("Mecze", "Matches")}</th><th>${L("Trafione", "Correct")}</th></tr></thead><tbody>
        ${byComp.map(x => `<tr><td class="t">${compLogo(x.c.code, "sm")} ${esc(compShort(x.c.code))}</td><td>${x.n}</td><td><b>${x.h}</b> (${pct(x.h / x.n)})</td></tr>`).join("")}
      </tbody></table></div>
      ${surprises.length ? `<h3 style="margin:14px 0 4px">${L("Największe niespodzianki", "Biggest surprises")}</h3>${surprises.map(r => line(r, `${esc(outcomeLab(r.m))} – ${L("szansa przed meczem tylko", "pre-match chance only")} ${pct(r.p)}`)).join("")}` : ""}
      ${favRows.length ? `<h3 style="margin:14px 0 4px">${L("Moje kluby", "My clubs")}</h3>${favRows.map(r => line(r, r.x ? `${L("prognoza", "forecast")}: ${esc([L("wygrana " + short(r.m.home), short(r.m.home) + " win"), L("remis", "draw"), L("wygrana " + short(r.m.away), short(r.m.away) + " win")][r.x.main.probs.indexOf(Math.max(...r.x.main.probs))])} ${pct(Math.max(...r.x.main.probs))}` : "")).join("")}` : ""}
      <p class="small muted" style="margin-bottom:0">${L("Trafiona = wynik 1/X/2 zgodny z najbardziej prawdopodobnym przed meczem (z kursów, a bez nich – z modelu). Dobra prognoza trafia ok. 50% meczów.", "Correct = the 1/X/2 result matched the most likely one before the match (from odds, or the model without them). A good forecast gets about 50% of matches right.")}${missing ? L(` Liczę jeszcze prognozy dla ${missing} meczów bez kursów…`, ` Still calculating forecasts for ${missing} matches without odds…`) : ""}</p>
    </details>`;
  }
  // doliczanie w tle testu wstecznego dla rozgrywek, w których mecze z ostatnich dni nie mają kursów
  function fillWeekend() {
    const need = [...new Set(recentPlayed().filter(m => !preMatch(m, true)).map(m => m.comp))].filter(c => !S.bts[c]);
    if (!need.length) return;
    setTimeout(() => {
      btFor(need[0]);
      const el = $("#weekend");
      if (el && S.tab === "mecze") { el.outerHTML = weekendHtml(); bindWeekend(); fillWeekend(); }
    }, 60);
  }
  function bindWeekend() { const el = $("#weekend"); if (el) el.ontoggle = () => { S.weekOpen = el.open; }; }
  function historyHtml(t, n = 5) {
    const ms = S.matches.filter(m => M.played(m) && (m.home === t || m.away === t)).slice(-n).reverse();
    const rows = ms.map(m => ({ m, x: preMatch(m) })).filter(r => r.x);
    if (!rows.length) return "";
    const lab = (m, i) => i === 1 ? L("remis", "draw") : L(`wygrana ${short(i === 0 ? m.home : m.away)}`, `${short(i === 0 ? m.home : m.away)} win`);
    const hits = rows.filter(r => r.x.hit).length, ex = rows.filter(r => r.x.exact).length, mr = rows.filter(r => r.x.mHit !== null), mh = mr.filter(r => r.x.mHit).length;
    return `<h2>${L(`Ostatnie ${rows.length} meczów – czy prognoza się sprawdziła`, `Last ${rows.length} matches – was the forecast right?`)}</h2><div class="card">
      ${rows.map(({ m, x }) => {
        const pi = x.main.probs.indexOf(Math.max(...x.main.probs));
        return `<div class="list-row" data-match="${esc(m.id)}" style="align-items:flex-start">
          <span class="res ${x.hit ? "W" : "P"}" title="${x.hit ? L("trafiona", "correct") : L("nietrafiona", "wrong")}">${x.hit ? "✓" : "✗"}</span>
          <span class="x" style="white-space:normal"><b>${esc(short(m.home))} ${m.hg}–${m.ag} ${esc(short(m.away))}</b> <span class="small muted">${fmtDate(m.date, false)} · ${esc(compShort(m.comp))}</span><br>
          <span class="small">${L("Prognoza", "Forecast")}: <b>${esc(lab(m, pi))}</b> ${pct(x.main.probs[pi])} · ${L("najbardziej prawdopodobny dokładny wynik", "most likely exact score")} ${x.main.top.hg}–${x.main.top.ag}${x.exact ? ` <span class="tag ok">${L("trafiony", "correct")}</span>` : ""}</span><br>
          <span class="small muted">1 ${pct(x.main.probs[0])} · X ${pct(x.main.probs[1])} · 2 ${pct(x.main.probs[2])} – ${x.main.src === "model" ? L("z modelu (brak kursów)", "from the model (no odds)") : L(`z kursów ${esc(x.main.src)}`, `from ${esc(x.main.src)} odds`)}${x.model && x.main.src !== "model" ? ` · model: ${esc(lab(m, x.model.probs.indexOf(Math.max(...x.model.probs))))} ${x.mHit ? "✓" : "✗"}` : ""}</span></span></div>`;
      }).join("")}
      <p class="small" style="margin-bottom:0">${L(`Trafiony wynik (1/X/2): <b>${hits} z ${rows.length}</b>, dokładny wynik: ${ex} z ${rows.length}`, `Correct result (1/X/2): <b>${hits} of ${rows.length}</b>, exact score: ${ex} of ${rows.length}`)}${mr.length && rows.some(r => r.x.main.src !== "model") ? L(` · sam model: ${mh} z ${mr.length}`, ` · model alone: ${mh} of ${mr.length}`) : ""}.</p>
      <p class="small muted" style="margin-bottom:0">${L("Prognozy liczone tylko z danych sprzed każdego meczu: z kursów zamknięcia bukmachera, gdy są, inaczej z modelu. Typ 1/X/2 to najbardziej prawdopodobny wynik – nawet dobra prognoza trafia go średnio w ok. 5 meczach na 10.", "Forecasts use only data from before each match: bookmaker closing odds when available, otherwise the model. The 1/X/2 pick is the most likely result – even a good forecast gets it right in about 5 matches out of 10.")}</p></div>`;
  }
  function openClub(t) {
    const lg = leagueOf(t);
    const er = S.elo.ratings;
    const mdl = lg ? modelFor(lg) : modelFor("CL");
    const lteams = lg ? teamsOf(lg, curSeason()) : [];
    const inLeague = lteams.includes(t);
    const rankOf = f => lteams.slice().sort((a, b) => f(b) - f(a)).indexOf(t) + 1;
    const attR = inLeague ? rankOf(x => mdl.att[x] ?? -9) : null, defR = inLeague ? rankOf(x => mdl.def[x] ?? -9) : null;
    const tbl = inLeague ? M.table(S.matches.filter(m => m.comp === lg && m.season === curSeason()), lteams) : [];
    const row = tbl.find(r => r.team === t), pos = row ? tbl.indexOf(row) + 1 : null;
    const euro = S.matches.filter(m => EURO.has(m.comp) && M.played(m) && (m.home === t || m.away === t));
    const euroW = euro.filter(m => (m.home === t ? m.hg > m.ag : m.ag > m.hg)).length;
    const mine = S.matches.filter(m => m.home === t || m.away === t);
    const t0 = today();
    const next = mine.filter(m => !M.played(m) && m.date >= t0).slice(0, 5);
    const last = mine.filter(M.played).slice(-10).reverse();
    const xgFor = t in mdl.att ? Math.exp(mdl.mu + mdl.att[t] + mdl.home / 2) : null;
    const xgAg = t in mdl.def ? Math.exp(mdl.mu - mdl.def[t] + mdl.home / 2) : null;
    let h = `<div class="vs" style="grid-template-columns:auto 1fr;text-align:left;padding-right:36px">${badge(t, "xl")}<div><h3>${esc(t)} ${favBtn(t)}</h3><div class="muted small">${pos ? `${L(`${pos}. miejsce`, `${ord(pos)} place`)} · ${esc(compName(lg))}` : lg ? esc(compName(lg)) : ""} · Elo ${Math.round(er[t] || 1500)}</div></div></div>
      <div class="stats">
        ${row ? `<div class="stat"><b>${row.pts}</b><span>${L(`punkty (${row.p} m.)`, `points (${row.p} games)`)}</span></div><div class="stat"><b>${row.w}-${row.d}-${row.l}</b><span>${L("W-R-P w lidze", "W-D-L in the league")}</span></div><div class="stat"><b>${row.gf}:${row.ga}</b><span>${L("bramki w lidze", "league goals")}</span></div>` : ""}
        ${xgFor ? `<div class="stat"><b>${dec(xgFor.toFixed(2))}</b><span>${L("siła ataku (gole/mecz)", "attack (goals/game)")}${attR ? ` · ${L(`${attR}. w lidze`, `${ord(attR)} in the league`)}` : ""}</span></div><div class="stat"><b>${dec(xgAg.toFixed(2))}</b><span>${L("siła obrony (stracone/mecz)", "defence (conceded/game)")}${defR ? ` · ${L(`${defR}. w lidze`, `${ord(defR)} in the league`)}` : ""}</span></div>` : ""}
        ${euro.length ? `<div class="stat"><b>${euroW}/${euro.length}</b><span>${L("wygrane w pucharach europejskich (2 sezony)", "wins in European cups (2 seasons)")}</span></div>` : ""}
      </div>
      <h2>${L("Forma (ostatnie 10)", "Form (last 10)")}</h2><div class="card">${formHtml(formOf(t, 10))}</div>
      ${historyHtml(t)}
      ${playersHtml(t, row)}
      <h2>${L("Ranking Elo w czasie", "Elo rating over time")}</h2><div class="card">${spark(S.elo.history[t])}</div>
      <h2>${L("Najbliższe mecze · szanse 1 / X / 2", "Upcoming matches · 1 / X / 2 chances")}</h2><div class="card">${next.length ? next.map(m => resultRow(m, t)).join("") : `<div class="muted">${L("Brak meczów w terminarzu.", "No fixtures scheduled.")}</div>`}</div>
      <h2>${L("Ostatnie wyniki", "Latest results")}</h2><div class="card">${last.map(m => resultRow(m, t)).join("") || `<div class="muted">${L("Brak.", "None.")}</div>`}</div>`;
    const sim = inLeague ? simFor(lg) : null;
    const sr = sim && sim.find(r => r.team === t);
    if (sr) {
      const z = D.COMP[lg].zones, T = sr.pos.length, mx = Math.max(...sr.pos);
      const topP = sr.pos.slice(0, z.top[0]).reduce((a, b) => a + b, 0), relP = sr.pos.slice(T - z.bottom[0]).reduce((a, b) => a + b, 0);
      h += `<h2>${L("Prognozowane miejsce na koniec sezonu", "Predicted final position")}</h2><div class="card"><div style="display:flex;align-items:flex-end;gap:3px;height:90px">${sr.pos.map((p, i) => `<div title="${L(`${i + 1}. miejsce`, `${ord(i + 1)} place`)}: ${pct(p, 1)}" style="flex:1;background:${i < z.top[0] ? "var(--cl)" : i >= T - z.bottom[0] ? "var(--loss)" : "var(--draw)"};height:${Math.max(1, p / mx * 100)}%;border-radius:3px 3px 0 0;opacity:${p > 0 ? 1 : .25}"></div>`).join("")}</div>
        <div class="bar-l"><span>${L("1.", "1st")}</span><span>${L(`średnio ${num1(sr.expPts)} pkt · top ${z.top[0]}: ${pct(topP)} · spadek: ${pct(relP)}`, `average ${num1(sr.expPts)} pts · top ${z.top[0]}: ${pct(topP)} · relegation: ${pct(relP)}`)}</span><span>${L(`${T}.`, ord(T))}</span></div></div>`;
    }
    openSheet(h);
  }

  // kluby do wyboru: ligi (bieżący sezon) i pozostałe kluby z pucharów
  function teamGroups() {
    const groups = D.COMPS.filter(c => !c.cup).map(c => [compName(c.code), teamsOf(c.code, curSeason())]).filter(([, ts]) => ts.length);
    const inLeagues = new Set(groups.flatMap(([, ts]) => ts));
    const others = [...new Set(S.matches.filter(m => EURO.has(m.comp) && m.season === curSeason()).flatMap(m => [m.home, m.away]))].filter(t => !inLeagues.has(t)).sort((a, b) => short(a).localeCompare(short(b)));
    if (others.length) groups.push([L("Inne kluby z pucharów", "Other clubs from European cups"), others]);
    return groups;
  }
  /* Wybór klubu z wyszukiwarką (zamiast długiej listy): wpisz kilka liter, polskie znaki niepotrzebne. */
  function openPicker(side) {
    openSheet(`<h2 style="margin-top:0">${side === "home" ? L("Gospodarz", "Home team") : L("Gość", "Away team")}</h2>
      <input type="text" id="pq" placeholder="${L("Wpisz nazwę klubu lub ligi…", "Type a club or league name…")}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <div id="plist" style="margin-top:10px"></div>`);
    const groups = teamGroups();
    const draw = () => {
      const q = norm($("#pq").value.trim());
      let html = "", n = 0, firstT = null;
      for (const [g, ts] of groups) {
        const hit = q ? (norm(g).includes(q) ? ts : ts.filter(t => norm(t).includes(q) || norm(short(t)).includes(q))) : ts;
        if (!hit.length) continue;
        n += hit.length; firstT = firstT || hit[0];
        html += `<div class="small muted" style="margin:10px 2px 2px;font-weight:700">${esc(g)}</div><div class="card" style="padding:2px 12px">${hit.map(t => `<div class="list-row" data-pick="${side}" data-team="${esc(t)}">${badge(t)}<span class="x">${esc(short(t))}${short(t) !== t ? ` <span class="small muted">${esc(t)}</span>` : ""}</span>${S.typ?.[side] === t ? "✓" : ""}</div>`).join("")}</div>`;
      }
      $("#plist").innerHTML = html || `<div class="empty">${L(`Nie znaleziono klubu „${esc($("#pq").value)}”.`, `No club found for "${esc($("#pq").value)}".`)}</div>`;
      $("#pq").dataset.first = n === 1 ? firstT : "";
    };
    $("#pq").oninput = draw;
    $("#pq").onkeydown = e => { if (e.key === "Enter" && e.target.dataset.first) pickTeam(side, e.target.dataset.first); };
    draw();
    $("#pq").focus({ preventScroll: true }); // od razu, w obsłudze dotknięcia – wtedy telefon wysuwa klawiaturę
  }
  function pickTeam(side, t) { S.typ = { ...S.typ, [side]: t }; closeSheet(); render(); }
  function viewTypuj() {
    const groups = teamGroups();
    const pick = (side, t) => `<button class="pick" data-picker="${side}" aria-label="${side === "home" ? L("Gospodarz", "Home team") : L("Gość", "Away team")}: ${esc(short(t))} – ${L("zmień", "change")}">${badge(t)}<span>${esc(short(t))}</span><b aria-hidden="true">⌕</b></button>`;
    const first = groups[0]?.[1] || [];
    const st = S.typ || (S.typ = { home: first[0], away: first[1], neutral: false });
    const adj = adjFor({ home: st.home, away: st.away, date: today() }, true);
    const p = M.predict(modelForPair(st.home, st.away), st.home, st.away, { neutral: st.neutral, adj });
    return `<h2>${L("Typuj dowolny mecz", "Predict any match")}</h2><div class="card">
      <div class="two"><div><label>${L("Gospodarz", "Home team")}</label>${pick("home", st.home)}</div><div><label>${L("Gość", "Away team")}</label>${pick("away", st.away)}</div></div>
      <div class="row"><label class="check" style="margin:0"><input type="checkbox" id="tn"${st.neutral ? " checked" : ""}> ${L("Teren neutralny (np. finał)", "Neutral venue (e.g. a final)")}</label><button class="btn sec" id="tswap">⇄ ${L("Zamień", "Swap")}</button></div></div>
      <div class="vs"><div class="tm">${badge(st.home, "lg")}${esc(short(st.home))}</div><div class="sc" style="color:var(--accent)">${p.top[0].hg}–${p.top[0].ag}<div class="small muted">${L("najbardziej prawdopodobny", "most likely")}</div></div><div class="tm">${badge(st.away, "lg")}${esc(short(st.away))}</div></div>
      ${st.home === st.away ? `<div class="empty">${L("Wybierz dwie różne drużyny.", "Choose two different teams.")}</div>` : predictionHtml(st.home, st.away, { neutral: st.neutral, adj })}
      ${leagueOf(st.home) !== leagueOf(st.away) ? `<p class="small muted">${L("Kluby z różnych lig – prognoza z modelu wszystkich lig, połączonych przez mecze w pucharach europejskich.", "Clubs from different leagues – forecast from the all-leagues model, linked through European cup matches.")}</p>` : ""}`;
  }

  function viewDane() {
    const all = [...new Set(S.matches.flatMap(m => [m.home, m.away]))].sort((a, b) => short(a).localeCompare(short(b)));
    const sopt = all.map(t => `<option value="${esc(t)}">${esc(short(t))}</option>`).join("");
    const st = d => `${L("stan z", "as of")} ${dt(d)}`;
    let h = `<h2>${L("Język", "Language")}</h2><div class="chips">${[["pl", "Polski"], ["en", "English"]].map(([k, l]) => `<button class="chip${LANG === k ? " on" : ""}" data-lang="${k}">${l}</button>`).join("")}</div>`;
    h += `<h2>${L("Źródła danych", "Data sources")}</h2><div class="card">
      <div class="list-row" style="cursor:default"><span class="res W">✓</span><span class="x" style="white-space:normal"><b>ESPN</b> – ${L("wyniki, terminarze, kluby i loga", "results, fixtures, clubs and crests")}<br><span class="small muted">${S.updated ? st(S.updated) : "–"}</span></span></div>`;
    for (const s of S.status) h += `<div class="list-row" style="cursor:default">${compLogo(s.comp, "sm")}<span class="x">${esc(compName(s.comp))}</span><span class="small muted">${s.played}/${s.n} ${L("meczów", "matches")}${s.last ? ` · ${L("ostatni", "last")} ${fmtDate(s.last, false)}` : ""}</span></div>`;
    h += `<div class="list-row" style="cursor:default"><span class="res ${S.fplInfo ? "W" : "P"}">${S.fplInfo ? "✓" : "!"}</span><span class="x" style="white-space:normal"><b>Fantasy Premier League</b> – ${L("kontuzje, forma zawodników, xG (Opta)", "injuries, player form, xG (Opta)")}<br><span class="small muted">${S.fplInfo ? L(`${S.fplInfo.players} zawodników · xG dla ${S.xgCount} meczów · `, `${S.fplInfo.players} players · xG for ${S.xgCount} matches · `) + st(S.fplInfo.updated) : L("niedostępne", "unavailable")}</span></span></div>`;
    if (S.raw.ek) h += `<div class="list-row" style="cursor:default"><span class="res W">✓</span><span class="x" style="white-space:normal"><b>Ekstraklasa</b> – ${L("wyniki i kursy z football-data.co.uk, terminarz 3 najbliższych kolejek z TheSportsDB (ESPN jej nie ma)", "results and odds from football-data.co.uk, fixtures for the next 3 rounds from TheSportsDB (not covered by ESPN)")}<br><span class="small muted">${st(S.raw.ek.updated)} · ${L("kursy na najbliższe mecze ok. 1–2 dni przed kolejką", "odds for upcoming matches about 1–2 days before each round")}</span></span></div>`;
    const fdN = S.matches.filter(m => m.odds?.book === "bet365").length;
    h += `<div class="list-row" style="cursor:default"><span class="res ${S.raw.fd ? "W" : "P"}">${S.raw.fd ? "✓" : "!"}</span><span class="x" style="white-space:normal"><b>football-data.co.uk</b> – ${L("xG 8 lig i kursy bet365 rozegranych meczów (do sprawdzania zakładów)", "xG for 8 leagues and bet365 odds of played matches (for checking bets)")}<br><span class="small muted">${S.raw.fd ? L(`kursy dla ${fdN} meczów · `, `odds for ${fdN} matches · `) + st(S.raw.fd.updated) : L("niedostępne", "unavailable")}</span></span></div>`;
    h += `<div class="row"><button class="btn" id="dRefresh">${L("Odśwież teraz", "Refresh now")}</button><span class="small muted">${L("Wyniki i kursy odświeżane automatycznie co godzinę przed meczami, pozostałe dane co 3 godziny.", "Results and odds refresh automatically every hour before matches, other data every 3 hours.")}${S.manual.length ? L(` Wpisanych ręcznie: ${S.manual.length}.`, ` Entered manually: ${S.manual.length}.`) : ""}</span></div></div>`;

    h += `<h2>${L("Prognozy", "Forecasts")}</h2><div class="card"><label class="check" style="margin:0 0 12px"><input type="checkbox" id="mktT"${mktOn() ? " checked" : ""}> ${L("Prognoza z kursów bukmachera, gdy są (trafniejsza niż sam model; wyłącz, żeby widzieć tylko model)", "Use bookmaker odds for the forecast when available (more accurate than the model alone; switch off to see the model only)")}</label><label class="check" style="margin:0"><input type="checkbox" id="injT"${injOn() ? " checked" : ""}> ${L("Uwzględniaj nieobecnych zawodników (Premier League, mecze w najbliższych 10 dniach)", "Account for absent players (Premier League, matches in the next 10 days)")}</label>
      <label class="check" style="margin:12px 0 0"><input type="checkbox" id="fatT"${fatOn() ? " checked" : ""}> ${L(`Uwzględniaj zmęczenie (mecz po ≤ ${M.FATIGUE.maxDays} dniach przerwy, gdy rywal odpoczywał dłużej)`, `Account for fatigue (a match after ≤ ${M.FATIGUE.maxDays} days' rest when the opponent rested longer)`)}</label></div>`;

    const done = D.COMPS.every(c => S.bts[c.code]);
    h += `<h2>${L("Skuteczność modelu", "Model accuracy")}</h2><div class="card">
      <p class="small muted" style="margin-top:0">${L(`Test „w ciemno”: każdy mecz od ${fmtDate(`${D.seasonStart() - 1}-09-15`, false)} przewidziany wyłącznie z danych sprzed niego.`, `Blind test: every match since ${fmtDate(`${D.seasonStart() - 1}-09-15`, false)} predicted only from data available before it.`)}</p>`;
    if (done) {
      let n = 0, hit = 0, br = 0;
      h += `<div class="tbl-wrap"><table><thead><tr><th class="t">${L("Rozgrywki", "Competition")}</th><th>${L("Mecze", "Matches")}</th><th>${L("Trafiony typ", "Correct pick")}</th><th>${L("Zawsze „1”", "Always \"1\"")}</th><th>${L("Dokładny wynik", "Exact score")}</th><th>Brier</th></tr></thead><tbody>`;
      for (const c of D.COMPS) {
        const b = S.bts[c.code], home = b.n ? b.records.filter(r => r.res === 0).length / b.n : 0;
        n += b.n; hit += b.accuracy * b.n; br += b.brier * b.n;
        h += `<tr><td class="t">${compLogo(c.code, "sm")} ${esc(compShort(c.code))}</td><td>${b.n}</td><td><b>${pct(b.accuracy, 1)}</b></td><td>${pct(home, 1)}</td><td>${pct(b.exact, 1)}</td><td>${dec(b.brier.toFixed(3))}</td></tr>`;
      }
      h += `<tr><td class="t"><b>${L("Razem", "Total")}</b></td><td>${n}</td><td><b>${pct(hit / n, 1)}</b></td><td></td><td></td><td>${dec((br / n).toFixed(3))}</td></tr></tbody></table></div>
        <p class="small muted" style="margin-bottom:0">${L("Brier: mniej = lepiej; losowe typowanie daje 0,667.", "Brier: lower = better; random guessing gives 0.667.")}</p>`;
    } else h += `<button class="btn" id="btAll">${L("Policz dla wszystkich rozgrywek", "Calculate for all competitions")}</button> <span class="small muted">${L("kilka sekund", "a few seconds")}</span>`;
    h += `</div>`;

    h += `<h2>${L("Dodaj mecz lub wynik ręcznie", "Add a match or result manually")}</h2><form class="card" id="manForm">
      <div class="two"><div><label>${L("Rozgrywki", "Competition")}</label><select name="comp">${D.COMPS.map(c => `<option value="${c.code}"${c.code === S.comp ? " selected" : ""}>${esc(compName(c.code))}</option>`).join("")}</select></div><div><label>${L("Data", "Date")}</label><input type="date" name="date" value="${today()}" required></div></div>
      <div class="two"><div><label>${L("Gospodarz", "Home team")}</label><select name="home">${sopt}</select></div><div><label>${L("Gość", "Away team")}</label><select name="away">${sopt}</select></div></div>
      <div class="two"><div><label>${L("Gole gospodarza (puste = mecz przyszły)", "Home goals (empty = future match)")}</label><input type="number" name="hg" min="0" max="20"></div><div><label>${L("Gole gościa", "Away goals")}</label><input type="number" name="ag" min="0" max="20"></div></div>
      <div class="row"><button class="btn">${L("Dodaj", "Add")}</button><span class="small muted">${L("Wynik wpisany do meczu z terminarza zastępuje brakujący wynik.", "A result entered for a scheduled match fills in the missing score.")}</span></div></form>`;
    if (S.manual.length) {
      h += `<div class="card">${S.manual.slice().reverse().map((m, i) => `<div class="list-row" style="cursor:default"><span class="d">${fmtDate(m.date, false)}</span>${compLogo(m.comp, "sm")}<span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span><span class="s">${Number.isInteger(m.hg) ? `${m.hg}–${m.ag}` : "—"}</span><button class="icon-btn" data-delman="${S.manual.length - 1 - i}" aria-label="${L("Usuń", "Delete")}">✕</button></div>`).join("")}</div>`;
    }

    const pm = modelFor("PL");
    h += L(`<h2>Jak działa prognoza</h2><div class="card small">
      <p style="margin-top:0"><b>Siła ataku i obrony.</b> Każda drużyna dostaje ocenę ataku i obrony dopasowaną do meczów z dwóch sezonów (regresja Poissona). Dla meczów ligowych model uczy się z danej ligi i pucharów europejskich, dla pucharów – ze wszystkich lig naraz, które łączą się przez mecze europejskie. Nowsze mecze ważą więcej – mecz sprzed 8 miesięcy liczy się w połowie. Drużyny z małą liczbą meczów są ściągane do średniej, a beniaminkowie startują z niższą oceną.</p>
      <p><b>Gole oczekiwane (xG).</b> W meczach 8 lig z tego sezonu siła drużyn liczona jest w 70% z xG (jakość stworzonych sytuacji; football-data.co.uk, w PL także Opta przez FPL), a w 30% z goli. Gdzie xG brak (poprzedni sezon, puchary), model bierze w 40% „xG ze strzałów” z ESPN: 0,19 gola za strzał celny i 0,07 za niecelny – tak wychodzi z porównania z prawdziwym xG. W teście wstecznym to podniosło trafność z 51,0% do 52,1%.</p>
      <p><b>Nauka z kursów.</b> Model uczy się też z tego, czego bukmacherzy spodziewali się w rozegranych już meczach: z kursów zamknięcia każdego meczu wyliczamy oczekiwane gole i liczymy je w połowie obok goli i xG. Kursy zawierają wiedzę o składach i formie, więc siła drużyn jest trafniejsza – w teście wstecznym trafność modelu wzrosła z 50,9% do 52,0%, a w Ekstraklasie z 42,5% do 46,2%. Do prognozy meczu używane są tylko kursy z wcześniejszych meczów.</p>
      <p><b>Wynik meczu.</b> Z ocen wychodzą oczekiwane gole obu drużyn (z przewagą własnego boiska, w PL ok. ${Math.round((Math.exp(pm.home) - 1) * 100)}% więcej goli gospodarza). Rozkład Poissona z poprawką Dixona-Colesa daje szansę każdego wyniku, a z nich – 1/X/2, powyżej 2,5 gola i „obie strzelą”.</p>
      <p><b>Prognoza z kursów.</b> Gdy mecz ma kursy bukmachera (bet365 z football-data.co.uk, a gdy ich brak – DraftKings z ESPN), prognoza na stronie pochodzi z nich: z kursów 1X2 i na 2,5 gola, po zdjęciu marży, wyliczamy oczekiwane gole obu drużyn, a z nich wszystkie rynki. W teście na 3527 meczach ligowych było to trafniejsze od modelu na każdym rynku (1X2: 52,7% wobec 51,2%), a dokładanie modelu tylko pogarszało wynik. Model zostaje jako drugie zdanie, dla meczów bez kursów i do symulacji tabeli. Można to wyłączyć wyżej.</p>
      <p><b>Tabela końcowa.</b> Pozostałe mecze sezonu losowane 3000 razy.</p>
      <p><b>Nieobecni</b> (tylko Premier League). Dla meczów w najbliższych 10 dniach model obniża atak drużyny o udział brakujących zawodników w jej xG i asystach oczekiwanych (zmiennicy odrabiają ok. 40%, najwyżej −25%) i podnosi liczbę traconych goli, gdy brakuje bramkarza lub obrońców (najwyżej +20%).</p>
      <p><b>Zmęczenie.</b> Drużyna grająca po najwyżej ${M.FATIGUE.maxDays} dniach przerwy przeciw rywalowi, który odpoczywał dłużej, ma atak niższy o ${pct(M.FATIGUE.att)} i traci o ${pct(M.FATIGUE.def)} więcej goli.</p>
      <p><b>Elo</b> to osobny ranking formy, aktualizowany po każdym meczu.</p>
      <p class="muted" style="margin-bottom:0">Model nie zna potwierdzonych składów, zmian trenera ani motywacji – traktuj prognozy jako punkt wyjścia, nie pewniak. Ekstraklasa pochodzi z football-data.co.uk (wyniki i kursy; bez xG, strzałów i składów), więc jej prognozy są mniej dokładne.</p></div>`,
      `<h2>How the forecast works</h2><div class="card small">
      <p style="margin-top:0"><b>Attack and defence strength.</b> Every team gets an attack and a defence rating fitted to two seasons of matches (Poisson regression). For league matches the model learns from that league plus the European cups; for cup matches from all leagues at once, linked through European games. Recent matches count more – a match from 8 months ago counts half. Teams with few matches are pulled towards the average, and promoted teams start with a lower rating.</p>
      <p><b>Expected goals (xG).</b> In this season's matches in 8 leagues, team strength is based 70% on xG (chance quality; football-data.co.uk, in the PL also Opta via FPL) and 30% on goals. Where xG is missing (last season, cups), the model uses 40% "shot-based xG" from ESPN: 0.19 goals per shot on target and 0.07 per other shot – derived by comparison with real xG. In the backtest this raised accuracy from 51.0% to 52.1%.</p>
      <p><b>Learning from odds.</b> The model also learns from what bookmakers expected in matches already played: from each match's closing odds we derive expected goals and weight them at 50% alongside goals and xG. Odds contain knowledge about line-ups and form, so team strength is more accurate – in the backtest model accuracy rose from 50.9% to 52.0%, and in the Ekstraklasa from 42.5% to 46.2%. Only odds from earlier matches are used to forecast a match.</p>
      <p><b>Match result.</b> The ratings give expected goals for both teams (with home advantage – in the PL the home side scores about ${Math.round((Math.exp(pm.home) - 1) * 100)}% more). A Poisson distribution with the Dixon-Coles adjustment gives the chance of every score, and from them 1/X/2, over 2.5 goals and both teams to score.</p>
      <p><b>Forecast from odds.</b> When a match has bookmaker odds (bet365 from football-data.co.uk, otherwise DraftKings from ESPN), the forecast shown comes from them: from the 1X2 and 2.5-goal odds, with the margin removed, we derive both teams' expected goals and from them every market. In a test on 3,527 league matches this was more accurate than the model on every market (1X2: 52.7% vs 51.2%), and blending in the model only made it worse. The model remains as a second opinion, for matches without odds and for the table simulation. You can switch this off above.</p>
      <p><b>Final table.</b> The remaining matches of the season are simulated 3,000 times.</p>
      <p><b>Absences</b> (Premier League only). For matches in the next 10 days the model lowers a team's attack by the missing players' share of its xG and expected assists (substitutes make up about 40%, at most −25%) and raises goals conceded when goalkeepers or defenders are missing (at most +20%).</p>
      <p><b>Fatigue.</b> A team playing after at most ${M.FATIGUE.maxDays} days' rest against an opponent who rested longer gets ${pct(M.FATIGUE.att)} lower attack and concedes ${pct(M.FATIGUE.def)} more goals.</p>
      <p><b>Elo</b> is a separate form rating, updated after every match.</p>
      <p class="muted" style="margin-bottom:0">The model does not know confirmed line-ups, managerial changes or motivation – treat forecasts as a starting point, not a sure thing. Ekstraklasa data comes from football-data.co.uk (results and odds; no xG, shots or line-ups), so its forecasts are less precise.</p></div>`);
    return h;
  }

  /* ---------- renderowanie i zdarzenia ---------- */
  const VIEWS = { mecze: viewMecze, tabela: viewTabela, kluby: viewKluby, typuj: viewTypuj, typy: viewTypy, dane: viewDane };
  // napisy poza widokiem (index.html): zakładki, nagłówek, tytuł strony
  const TABS = { mecze: ["Mecze", "Matches"], tabela: ["Tabela", "Table"], kluby: ["Kluby", "Clubs"], typuj: ["Typuj", "Predict"], typy: ["Typy", "Tips"], dane: ["Dane", "Data"] };
  function staticTexts() {
    document.documentElement.lang = LANG;
    document.title = L("Futbol – prognozy meczów", "Futbol – match forecasts");
    document.querySelectorAll(".tabs button").forEach(b => { const t = TABS[b.dataset.tab]; const n = [...b.childNodes].find(x => x.nodeType === 3); if (t && n) n.textContent = L(...t); });
    const sm = document.querySelector(".brand small"); if (sm) sm.textContent = L("prognozy", "forecasts");
    const rf = $("#refresh"); rf.setAttribute("aria-label", L("Odśwież dane", "Refresh data")); rf.title = L("Odśwież dane", "Refresh data");
    document.querySelectorAll(".sheet-x").forEach(b => b.setAttribute("aria-label", L("Zamknij", "Close")));
  }
  function setLang(l) {
    LANG = l === "en" ? "en" : "pl";
    store.set(LS.lang, LANG);
    S._expl = new Map(); S.predCache = new Map(); S.pmCache = new Map(); S.calib = null;
    staticTexts(); render();
  }
  function render() {
    if (!S.raw) return;
    ensureExamples();
    freshness();
    staticTexts();
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("#view").innerHTML = (VIEWS[S.tab] || viewMecze)();
    bindView();
    const on = document.querySelector(".cchip.on");
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function bindView() {
    const v = $("#view");
    if (S.tab === "mecze") { bindWeekend(); fillWeekend(); }
    if (S.tab === "kluby" && $("#cq")) {
      $("#cq").oninput = e => { S.clubQ = e.target.value; $("#cres").innerHTML = clubSearchHtml(S.clubQ); };
    }
    if (S.tab === "typuj") {
      $("#tn").onchange = () => { S.typ = { ...S.typ, neutral: $("#tn").checked }; render(); };
      $("#tswap").onclick = () => { S.typ = { ...S.typ, home: S.typ.away, away: S.typ.home }; render(); };
    }
    if (S.tab === "typy") {
      const cb = $("#calibBtn");
      if (cb) cb.onclick = () => { cb.disabled = true; cb.textContent = L("Liczę…", "Calculating…"); setTimeout(() => { S.calib = computeCalib(); render(); }, 30); };
      const de = $("#delEx");
      if (de) de.onclick = () => { if (confirm(L("Usunąć wszystkie przykładowe typy?", "Delete all example picks?"))) { S.tips = S.tips.filter(t => !t.example); saveTips(); render(); } };
      const da = $("#delAllTips");
      if (da) da.onclick = () => { if (confirm(L("Usunąć wszystkie typy? Tego nie da się cofnąć.", "Delete all picks? This cannot be undone."))) { S.tips = []; saveTips(); render(); } };
    }
    if (S.tab === "dane") {
      $("#dRefresh").onclick = () => load(true);
      $("#injT").onchange = e => { store.set(LS.inj, e.target.checked); S.absCache = new Map(); S.predCache = new Map(); S._expl = new Map(); render(); };
      $("#fatT").onchange = e => { store.set(LS.fat, e.target.checked); S.bts = {}; S.btMap = new Map(); S.predCache = new Map(); S._expl = new Map(); render(); };
      $("#mktT").onchange = e => { store.set(LS.mkt, e.target.checked); S.predCache = new Map(); S._expl = new Map(); render(); };
      const ba = $("#btAll");
      if (ba) ba.onclick = () => { ba.disabled = true; ba.textContent = L("Liczę…", "Calculating…"); setTimeout(() => { D.COMPS.forEach(c => btFor(c.code)); render(); }, 30); };
      $("#manForm").onsubmit = e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const home = f.get("home"), away = f.get("away");
        if (home === away) { alert(L("Wybierz dwie różne drużyny.", "Choose two different teams.")); return; }
        const hg = f.get("hg"), ag = f.get("ag");
        if ((hg === "") !== (ag === "")) { alert(L("Wpisz gole obu drużyn albo zostaw oba pola puste.", "Enter goals for both teams or leave both empty.")); return; }
        const date = f.get("date"), comp = f.get("comp");
        const ex = S.matches.find(m => m.comp === comp && m.home === home && m.away === away && Math.abs(new Date(m.date) - new Date(date)) <= 3 * 86400000);
        addManual({ comp, season: ex?.season || D.seasonOf(date), round: ex?.round || "", date: ex?.date || date, time: ex?.time || "", home, away, hg: hg === "" ? null : +hg, ag: ag === "" ? null : +ag });
      };
      v.querySelectorAll("[data-delman]").forEach(b => b.onclick = () => { S.manual.splice(+b.dataset.delman, 1); store.set(LS.manual, S.manual); compute(); render(); });
    }
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-savebet],[data-betdays],[data-typysub],[data-deltip],[data-tipf],[data-tab],[data-comp],[data-season],[data-more],[data-match],[data-club],[data-close],[data-go],[data-picker],[data-pick],[data-fav],[data-lang],[data-hround],[data-hseason]");
    if (!el) return;
    const d = el.dataset;
    if (d.close !== undefined) return closeSheet();
    if (d.lang) { setLang(d.lang); return; }
    if (d.hround !== undefined) { S.histIdx = +d.hround; const y = scrollY; render(); scrollTo(0, y); return; }
    if (d.hseason) { S.histSeason = d.hseason; S.histIdx = null; const y = scrollY; render(); scrollTo(0, y); return; }
    if (d.fav) {
      e.stopPropagation(); toggleFav(d.fav);
      document.querySelectorAll(`[data-fav="${CSS.escape(d.fav)}"]`).forEach(b => { const on = isFav(d.fav); b.classList.toggle("on", on); b.textContent = on ? "★" : "☆"; });
      if (S.tab === "kluby" && $("#sheet").hidden) render();
      return;
    }
    if (d.picker) return openPicker(d.picker);
    if (d.pick) return pickTeam(d.pick, d.team);
    if (d.deltip) { e.stopPropagation(); return deleteTip(d.deltip); }
    if (d.tipf) { S.tipFilter = d.tipf; render(); return; }
    if (d.typysub) { S.typySub = d.typysub; render(); return; }
    if (d.betdays) { S.betDays = +d.betdays; render(); return; }
    if (d.savebet !== undefined) { e.stopPropagation(); const x = S._betList?.[+d.savebet]; if (x) saveBet(x); return; }
    if (d.tab || d.go) { S.tab = d.tab || d.go; store.set(LS.tab, S.tab); closeSheet(); render(); scrollTo(0, 0); return; }
    if (d.comp) { S.comp = d.comp; S.tableSeason = null; S.showOverdue = false; S.histIdx = null; S.histSeason = null; store.set(LS.comp, S.comp); render(); return; }
    if (d.season) { S.tableSeason = d.season; render(); return; }
    if (d.more) { S.showOverdue = true; render(); return; }
    if (d.match) return openMatch(d.match);
    if (d.club) return openClub(d.club);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  function openSheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").hidden = false; $(".sheet-card").scrollTop = 0; document.body.style.overflow = "hidden"; }
  function closeSheet() { S.sheetId = null;  $("#sheet").hidden = true; document.body.style.overflow = ""; }
  $("#refresh").onclick = () => load(true);

  // wyniki na żywo: co minutę (tylko gdy aplikacja jest widoczna i trwają mecze) oraz po powrocie do aplikacji
  setInterval(pollLive, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pollLive(); });
  staticTexts();
  const ld = document.querySelector("#view .loading"); if (ld) ld.textContent = L("Wczytuję dane…", "Loading data…");
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load(false);
})();
