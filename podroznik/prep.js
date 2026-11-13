/* Podróżnik – „Przygotuj na wyjazd offline”: jedna lista kontrolna i jeden przycisk, który pobiera na zapas
   wszystko, co potem wymaga internetu. Ważne zwłaszcza przed Chinami (Google, Wikipedia i część map tam nie działa).
   Trasa: #/przygotuj/:tripId
   Kroki (po kolei): ochrona danych przed usunięciem → karty dla kierowcy (lokalne adresy) → zdjęcia miejsc →
   kursy walut (NBP) → pogoda → mapa offline (największa, na końcu). Każdy krok można powtórzyć – pobiera tylko brakujące. */
(function () {
  const { esc, plural } = App;
  const hasXY = p => p && p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon);
  const fresh = r => r.local && r.local.lat === r.lat && r.local.lon === r.lon;

  // waluta kraju (kod ISO z kart dla kierowcy) i z nazwy celu podróży
  const CUR_OF = { cn: "CNY", hk: "HKD", mo: "MOP", tw: "TWD", th: "THB", vn: "VND", la: "LAK", kh: "KHR", mm: "MMK", my: "MYR", sg: "SGD",
    id: "IDR", ph: "PHP", jp: "JPY", kr: "KRW", in: "INR", np: "NPR", lk: "LKR", ae: "AED", tr: "TRY", eg: "EGP", ma: "MAD", gb: "GBP", us: "USD",
    ch: "CHF", cz: "CZK", hu: "HUF", no: "NOK", se: "SEK", dk: "DKK", ge: "GEL", al: "ALL", ro: "RON", bg: "BGN", rs: "RSD", is: "ISK" };
  const CUR_WORDS = [[/chin|china/i, "CNY"], [/tajl|thai/i, "THB"], [/wietn|viet/i, "VND"], [/laos/i, "LAK"], [/kambod|cambod/i, "KHR"],
    [/japon|japan/i, "JPY"], [/korea/i, "KRW"], [/hong ?kong/i, "HKD"], [/indonez|indones|bali/i, "IDR"], [/malez|malays/i, "MYR"]];

  async function gather(id) {
    const [trip, items, segs] = await Promise.all([DB.get("trips", id), DB.byIndex("planItems", "tripId", id), DB.byIndex("segments", "tripId", id)]);
    if (!trip) return null;
    const places = segs.filter(s => s.type === "nocleg" && hasXY(s)).map(rec => ({ store: "segments", rec }))
      .concat(items.filter(hasXY).map(rec => ({ store: "planItems", rec })));
    const ccs = new Set(places.map(p => p.rec.local && p.rec.local.cc).filter(Boolean));
    return { trip, items, segs, places, ccs };
  }

  // stan wszystkich kroków; done: true / false / null (nie dotyczy)
  async function check(id) {
    const g = await gather(id);
    if (!g) return null;
    const { trip, items, places, ccs } = g;
    const today = App.todayStr();
    const steps = [];

    // 1. ochrona przed usunięciem
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    steps.push({ key: "persist", icon: "🛡️", name: "Ochrona danych przed usunięciem", done: persisted,
      txt: persisted ? "włączona" : "telefon może usunąć pobrane mapy, gdy zabraknie miejsca" });

    // 2. karty dla kierowcy
    const nFresh = places.filter(p => fresh(p.rec)).length;
    steps.push({ key: "cards", icon: "🚕", name: "Karty dla kierowcy", href: `#/karty/${id}`,
      done: places.length ? nFresh === places.length : null,
      txt: places.length ? `${nFresh}/${places.length} ${plural(places.length, "adres", "adresy", "adresów")} w lokalnym piśmie` : "brak miejsc z położeniem na mapie" });

    // 3. zdjęcia miejsc
    const withTitle = items.filter(i => i.title && !i.photoOff);
    const nPhoto = withTitle.filter(i => i.photo).length;
    const missing = App.Photos ? withTitle.filter(App.Photos.needs).length : 0;
    steps.push({ key: "photos", icon: "🖼️", name: "Zdjęcia miejsc", href: `#/plan/${id}`,
      done: withTitle.length ? missing === 0 : null,
      txt: withTitle.length ? `${nPhoto}/${withTitle.length} ze zdjęciem${missing ? ` · do sprawdzenia ${missing}` : ""}` : "brak punktów planu" });

    // 4. kursy walut
    const bd = App.Budget ? await App.Budget.load(id) : null;
    const home = bd ? bd.home : "PLN";
    const curs = new Set(bd ? bd.currencies : []);
    ccs.forEach(cc => CUR_OF[cc] && curs.add(CUR_OF[cc]));
    CUR_WORDS.forEach(([re, c]) => re.test(`${trip.destination || ""} ${trip.name || ""}`) && curs.add(c));
    curs.delete(home);
    const rates = trip.rates || {};
    const noRate = [...curs].filter(c => !(rates[c] > 0));
    steps.push({ key: "rates", icon: "💱", name: "Kursy walut", href: `#/budzet/${id}`, curs: [...curs], noRate, home,
      done: curs.size ? noRate.length === 0 : null,
      txt: !curs.size ? "brak walut obcych" : noRate.length ? `brak kursu: ${noRate.join(", ")}${home !== "PLN" ? " – wpisz w budżecie" : ""}`
        : [...curs].map(c => `1 ${c} = ${String(rates[c]).replace(".", ",")} ${home}`).join(" · ") });

    // 5. pogoda
    const wx = App.Weather && trip.end >= today ? await App.Weather.get(trip) : null;
    steps.push({ key: "weather", icon: "🌤️", name: "Pogoda", wx,
      done: wx ? !!wx.data : null,
      txt: !wx ? "podróż już minęła" : wx.data ? `zapisana ${App.fmtDay(new Date(wx.data.at).toISOString().slice(0, 10))}${wx.data.kind === "lastyear" ? " (zeszły rok – prognoza 16 dni przed)" : ""}` : "nie pobrana" });

    // 6. mapa offline (wszystkie obszary podróży + przegląd)
    let map = { done: null, txt: "brak miejsc na mapie", tiles: [] };
    if (App.Offline) {
      const areas = await App.Offline.areasOf(trip);
      // przegląd całej podróży najpierw – przyda się nawet przy limicie
      const tiles = [...new Set(areas.slice().sort((a, b) => (b.key === "overview") - (a.key === "overview")).flatMap(a => a.tiles))];
      if (tiles.length) {
        const have = await App.Offline.haveOf(id);
        const todo = tiles.filter(t => !have.has(App.Offline.tileUrl(...t.split("/"))));
        const pct = Math.floor((tiles.length - todo.length) / tiles.length * 100);
        const mb = Math.max(1, Math.round(todo.length * App.Offline.KB_PER_TILE / 1024));
        map = { done: !todo.length, todo, txt: todo.length ? `pobrane ${pct}% · do pobrania ok. ${mb} MB (najlepiej przez Wi-Fi)` : `pobrana · ${areas.length - 1} ${plural(areas.length - 1, "obszar", "obszary", "obszarów")} + przegląd` };
      }
    }
    steps.push({ key: "map", icon: "🗺️", name: "Mapa offline", href: `#/mapa-offline/${id}`, ...map });

    // 7. kopia zapasowa poza telefonem (zgubiony / skradziony telefon) – na końcu, gdy wszystko już pobrane; robi ją użytkownik (Dysk Google / mail)
    const last = await DB.getSetting("lastBackup", null);
    const stale = App.Backup ? await App.Backup.stale() : !last;
    const when = last ? App.fmtDay(last.at.slice(0, 10)) : "";
    steps.push({ key: "backup", icon: "💾", name: "Kopia poza telefonem", href: `#/ustawienia/kopia?wroc=/przygotuj/${id}`, manual: true, done: !stale,
      txt: !last ? "jeszcze nie było – zapisz na Dysku Google albo wyślij mailem do siebie" : stale ? `ostatnia ${when} – od tego czasu doszły zmiany`
        : `zrobiona ${when}${last.encrypted ? " · z hasłem" : " · bez hasła"}` });

    const china = ccs.has("cn") || /chin|china/i.test(`${trip.destination || ""} ${trip.name || ""}`);
    return { trip, g, steps, china };
  }

  /* ---------- wykonanie kroków ---------- */
  let running = null; // { id, stopped }
  const actions = {
    async persist() {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => false);
    },
    async cards(st, g, say) {
      const todo = g.places.filter(p => !fresh(p.rec));
      let i = 0, bad = 0;
      for (const p of todo) {
        if (running.stopped) break;
        say(`szukam adresu ${++i}/${todo.length}…`);
        try { await App.Phrases.localize(p.store, p.rec); bad = 0; } catch (e) { if (++bad >= 3) break; }
      }
    },
    async photos(st, g, say) {
      if (!App.Photos) return;
      let n = 0;
      for (let round = 0; round < 5 && !running.stopped; round++) {
        const items = await DB.byIndex("planItems", "tripId", g.trip.id);
        const left = items.filter(App.Photos.needs).length;
        if (!left) break;
        say(`szukam zdjęć… (zostało ${left})`);
        const before = n;
        await App.Photos.fill(items, () => { n++; say(`znaleziono ${n} · szukam dalej…`); });
        const after = (await DB.byIndex("planItems", "tripId", g.trip.id)).filter(App.Photos.needs).length;
        if (after >= left && n === before) break; // bez postępu (Wikipedia nie odpowiada)
      }
    },
    async rates(st, g, say) {
      if (st.home !== "PLN" || !st.noRate.length) return;
      const trip = await DB.get("trips", g.trip.id);
      const rates = { ...(trip.rates || {}) };
      for (const c of st.noRate) { say(`kurs ${c}…`); const v = await App.Budget.nbp(c); if (v) rates[c] = v; }
      await DB.putRaw("trips", { ...(await DB.get("trips", g.trip.id)), rates });
    },
    async weather(st, g, say) {
      say("pobieram…");
      const wx = await App.Weather.get(await DB.get("trips", g.trip.id));
      await wx.refresh();
    },
    async map(st, g, say) {
      if (!st.todo || !st.todo.length) return;
      if (App.Offline.busy()) { say("pobieranie mapy już trwa"); return; }
      let tiles = st.todo.slice(0, App.Offline.MAX_TILES);
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
      const free = est && est.quota ? est.quota - (est.usage || 0) : null;
      if (free != null && tiles.length * App.Offline.KB_PER_TILE * 1024 * 1.5 > free) { say("za mało miejsca w telefonie"); return; }
      const stopper = setInterval(() => { const j = App.Offline.busy(); if (j && running.stopped) j.state.stopped = true; }, 300);
      try { await App.Offline.download(g.trip.id, tiles, s => say(`kafelki ${s.done}/${s.total}${s.failed ? ` · błędy ${s.failed}` : ""}`)); }
      finally { clearInterval(stopper); }
    },
  };

  App.route(/^\/przygotuj\/([\w-]+)$/, async ([id]) => {
    const c = await check(id);
    if (!c) { location.replace("#/podroze"); return ""; }
    const { trip, steps, china } = c;
    // do zrobienia przyciskiem: ochrona danych jest prośbą (przeglądarka może odmówić), kursy spoza NBP – ręcznie w budżecie
    const todo = steps.filter(s => s.done === false && s.key !== "persist" && !s.manual && !(s.key === "rates" && s.home !== "PLN"));
    const askPersist = steps.find(s => s.key === "persist" && s.done === false);
    const ready = steps.filter(s => s.done === true).length, total = steps.filter(s => s.done !== null).length;
    const busy = running && running.id === id;
    const mark = s => s.done === true ? "✅" : s.done === false ? "⬜" : "➖";
    const rows = steps.map(s => `<div class="pr-row${s.done === null ? " na" : ""}" data-k="${s.key}">
        <span class="pr-mark" aria-hidden="true">${mark(s)}</span>
        <span class="pr-main"><b><span aria-hidden="true">${s.icon}</span> ${esc(s.name)}</b><span class="muted small pr-txt">${esc(s.txt)}</span></span>
        ${s.href ? `<a class="pr-go" href="${s.href}" aria-label="Otwórz: ${esc(s.name)}">›</a>` : ""}
      </div>`).join("");

    return {
      title: `Przygotuj offline · ${trip.name}`,
      back: `#/podroze/${id}`,
      html: `
        ${china ? `<div class="card pr-warn"><b>🇨🇳 Przed wjazdem do Chin</b>
          <p class="small">W Chinach nie działają Google, Wikipedia i część serwerów map, a reszta bywa bardzo wolna. Zrób to w Polsce albo w hotelu z Wi-Fi przed granicą – potem karty, zdjęcia i mapa działają bez internetu. Nawigację ustaw na Amap (Ustawienia).</p></div>`
        : `<p class="muted small">Pobierz na zapas wszystko, co potem wymaga internetu – najlepiej przez Wi-Fi przed wyjazdem. Bilety, plan i dokumenty są w telefonie zawsze.</p>`}
        <div class="card pr-sum"><b>${ready}/${total} gotowe</b>
          <div class="bar"><i style="width:${total ? Math.round(ready / total * 100) : 0}%"></i></div></div>
        ${busy ? `<button type="button" class="btn wide" id="pr-stop">Zatrzymaj</button>`
          : todo.length ? `<button type="button" class="btn primary wide" id="pr-go">📥 Przygotuj wszystko (${todo.length})</button>`
          : `<p class="pr-ok">✅ Wszystko gotowe do podróży bez internetu.</p>${askPersist ? `<button type="button" class="btn wide" id="pr-persist">🛡️ Włącz ochronę danych</button>` : ""}`}
        <div class="card pr-list">${rows}</div>
        ${steps.find(s => s.key === "backup" && !s.done) ? `<a class="btn wide pr-backup" href="#/ustawienia/kopia?wroc=/przygotuj/${id}">💾 Zrób kopię poza telefonem</a>
          <p class="muted small">Kopię zapisz sam (Dysk Google, mail do siebie) – najlepiej na końcu, gdy wszystko jest już pobrane. Zgubisz telefon – wczytasz ją na innym.</p>` : ""}
        <p class="muted small">Możesz wyjść z tego ekranu – pobieranie trwa dalej, dopóki aplikacja jest otwarta. Przycisk można nacisnąć ponownie: pobierze tylko to, czego brakuje.</p>`,
      after(view) {
        const stop = view.querySelector("#pr-stop");
        if (stop) stop.onclick = () => { if (running) running.stopped = true; stop.disabled = true; stop.textContent = "Zatrzymuję…"; };
        const pb = view.querySelector("#pr-persist");
        if (pb) pb.onclick = async () => {
          await actions.persist();
          const ok = navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
          App.toast(ok ? "Ochrona włączona" : "Przeglądarka nie zgodziła się – zainstaluj aplikację (APK) albo zwolnij miejsce");
          App.render();
        };
        const go = view.querySelector("#pr-go");
        if (!go) return;
        go.onclick = async () => {
          if (running) { App.toast("Przygotowanie już trwa"); return; }
          if (!navigator.onLine) { App.toast("Brak internetu – połącz się z Wi-Fi"); return; }
          running = { id, stopped: false };
          // od razu (to samo dotknięcie) – przeglądarka pyta o zgodę tylko przy geście użytkownika
          if (askPersist) await actions.persist();
          go.outerHTML = `<button type="button" class="btn wide" id="pr-stop">Zatrzymaj</button>`;
          view.querySelector("#pr-stop").onclick = e => { running.stopped = true; e.target.disabled = true; e.target.textContent = "Zatrzymuję…"; };
          const g = c.g;
          let failed = 0;
          for (const s of todo) {
            if (running.stopped) continue;
            const row = () => document.querySelector(`.pr-row[data-k="${s.key}"]`);
            const say = t => { const r = row(); if (r) { r.querySelector(".pr-mark").textContent = "⏳"; r.querySelector(".pr-txt").textContent = t; } };
            say("czekam…");
            try { await actions[s.key](s, g, say); } catch (e) { failed++; }
          }
          const stopped = running.stopped;
          running = null;
          const after = await check(id);
          const left = after ? after.steps.filter(s => s.done === false && s.key !== "persist" && !s.manual && !(s.key === "rates" && s.home !== "PLN")).length : 0;
          App.toast(stopped ? "Zatrzymano – pobrane zostaje" : !left ? "Gotowe – podróż przygotowana offline ✅" : `Gotowe częściowo – brakuje ${left} ${plural(left, "rzeczy", "rzeczy", "rzeczy")}, spróbuj ponownie`);
          if (location.hash === `#/przygotuj/${id}`) App.render();
        };
      },
    };
  });

  App.Prep = { check };
})();
