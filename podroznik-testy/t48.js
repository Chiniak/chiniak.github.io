// optymalizacja trasy dnia: punkty z godziną zostają, odcinki między nimi, powrót do noclegu, „Ułóż trasę” w planie + „Cofnij”
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);

  // 1) algorytm: punkty na prostej, stały start i koniec
  const u = await p.evaluate(() => {
    const P = App.Places, pt = x => ({ lat: 50, lon: 19 + x / 100 });
    const pts = [pt(5), pt(1), pt(4), pt(2), pt(3)];
    return { open: P.shortestOrder(pts).map(i => pts[i].lon), start: P.shortestOrder(pts, pt(6)).map(i => pts[i].lon), both: P.shortestOrder(pts, pt(0), pt(6)).map(i => pts[i].lon) };
  });
  const asc = a => a.every((x, i) => !i || x > a[i - 1]), desc = a => a.every((x, i) => !i || x < a[i - 1]);
  ok(asc(u.open) || desc(u.open), 'ścieżka otwarta po kolei: ' + u.open);
  ok(desc(u.start), 'start z prawej → malejąco: ' + u.start);
  ok(asc(u.both), 'start z lewej, koniec z prawej → rosnąco: ' + u.both);

  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Kraków', destination: 'Kraków', start: '2027-06-01', end: '2027-06-03' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Rynek', address: 'Rynek 1', lat: 50.0617, lon: 19.9373, depart: '2027-06-01T15:00', arrive: '2027-06-03T11:00' });
    const mk = (title, lat, lon, order, extra = {}) => DB.put('planItems', { tripId: t.id, date: '2027-06-02', time: '', title, cat: 'zwiedzanie', place: title, lat, lon, order, ...extra });
    // rano (przed obiadem o 13:00): zła kolejność – Kazimierz, Wawel, Barbakan; obiad przy Wawelu; po obiedzie: Kopiec (daleko na zachód), Sukiennice
    await mk('Kazimierz', 50.0513, 19.9449, 0);
    await mk('Barbakan', 50.0655, 19.9417, 1);
    await mk('Wawel', 50.0540, 19.9354, 2);
    await mk('Obiad', 50.0560, 19.9370, 3, { time: '13:00' });
    await mk('Kopiec Kościuszki', 50.0548, 19.8933, 6);
    await DB.put('planItems', { tripId: t.id, date: '2027-06-02', time: '', title: 'Bez miejsca', cat: 'inne', order: 5 });
    await mk('Sukiennice', 50.0617, 19.9373 + 0.0005, 4);
    // dzień 3: już ułożony (dwa punkty po drodze)
    const d3 = (title, lat, lon, order) => DB.put('planItems', { tripId: t.id, date: '2027-06-01', time: '', title, cat: 'zwiedzanie', place: title, lat, lon, order });
    await d3('A', 50.0620, 19.9380, 0); await d3('B', 50.0625, 19.9390, 1);
    return { t: t.id };
  });
  const order = d => p.evaluate(([id, d]) => DB.byIndex('planItems', 'tripId', id).then(a => a.filter(i => i.date === d).sort((x, y) => x.order - y.order).map(i => i.title)), [ids.t, d]);

  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(800);
  const bar = await p.textContent('.pl-day[data-date="2027-06-02"] .pl-route');
  ok(/Trasa dnia z noclegu i z powrotem: ok\. [\d,]+ km/.test(bar.replace(/\s+/g, ' ')), 'pasek trasy: ' + bar.replace(/\s+/g, ' ').trim());
  ok(await p.$('.pl-day[data-date="2027-06-02"] [data-opt]') !== null, 'przycisk „Ułóż trasę”');
  const before = await order('2027-06-02');
  await p.click('.pl-day[data-date="2027-06-02"] [data-opt]'); await p.waitForTimeout(800);
  const after = await order('2027-06-02');
  console.log('przed:', before.join(' › ')); console.log('po:   ', after.join(' › '));
  ok(after.indexOf('Obiad') === 3, 'obiad (13:00) zostaje na 4. miejscu');
  ok(after.indexOf('Bez miejsca') === 5, 'punkt bez położenia zostaje na miejscu');
  ok(after.slice(0, 3).sort().join() === 'Barbakan,Kazimierz,Wawel', 'rano te same punkty (nie przeskakują przez obiad)');
  ok(after[0] === 'Barbakan' && after[2] === 'Wawel', 'rano: z hotelu Barbakan → Kazimierz → Wawel (koniec przy obiedzie)');
  ok(after[4] === 'Kopiec Kościuszki' && after[6] === 'Sukiennice', 'po obiedzie: Kopiec, potem Sukiennice przy hotelu (powrót)');
  const done = (await p.textContent('.pl-day[data-date="2027-06-02"] .pl-route.is-done')).replace(/\s+/g, ' ').trim();
  ok(/Trasa krótsza o [\d,]+ (km|m): było [\d,]+ km, jest [\d,]+ km/.test(done), 'wynik: ' + done);
  await p.screenshot({ path: `${dir}/t48-plan.png` });

  // ponowne ułożenie: nic do poprawy
  const r2 = await p.evaluate(id => App.Places.optimizeDay(id, '2027-06-02', { dry: true }), ids.t);
  ok(r2.moved === 0 && r2.saved === 0, 'drugi raz – bez zmian');

  // cofnij
  await p.click('.pl-day[data-date="2027-06-02"] [data-undo]'); await p.waitForTimeout(700);
  ok((await order('2027-06-02')).join() === before.join(), 'Cofnij przywraca kolejność');
  ok(await p.$('.pl-route.is-done') === null, 'po cofnięciu bez komunikatu');

  // dzień już ułożony
  await p.click('.pl-day[data-date="2027-06-01"] [data-opt]'); await p.waitForTimeout(700);
  const d1 = (await p.textContent('.pl-day[data-date="2027-06-01"] .pl-route')).replace(/\s+/g, ' ').trim();
  ok(/już najkrótsza/.test(d1), 'dzień ułożony: ' + d1);
  await p.click('.pl-day[data-date="2027-06-01"] [data-undo]'); await p.waitForTimeout(500);
  ok((await order('2027-06-01')).join() === 'A,B', 'zamknięcie komunikatu nic nie zmienia');

  // komunikat znika, gdy kolejność zmieni się inaczej (np. przeciągnięcie)
  await p.click('.pl-day[data-date="2027-06-02"] [data-opt]'); await p.waitForTimeout(700);
  await p.evaluate(async id => { const a = (await DB.byIndex('planItems', 'tripId', id)).filter(i => i.date === '2027-06-02').sort((x, y) => x.order - y.order);
    await DB.put('planItems', { ...a[0], order: 1 }); await DB.put('planItems', { ...a[1], order: 0 }); App.render(); }, ids.t);
  await p.waitForTimeout(600);
  ok(await p.$('.pl-route.is-done') === null, 'po ręcznej zmianie kolejności „Cofnij” znika');

  // mapa: ten sam algorytm
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${ids.t}?d=2027-06-02`); await p.waitForTimeout(1000);
  ok(/i powrót do niego/.test(await p.textContent('.mp-opt-hint')), 'mapa: podpowiedź o powrocie do noclegu');
  await p.click('#mp-opt'); await p.waitForTimeout(700);
  ok((await order('2027-06-02'))[3] === 'Obiad', 'mapa: obiad zostaje na miejscu');

  // angielski
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); }); await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.reload(); await p.waitForTimeout(900);
  const en = (await p.textContent('.pl-day[data-date="2027-06-02"] .pl-route')).replace(/\s+/g, ' ').trim();
  ok(/Day route from the stay and back: approx\./.test(en) && /Optimize route/.test(en), 'EN: ' + en);
  await p.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
