/* Futbol – interfejs: najważniejsze ligi i puchary europejskie – mecze z prognozami, tabele z symulacją sezonu,
   karty klubów z logami, typowanie dowolnego meczu, źródła danych i skuteczność modelu. */
(function () {
  "use strict";
  const M = window.FModel, D = window.FData;
  const LS = { tips: "futbol.tips.v1", fat: "futbol.fatigue", inj: "futbol.injuries", cache: "futbol.cache.v2", manual: "futbol.manual.v1", tab: "futbol.tab", comp: "futbol.comp" };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  try { localStorage.removeItem("futbol.cache.v1"); localStorage.removeItem("futbol.fdkey"); localStorage.removeItem("futbol.filter"); } catch { /* stare klucze */ }

  const XG = 0.7;              // udział xG w ocenie siły (reszta – gole); dobrane testem wstecznym
  const EURO = new Set(["CL", "EL"]);
  const FIT = { shrink: 6, halfLife: 240, xg: XG };

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
  const compLogo = (c, cls = "") => `<img class="clogo ${cls}" src="${D.leagueLogo(c)}" alt="" loading="lazy" onerror="this.remove()">`;
  const compTag = c => `<span class="ctag">${compLogo(c)}${esc(D.COMP[c]?.short || c)}</span>`;
  const compName = c => D.COMP[c]?.name || c;

  /* ---------- daty ---------- */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const fmtDate = (d, withDay = true) => new Date(d + "T12:00:00").toLocaleDateString("pl-PL", withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
  const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  /* ---------- stan ---------- */
  const S = {
    raw: null, teams: {}, players: [], manual: store.get(LS.manual, []), matches: [], status: [],
    elo: null, models: {}, bts: {}, btMap: new Map(), sims: {}, rest: new Map(), absCache: new Map(),
    tab: store.get(LS.tab, "mecze"), comp: store.get(LS.comp, "PL"), tableSeason: null, typ: null,
    tips: store.get(LS.tips, null), tipFilter: "all",
  };
  if (!D.COMP[S.comp]) S.comp = "PL";
  const curSeason = () => D.seasonLabel(D.seasonStart());
  const prevSeason = () => D.seasonLabel(D.seasonStart() - 1);
  const isCup = c => !!D.COMP[c]?.cup;

  function compute() {
    const r = S.raw;
    const es = D.parseEspn(r.espn);          // najpierw ESPN – jego nazwy klubów są wzorcowe
    const fpl = r.fpl ? D.parseFpl(r.fpl) : null;
    const xg = r.xg ? D.parseXg(r.xg) : null;
    S.teams = es.teams;
    S.status = es.status; S.updated = es.updated; S.fplInfo = fpl ? { updated: fpl.updated, players: fpl.players.length, played: fpl.played } : null;
    S.matches = D.merge([es.matches, fpl ? fpl.matches : [], S.manual.map(m => ({ ...m, src: "manual" }))]);
    S.xgCount = xg ? D.attachXg(S.matches, xg) : 0;
    S.players = fpl ? fpl.players.map(p => ({ ...p, team: D.canon(p.team) })) : [];
    S.elo = M.elo(S.matches);
    S.rest = new Map([...M.restDays(S.matches)].map(([m, x]) => [m.id, x]));
    S.models = {}; S.bts = {}; S.btMap = new Map(); S.sims = {}; S.absCache = new Map(); S._teamsOf = {}; S._league = null;
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
  function modelFor(comp) {
    return S.models[comp] || (S.models[comp] = M.fit(dataFor(comp), { ...FIT, asOf: today(), priors: priorsFor(comp) }));
  }
  function modelForPair(h, a) {
    const lh = leagueOf(h), la = leagueOf(a);
    return lh && lh === la ? modelFor(lh) : modelFor("CL");
  }
  const pred = m => M.predict(modelFor(m.comp), m.home, m.away, { neutral: m.neutral, adj: adjFor(m) });

  function btFor(comp) {
    if (S.bts[comp]) return S.bts[comp];
    const b = M.backtest(dataFor(comp), {
      from: `${D.seasonStart() - 1}-09-15`, filter: m => m.comp === comp,
      fit: { ...FIT, priors: priorsFor(comp) }, adjFn: fatOn() ? m => M.fatigueAdj(S.rest.get(m.id)) : null,
    });
    for (const r of b.records) S.btMap.set(r.m.id, r);
    return (S.bts[comp] = b);
  }
  function simFor(comp) {
    if (S.sims[comp] !== undefined) return S.sims[comp];
    const lm = S.matches.filter(m => m.comp === comp && m.season === curSeason());
    return (S.sims[comp] = !isCup(comp) && lm.some(m => !M.played(m)) ? M.simulateSeason(modelFor(comp), lm, { runs: 3000 }) : null);
  }

  /* ---------- ładowanie danych ---------- */
  async function load(force) {
    const cache = store.get(LS.cache, null);
    if (cache?.espn && !S.raw) { S.raw = cache; S.fetchedAt = cache.at; compute(); render(); }
    const fresh = !cache || force || Date.now() - (cache.at || 0) > 20 * 60 * 1000;
    if (!fresh) return;
    $("#refresh").classList.add("spin");
    try {
      const [espn, fpl, xg] = await Promise.all([D.getJson("dane/espn.json"), D.getJson("dane/fpl.json").catch(() => null), D.getJson("dane/xg.json").catch(() => null)]);
      S.raw = { espn, fpl, xg, at: Date.now() };
      S.fetchedAt = S.raw.at;
      if (!store.set(LS.cache, S.raw)) store.set(LS.cache, { espn, at: S.raw.at }); // za mało miejsca – przynajmniej wyniki
      compute(); render();
    } catch (e) {
      if (!S.raw) $("#view").innerHTML = `<div class="empty">Nie udało się pobrać danych. Sprawdź internet i spróbuj ponownie.<div class="row" style="justify-content:center"><button class="btn" onclick="location.reload()">Spróbuj ponownie</button></div></div>`;
      else toastNotice("Brak połączenia – pokazuję zapisane dane z " + new Date(S.fetchedAt).toLocaleString("pl-PL"));
    } finally {
      $("#refresh").classList.remove("spin");
    }
  }
  function toastNotice(html) { const n = $("#notice"); n.innerHTML = html; n.hidden = false; }
  function freshness() {
    const n = $("#notice");
    const age = S.updated ? (Date.now() - new Date(S.updated)) / 3600000 : 0;
    if (age > 24) { n.innerHTML = `Dane są z <b>${new Date(S.updated).toLocaleString("pl-PL")}</b> – automatyczne odświeżanie mogło się zatrzymać.`; n.hidden = false; }
    else n.hidden = true;
  }

  /* ---------- zawodnicy: kontuzje, zawieszenia, forma (Fantasy Premier League) ---------- */
  const POS = { 1: "BR", 2: "OBR", 3: "POM", 4: "NAP" };
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
  const plNews = t => PL_WORDS.reduce((s, [re, r]) => s.replace(re, r), t || "");
  function statusTag(x) {
    if (x.p.st === "s") return `<span class="tag bad">zawieszony</span>`;
    if (x.av === 0) return `<span class="tag bad">nie zagra</span>`;
    return `<span class="tag wait">${Math.round(x.av * 100)}% szans</span>`;
  }
  function absenceHtml(team, limit = 8) {
    const a = absences(team);
    if (!a) return `<div class="muted small">Brak danych o kadrze – kontuzje są dostępne tylko dla klubów Premier League.</div>`;
    if (!a.list.length) return `<div class="muted small">Wszyscy zawodnicy dostępni.</div>`;
    const rows = a.list.slice(0, limit).map(x => `<div class="list-row" style="cursor:default;align-items:flex-start">
        <span class="res N" style="width:auto;padding:0 5px">${POS[x.p.pos]}</span>
        <span class="x" style="white-space:normal"><b>${esc(x.p.n)}</b> ${statusTag(x)}<br><span class="small muted">${esc(plNews(x.p.news))}${x.xgiShare > 0.03 ? ` · ${pct(x.xgiShare)} xG+xA drużyny` : ""}</span></span></div>`).join("");
    const more = a.list.length > limit ? `<div class="small muted" style="padding-top:6px">i ${a.list.length - limit} innych (mało grających)</div>` : "";
    return rows + more + `<div class="small muted" style="padding-top:8px">Wpływ na prognozę: atak ${a.att < 0.995 ? "−" + pct(1 - a.att) : "bez zmian"}, obrona ${a.def > 1.005 ? "+" + pct(a.def - 1) + " straconych goli" : "bez zmian"}.</div>`;
  }
  function restHtml(m) {
    const r = S.rest.get(m.id);
    if (!r || r.h === null || r.a === null) return "";
    const f = M.fatigueAdj(r), F = M.FATIGUE;
    const tired = f ? (f.home.att ? m.home : m.away) : null;
    return `<h2>Odpoczynek przed meczem</h2><div class="card small">${esc(short(m.home))}: <b>${r.h} dni</b> od poprzedniego meczu · ${esc(short(m.away))}: <b>${r.a} dni</b>
      ${tired ? `<br><b>${esc(short(tired))}</b> gra po krótkiej przerwie, a rywal odpoczywał dłużej${M.played(m) ? "." : fatOn() ? ` – w prognozie: atak −${pct(F.att)}, +${pct(F.def)} straconych goli.` : " (zmęczenie wyłączone w Danych)."}` : ""}
      <div class="muted" style="margin-top:4px">Liczone z meczów ligowych i europejskich – bez pucharów krajowych, więc przerwa bywa krótsza niż tu widać.</div></div>`;
  }

  /* ---------- elementy wspólne ---------- */
  function probBar(p) {
    return `<div class="bar"><i class="w" style="width:${p.win * 100}%"></i><i class="d" style="width:${p.draw * 100}%"></i><i class="l" style="width:${p.loss * 100}%"></i></div>
      <div class="bar-l"><span>1 <b>${pct(p.win)}</b></span><span>X <b>${pct(p.draw)}</b></span><span>2 <b>${pct(p.loss)}</b></span></div>`;
  }
  function compBar(sel, opts = {}) {
    const list = D.COMPS.filter(c => !opts.leaguesOnly || !c.cup);
    return `<div class="cbar" role="tablist">${list.map(c => `<button class="cchip${c.code === sel ? " on" : ""}" data-comp="${c.code}" role="tab" aria-selected="${c.code === sel}">${compLogo(c.code)}<span>${esc(c.short)}</span></button>`).join("")}</div>`;
  }

  function matchCard(m) {
    const done = M.played(m);
    const p = pred(m);
    const bt = done ? S.btMap.get(m.id) : null;
    let mid;
    if (done) mid = `<div class="score">${m.hg}–${m.ag}${m.pens ? `<small>k. ${m.pens[0]}–${m.pens[1]}</small>` : m.aet ? `<small>po dogr. ${m.aet[0]}–${m.aet[1]}</small>` : ""}</div>`;
    else if (m.live) mid = `<div class="score live">${m.live[0]}–${m.live[1]}<small>na żywo</small></div>`;
    else mid = `<div class="score pred">${p.top[0].hg}–${p.top[0].ag}<small>typ</small></div>`;
    let tag = "";
    if (bt) tag = bt.hit ? `<span class="tag ok">model trafił</span>` : `<span class="tag bad">model nie trafił</span>`;
    else if (!done && !m.live && m.date < today()) tag = `<span class="tag wait">czeka na wynik</span>`;
    const miss = !done && injAdj(m) ? (() => { const n = t => (absences(t)?.list || []).filter(x => x.weight > 0.04).map(x => x.p.n); const k = [...n(m.home), ...n(m.away)]; return k.length ? `<div class="small muted" style="margin-top:6px">Brakuje: ${esc(k.slice(0, 4).join(", "))}${k.length > 4 ? ` i ${k.length - 4} innych` : ""}</div>` : ""; })() : "";
    return `<button class="card match" data-match="${esc(m.id)}">
      <div class="m-meta"><span>${compTag(m.comp)}${m.round ? ` · ${esc(m.round)}` : ""}</span><span>${tag} ${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="m-row">${teamEl(m.home)}${mid}${teamEl(m.away, true)}</div>
      ${done && !bt ? "" : probBar(bt ? { win: bt.probs[0], draw: bt.probs[1], loss: bt.probs[2] } : p)}
      ${miss}
      ${tipLine(m)}
    </button>`;
  }

  function formOf(team, n = 5) {
    return S.matches.filter(m => M.played(m) && (m.home === team || m.away === team)).slice(-n).map(m => {
      const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg;
      return { m, r: gf > ga ? "W" : gf === ga ? "R" : "P" };
    });
  }
  const formHtml = f => `<span class="form">${f.map(x => `<i class="${x.r}" title="${esc(short(x.m.home))} ${x.m.hg}–${x.m.ag} ${esc(short(x.m.away))} (${esc(D.COMP[x.m.comp]?.short || "")})">${x.r}</i>`).join("")}</span>`;

  /* ---------- prognoza meczu ---------- */
  function predictionHtml(home, away, opts = {}) {
    const mdl = opts.model || modelForPair(home, away);
    const p = M.predict(mdl, home, away, { neutral: opts.neutral, adj: opts.adj });
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
    const h2h = S.matches.filter(m => M.played(m) && ((m.home === home && m.away === away) || (m.home === away && m.away === home))).slice(-6).reverse();
    const lowData = [home, away].filter(t => !(t in mdl.att) || (mdl.games[t] || 0) < 4);
    const squad = opts.squad !== false && (absences(home) || absences(away));
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
      ${squad ? `<h2>Kadra przed meczem${opts.injApplied ? "" : injOn() ? " (poza oknem 10 dni – nieuwzględniona)" : " (wyłączone w Danych)"}</h2>
      <div class="card"><div class="list-row" style="cursor:default">${badge(home)}<b class="x">${esc(short(home))}</b></div>${absenceHtml(home, 6)}</div>
      <div class="card"><div class="list-row" style="cursor:default">${badge(away)}<b class="x">${esc(short(away))}</b></div>${absenceHtml(away, 6)}</div>` : ""}
      ${opts.match ? restHtml(opts.match) : ""}
      <h2>Forma (ostatnie 5)</h2>
      <div class="card">
        <div class="list-row" style="cursor:default">${badge(home)}<span class="x">${esc(short(home))}</span>${formHtml(formOf(home))}</div>
        <div class="list-row" style="cursor:default">${badge(away)}<span class="x">${esc(short(away))}</span>${formHtml(formOf(away))}</div>
      </div>
      ${h2h.length ? `<h2>Bezpośrednie mecze</h2><div class="card">${h2h.map(m => resultRow(m)).join("")}</div>` : ""}`;
  }

  function resultRow(m, team) {
    const done = M.played(m);
    let r = "N";
    if (done && team) { const gf = m.home === team ? m.hg : m.ag, ga = m.home === team ? m.ag : m.hg; r = gf > ga ? "W" : gf === ga ? "R" : "P"; }
    const right = done ? `${m.xhg !== undefined ? `<span class="small muted">xG ${m.xhg.toFixed(1)}–${m.xag.toFixed(1)}</span>` : ""}<span class="s">${m.hg}–${m.ag}</span>`
      : (() => { const p = pred(m); return `<span class="small muted">${pct(p.win)} / ${pct(p.draw)} / ${pct(p.loss)}</span>`; })();
    return `<div class="list-row" data-match="${esc(m.id)}">${team ? `<span class="res ${r}">${done ? r : "–"}</span>` : ""}<span class="d">${fmtDate(m.date, false)}</span>${compLogo(m.comp, "sm")}<span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span>${right}</div>`;
  }

  function openMatch(id) {
    const m = S.matches.find(x => x.id === id);
    if (!m) return;
    btFor(m.comp);
    const done = M.played(m), bt = S.btMap.get(m.id);
    const p = pred(m);
    let html = `<div class="m-meta" style="padding-right:36px"><span>${compTag(m.comp)}${m.round ? ` · ${esc(m.round)}` : ""}</span><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span></div>
      <div class="vs"><div class="tm" data-club="${esc(m.home)}">${badge(m.home, "lg")}${esc(short(m.home))}</div>
      <div class="sc">${done ? `${m.hg}–${m.ag}` : m.live ? `${m.live[0]}–${m.live[1]}` : `<span style="color:var(--accent)">${p.top[0].hg}–${p.top[0].ag}</span>`}<div class="small muted">${done ? (m.pens ? `karne ${m.pens[0]}–${m.pens[1]}` : m.aet ? `po dogrywce ${m.aet[0]}–${m.aet[1]}` : m.xhg !== undefined ? `xG ${m.xhg.toFixed(2)} – ${m.xag.toFixed(2)}` : "wynik") : m.live ? "na żywo" : "najbardziej prawdopodobny"}</div></div>
      <div class="tm" data-club="${esc(m.away)}">${badge(m.away, "lg")}${esc(short(m.away))}</div></div>`;
    if (done && bt) html += `<div class="card"><b>Przed meczem model dawał:</b> 1 ${pct(bt.probs[0])} · X ${pct(bt.probs[1])} · 2 ${pct(bt.probs[2])}, typ ${bt.top.hg}–${bt.top.ag}. ${bt.hit ? `<span class="tag ok">trafiony</span>` : `<span class="tag bad">nietrafiony</span>`}</div>`;
    html += done ? `<h2>Gdyby zagrali teraz</h2>` : "";
    html += predictionHtml(m.home, m.away, { model: modelFor(m.comp), neutral: m.neutral, adj: adjFor(m), injApplied: !!injAdj(m), match: m, squad: !done });
    html += tipSectionHtml(m, p);
    html += `<h2>${done ? "Popraw wynik" : "Wpisz wynik"}</h2>
      <form class="card" id="resForm"><div class="two"><div><label>${esc(short(m.home))}</label><input type="number" min="0" max="20" name="hg" value="${done ? m.hg : ""}" required></div>
      <div><label>${esc(short(m.away))}</label><input type="number" min="0" max="20" name="ag" value="${done ? m.ag : ""}" required></div></div>
      <div class="row"><button class="btn">Zapisz wynik</button><span class="small muted">Wynik po 90 minutach. Zostaje w tej przeglądarce.</span></div></form>`;
    openSheet(html);
    bindTipForm(m, p);
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
  const tipFor = m => (S.tips || []).find(t => t.comp === m.comp && t.home === m.home && t.away === m.away && near(m.date, t.date));
  const sign = (a, b) => Math.sign(a - b);
  // rozliczenie: 3 pkt za dokładny wynik, 1 pkt za trafiony 1X2
  function tipResult(t) {
    const m = tipMatch(t);
    if (!m || !M.played(m)) return { m, done: false };
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
    const notes = ["Przykład: typuję wyżej niż model", "Przykładowy typ – możesz go zmienić lub usunąć", "Przykład: typ jak model"];
    up.forEach((m, i) => { const p = pred(m), x = p.top[0]; out.push(newTip(m, i === 0 ? x.hg + 1 : x.hg, x.ag, notes[i], p, true)); });
    const bt = btFor("PL");
    const rec = bt.records.slice(-40);
    const ok = r => sign(r.top.hg, r.top.ag) === sign(r.m.hg, r.m.ag);
    const pick = [rec.filter(ok).pop(), rec.filter(r => !ok(r)).pop()].filter(Boolean);
    for (const r of pick) {
      const tip = newTip(r.m, r.top.hg, r.top.ag, "Przykład: typ już rozliczony", { top: [r.top], win: r.probs[0], draw: r.probs[1], loss: r.probs[2] }, true);
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
    const tag = r.done ? (r.exact ? `<span class="tag ok">dokładnie! +3</span>` : r.outcome ? `<span class="tag ok">+1</span>` : `<span class="tag bad">0 pkt</span>`) : "";
    return `<div class="tipline">★ Mój typ: <b>${t.hg}–${t.ag}</b> ${tag}</div>`;
  }
  function tipSectionHtml(m, p) {
    const t = tipFor(m), done = M.played(m);
    if (done || m.live) {
      if (!t) return "";
      const r = tipResult(t);
      return `<h2>Mój typ</h2><div class="card"><div class="list-row" style="cursor:default"><span class="x">Typowałeś <b>${t.hg}–${t.ag}</b>${t.note ? ` · ${esc(t.note)}` : ""}</span>
        ${r.done ? (r.exact ? `<span class="tag ok">dokładny wynik · 3 pkt</span>` : r.outcome ? `<span class="tag ok">trafiony 1X2 · 1 pkt</span>` : `<span class="tag bad">0 pkt</span>`) : `<span class="tag wait">trwa</span>`}</div>
        <div class="row"><button class="btn sec" data-deltip="${t.id}">Usuń typ</button></div></div>`;
    }
    const hg = t ? t.hg : p.top[0].hg, ag = t ? t.ag : p.top[0].ag;
    return `<h2>Mój typ</h2><form class="card" id="tipForm">
      <div class="two"><div><label>${esc(short(m.home))}</label><input type="number" min="0" max="20" name="hg" value="${hg}" required></div>
      <div><label>${esc(short(m.away))}</label><input type="number" min="0" max="20" name="ag" value="${ag}" required></div></div>
      <label>Notatka (opcjonalnie)</label><input type="text" name="note" maxlength="120" value="${esc(t?.note || "")}" placeholder="np. bez Saki, gra po LM">
      <div class="row"><button class="btn">${t ? "Zmień typ" : "Zapisz mój typ"}</button>${t ? `<button type="button" class="btn sec" data-deltip="${t.id}">Usuń typ</button>` : ""}
      <span class="small muted">Model typuje ${p.top[0].hg}–${p.top[0].ag}. Typy są w zakładce „Moje typy”.</span></div></form>`;
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
      toast(old ? "Typ zmieniony" : "Typ zapisany w „Moje typy”");
      closeSheet(); render();
    };
  }
  function deleteTip(id) {
    const t = (S.tips || []).find(x => x.id === id);
    if (!t) return;
    if (!confirm(`Usunąć typ ${short(t.home)} – ${short(t.away)} (${t.hg}–${t.ag})?`)) return;
    S.tips = S.tips.filter(x => x.id !== id);
    saveTips(); closeSheet(); render();
  }
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2200);
  }

  function viewTypy() {
    const tips = (S.tips || []).map(t => ({ t, r: tipResult(t) }));
    const pend = tips.filter(x => !x.r.done).sort((a, b) => a.t.date.localeCompare(b.t.date));
    const done = tips.filter(x => x.r.done).sort((a, b) => b.t.date.localeCompare(a.t.date));
    const f = S.tipFilter;
    const pts = done.reduce((s, x) => s + x.r.pts, 0);
    const oc = done.filter(x => x.r.outcome).length, ex = done.filter(x => x.r.exact).length;
    const withModel = done.filter(x => x.r.modelOutcome !== null), mo = withModel.filter(x => x.r.modelOutcome).length;
    let h = `<h2>Moje typy</h2>
      <div class="stats" style="margin-top:0"><div class="stat"><b>${tips.length}</b><span>zapisanych</span></div><div class="stat"><b>${pend.length}</b><span>oczekuje</span></div>
      <div class="stat"><b>${pts}</b><span>punkty (3 za wynik, 1 za 1X2)</span></div>
      <div class="stat"><b>${done.length ? pct(oc / done.length) : "–"}</b><span>trafione 1X2${withModel.length ? ` · model ${pct(mo / withModel.length)}` : ""}</span></div>
      <div class="stat"><b>${ex}</b><span>dokładnych wyników</span></div></div>
      <div class="chips">${[["all", "Wszystkie"], ["pend", `Oczekujące (${pend.length})`], ["done", `Rozliczone (${done.length})`]].map(([k, l]) => `<button class="chip${f === k ? " on" : ""}" data-tipf="${k}">${l}</button>`).join("")}</div>`;
    const card = ({ t, r }) => {
      const m = r.m;
      const status = r.done ? (r.exact ? `<span class="tag ok">dokładny wynik · 3 pkt</span>` : r.outcome ? `<span class="tag ok">trafiony 1X2 · 1 pkt</span>` : `<span class="tag bad">0 pkt</span>`)
        : m?.live ? `<span class="tag wait">na żywo ${m.live[0]}–${m.live[1]}</span>` : m && m.date < today() ? `<span class="tag wait">czeka na wynik</span>` : `<span class="tag wait">oczekuje</span>`;
      return `<div class="card tip${t.example ? " ex" : ""}">
        <div class="m-meta"><span>${compTag(t.comp)}${t.example ? ` <span class="tag ex">przykład</span>` : ""}</span><span>${fmtDate(t.date)}${t.time ? " · " + esc(t.time) : ""}</span></div>
        <div class="m-row" ${m ? `data-match="${esc(m.id)}" style="cursor:pointer"` : ""}>${teamEl(t.home)}<div class="score pred">${t.hg}–${t.ag}<small>mój typ</small></div>${teamEl(t.away, true)}</div>
        <div class="tipfoot"><span>${status}${r.done ? ` <span class="small muted">wynik ${m.hg}–${m.ag}</span>` : ""}</span><span class="small muted">model: ${t.model.hg}–${t.model.ag} (${pct(t.model.win)}/${pct(t.model.draw)}/${pct(t.model.loss)})</span></div>
        ${t.note ? `<div class="small muted" style="margin-top:6px">„${esc(t.note)}”</div>` : ""}
        <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sec small-btn" data-deltip="${t.id}">Usuń</button></div></div>`;
    };
    const show = f === "pend" ? pend : f === "done" ? done : [...pend, ...done];
    if (!tips.length) h += `<div class="card empty">Nie masz jeszcze typów. Otwórz dowolny mecz w zakładce Mecze i wybierz „Zapisz mój typ”.</div>`;
    else if (!show.length) h += `<div class="card empty">Brak typów w tym widoku.</div>`;
    else h += show.map(card).join("");
    const exN = tips.filter(x => x.t.example).length;
    h += `<div class="row" style="justify-content:center;margin-top:16px">${exN ? `<button class="btn sec" id="delEx">Usuń przykłady (${exN})</button>` : ""}${tips.length ? `<button class="btn danger" id="delAllTips">Usuń wszystkie typy</button>` : ""}</div>
      <p class="small muted" style="text-align:center">Typy są zapisane w tej przeglądarce na tym urządzeniu.</p>`;
    return h;
  }

  /* ---------- widoki ---------- */
  function viewMecze() {
    const c = S.comp, t = today();
    btFor(c);
    const mine = S.matches.filter(m => m.comp === c);
    const up = mine.filter(m => !M.played(m) && (m.date >= t || m.live));
    const horizon = up.length ? addDays(up[0].date, 9) : t;
    const next = up.filter(m => m.date <= horizon);
    const overdue = mine.filter(m => !M.played(m) && !m.live && m.date < t && m.season === curSeason());
    const recent = mine.filter(M.played).slice(-12).reverse();
    let h = compBar(c);
    h += `<h2>Najbliższe mecze · ${esc(compName(c))}</h2>`;
    h += next.length ? next.map(matchCard).join("") : `<div class="card empty">Brak zaplanowanych meczów w najbliższym czasie.</div>`;
    if (overdue.length) {
      h += `<h2>Czekają na wynik (${overdue.length})</h2>`;
      h += overdue.slice(-(S.showOverdue ? overdue.length : 6)).reverse().map(matchCard).join("");
      if (overdue.length > 6 && !S.showOverdue) h += `<button class="btn sec" data-more="overdue" style="width:100%">Pokaż wszystkie</button>`;
    }
    h += `<h2>Ostatnie wyniki</h2>` + (recent.length ? recent.map(matchCard).join("") : `<div class="card empty">Brak wyników.</div>`);
    return h;
  }

  function zoneOf(c, i, n) {
    const z = D.COMP[c].zones;
    if (i < z.top[0]) return "z-top";
    if (z.mid && i + 1 >= z.mid[0] && i + 1 <= z.mid[1]) return "z-mid";
    if (i >= n - z.bottom[0]) return "z-rel";
    return "";
  }
  function legendHtml(c) {
    const z = D.COMP[c].zones;
    return `<div class="legend"><span><i style="background:var(--cl)"></i>${esc(z.top[1])}</span>${z.mid ? `<span><i style="background:#f28c28"></i>${esc(z.mid[2])}</span>` : ""}<span><i style="background:var(--loss)"></i>${esc(z.bottom[1])}</span></div>`;
  }
  function tableHtml(c, rows, title) {
    let h = `<h2>${esc(title)}</h2><div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th class="t">Klub</th><th>M</th><th>W</th><th>R</th><th>P</th><th>Bramki</th><th>+/−</th><th>Pkt</th><th class="t">Forma</th></tr></thead><tbody>`;
    rows.forEach((r, i) => {
      h += `<tr class="click ${zoneOf(c, i, rows.length)}" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td>
        <td class="t"><span class="form">${r.form.slice(-5).map(x => `<i class="${x}">${x}</i>`).join("")}</span></td></tr>`;
    });
    return h + `</tbody></table></div>${legendHtml(c)}</div>`;
  }
  function viewTabela() {
    const c = S.comp;
    let h = compBar(c);
    const seasons = [curSeason(), prevSeason()].filter(s => S.matches.some(m => m.comp === c && m.season === s));
    const sea = seasons.includes(S.tableSeason) ? S.tableSeason : seasons[0];
    if (!sea) return h + `<div class="empty">Brak danych.</div>`;
    h += `<div class="chips">${seasons.map(s => `<button class="chip${s === sea ? " on" : ""}" data-season="${s}">Sezon ${s.replace("-", "/")}</button>`).join("")}</div>`;
    if (isCup(c)) {
      const lp = S.matches.filter(m => m.comp === c && m.season === sea && m.round === "Faza ligowa");
      if (!lp.length) return h + `<div class="card empty">Brak meczów fazy ligowej w tym sezonie.</div>`;
      h += tableHtml(c, M.table(lp), `${compName(c)} ${sea.replace("-", "/")} · faza ligowa`);
      const ko = S.matches.filter(m => m.comp === c && m.season === sea && m.round && m.round !== "Faza ligowa").reverse();
      if (ko.length) h += `<h2>Faza pucharowa</h2><div class="card">${ko.map(m => resultRow(m)).join("")}</div>`;
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
        h += `<h2>Prognoza końca sezonu</h2><div class="card"><p class="small muted" style="margin-top:0">3000 symulacji pozostałych ${left} meczów modelem Poissona.</p><div class="tbl-wrap"><table>
          <thead><tr><th>#</th><th class="t">Klub</th><th>Pkt (śr.)</th><th>Mistrz</th><th>Top ${topN}</th><th>Spadek</th></tr></thead><tbody>`;
        const cell = (x, col) => `<td class="pct" style="background:color-mix(in srgb, ${col} ${Math.round(x * 55)}%, transparent)">${x < 0.005 ? "–" : x > 0.995 ? ">99%" : pct(x)}</td>`;
        sim.forEach((r, i) => {
          h += `<tr class="click" data-club="${esc(r.team)}"><td>${i + 1}</td><td class="t">${teamEl(r.team)}</td><td><b>${r.expPts.toFixed(1)}</b></td>${cell(r.pos[0], "var(--accent)")}${cell(sum(r.pos, 0, topN), "var(--cl)")}${cell(sum(r.pos, T - botN, T), "var(--loss)")}</tr>`;
        });
        h += `</tbody></table></div><p class="small muted" style="margin-bottom:0">Top ${topN}: ${esc(z.top[1])}. Spadek: ostatnie ${botN} miejsca.</p></div>`;
      }
    }
    return h;
  }

  function viewKluby() {
    const c = S.comp;
    const er = S.elo.ratings;
    let teams = teamsOf(c, curSeason());
    if (!teams.length) teams = teamsOf(c, prevSeason());
    let order = teams.slice().sort((a, b) => (er[b] || 0) - (er[a] || 0));
    if (!isCup(c)) { const tb = M.table(S.matches.filter(m => m.comp === c && m.season === curSeason()), teams); if (tb.some(r => r.p)) order = tb.map(r => r.team); }
    let h = compBar(c) + `<h2>${esc(compName(c))} · ${isCup(c) ? "uczestnicy" : "kolejność jak w tabeli"}</h2><div class="grid">`;
    for (const t of order) h += `<button class="card club" data-club="${esc(t)}">${badge(t, "lg")}<span>${esc(short(t))}</span><span class="muted">Elo ${Math.round(er[t] || 1500)}</span></button>`;
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

  /* Kontuzje, xG drużyny i forma zawodników (FPL – tylko Premier League). */
  function playersHtml(t, row) {
    const ps = S.players.filter(p => p.team === t && p.st !== "u");
    if (!ps.length) return "";
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
        </tbody></table></div><p class="small muted" style="margin-bottom:0">Forma = średnia punktów Fantasy Premier League z ostatnich 30 dni (gole, asysty, czyste konta, minuty). Źródło: FPL${S.fplInfo?.updated ? `, stan z ${new Date(S.fplInfo.updated).toLocaleString("pl-PL")}` : ""}.</p></div>`;
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
    let h = `<div class="vs" style="grid-template-columns:auto 1fr;text-align:left;padding-right:36px">${badge(t, "xl")}<div><h3>${esc(t)}</h3><div class="muted small">${pos ? `${pos}. miejsce · ${esc(compName(lg))}` : lg ? esc(compName(lg)) : ""} · Elo ${Math.round(er[t] || 1500)}</div></div></div>
      <div class="stats">
        ${row ? `<div class="stat"><b>${row.pts}</b><span>punkty (${row.p} m.)</span></div><div class="stat"><b>${row.w}-${row.d}-${row.l}</b><span>W-R-P w lidze</span></div><div class="stat"><b>${row.gf}:${row.ga}</b><span>bramki w lidze</span></div>` : ""}
        ${xgFor ? `<div class="stat"><b>${xgFor.toFixed(2)}</b><span>siła ataku (gole/mecz)${attR ? ` · ${attR}. w lidze` : ""}</span></div><div class="stat"><b>${xgAg.toFixed(2)}</b><span>siła obrony (stracone/mecz)${defR ? ` · ${defR}. w lidze` : ""}</span></div>` : ""}
        ${euro.length ? `<div class="stat"><b>${euroW}/${euro.length}</b><span>wygrane w pucharach europejskich (2 sezony)</span></div>` : ""}
      </div>
      <h2>Forma (ostatnie 10)</h2><div class="card">${formHtml(formOf(t, 10))}</div>
      ${playersHtml(t, row)}
      <h2>Ranking Elo w czasie</h2><div class="card">${spark(S.elo.history[t])}</div>
      <h2>Najbliższe mecze · szanse 1 / X / 2</h2><div class="card">${next.length ? next.map(m => resultRow(m, t)).join("") : `<div class="muted">Brak meczów w terminarzu.</div>`}</div>
      <h2>Ostatnie wyniki</h2><div class="card">${last.map(m => resultRow(m, t)).join("") || `<div class="muted">Brak.</div>`}</div>`;
    const sim = inLeague ? simFor(lg) : null;
    const sr = sim && sim.find(r => r.team === t);
    if (sr) {
      const z = D.COMP[lg].zones, T = sr.pos.length, mx = Math.max(...sr.pos);
      const topP = sr.pos.slice(0, z.top[0]).reduce((a, b) => a + b, 0), relP = sr.pos.slice(T - z.bottom[0]).reduce((a, b) => a + b, 0);
      h += `<h2>Prognozowane miejsce na koniec sezonu</h2><div class="card"><div style="display:flex;align-items:flex-end;gap:3px;height:90px">${sr.pos.map((p, i) => `<div title="${i + 1}. miejsce: ${pct(p, 1)}" style="flex:1;background:${i < z.top[0] ? "var(--cl)" : i >= T - z.bottom[0] ? "var(--loss)" : "var(--draw)"};height:${Math.max(1, p / mx * 100)}%;border-radius:3px 3px 0 0;opacity:${p > 0 ? 1 : .25}"></div>`).join("")}</div>
        <div class="bar-l"><span>1.</span><span>średnio ${sr.expPts.toFixed(1)} pkt · top ${z.top[0]}: ${pct(topP)} · spadek: ${pct(relP)}</span><span>${T}.</span></div></div>`;
    }
    openSheet(h);
  }

  function viewTypuj() {
    const groups = D.COMPS.filter(c => !c.cup).map(c => [c, teamsOf(c.code, curSeason())]).filter(([, ts]) => ts.length);
    const inLeagues = new Set(groups.flatMap(([, ts]) => ts));
    const others = [...new Set(S.matches.filter(m => EURO.has(m.comp) && m.season === curSeason()).flatMap(m => [m.home, m.away]))].filter(t => !inLeagues.has(t)).sort((a, b) => short(a).localeCompare(short(b)));
    const opt = sel => groups.map(([c, ts]) => `<optgroup label="${esc(c.name)}">${ts.map(t => `<option value="${esc(t)}"${t === sel ? " selected" : ""}>${esc(short(t))}</option>`).join("")}</optgroup>`).join("")
      + (others.length ? `<optgroup label="Inne kluby z pucharów">${others.map(t => `<option value="${esc(t)}"${t === sel ? " selected" : ""}>${esc(short(t))}</option>`).join("")}</optgroup>` : "");
    const first = groups[0]?.[1] || [];
    const st = S.typ || (S.typ = { home: first[0], away: first[1], neutral: false });
    const adj = adjFor({ home: st.home, away: st.away, date: today() }, true);
    const p = M.predict(modelForPair(st.home, st.away), st.home, st.away, { neutral: st.neutral, adj });
    return `<h2>Typuj dowolny mecz</h2><div class="card">
      <div class="two"><div><label for="th">Gospodarz</label><select id="th">${opt(st.home)}</select></div><div><label for="ta">Gość</label><select id="ta">${opt(st.away)}</select></div></div>
      <div class="row"><label class="check" style="margin:0"><input type="checkbox" id="tn"${st.neutral ? " checked" : ""}> Teren neutralny (np. finał)</label><button class="btn sec" id="tswap">⇄ Zamień</button></div></div>
      <div class="vs"><div class="tm">${badge(st.home, "lg")}${esc(short(st.home))}</div><div class="sc" style="color:var(--accent)">${p.top[0].hg}–${p.top[0].ag}<div class="small muted">najbardziej prawdopodobny</div></div><div class="tm">${badge(st.away, "lg")}${esc(short(st.away))}</div></div>
      ${st.home === st.away ? `<div class="empty">Wybierz dwie różne drużyny.</div>` : predictionHtml(st.home, st.away, { neutral: st.neutral, adj })}
      ${leagueOf(st.home) !== leagueOf(st.away) ? `<p class="small muted">Kluby z różnych lig – prognoza z modelu wszystkich lig, połączonych przez mecze w pucharach europejskich.</p>` : ""}`;
  }

  function viewDane() {
    const all = [...new Set(S.matches.flatMap(m => [m.home, m.away]))].sort((a, b) => short(a).localeCompare(short(b)));
    const sopt = all.map(t => `<option value="${esc(t)}">${esc(short(t))}</option>`).join("");
    let h = `<h2>Źródła danych</h2><div class="card">
      <div class="list-row" style="cursor:default"><span class="res W">✓</span><span class="x" style="white-space:normal"><b>ESPN</b> – wyniki, terminarze, kluby i loga<br><span class="small muted">stan z ${S.updated ? new Date(S.updated).toLocaleString("pl-PL") : "–"}</span></span></div>`;
    for (const s of S.status) h += `<div class="list-row" style="cursor:default">${compLogo(s.comp, "sm")}<span class="x">${esc(compName(s.comp))}</span><span class="small muted">${s.played}/${s.n} meczów${s.last ? ` · ostatni ${fmtDate(s.last, false)}` : ""}</span></div>`;
    h += `<div class="list-row" style="cursor:default"><span class="res ${S.fplInfo ? "W" : "P"}">${S.fplInfo ? "✓" : "!"}</span><span class="x" style="white-space:normal"><b>Fantasy Premier League</b> – kontuzje, forma zawodników, xG (Opta)<br><span class="small muted">${S.fplInfo ? `${S.fplInfo.players} zawodników · xG dla ${S.xgCount} meczów · stan z ${new Date(S.fplInfo.updated).toLocaleString("pl-PL")}` : "niedostępne"}</span></span></div>`;
    h += `<div class="row"><button class="btn" id="dRefresh">Odśwież teraz</button><span class="small muted">Dane na stronie odświeżane automatycznie co 3 godziny.${S.manual.length ? ` Wpisanych ręcznie: ${S.manual.length}.` : ""}</span></div></div>`;

    h += `<h2>Prognozy</h2><div class="card"><label class="check" style="margin:0"><input type="checkbox" id="injT"${injOn() ? " checked" : ""}> Uwzględniaj nieobecnych zawodników (Premier League, mecze w najbliższych 10 dniach)</label>
      <label class="check" style="margin:12px 0 0"><input type="checkbox" id="fatT"${fatOn() ? " checked" : ""}> Uwzględniaj zmęczenie (mecz po ≤ ${M.FATIGUE.maxDays} dniach przerwy, gdy rywal odpoczywał dłużej)</label></div>`;

    const done = D.COMPS.every(c => S.bts[c.code]);
    h += `<h2>Skuteczność modelu</h2><div class="card">
      <p class="small muted" style="margin-top:0">Test „w ciemno”: każdy mecz od ${fmtDate(`${D.seasonStart() - 1}-09-15`, false)} przewidziany wyłącznie z danych sprzed niego.</p>`;
    if (done) {
      let n = 0, hit = 0, br = 0;
      h += `<div class="tbl-wrap"><table><thead><tr><th class="t">Rozgrywki</th><th>Mecze</th><th>Trafiony typ</th><th>Zawsze „1”</th><th>Dokładny wynik</th><th>Brier</th></tr></thead><tbody>`;
      for (const c of D.COMPS) {
        const b = S.bts[c.code], home = b.n ? b.records.filter(r => r.res === 0).length / b.n : 0;
        n += b.n; hit += b.accuracy * b.n; br += b.brier * b.n;
        h += `<tr><td class="t">${compLogo(c.code, "sm")} ${esc(c.short)}</td><td>${b.n}</td><td><b>${pct(b.accuracy, 1)}</b></td><td>${pct(home, 1)}</td><td>${pct(b.exact, 1)}</td><td>${b.brier.toFixed(3)}</td></tr>`;
      }
      h += `<tr><td class="t"><b>Razem</b></td><td>${n}</td><td><b>${pct(hit / n, 1)}</b></td><td></td><td></td><td>${(br / n).toFixed(3)}</td></tr></tbody></table></div>
        <p class="small muted" style="margin-bottom:0">Brier: mniej = lepiej; losowe typowanie daje 0,667.</p>`;
    } else h += `<button class="btn" id="btAll">Policz dla wszystkich rozgrywek</button> <span class="small muted">kilka sekund</span>`;
    h += `</div>`;

    h += `<h2>Dodaj mecz lub wynik ręcznie</h2><form class="card" id="manForm">
      <div class="two"><div><label>Rozgrywki</label><select name="comp">${D.COMPS.map(c => `<option value="${c.code}"${c.code === S.comp ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div><div><label>Data</label><input type="date" name="date" value="${today()}" required></div></div>
      <div class="two"><div><label>Gospodarz</label><select name="home">${sopt}</select></div><div><label>Gość</label><select name="away">${sopt}</select></div></div>
      <div class="two"><div><label>Gole gospodarza (puste = mecz przyszły)</label><input type="number" name="hg" min="0" max="20"></div><div><label>Gole gościa</label><input type="number" name="ag" min="0" max="20"></div></div>
      <div class="row"><button class="btn">Dodaj</button><span class="small muted">Wynik wpisany do meczu z terminarza zastępuje brakujący wynik.</span></div></form>`;
    if (S.manual.length) {
      h += `<div class="card">${S.manual.slice().reverse().map((m, i) => `<div class="list-row" style="cursor:default"><span class="d">${fmtDate(m.date, false)}</span>${compLogo(m.comp, "sm")}<span class="x">${esc(short(m.home))} – ${esc(short(m.away))}</span><span class="s">${Number.isInteger(m.hg) ? `${m.hg}–${m.ag}` : "—"}</span><button class="icon-btn" data-delman="${S.manual.length - 1 - i}" aria-label="Usuń">✕</button></div>`).join("")}</div>`;
    }

    const pm = modelFor("PL");
    h += `<h2>Jak działa prognoza</h2><div class="card small">
      <p style="margin-top:0"><b>Siła ataku i obrony.</b> Każda drużyna dostaje ocenę ataku i obrony dopasowaną do meczów z dwóch sezonów (regresja Poissona). Dla meczów ligowych model uczy się z danej ligi i pucharów europejskich, dla pucharów – ze wszystkich lig naraz, które łączą się przez mecze europejskie. Nowsze mecze ważą więcej – mecz sprzed 8 miesięcy liczy się w połowie. Drużyny z małą liczbą meczów są ściągane do średniej, a beniaminkowie startują z niższą oceną.</p>
      <p><b>Gole oczekiwane (xG).</b> W meczach Premier League tego sezonu siła drużyn liczona jest w 70% z xG (jakość stworzonych sytuacji, dane Opta przez FPL), a w 30% z goli. Dla innych lig darmowych danych xG nie ma.</p>
      <p><b>Wynik meczu.</b> Z ocen wychodzą oczekiwane gole obu drużyn (z przewagą własnego boiska, w PL ok. ${Math.round((Math.exp(pm.home) - 1) * 100)}% więcej goli gospodarza). Rozkład Poissona z poprawką Dixona-Colesa daje szansę każdego wyniku, a z nich – 1/X/2, powyżej 2,5 gola i „obie strzelą”.</p>
      <p><b>Tabela końcowa.</b> Pozostałe mecze sezonu losowane 3000 razy.</p>
      <p><b>Nieobecni</b> (tylko Premier League). Dla meczów w najbliższych 10 dniach model obniża atak drużyny o udział brakujących zawodników w jej xG i asystach oczekiwanych (zmiennicy odrabiają ok. 40%, najwyżej −25%) i podnosi liczbę traconych goli, gdy brakuje bramkarza lub obrońców (najwyżej +20%).</p>
      <p><b>Zmęczenie.</b> Drużyna grająca po najwyżej ${M.FATIGUE.maxDays} dniach przerwy przeciw rywalowi, który odpoczywał dłużej, ma atak niższy o ${pct(M.FATIGUE.att)} i traci o ${pct(M.FATIGUE.def)} więcej goli.</p>
      <p><b>Elo</b> to osobny ranking formy, aktualizowany po każdym meczu.</p>
      <p class="muted" style="margin-bottom:0">Model nie zna potwierdzonych składów, zmian trenera ani motywacji – traktuj prognozy jako punkt wyjścia, nie pewniak. Ekstraklasy nie ma w darmowych źródłach danych.</p></div>`;
    return h;
  }

  /* ---------- renderowanie i zdarzenia ---------- */
  const VIEWS = { mecze: viewMecze, tabela: viewTabela, kluby: viewKluby, typuj: viewTypuj, typy: viewTypy, dane: viewDane };
  function render() {
    if (!S.raw) return;
    ensureExamples();
    freshness();
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("#view").innerHTML = (VIEWS[S.tab] || viewMecze)();
    bindView();
    const on = document.querySelector(".cchip.on");
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function bindView() {
    const v = $("#view");
    if (S.tab === "typuj") {
      const upd = () => { S.typ = { home: $("#th").value, away: $("#ta").value, neutral: $("#tn").checked }; render(); };
      $("#th").onchange = upd; $("#ta").onchange = upd; $("#tn").onchange = upd;
      $("#tswap").onclick = () => { S.typ = { ...S.typ, home: S.typ.away, away: S.typ.home }; render(); };
    }
    if (S.tab === "typy") {
      const de = $("#delEx");
      if (de) de.onclick = () => { if (confirm("Usunąć wszystkie przykładowe typy?")) { S.tips = S.tips.filter(t => !t.example); saveTips(); render(); } };
      const da = $("#delAllTips");
      if (da) da.onclick = () => { if (confirm("Usunąć wszystkie typy? Tego nie da się cofnąć.")) { S.tips = []; saveTips(); render(); } };
    }
    if (S.tab === "dane") {
      $("#dRefresh").onclick = () => load(true);
      $("#injT").onchange = e => { store.set(LS.inj, e.target.checked); S.absCache = new Map(); render(); };
      $("#fatT").onchange = e => { store.set(LS.fat, e.target.checked); S.bts = {}; S.btMap = new Map(); render(); };
      const ba = $("#btAll");
      if (ba) ba.onclick = () => { ba.disabled = true; ba.textContent = "Liczę…"; setTimeout(() => { D.COMPS.forEach(c => btFor(c.code)); render(); }, 30); };
      $("#manForm").onsubmit = e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const home = f.get("home"), away = f.get("away");
        if (home === away) { alert("Wybierz dwie różne drużyny."); return; }
        const hg = f.get("hg"), ag = f.get("ag");
        if ((hg === "") !== (ag === "")) { alert("Wpisz gole obu drużyn albo zostaw oba pola puste."); return; }
        const date = f.get("date"), comp = f.get("comp");
        const ex = S.matches.find(m => m.comp === comp && m.home === home && m.away === away && Math.abs(new Date(m.date) - new Date(date)) <= 3 * 86400000);
        addManual({ comp, season: ex?.season || D.seasonOf(date), round: ex?.round || "", date: ex?.date || date, time: ex?.time || "", home, away, hg: hg === "" ? null : +hg, ag: ag === "" ? null : +ag });
      };
      v.querySelectorAll("[data-delman]").forEach(b => b.onclick = () => { S.manual.splice(+b.dataset.delman, 1); store.set(LS.manual, S.manual); compute(); render(); });
    }
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-deltip],[data-tipf],[data-tab],[data-comp],[data-season],[data-more],[data-match],[data-club],[data-close],[data-go]");
    if (!el) return;
    const d = el.dataset;
    if (d.close !== undefined) return closeSheet();
    if (d.deltip) { e.stopPropagation(); return deleteTip(d.deltip); }
    if (d.tipf) { S.tipFilter = d.tipf; render(); return; }
    if (d.tab || d.go) { S.tab = d.tab || d.go; store.set(LS.tab, S.tab); closeSheet(); render(); scrollTo(0, 0); return; }
    if (d.comp) { S.comp = d.comp; S.tableSeason = null; S.showOverdue = false; store.set(LS.comp, S.comp); render(); return; }
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
