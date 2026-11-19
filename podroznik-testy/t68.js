// „Rozłóż pomysły na dni”: grupowanie po położeniu, noclegi w dwóch miastach, limity, układanie trasy, cofnięcie
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);

  // jednostki: limity i grupowanie
  const u = await p.evaluate(() => {
    const D = App.Distribute;
    const caps = [D.capsFor([0, 0, 0], 7, 6), D.capsFor([4, 0], 4, 6), D.capsFor([6, 6], 3, 6)];
    // dwie wyraźne kępy po 3 punkty (Lizbona centrum i Belém)
    const pts = [[38.711, -9.139], [38.713, -9.136], [38.709, -9.141], [38.697, -9.206], [38.693, -9.216], [38.696, -9.203]].map(([lat, lon]) => ({ lat, lon }));
    const { of } = D.clusters(pts, [3, 3]);
    return { caps, of };
  });
  ok(JSON.stringify(u.caps[0]) === '[3,3,3]', 'limity równe: ' + JSON.stringify(u.caps[0]));
  ok(u.caps[1][0] + u.caps[1][1] >= 4 && u.caps[1][1] > u.caps[1][0], 'dzień z punktami dostaje mniej: ' + JSON.stringify(u.caps[1]));
  ok(JSON.stringify(u.caps[2]) === '[0,0]', 'pełne dni – zero: ' + JSON.stringify(u.caps[2]));
  ok(u.of[0] === u.of[1] && u.of[1] === u.of[2] && u.of[3] === u.of[4] && u.of[4] === u.of[5] && u.of[0] !== u.of[3], 'kępy w osobnych dniach: ' + u.of.join(''));

  // podróż: 2 noce w Lizbonie, 2 w Porto; pomysły w obu miastach + jeden bez położenia
  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Portugalia', destination: 'Portugalia', start: '2027-05-01', end: '2027-05-04' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Lizbona', depart: '2027-05-01T15:00', arrive: '2027-05-03T10:00', lat: 38.712, lon: -9.14 });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Porto', depart: '2027-05-03T15:00', arrive: '2027-05-05T10:00', lat: 41.146, lon: -8.611 });
    const L = [['Zamek', 38.7139, -9.1335], ['Alfama', 38.7115, -9.1300], ['Rossio', 38.7139, -9.1394], ['Belém', 38.6916, -9.2160], ['Jerónimos', 38.6979, -9.2068], ['LX Factory', 38.7036, -9.1782]];
    const P = [['Ribeira', 41.1405, -8.6130], ['Livraria Lello', 41.1469, -8.6148], ['Clérigos', 41.1457, -8.6146], ['Foz', 41.1520, -8.6760]];
    let o = 0;
    for (const [title, lat, lon] of L.concat(P)) await DB.put('planItems', { tripId: t.id, date: '', time: '', title, lat, lon, order: o++ });
    await DB.put('planItems', { tripId: t.id, date: '', time: '', title: 'Bez miejsca', order: o++ });
    await DB.put('planItems', { tripId: t.id, date: '2027-05-01', time: '19:00', title: 'Kolacja', lat: 38.71, lon: -9.14, order: 0 });
    return { t: t.id };
  });

  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(800);
  ok(await p.$(`a.pl-distribute[href="#/rozloz/${ids.t}"]`) !== null, 'przycisk „Rozłóż pomysły na dni” w pomysłach');
  await p.click('a.pl-distribute'); await p.waitForSelector('.rz-pday', { timeout: 5000 });
  const prev = await p.$$eval('.rz-pday', e => e.map(x => x.querySelector('b').textContent + ': ' + [...x.querySelectorAll('li')].map(l => l.textContent).join('|')));
  console.log('  podgląd:\n   ' + prev.join('\n   '));
  ok(prev.length === 4, 'podgląd: 4 dni');
  const day = n => prev[n].split(': ')[1].split('|');
  const lis = ['Zamek', 'Alfama', 'Rossio', 'Belém', 'Jerónimos', 'LX Factory'], por = ['Ribeira', 'Livraria Lello', 'Clérigos', 'Foz'];
  ok([0, 1].every(i => day(i).every(x => lis.includes(x))) && [2, 3].every(i => day(i).every(x => por.includes(x))), 'Lizbona w dni 1–2, Porto w dni 3–4 (według noclegu)');
  ok(day(0).includes('Belém') === day(0).includes('Jerónimos'), 'Belém i Jerónimos tego samego dnia');
  ok(/bez miejsca na mapie/.test(await p.textContent('#rz-prev')), 'pomysł bez położenia zostaje');
  await p.screenshot({ path: `${dir}/t68-prev.png`, fullPage: true });

  // limit 3 dziennie: dzień 1 ma już kolację → 2 wolne; coś zostaje
  await p.selectOption('select[name=max]', '3'); await p.waitForTimeout(400);
  const t3 = await p.textContent('#rz-prev');
  ok(/Nie zmieści się/.test(t3) && (await p.textContent('#rz-go')).includes('(9)'), 'limit 3 → 9 rozłożonych, reszta zostaje: ' + (await p.textContent('#rz-go')) + ' / ' + t3.slice(-160));
  await p.selectOption('select[name=max]', '6'); await p.waitForTimeout(300);

  await p.click('#rz-go'); await p.waitForSelector('#rz-undo', { timeout: 5000 });
  ok(/Rozłożono 10 pomysłów/.test(await p.textContent('.rz-hero')), 'zapisano: 10 pomysłów');
  const st = await p.evaluate(async id => {
    const it = await DB.byIndex('planItems', 'tripId', id);
    const k = it.find(i => i.title === 'Kolacja');
    return { ideas: it.filter(i => !i.date).map(i => i.title), d1: it.filter(i => i.date === '2027-05-01').sort((a, b) => a.order - b.order).map(i => i.title), kol: k.date + ' ' + k.time };
  }, ids.t);
  ok(st.ideas.join() === 'Bez miejsca', 'w pomysłach tylko „Bez miejsca”');
  ok(st.kol === '2027-05-01 19:00', 'punkt z godziną bez zmian');
  ok(st.d1[st.d1.length - 1] === 'Kolacja' && st.d1.length === 4, 'dzień 1: pomysły przed kolacją o 19:00 – ' + st.d1.join(' → '));

  await p.click('#rz-undo'); await p.waitForTimeout(800);
  const back = await p.evaluate(async id => (await DB.byIndex('planItems', 'tripId', id)).filter(i => !i.date).length, ids.t);
  ok(back === 11 && p.url().endsWith(`#/plan/${ids.t}`), 'Cofnij: wszystkie pomysły wróciły (11)');

  // ciemny i angielski
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); });
  await p.evaluate(async () => { await DB.setSetting('lang', 'en'); await DB.setSetting('theme', 'dark'); });
  await p.goto(`http://localhost:8765/podroznik/#/rozloz/${ids.t}`); await p.reload(); await p.waitForSelector('.rz-pday', { timeout: 5000 });
  await p.screenshot({ path: `${dir}/t68-en-dark.png`, fullPage: true });
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
