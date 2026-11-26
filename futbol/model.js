/* Futbol – model przewidywania wyników.
   Siła ataku i obrony każdej drużyny z ważonej regresji Poissona (nowsze mecze ważą więcej),
   przewaga własnego boiska, korekta Dixona-Colesa dla niskich wyników, ranking Elo
   i symulacja Monte Carlo reszty sezonu. Działa w przeglądarce i w Node (testy). */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const MAX_GOALS = 10;
  const RHO = -0.08; // korekta Dixona-Colesa: trochę więcej remisów 0-0 i 1-1

  // mecz: { date: "YYYY-MM-DD", home, away, hg, ag, comp: "PL"|"CL", neutral? }
  function played(m) { return Number.isInteger(m.hg) && Number.isInteger(m.ag); }

  /* Dopasowanie siły drużyn.
     log λ(dom) = mu + home + att[dom] − def[gość];  log λ(gość) = mu + att[gość] − def[dom]
     Ściąganie do wartości wyjściowej (prior) działa jak k pseudo-meczów o przeciętnym wyniku,
     dlatego drużyny z małą liczbą meczów nie dostają skrajnych ocen. */
  function fit(matches, opts = {}) {
    const asOf = opts.asOf ? new Date(opts.asOf).getTime() : Date.now();
    const halfLife = opts.halfLife || 240;          // dni
    const k = opts.shrink ?? 6;                     // siła ściągania
    const priors = opts.priors || {};               // { team: { att, def } }
    const ms = matches.filter(m => played(m) && new Date(m.date).getTime() <= asOf);
    const teams = [...new Set(ms.flatMap(m => [m.home, m.away]))];
    const att = {}, def = {}, games = {};
    // ciepły start: zaczynamy od wcześniejszego dopasowania (szybciej zbiega)
    const init = opts.init;
    for (const t of teams) { att[t] = init?.att[t] ?? priors[t]?.att ?? 0; def[t] = init?.def[t] ?? priors[t]?.def ?? 0; games[t] = 0; }
    const rows = ms.map(m => {
      const age = Math.max(0, (asOf - new Date(m.date).getTime()) / DAY);
      const w = Math.pow(0.5, age / halfLife);
      games[m.home] += w; games[m.away] += w;
      // xG: gdy znamy gole oczekiwane, siłę liczymy z mieszanki goli i xG (xg = udział xG, 0–1)
      const xw = opts.xg || 0, hasXg = xw > 0 && m.xhg !== undefined && m.xhg !== null;
      const hg = hasXg ? (1 - xw) * m.hg + xw * m.xhg : m.hg, ag = hasXg ? (1 - xw) * m.ag + xw * m.xag : m.ag;
      return { h: m.home, a: m.away, hg, ag, w, ha: m.neutral ? 0 : 1 };
    });
    let mu = init?.mu ?? Math.log(1.35), home = init?.home ?? 0.2;
    if (!rows.length) return { mu, home, att, def, games, teams, n: 0, asOf };

    const iters = opts.iters || (init ? 20 : 80);
    for (let it = 0; it < iters; it++) {
      // mu i przewaga gospodarzy
      let G = 0, E = 0, GH = 0, EH = 0;
      for (const r of rows) {
        const eh = Math.exp(att[r.h] - def[r.a] + home * r.ha), ea = Math.exp(att[r.a] - def[r.h]);
        G += r.w * (r.hg + r.ag); E += r.w * (eh + ea);
        if (r.ha) { GH += r.w * r.hg; EH += r.w * Math.exp(att[r.h] - def[r.a]); }
      }
      mu = Math.log(G / E);
      if (EH > 0 && GH > 0) home = Math.max(0, Math.min(0.6, Math.log(GH / (EH * Math.exp(mu)))));

      // atak
      const S = {}, X = {};
      for (const t of teams) { S[t] = 0; X[t] = 0; }
      for (const r of rows) {
        S[r.h] += r.w * r.hg; X[r.h] += r.w * Math.exp(mu + home * r.ha - def[r.a]);
        S[r.a] += r.w * r.ag; X[r.a] += r.w * Math.exp(mu - def[r.h]);
      }
      for (const t of teams) {
        const p = priors[t]?.att || 0;
        att[t] = Math.log((S[t] + k * Math.exp(p) * unit(X[t], games[t])) / (X[t] + k * unit(X[t], games[t])));
      }
      // obrona (stracone gole – im więcej straconych, tym niższa obrona)
      for (const t of teams) { S[t] = 0; X[t] = 0; }
      for (const r of rows) {
        S[r.a] += r.w * r.hg; X[r.a] += r.w * Math.exp(mu + home * r.ha + att[r.h]);
        S[r.h] += r.w * r.ag; X[r.h] += r.w * Math.exp(mu + att[r.a]);
      }
      for (const t of teams) {
        const p = priors[t]?.def || 0;
        def[t] = -Math.log((S[t] + k * Math.exp(-p) * unit(X[t], games[t])) / (X[t] + k * unit(X[t], games[t])));
      }
      // wycentrowanie (identyfikowalność)
      const ma = teams.reduce((s, t) => s + att[t], 0) / teams.length;
      const md = teams.reduce((s, t) => s + def[t], 0) / teams.length;
      for (const t of teams) { att[t] -= ma; def[t] -= md; }
    }
    return { mu, home, att, def, games, teams, n: rows.length, asOf };
  }
  // średni „oczekiwany” wkład jednego meczu – skala pseudo-meczów
  function unit(x, g) { return g > 0 ? x / g : 1; }

  function rating(model, t) {
    // drużyna spoza danych: przeciętna z lekkim minusem
    return { att: model.att[t] ?? -0.15, def: model.def[t] ?? -0.15 };
  }

  /* adj – poprawki za nieobecnych zawodników: { home: { att, def }, away: { att, def } }.
     att mnoży strzelane gole drużyny, def mnoży gole tracone. */
  function expectedGoals(model, home, away, neutral, adj) {
    const h = rating(model, home), a = rating(model, away);
    const ha = neutral ? 0 : model.home;
    const ah = adj?.home || {}, aa = adj?.away || {};
    return {
      home: Math.exp(model.mu + ha + h.att - a.def) * (ah.att ?? 1) * (aa.def ?? 1),
      away: Math.exp(model.mu + a.att - h.def) * (aa.att ?? 1) * (ah.def ?? 1),
    };
  }

  function poisson(l, n) {
    let p = Math.exp(-l);
    const out = [p];
    for (let i = 1; i <= n; i++) { p = p * l / i; out.push(p); }
    return out;
  }

  function dcTau(x, y, lh, la, rho) {
    if (x === 0 && y === 0) return 1 - lh * la * rho;
    if (x === 0 && y === 1) return 1 + lh * rho;
    if (x === 1 && y === 0) return 1 + la * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  }

  /* Pełna przepowiednia meczu. */
  function predict(model, home, away, opts = {}) {
    const xg = expectedGoals(model, home, away, opts.neutral, opts.adj);
    const ph = poisson(xg.home, MAX_GOALS), pa = poisson(xg.away, MAX_GOALS);
    const grid = [];
    let total = 0;
    for (let i = 0; i <= MAX_GOALS; i++) {
      grid.push([]);
      for (let j = 0; j <= MAX_GOALS; j++) {
        const p = ph[i] * pa[j] * dcTau(i, j, xg.home, xg.away, RHO);
        grid[i].push(p); total += p;
      }
    }
    let win = 0, draw = 0, loss = 0, over25 = 0, btts = 0, cleanH = 0, cleanA = 0;
    const scores = [];
    for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) {
      const p = grid[i][j] / total;
      grid[i][j] = p;
      if (i > j) win += p; else if (i === j) draw += p; else loss += p;
      if (i + j > 2) over25 += p;
      if (i > 0 && j > 0) btts += p;
      if (j === 0) cleanH += p;
      if (i === 0) cleanA += p;
      scores.push({ hg: i, ag: j, p });
    }
    scores.sort((a, b) => b.p - a.p);
    return { home, away, xg, win, draw, loss, over25, btts, cleanH, cleanA, top: scores.slice(0, 6), grid };
  }

  /* Ranking Elo – szybki wskaźnik formy, liczony chronologicznie po wszystkich meczach. */
  function elo(matches, opts = {}) {
    const K = opts.K || 22, HA = opts.home ?? 55, start = opts.start || {};
    const r = {};
    const hist = {};
    const ms = matches.filter(played).slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const m of ms) {
      for (const t of [m.home, m.away]) if (!(t in r)) { r[t] = start[t] ?? 1500; hist[t] = []; }
      const dr = r[m.home] - r[m.away] + (m.neutral ? 0 : HA);
      const e = 1 / (1 + Math.pow(10, -dr / 400));
      const s = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
      const gd = Math.abs(m.hg - m.ag);
      const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
      const d = K * mult * (s - e);
      r[m.home] += d; r[m.away] -= d;
      hist[m.home].push({ date: m.date, r: r[m.home] });
      hist[m.away].push({ date: m.date, r: r[m.away] });
    }
    return { ratings: r, history: hist };
  }

  // generator liczb pseudolosowych z ziarnem – powtarzalne symulacje
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function samplePoisson(l, rand) {
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  /* Tabela z meczów rozegranych. */
  function table(matches, teams) {
    const t = {};
    const add = n => t[n] || (t[n] = { team: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
    (teams || []).forEach(add);
    for (const m of matches.filter(played).sort((a, b) => a.date.localeCompare(b.date))) {
      const h = add(m.home), a = add(m.away);
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("P"); }
      else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; h.form.push("P"); a.form.push("W"); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("R"); a.form.push("R"); }
    }
    return Object.values(t).sort(cmpRow);
  }
  function cmpRow(a, b) {
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team);
  }

  /* Symulacja pozostałych meczów ligi: rozkład miejsc na koniec sezonu. */
  function simulateSeason(model, leagueMatches, opts = {}) {
    const n = opts.runs || 4000;
    const rand = rng(opts.seed || 12345);
    const base = table(leagueMatches);
    const teams = base.map(r => r.team);
    const idx = Object.fromEntries(teams.map((t, i) => [t, i]));
    const rest = leagueMatches.filter(m => !played(m)).map(m => {
      const xg = expectedGoals(model, m.home, m.away);
      return { h: idx[m.home], a: idx[m.away], lh: xg.home, la: xg.away };
    }).filter(r => r.h !== undefined && r.a !== undefined);
    const T = teams.length;
    const pos = teams.map(() => new Array(T).fill(0));
    const ptsSum = new Array(T).fill(0);
    const pts = new Array(T), gd = new Array(T), gf = new Array(T);
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < T; i++) { pts[i] = base[i].pts; gd[i] = base[i].gf - base[i].ga; gf[i] = base[i].gf; }
      for (const r of rest) {
        const x = samplePoisson(r.lh, rand), y = samplePoisson(r.la, rand);
        gd[r.h] += x - y; gd[r.a] += y - x; gf[r.h] += x; gf[r.a] += y;
        if (x > y) pts[r.h] += 3; else if (x < y) pts[r.a] += 3; else { pts[r.h]++; pts[r.a]++; }
      }
      const order = [...Array(T).keys()].sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a] || gf[b] - gf[a] || rand() - 0.5);
      order.forEach((ti, p) => { pos[ti][p]++; });
      for (let i = 0; i < T; i++) ptsSum[i] += pts[i];
    }
    return teams.map((t, i) => ({
      team: t,
      pos: pos[i].map(c => c / n),
      expPts: ptsSum[i] / n,
      title: pos[i][0] / n,
      top4: pos[i].slice(0, 4).reduce((a, b) => a + b, 0) / n,
      top5: pos[i].slice(0, 5).reduce((a, b) => a + b, 0) / n,
      releg: pos[i].slice(T - 3).reduce((a, b) => a + b, 0) / n,
    })).sort((a, b) => b.expPts - a.expPts);
  }

  /* Test wsteczny: przepowiadamy mecze używając tylko danych sprzed nich.
     Zwraca trafność typu 1X2, wynik Briera i trafienia dokładnego wyniku. */
  function backtest(matches, opts = {}) {
    const target = matches.filter(m => played(m) && (!opts.comp || m.comp === opts.comp) && (!opts.filter || opts.filter(m)) && (!opts.from || m.date >= opts.from))
      .sort((a, b) => a.date.localeCompare(b.date));
    const step = opts.stepDays || 7;
    let model = null, fittedAt = null, hits = 0, exact = 0, brier = 0, logl = 0, n = 0;
    const records = [];
    for (const m of target) {
      const t = new Date(m.date).getTime();
      if (!model || (t - fittedAt) / DAY >= step) {
        fittedAt = t;
        const prev = new Date(t - DAY).toISOString().slice(0, 10);
        model = fit(matches, { ...opts.fit, asOf: prev, init: model });
      }
      if (!(m.home in model.att) || !(m.away in model.att)) continue;
      const p = predict(model, m.home, m.away, { neutral: m.neutral, adj: opts.adjFn ? opts.adjFn(m) : null });
      const res = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
      const probs = [p.win, p.draw, p.loss];
      const pick = probs.indexOf(Math.max(...probs));
      if (pick === res) hits++;
      if (p.top[0].hg === m.hg && p.top[0].ag === m.ag) exact++;
      brier += probs.reduce((s, q, i) => s + (q - (i === res ? 1 : 0)) ** 2, 0);
      logl += -Math.log(Math.max(1e-9, probs[res]));
      records.push({ m, probs, pick, res, hit: pick === res, top: p.top[0], xg: p.xg });
      n++;
    }
    return { n, accuracy: n ? hits / n : 0, exact: n ? exact / n : 0, brier: n ? brier / n : 0, logLoss: n ? logl / n : 0, records };
  }

  /* Zmęczenie: dni od poprzedniego meczu drużyny (rozegranego lub zaplanowanego, w dowolnych rozgrywkach z danych).
     Zwraca Map: mecz → { h, a } (null, gdy brak poprzedniego meczu w ciągu 30 dni). */
  function restDays(matches) {
    const last = {}, out = new Map();
    const ms = matches.filter(m => m.date).slice().sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
    const gap = (t, d) => { const p = last[t]; if (!p) return null; const r = Math.round((new Date(d) - new Date(p)) / DAY); return r <= 30 ? r : null; };
    for (const m of ms) {
      out.set(m, { h: gap(m.home, m.date), a: gap(m.away, m.date) });
      last[m.home] = m.date; last[m.away] = m.date;
    }
    return out;
  }
  /* Poprawka za zmęczenie: drużyna grająca po ≤ maxDays dniach przerwy strzela mniej (att) i traci więcej (def),
     ale tylko gdy rywal odpoczywał dłużej. Parametry dobrane testem wstecznym. */
  const FATIGUE = { maxDays: 3, att: 0.03, def: 0.06 };
  function fatigueAdj(rest, prm = FATIGUE) {
    if (!rest) return null;
    const tired = (me, op) => me !== null && op !== null && me <= prm.maxDays && op > me;
    const th = tired(rest.h, rest.a), ta = tired(rest.a, rest.h);
    if (!th && !ta) return null;
    return {
      home: th ? { att: 1 - prm.att, def: 1 + prm.def } : {},
      away: ta ? { att: 1 - prm.att, def: 1 + prm.def } : {},
    };
  }
  // łączenie poprawek (np. kontuzje × zmęczenie)
  function combineAdj(...xs) {
    const out = { home: {}, away: {} };
    let any = false;
    for (const x of xs) if (x) for (const side of ["home", "away"]) for (const k of ["att", "def"]) {
      if (x[side]?.[k] !== undefined) { out[side][k] = (out[side][k] ?? 1) * x[side][k]; any = true; }
    }
    return any ? out : null;
  }

  const api = { restDays, fatigueAdj, combineAdj, FATIGUE, fit, predict, expectedGoals, elo, table, simulateSeason, backtest, played };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FModel = api;
})(typeof self !== "undefined" ? self : this);
