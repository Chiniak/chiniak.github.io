// t66: pasek „Twoje podróże” (Plan, Pakowanie) – przytrzymanie karty otwiera menu: Edytuj podróż, Szczegóły, Usuń podróż.
// Zwykłe dotknięcie dalej przełącza podróż; po przytrzymaniu nie przełącza. Usunięcie innej podróży zostaje na ekranie,
// usunięcie oglądanej wraca do #/plan. Prawy przycisk (contextmenu) też otwiera menu. EN.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(B + '#/podroze'); await p.waitForTimeout(600);
  const ids = await p.evaluate(async () => {
    const T = App.todayStr(), d = n => App.addDays(T, n);
    const a = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: d(10), end: d(15), color: '#2f6fd6' });
    const c = await DB.put('trips', { name: 'Rzym', destination: 'Rzym', start: d(40), end: d(44), color: '#d6602f' });
    const e = await DB.put('trips', { name: 'Kraków', destination: 'Kraków', start: d(70), end: d(72), color: '#1f9e8f' });
    await DB.put('planItems', { tripId: c.id, date: d(41), time: '10:00', title: 'Koloseum', cat: 'zwiedzanie', order: 0 });
    await DB.put('packItems', { tripId: c.id, list: 'pack', name: 'Paszport', cat: 'dokumenty', status: 'pack', order: 0 });
    return { a: a.id, c: c.id, e: e.id };
  });
  // długie przytrzymanie palcem (dotyk): pointerdown → 700 ms → pointerup
  const hold = async sel => {
    const box = await p.locator(sel).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(750); await p.mouse.up();
    await p.waitForTimeout(300);
  };
  await p.goto(B + `#/plan/${ids.a}`); await p.waitForSelector('.pl-trips');
  // zwykłe dotknięcie przełącza
  await p.click(`.pl-tcard[data-trip="${ids.c}"]`); await p.waitForTimeout(600);
  ok(p.url().endsWith(`#/plan/${ids.c}`), 'dotknięcie karty przełącza podróż');
  // przytrzymanie → menu, bez przełączania
  await hold(`.pl-tcard[data-trip="${ids.a}"]`);
  ok(await p.$('dialog.tp-sheet [data-act="edit"]') !== null, 'przytrzymanie: menu z „Edytuj podróż”');
  ok(p.url().endsWith(`#/plan/${ids.c}`), 'przytrzymanie nie przełącza podróży');
  ok(/Lizbona/.test(await p.textContent('dialog.tp-sheet')) && await p.$('[data-act="del"]') !== null && await p.$('[data-act="open"]') !== null, 'menu: nazwa, Szczegóły, Usuń');
  await p.screenshot({ path: 'podroznik-testy/t66-menu.png' });
  // edycja
  await p.click('[data-act="edit"]'); await p.waitForSelector('#trip-form', { timeout: 5000 });
  ok(p.url().endsWith(`#/podroze/${ids.a}/edytuj`), 'Edytuj → formularz podróży');
  await p.fill('#trip-form [name=name]', 'Lizbona i Porto'); await p.click('#trip-form button[type=submit]'); await p.waitForTimeout(800);
  ok(await p.evaluate(id => DB.get('trips', id).then(t => t.name), ids.a) === 'Lizbona i Porto', 'zmieniona nazwa zapisana');
  ok(/#\/plan\//.test(p.url()), 'po zapisie powrót do Planu: ' + p.url().split('#')[1]);
  // usunięcie innej podróży (contextmenu – prawy przycisk)
  await p.goto(B + `#/plan/${ids.c}`); await p.waitForSelector('.pl-trips'); await p.waitForTimeout(300);
  await p.click(`.pl-tcard[data-trip="${ids.e}"]`, { button: 'right' }); await p.waitForTimeout(300);
  ok(await p.$('dialog.tp-sheet [data-act="del"]') !== null, 'prawy przycisk: menu');
  await p.click('[data-act="del"]'); await p.waitForTimeout(800);
  ok(!(await p.evaluate(id => DB.get('trips', id), ids.e)), 'usunięto inną podróż');
  ok(p.url().endsWith(`#/plan/${ids.c}`) && await p.$(`.pl-tcard[data-trip="${ids.e}"]`) === null, 'ekran zostaje, karta znika');
  // Pakowanie: usunięcie oglądanej podróży
  await p.goto(B + `#/pakowanie/${ids.c}`); await p.waitForSelector('.pl-trips'); await p.waitForTimeout(300);
  await hold(`.pl-tcard[data-trip="${ids.c}"]`);
  ok(await p.$('dialog.tp-sheet') !== null, 'Pakowanie: menu po przytrzymaniu');
  await p.click('[data-act="del"]'); await p.waitForTimeout(900);
  ok(!(await p.evaluate(id => DB.get('trips', id), ids.c)), 'usunięto oglądaną podróż');
  ok(await p.evaluate(id => DB.byIndex('packItems', 'tripId', id).then(a => a.length), ids.c) === 0 && await p.evaluate(id => DB.byIndex('planItems', 'tripId', id).then(a => a.length), ids.c) === 0, 'razem z planem i pakowaniem');
  ok(/#\/pakowanie(\/|$)/.test(p.url()) && !p.url().includes(ids.c), 'powrót do Pakowania bez usuniętej podróży: ' + p.url().split('#')[1]);
  // EN
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await p.evaluate(() => DB.put('trips', { name: 'Paris', destination: 'Paris', start: App.addDays(App.todayStr(), 90), end: App.addDays(App.todayStr(), 92) }));
  await p.goto(B + `#/plan/${ids.a}`); await p.reload(); await p.waitForSelector('.pl-trips'); await p.waitForTimeout(400);
  await hold(`.pl-tcard[data-trip="${ids.a}"]`);
  const en = await p.textContent('dialog.tp-sheet');
  ok(/Edit trip/.test(en) && /Delete trip/.test(en) && !/Usuń|Edytuj/.test(en), 'EN: Edit trip / Delete trip');
  await p.screenshot({ path: 'podroznik-testy/t66-en.png' });
  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
