/* Tripwillow – „Rozłóż pomysły na dni” (automatyczny plan, jak w Wanderlog).
   Trasa: #/rozloz/:tripId
   Pomysły (punkty planu bez dnia) z położeniem na mapie dzielone są między wybrane dni tak, żeby:
   - miejsca blisko siebie wypadały tego samego dnia (grupowanie k-średnich z limitem punktów na dzień),
   - w podróży przez kilka miast pomysł trafił do dni, w których śpimy najbliżej (nocleg dnia – places.js hotelFor),
   - dni były podobnie zapełnione (liczą się też punkty, które już są w planie; limit „najwyżej N dziennie”).
   Potem każdy zmieniony dzień jest układany najkrótszą trasą (App.Places.optimizeDay – punkty z godziną zostają).
   Pomysły bez położenia i te, które się nie zmieściły, zostają pomysłami. Ostatnie rozłożenie można cofnąć. */
(function () {
  const { esc, plural } = App;
  const I = (n, c = "sm") => App.icon(n, c);
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);
  const km = (a, b) => App.Places.km(a, b);

  /* ---------- grupowanie z limitem: k-średnich, przypisanie zachłanne po rosnącej odległości ---------- */
  function clusters(pts, caps, iters = 20) {
    const k = caps.length, n = pts.length;
    if (!k || !n) return { of: pts.map(() => -1) };
    // start: punkty możliwie daleko od siebie (deterministycznie – pierwszy najbliżej środka)
    const mid = { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lon: pts.reduce((s, p) => s + p.lon, 0) / n };
    const centers = [];
    let first = 0;
    pts.forEach((p, i) => { if (km(p, mid) < km(pts[first], mid)) first = i; });
    centers.push({ lat: pts[first].lat, lon: pts[first].lon });
    while (centers.length < k) {
      let far = 0, fd = -1;
      pts.forEach((p, i) => { const d = Math.min(...centers.map(c => km(p, c))); if (d > fd) { fd = d; far = i; } });
      centers.push({ lat: pts[far].lat + centers.length * 1e-9, lon: pts[far].lon });
    }
    let of = [];
    for (let it = 0; it < iters; it++) {
      const pairs = [];
      pts.forEach((p, i) => centers.forEach((c, j) => pairs.push([km(p, c), i, j])));
      pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      const left = caps.slice(), next = pts.map(() => -1);
      for (const [, i, j] of pairs) if (next[i] < 0 && left[j] > 0) { next[i] = j; left[j]--; }
      const same = next.every((v, i) => v === of[i]);
      of = next;
      centers.forEach((c, j) => {
        const mine = pts.filter((_, i) => of[i] === j);
        if (mine.length) { c.lat = mine.reduce((s, p) => s + p.lat, 0) / mine.length; c.lon = mine.reduce((s, p) => s + p.lon, 0) / mine.length; }
      });
      if (same) break;
    }
    return { of, centers };
  }

  // limity dni: wyrównanie do wspólnego poziomu (z punktami, które już są), najwyżej `max` dziennie
  function capsFor(existing, n, max) {
    const m = existing.length;
    if (!m) return [];
    const sumEx = existing.reduce((s, x) => s + x, 0);
    let caps = existing.map(() => 0);
    for (let L = Math.min(max, Math.ceil((n + sumEx) / m)); L <= max; L++) {
      caps = existing.map(e => Math.max(0, Math.min(max, L) - e));
      if (caps.reduce((s, x) => s + x, 0) >= n) break;
    }
    return caps;
  }

  /* propozycja: { byDay: { dzień: [pomysły] }, left: [pomysły bez miejsca], noXY: [..], days } – nic nie zapisuje */
  async function propose(tripId, { days, max = 6 } = {}) {
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", tripId), DB.byIndex("segments", "tripId", tripId)]);
    const ideas = items.filter(i => !i.date).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.created || "").localeCompare(b.created || ""));
    const pts = ideas.filter(hasXY), noXY = ideas.filter(i => !hasXY(i));
    const byDay = {};
    days.forEach(d => { byDay[d] = []; });
    if (!days.length || !pts.length) return { byDay, left: pts, noXY, days };

    // nocleg dnia; dni bez noclegu biorą nocleg najbliższego dnia, który go ma
    const hotelOf = {};
    days.forEach(d => { const h = App.Places.hotelFor(segs, d); if (hasXY(h)) hotelOf[d] = h; });
    const withH = days.filter(d => hotelOf[d]);
    if (withH.length) days.forEach(d => {
      if (!hotelOf[d]) hotelOf[d] = hotelOf[withH.reduce((b, x) => Math.abs(App.dayDiff(x, d)) < Math.abs(App.dayDiff(b, d)) ? x : b)];
    });
    // grupy dni według noclegu (miasta); bez żadnego noclegu – jedna grupa
    const groups = new Map();
    days.forEach(d => {
      const key = hotelOf[d] ? `${hotelOf[d].lat.toFixed(3)},${hotelOf[d].lon.toFixed(3)}` : "-";
      if (!groups.has(key)) groups.set(key, { hotel: hotelOf[d] || null, days: [], pts: [] });
      groups.get(key).days.push(d);
    });
    const G = [...groups.values()];
    // pomysł → grupa z najbliższym noclegiem (wyraźnie dalej niż 1,5× – i tak najbliższa)
    pts.forEach(p => {
      const g = G.length === 1 || !G[0].hotel ? G[0] : G.reduce((b, x) => km(p, x.hotel) < km(p, b.hotel) ? x : b);
      g.pts.push(p);
    });
    const existing = d => items.filter(i => i.date === d).length;
    const left = [];
    for (const g of G) {
      const ex = g.days.map(existing);
      const caps = capsFor(ex, g.pts.length, max);
      const use = g.days.map((d, i) => i).filter(i => caps[i] > 0);
      const { of } = clusters(g.pts, use.map(i => caps[i]));
      // większe grupy do dni z mniejszą liczbą punktów – przypisanie jest już zgodne z limitami dni
      g.pts.forEach((p, i) => { if (of[i] >= 0) byDay[g.days[use[of[i]]]].push(p); else left.push(p); });
    }
    // w obrębie dnia: kolejność najkrótszej trasy od noclegu (dla podglądu; zapis i tak układa optimizeDay)
    for (const d of days) {
      const list = byDay[d];
      if (list.length > 1) { const h = hotelOf[d] || null; byDay[d] = App.Places.shortestOrder(list, h, h).map(i => list[i]); }
    }
    return { byDay, left, noXY, days, hotelOf };
  }

  /* zapis: pomysły dostają dzień (przed wieczornymi punktami z godziną), potem każdy zmieniony dzień układany jest najkrótszą trasą.
     Zwraca dane do cofnięcia: [[id, date, order]] wszystkich ruszonych punktów. */
  async function apply(tripId, prop, { optimize = true } = {}) {
    const touched = new Map();
    const remember = it => { if (!touched.has(it.id)) touched.set(it.id, [it.id, it.date || "", it.order]); };
    let n = 0;
    for (const d of Object.keys(prop.byDay)) {
      const list = prop.byDay[d];
      if (!list.length) continue;
      const before = (await DB.byIndex("planItems", "tripId", tripId)).filter(i => i.date === d).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      before.forEach(remember);
      // nowe punkty (bez godziny) przed wieczornymi punktami z godziną (kolacja, koncert), inaczej na końcu dnia
      let at = before.findIndex(i => i.time && i.time >= "17:00");
      if (at < 0) at = before.length;
      const add = [];
      for (const p of list) {
        const it = await DB.get("planItems", p.id);
        if (!it || it.date) continue; // ktoś zmienił w międzyczasie
        remember(it);
        add.push({ ...it, date: d, time: "" });
      }
      const day = before.slice(0, at).concat(add, before.slice(at));
      for (let k = 0; k < day.length; k++) if (add.includes(day[k]) || day[k].order !== k) await DB.put("planItems", { ...day[k], order: k });
      n += add.length;
      if (optimize) await App.Places.optimizeDay(tripId, d);
    }
    return { n, undo: [...touched.values()] };
  }
  async function undo(list) {
    for (const [id, date, order] of list) {
      const it = await DB.get("planItems", id);
      if (it && (it.date !== date || it.order !== order)) await DB.put("planItems", { ...it, date, order, ...(date ? {} : { time: "" }) });
    }
  }

  /* ---------- ekran ---------- */
  let last = null; // { tripId, undo, n }

  App.route(/^\/rozloz\/([\w-]+)$/, async ([id], q) => {
    const trip = await DB.get("trips", id);
    if (!trip) { location.replace("#/plan"); return ""; }
    const [items, segs] = await Promise.all([DB.byIndex("planItems", "tripId", id), DB.byIndex("segments", "tripId", id)]);
    const all = [];
    for (let d = trip.start; d <= trip.end; d = App.addDays(d, 1)) all.push(d);
    const ideas = items.filter(i => !i.date);
    const nXY = ideas.filter(hasXY).length;
    const done = last && last.tripId === id && q.ok ? last : null;

    const dayRow = d => {
      const n = items.filter(i => i.date === d).length, h = App.Places.hotelFor(segs, d);
      return `<label class="of-row rz-day">
          <input type="checkbox" name="d" value="${d}" checked>
          <span class="of-name"><b>${App.fmtDay(d)}</b><span class="muted small">${n ? `${n} ${plural(n, "punkt", "punkty", "punktów")} w planie` : "pusty dzień"}${h && h.name ? ` · ${esc(h.name)}` : ""}</span></span>
        </label>`;
    };

    return {
      title: "Rozłóż pomysły",
      back: `#/plan/${id}`,
      html: done ? `
        <section class="tx-hero rz-hero">
          <span class="tx-hero-ic" aria-hidden="true">${I("sparkle", "")}</span>
          <div><h2>Rozłożono ${done.n} ${plural(done.n, "pomysł", "pomysły", "pomysłów")}</h2>
          <p>Każdy dzień ułożony najkrótszą trasą. Punkty z godziną zostały na swoim miejscu.</p></div>
        </section>
        <a class="btn primary wide" href="#/plan/${id}">${I("plan")} Zobacz plan</a>
        ${done.undo.length ? `<button type="button" class="btn wide" id="rz-undo">${I("undo")} Cofnij</button>` : ""}`
      : `
        <section class="tx-hero rz-hero">
          <span class="tx-hero-ic" aria-hidden="true">${I("sparkle", "")}</span>
          <div><h2>${esc(trip.name)}</h2>
          <p>Pomysły z miejscem na mapie trafią do wybranych dni: bliskie miejsca tego samego dnia, najbliżej noclegu, równo po dniach. Potem każdy dzień ułożę najkrótszą trasą.</p></div>
        </section>
        ${!nXY ? App.empty("💡", ideas.length ? "Pomysły nie mają miejsca na mapie" : "Brak pomysłów",
          ideas.length ? "Dodaj do pomysłów adres albo zaznacz je na mapie – wtedy wiadomo, co jest blisko czego." : "Dodaj pomysły (np. z Odkrywaj albo z przewodnika), potem wróć tutaj.",
          `<a class="btn" href="#/plan/${id}">Wróć do planu</a>`)
        : `<form id="rz-form">
          <h2 class="section">Dni</h2>
          <div class="list of-list">${all.map(dayRow).join("")}</div>
          <label class="field rz-max"><span>Najwyżej punktów dziennie (z tymi, które już są)</span>
            <select name="max">${[3, 4, 5, 6, 7, 8, 10, 12].map(n => `<option value="${n}"${n === 6 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="sw rz-opt"><input type="checkbox" name="opt" checked><span class="sw-ui" aria-hidden="true"></span><span>Ułóż każdy dzień najkrótszą trasą</span></label>
          <h2 class="section">Podgląd</h2>
          <div id="rz-prev" class="rz-prev" aria-live="polite"></div>
          <button type="submit" class="btn primary wide" id="rz-go">${I("sparkle")} Rozłóż</button>
        </form>`}`,
      after(view) {
        const ub = view.querySelector("#rz-undo");
        if (ub) ub.onclick = async () => {
          await undo(done.undo); last = null;
          App.toast("Przywrócono pomysły i kolejność");
          location.replace(`#/plan/${id}`);
        };
        const f = view.querySelector("#rz-form");
        if (!f) return;
        let prop = null, seq = 0;
        const opts = () => ({ days: [...f.querySelectorAll("input[name=d]:checked")].map(x => x.value), max: +f.max.value });
        const show = async () => {
          const my = ++seq, o = opts();
          const p = await propose(id, o);
          if (my !== seq || !view.isConnected) return;
          prop = p;
          const n = o.days.reduce((s, d) => s + p.byDay[d].length, 0);
          const box = view.querySelector("#rz-prev");
          const dayBox = d => {
            const list = p.byDay[d];
            if (!list.length) return "";
            const h = p.hotelOf && p.hotelOf[d];
            const kmTxt = App.Places.fmtDist(App.Places.routeKm(list, h));
            return `<div class="rz-pday"><div class="rz-ph"><b>${App.fmtDay(d)}</b><span class="muted small">+${list.length} · ok. ${kmTxt}${h ? " z noclegu" : ""}</span></div>
              <ol>${list.map(i => `<li>${esc(i.title || "Punkt")}</li>`).join("")}</ol></div>`;
          };
          box.innerHTML = (o.days.map(dayBox).join("") || `<p class="muted small">Zaznacz co najmniej jeden dzień z wolnym miejscem.</p>`)
            + (p.left.length ? `<p class="td-note rz-left">${I("info")}<span>Nie zmieści się (limit dzienny): ${p.left.map(i => esc(i.title || "Punkt")).join(", ")} – zostaną w pomysłach.</span></p>` : "")
            + (p.noXY.length ? `<p class="f-hint">${p.noXY.length} ${plural(p.noXY.length, "pomysł", "pomysły", "pomysłów")} bez miejsca na mapie – zostaje w pomysłach.</p>` : "");
          const go = view.querySelector("#rz-go");
          go.disabled = !n;
          go.innerHTML = `${I("sparkle")} Rozłóż${n ? ` (${n})` : ""}`;
        };
        f.addEventListener("change", show);
        show();
        f.addEventListener("submit", async e => {
          e.preventDefault();
          if (!prop) return;
          const go = view.querySelector("#rz-go");
          go.disabled = true;
          const r = await apply(id, await propose(id, opts()), { optimize: f.opt.checked });
          last = { tripId: id, ...r };
          location.replace(`#/rozloz/${id}?ok=1`);
        });
      },
    };
  });

  App.Distribute = { clusters, capsFor, propose, apply, undo };
})();
