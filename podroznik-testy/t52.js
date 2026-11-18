// przełącznik podróży (arkusz z kartami) w planie i pakowaniu + nazwa nowej podróży z Gmaila (miejsce najdłuższego pobytu)
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', colorScheme: 'dark' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  const ids = await p.evaluate(async () => { const T = App.todayStr();
    const now = await DB.put('trips', { name: 'Majówka', destination: 'Lizbona', start: App.addDays(T, -1), end: App.addDays(T, 3), color: '#e0604f' });
    const s1 = await DB.put('trips', { name: 'Chiny', destination: 'Szanghaj', start: App.addDays(T, 20), end: App.addDays(T, 40) });
    const s2 = await DB.put('trips', { name: 'Porto', destination: 'Porto', start: App.addDays(T, 1), end: App.addDays(T, 2) });
    const old = await DB.put('trips', { name: 'Kraków 2025', destination: 'Kraków', start: '2025-05-01', end: '2025-05-03' });
    return { now: now.id, s1: s1.id, s2: s2.id, old: old.id }; });

  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.s1}`); await p.waitForTimeout(700);
  ok(await p.$('#pl-trip') !== null && await p.$('select#pl-trip') === null, 'przycisk zamiast listy rozwijanej');
  await p.click('#pl-trip'); await p.waitForSelector('.tp-sheet[open]', { timeout: 3000 });
  const heads = await p.$$eval('.tp-h', e => e.map(x => x.textContent));
  ok(heads.join() === 'Teraz,Nadchodzące', 'grupy: ' + heads.join());
  const cards = await p.$$eval('.tp-sheet .tp-list > .tp-trip', e => e.map(x => x.querySelector('b').textContent + '|' + x.querySelector('.tp-st').textContent));
  ok(cards[0] === 'Majówka|trwa · dzień 2 z 5' && cards[1] === 'Porto|jutro' && cards[2] === 'Chiny|za 20 dni', 'karty: ' + cards.join(' ; '));
  ok(/Szanghaj/.test(await p.textContent('.tp-trip.on')), 'bieżąca podróż zaznaczona, z celem');
  ok(await p.$eval('.tp-past', e => !e.open) && /Minione\s*1/.test(await p.textContent('.tp-past summary')), 'minione zwinięte');
  await p.waitForTimeout(500); await p.screenshot({ path: `${dir}/t52-sheet.png` });
  // zamknięcie klawiszem Esc
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(await p.$('.tp-sheet') === null, 'Esc zamyka');
  // wybór innej podróży
  await p.click('#pl-trip'); await p.waitForSelector('.tp-sheet[open]');
  await p.click('.tp-trip:has-text("Porto")'); await p.waitForTimeout(700);
  ok(p.url().endsWith(`#/plan/${ids.s2}`) && /Porto/.test(await p.textContent('.pl-head h2')), 'wybór przełącza plan');
  // pakowanie
  await p.goto(`http://localhost:8765/podroznik/#/pakowanie/${ids.now}`); await p.waitForTimeout(700);
  await p.click('#pk-trip'); await p.waitForSelector('.tp-sheet[open]');
  await p.click('.tp-past summary'); await p.click('.tp-trip:has-text("Kraków 2025")'); await p.waitForTimeout(700);
  ok(p.url().includes(`#/pakowanie/${ids.old}`), 'pakowanie: przełączenie na minioną podróż');

  // nazwa podróży z Gmaila
  const names = await p.evaluate(() => {
    const seg = (type, from, to, depart, arrive) => ({ kind: 'seg', type, from, to, depart, arrive });
    return [
      App.Gmail.tripName([seg('pociag', 'Derby', 'London St Pancras International', '2026-12-08T15:08', '2026-12-08T16:39'),
        seg('lot', 'London LHR', 'Shenzhen SZX', '2026-12-08T22:30', '2026-12-09T18:40'),
        seg('lot', 'Shenzhen SZX', 'London LHR', '2026-12-15T10:00', '2026-12-15T16:00')]),
      App.Gmail.tripName([seg('lot', 'Warsaw WAW', 'Lisbon LIS', '2026-12-11T06:40', '2026-12-11T09:55'),
        seg('pociag', 'Lisboa Santa Apolónia', 'Porto Campanhã', '2026-12-13T08:39', '2026-12-13T11:35'),
        seg('lot', 'Lisbon LIS', 'Warsaw WAW', '2026-12-15T10:45', '2026-12-15T16:30')]),
      App.Gmail.tripName([seg('lot', 'Kraków KRK', 'Porto OPO', '2026-12-12T06:15', '2026-12-12T09:40')]),
      App.Gmail.tripName([{ kind: 'seg', type: 'nocleg', name: 'Hotel X', city: 'Hanoi', depart: '2026-12-24T14:00' }]),
    ];
  });
  ok(names[0] === 'Shenzhen', 'Derby → St Pancras → Shenzhen: ' + names[0]);
  ok(names[1] === 'Lisbon', 'Lizbona z wycieczką do Porto: ' + names[1]);
  ok(names[2] === 'Porto', 'jeden lot: ' + names[2]);
  ok(names[3] === 'Hanoi', 'sam nocleg: ' + names[3]);

  // EN
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.s1}`); await p.reload(); await p.waitForTimeout(800);
  await p.click('#pl-trip'); await p.waitForSelector('.tp-sheet[open]'); await p.waitForTimeout(300);
  const en = (await p.textContent('.tp-sheet')).replace(/\s+/g, ' ');
  ok(/Choose a trip/.test(en) && /Upcoming/.test(en) && /day 2 of 5/.test(en) && /in 20 days/.test(en), 'EN: ' + en.slice(0, 160));
  await p.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
