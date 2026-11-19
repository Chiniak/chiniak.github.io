// zameldowanie przed przylotem (propozycja i poprawka jednym dotknięciem), wpis „Przylot” w dniu przylotu,
// rozdzielenie punktu „cały dzień w jednym” na osobne punkty z godzinami
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', colorScheme: 'dark' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);

  // jednostki
  const u = await p.evaluate(() => ({
    a: App.Plan.checkinAfter('2026-12-09T18:40'), b: App.Plan.checkinAfter('2026-12-09T23:20'),
    p1: App.Divide.parts('Pociągiem do Kunming, wieczór nad jeziorem Cuihu'),
    p2: App.Divide.parts('Przylot 18:40, transfer metrem linii 11 / taksówką do Shenzhen North, kolacja i sen.').map(App.Divide.row),
    p3: App.Divide.parts('Muzeum Sztuki i Techniki'),
    c: ['Kolacja', 'Świątynia Lamy', 'Spacer nad jeziorem', 'Nocny targ'].map(App.Divide.catFor),
  }));
  ok(u.a === '2026-12-09T19:45' && u.b === '2026-12-09T23:45', 'godzina zameldowania po przylocie: ' + u.a + ', ' + u.b);
  ok(JSON.stringify(u.p1) === '["Pociągiem do Kunming","wieczór nad jeziorem Cuihu"]', 'podział tytułu: ' + JSON.stringify(u.p1));
  ok(u.p2[0].time === '18:40' && u.p2[0].title === 'Przylot' && u.p2.length === 5 && u.p2[3].title === 'Kolacja' && u.p2[4].title === 'Sen', 'podział notatki z godziną: ' + JSON.stringify(u.p2));
  ok(u.p3.length === 1, 'nazwa własna z „i” nie jest dzielona');
  ok(u.c.join() === 'jedzenie,zwiedzanie,natura,jedzenie', 'kategorie: ' + u.c.join());

  // podróż jak na zrzucie właściciela
  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Chiny', destination: 'Chiny', start: '2026-12-08', end: '2026-12-12' });
    const f = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Londyn LHR', to: 'Shenzhen SZX', depart: '2026-12-08T22:30', arrive: '2026-12-09T18:40' });
    const n = await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Nocleg – Shenzhen', address: 'Shenzhen, Chiny', depart: '2026-12-09T15:00', arrive: '2026-12-10T11:00' });
    const it = await DB.put('planItems', { tripId: t.id, date: '2026-12-10', time: '', title: 'Pociągiem do Kunming, wieczór nad jeziorem Cuihu', place: 'Kunming, Chiny', lat: 25.04, lon: 102.7, note: 'Pociąg 9:15 z Shenzhen North, kolacja w Kunming', cat: 'inne', order: 0 });
    return { t: t.id, n: n.id, it: it.id };
  });
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(900);
  const day2 = await p.$$eval('.pl-day[data-date="2026-12-09"] .pl-row', r => r.map(x => x.querySelector('.pl-time').textContent.trim() + ' ' + x.querySelector('.pl-title').textContent.trim()));
  ok(day2.some(x => /^18:40 Przylot: Shenzhen SZX/.test(x)), 'dzień przylotu: wpis „Przylot” 18:40 – ' + day2.join(' | '));
  ok(await p.$(`[data-fixci="${ids.n}"]`) !== null && /przed przylotem \(18:40\) · ustaw 19:45/.test(await p.textContent(`[data-fixci="${ids.n}"]`)), 'ostrzeżenie: zameldowanie przed przylotem, propozycja 19:45');
  await p.screenshot({ path: `${dir}/t72-plan.png` });
  await p.click(`[data-fixci="${ids.n}"]`); await p.waitForTimeout(700);
  ok(await p.evaluate(id => DB.get('segments', id).then(s => s.depart), ids.n) === '2026-12-09T19:45' && await p.$('[data-fixci]') === null, 'po dotknięciu: zameldowanie 19:45, ostrzeżenie znika');
  const order = await p.$$eval('.pl-day[data-date="2026-12-09"] .pl-row .pl-title', r => r.map(x => x.textContent.trim()));
  ok(order.indexOf('Przylot: Shenzhen SZX') < order.findIndex(x => /^Zameldowanie/.test(x)), 'kolejność: przylot, potem zameldowanie');

  // rozdzielenie
  ok(await p.$(`.pl-split-chip[href="#/punkt/${ids.it}/rozdziel"]`) !== null, 'na karcie: „Rozdziel na punkty z godzinami”');
  await p.screenshot({ path: `${dir}/t72-karta.png`, fullPage: true });
  await p.click(`.pl-split-chip[href="#/punkt/${ids.it}/rozdziel"]`); await p.waitForSelector('#rd-rows .rd-row');
  ok((await p.$$('#rd-rows .rd-row')).length === 2, 'dwa wiersze z tytułu');
  await p.click('#rd-note'); await p.waitForTimeout(200);
  const rows = await p.$$('#rd-rows .rd-row');
  ok(rows.length === 4 && await rows[2].$eval('[name=t]', i => i.value) === '09:15', 'z notatki: „Pociąg” 09:15 + „Kolacja w Kunming”');
  await rows[1].$eval('[name=t]', i => { i.value = '19:00'; });
  await rows[2].$eval('.rd-x', b => b.click());
  await p.screenshot({ path: `${dir}/t72-rozdziel.png`, fullPage: true });
  await p.click('#rd-form button[type=submit]'); await p.waitForTimeout(900);
  const after = await p.evaluate(async id => (await DB.byIndex('planItems', 'tripId', id)).filter(i => i.date === '2026-12-10').map(i => `${i.time}|${i.title}|${i.cat}|${i.place}|${i.lat}`).sort(), ids.t);
  ok(after.length === 3 && after.includes('19:00|Wieczór nad jeziorem Cuihu|natura|Kunming, Chiny|25.04') && after.includes('|Kolacja w Kunming|jedzenie|Kunming, Chiny|25.04') && after.includes('|Pociągiem do Kunming|inne|Kunming, Chiny|25.04'),
    '3 osobne punkty z godzinami, kategoriami i miejscem: ' + after.join(' ; '));
  ok(await p.evaluate(id => DB.get('planItems', id), ids.it) == null && p.url().endsWith(`#/plan/${ids.t}`), 'oryginał usunięty, powrót do planu');
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
