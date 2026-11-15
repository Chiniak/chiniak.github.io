// t42: tryb „W podróży” – ekran Dziś (dzis.js): nagłówek, Teraz/Dalej, nocleg, bilety dnia, plan dnia, szybki wydatek,
// strzałki dni, jutro, wejście z ekranu głównego i z Planu, ustawienie ekranu startowego, podgląd przyszłej podróży, angielski
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_PROXY/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const fails = [];
  const ok = (cond, what) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + what); if (!cond) fails.push(what); };
  const txt = async sel => ((await p.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const shot = async (n, full) => { await p.waitForTimeout(300); await p.screenshot({ path: `${SP}/${n}.png`, fullPage: !!full }); };
  const B = 'http://localhost:8765/podroznik/';
  await p.goto(B + '#/dzis'); await p.waitForTimeout(600);
  ok((await txt('#view')).includes('Tryb „W podróży”'), 'bez podróży: pusty stan');

  const ids = await p.evaluate(async () => {
    const pad = n => String(n).padStart(2, '0'); const T = App.todayStr();
    const at = m => { const x = new Date(Date.now() + m * 60000); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
    const nw = new Date(), soon = Math.max(1, Math.min(90, 23 * 60 + 58 - nw.getHours() * 60 - nw.getMinutes())); // autobus zawsze dziś
    const t = await DB.put('trips', { name: 'Hanoi i okolice', destination: 'Hanoi', start: App.addDays(T, -1), end: App.addDays(T, 2), color: '#2f6fd6', budget: { amount: 4000, currency: 'PLN' }, rates: { VND: 0.00016 } });
    const f = await DB.put('trips', { name: 'Rzym', destination: 'Rzym', start: App.addDays(T, 30), end: App.addDays(T, 33) });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Lotus', address: '12 Hang Bac, Hanoi', phone: '+84 24 1234 567', room: '305', depart: App.addDays(T, -1) + 'T14:00', arrive: App.addDays(T, 1) + 'T12:00' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Ha Long Cruise', address: 'Tuan Chau, Ha Long', depart: App.addDays(T, 1) + 'T13:00', arrive: App.addDays(T, 2) + 'T10:00' });
    const bus = await DB.put('segments', { tripId: t.id, type: 'autobus', from: 'Hanoi', to: 'Ninh Binh', depart: at(soon), arrive: at(soon + 120), number: 'VX 12' });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Hanoi HAN', to: 'Warszawa WAW', depart: App.addDays(T, 2) + 'T23:30', arrive: App.addDays(T, 3) + 'T07:10' });
    const png = await (await fetch('icon-192.png')).blob();
    await DB.put('files', { tripId: t.id, segmentId: bus.id, kind: 'image', name: 'bilet.png', type: 'image/png', blob: png });
    const done = await DB.put('planItems', { tripId: t.id, date: T, time: '00:00', title: 'Pho na śniadanie', cat: 'jedzenie', place: '', order: 0 });
    await DB.put('planItems', { tripId: t.id, date: T, time: '', title: 'Jezioro Hoan Kiem', cat: 'natura', place: 'Hoan Kiem Lake, Hanoi', order: 1 });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T, 1), time: '08:00', title: 'Rejs po zatoce', cat: 'zwiedzanie', order: 0 });
    await DB.put('expenses', { tripId: t.id, title: 'kawa', amount: 50000, currency: 'VND', cat: 'jedzenie', date: T });
    return { t: t.id, f: f.id, done: done.id, T };
  });

  // ---------- ekran główny → „Dziś w podróży” ----------
  await p.goto(B + '#/podroze'); await p.waitForTimeout(700);
  ok(await p.isVisible('.hm-today'), 'ekran główny: przycisk „Dziś w podróży”');
  await p.click('.hm-today'); await p.waitForTimeout(800);
  ok(p.url().endsWith(`#/dzis/${ids.t}`), 'przycisk prowadzi do #/dzis/:id');
  ok(await txt('#title') === 'Dziś', 'tytuł paska „Dziś”');
  const head = await txt('.dz-head');
  ok(/W podróży/.test(head) && /Hanoi i okolice/.test(head) && /dzień 2 z 4/.test(head), 'nagłówek: stan, nazwa, dzień 2 z 4 – ' + head);
  const tc = await txt('.today-card');
  ok(/Dalej/.test(tc) && /Hanoi → Ninh Binh/.test(tc), 'karta Teraz/Dalej: autobus – ' + tc.slice(0, 90));
  ok(!(await p.$('.today-card .td-more')), 'karta na ekranie Dziś bez linku „Cały dzień”');
  const stay = await txt('.dz-stay');
  ok(/Hotel Lotus/.test(stay) && /pokój 305/.test(stay) && /Nawiguj/.test(stay) && /Zadzwoń/.test(stay) && /Dla kierowcy/.test(stay), 'nocleg: nazwa, pokój, akcje – ' + stay);
  ok((await p.getAttribute('.dz-act[href^="tel:"]', 'href')) === 'tel:+84241234567', 'telefon noclegu jako tel:');
  ok((await p.getAttribute('.dz-acts a[href*="karty"]', 'href')) === `#/karty/${ids.t}`, 'link do kart dla kierowcy');
  ok((await p.$$('.dz-ticket')).length === 1 && /Hanoi → Ninh Binh/.test(await txt('.dz-ticket')), 'bilet na dziś (autobus)');
  const rows = await p.$$eval('.dz-plan .dz-row', r => r.map(x => x.querySelector('.dz-time').textContent + ' ' + x.querySelector('.li-main b').textContent.trim() + (x.classList.contains('is-done') ? ' [done]' : '')));
  console.log('plan dnia:', JSON.stringify(rows));
  ok(rows.some(r => /00:00 .*Pho.*\[done\]/.test(r)), 'minione punkty przekreślone');
  ok(rows.some(r => /Jezioro Hoan Kiem/.test(r)) && rows.some(r => /Hanoi → Ninh Binh/.test(r)), 'plan dnia: punkty i odcinek');
  ok((await p.$$('.dz-plan .dz-nav')).length >= 2, 'przyciski Nawiguj w planie dnia');
  ok(/8 PLN/.test(await txt('.dz-spent')), 'wydatki dziś przeliczone (50 000 VND = 8 PLN) – ' + await txt('.dz-spent'));
  ok(/na dzień/.test(await txt('.dz-money-top')), 'chip „na dzień” z budżetu');
  ok(/Jutro/.test(await txt('.dz-next')) && /Rejs po zatoce/.test(await txt('.dz-next')) && /Wymeldowanie/.test(await txt('.dz-next')), 'jutro: wymeldowanie i rejs – ' + await txt('.dz-next'));
  await shot('t42-dzis', true);

  // ---------- szybki wydatek ----------
  await p.click('.dz-cat:has-text("Atrakcje")');
  await p.fill('#dz-add [name=amount]', '120000');
  await p.click('#dz-add button[type=submit]'); await p.waitForTimeout(700);
  const exp = await p.evaluate(async () => (await DB.all('expenses')).map(e => `${e.amount} ${e.currency} ${e.cat} ${e.date}`));
  ok(exp.includes(`120000 VND atrakcje ${ids.T}`), 'szybki wydatek zapisany (waluta zapamiętana, kategoria, dzień) – ' + JSON.stringify(exp));
  ok(/27,20 PLN/.test(await txt('.dz-spent')), 'suma dnia po dodaniu – ' + await txt('.dz-spent'));

  // ---------- strzałki dni ----------
  await p.click('.dz-day a[aria-label^="Następny dzień"]'); await p.waitForTimeout(600);
  const h2 = await txt('.dz-head');
  ok(/dzień 3 z 4/.test(h2) && /Podgląd/.test(h2), 'następny dzień: dzień 3, podgląd – ' + h2);
  ok(!(await p.$('.today-card')), 'inny dzień: bez karty Teraz/Dalej');
  ok(/Wymeldowanie dziś|zameldowanie dziś/.test(await txt('#view')) && /Ha Long Cruise/.test(await txt('.dz-stay')), 'dzień 3: nowy nocleg (zameldowanie) – ' + await txt('.dz-stay'));
  ok(/Rejs po zatoce/.test(await txt('.dz-plan')), 'dzień 3: plan');
  await p.click('.dz-day a[aria-label^="Następny dzień"]'); await p.waitForTimeout(600);
  ok(/Ostatni dzień podróży/.test(await txt('#view')) && !!(await p.$('.dz-day .dz-arrow.off')), 'ostatni dzień: notka, strzałka wyłączona');
  ok(/Wymeldowanie dziś/.test(await txt('#view')), 'ostatni dzień: wymeldowanie z rejsu');
  await p.goto(B + `#/dzis/${ids.t}?d=2000-01-01`); await p.waitForTimeout(600);
  ok(/dzień 2 z 4/.test(await txt('.dz-head')), 'dzień spoza podróży → dziś');

  // ---------- Plan: link „Cały dzień” ----------
  await p.goto(B + `#/plan/${ids.t}`); await p.waitForTimeout(700);
  ok((await p.getAttribute('.today-card .td-more', 'href')) === `#/dzis/${ids.t}`, 'Plan: link „Cały dzień” w karcie Dziś');

  // ---------- #/dzis wybiera trwającą podróż; przyszła = podgląd ----------
  await p.goto(B + '#/dzis'); await p.waitForTimeout(700);
  ok(p.url().endsWith(`#/dzis/${ids.t}`), '#/dzis → trwająca podróż');
  await p.goto(B + `#/dzis/${ids.f}`); await p.waitForTimeout(700);
  ok(/dzień 1 z 4/.test(await txt('.dz-head')) && /zaczyna się/.test(await txt('.dz-note')), 'przyszła podróż: podgląd 1. dnia z notką');
  ok(/Nic nie zaplanowano/.test(await txt('.dz-add')), 'pusty plan: zachęta do dodania');

  // ---------- ustawienie ekranu startowego ----------
  await p.goto(B + '#/ustawienia'); await p.waitForTimeout(600);
  ok(await p.getAttribute('[data-start-opt="podroze"]', 'aria-pressed') === 'true', 'domyślnie start na Podróżach');
  await p.goto(B + '#/podroze'); await p.reload(); await p.waitForTimeout(800);
  ok(p.url().endsWith('#/podroze'), 'bez ustawienia: start na Podróżach');
  await p.goto(B + '#/ustawienia'); await p.waitForTimeout(600);
  await p.click('[data-start-opt="dzis"]'); await p.waitForTimeout(400);
  await p.goto(B + '#/podroze'); await p.reload(); await p.waitForTimeout(900);
  ok(p.url().endsWith(`#/dzis/${ids.t}`), 'ustawienie „Dziś”: start w trakcie podróży na ekranie Dziś');
  await p.goto(B + `#/bilety`); await p.reload(); await p.waitForTimeout(800);
  ok(p.url().endsWith('#/bilety'), 'inny ekran po przeładowaniu zostaje bez zmian');
  await p.evaluate(async id => { const t = await DB.get('trips', id); await DB.put('trips', { ...t, end: App.addDays(App.todayStr(), -1), start: App.addDays(App.todayStr(), -3) }); }, ids.t);
  await p.goto(B + '#/podroze'); await p.reload(); await p.waitForTimeout(800);
  ok(p.url().endsWith('#/podroze'), 'żadna podróż nie trwa: start na Podróżach');
  await p.goto(B + `#/dzis/${ids.t}`); await p.waitForTimeout(700);
  ok(/Miniony dzień/.test(await txt('.dz-head')) && /zakończyła/.test(await txt('.dz-note')), 'zakończona podróż: podgląd ostatniego dnia');

  // ---------- ciemny motyw i angielski (zrzuty, brak polskich tekstów) ----------
  await p.evaluate(async id => { const t = await DB.get('trips', id); await DB.put('trips', { ...t, start: App.addDays(App.todayStr(), -1), end: App.addDays(App.todayStr(), 2) }); }, ids.t);
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.goto(B + `#/dzis/${ids.t}`); await p.reload(); await p.waitForTimeout(900);
  ok(/W podróży/.test(await txt('.dz-head')), 'po przywróceniu dat: znów w podróży');
  await shot('t42-dzis-dark', true);
  await p.emulateMedia({ colorScheme: 'light' });
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'en'));
  await p.reload(); await p.waitForTimeout(1000);
  const en = await txt('#view');
  const pl = ['W podróży', 'Nocleg', 'Plan dnia', 'Wydatki', 'Bilety na ten dzień', 'Jutro', 'Nawiguj', 'Zadzwoń', 'Dla kierowcy', 'W pobliżu', 'Rozmówki', 'Dokumenty', 'Mapa dnia', 'Cały plan', 'Dodaj punkt', 'dzień 2 z 4', 'pokój', 'na dzień', 'Pokaż'].filter(w => en.includes(w));
  ok(!pl.length, 'angielski: brak polskich tekstów ' + JSON.stringify(pl));
  ok(/Today/.test(await txt('#title')), 'angielski: tytuł „Today”');
  await shot('t42-dzis-en', true);

  // ---------- aplikacja (udawany Capacitor): bez wyboru start na „Dziś” ----------
  const ctx2 = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx2.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { Filesystem: { rmdir: async () => {}, writeFile: async () => ({ uri: '' }) } } }; });
  const q = await ctx2.newPage();
  const errs2 = []; q.on('pageerror', e => errs2.push(e.message));
  await q.goto(B + '#/podroze'); await q.waitForTimeout(600);
  const tid = await q.evaluate(async () => (await DB.put('trips', { name: 'Kraków', start: App.addDays(App.todayStr(), -1), end: App.addDays(App.todayStr(), 1) })).id);
  await q.reload(); await q.waitForTimeout(900);
  ok(q.url().endsWith(`#/dzis/${tid}`), 'APK bez wyboru: start na „Dziś”');
  await q.goto(B + '#/ustawienia'); await q.waitForTimeout(600);
  ok(await q.getAttribute('[data-start-opt="dzis"]', 'aria-pressed') === 'true', 'APK: w Ustawieniach zaznaczone „Dziś”');
  await q.click('[data-start-opt="podroze"]'); await q.waitForTimeout(400);
  await q.goto(B + '#/podroze'); await q.reload(); await q.waitForTimeout(900);
  ok(q.url().endsWith('#/podroze'), 'APK po wyborze „Podróże”: start na Podróżach');
  ok(!errs2.length, 'APK: bez błędów ' + JSON.stringify(errs2));

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL OK');
  console.log('errors:', errs);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
