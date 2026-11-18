// t57: kopiowanie od innych – cały dzień (do wybranego dnia mojej podróży, z godzinami) i cała wycieczka z nową datą wyjazdu
// (plan i przejazdy przesunięte). Emulator Firebase; bez niego test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const dir = process.argv[2] || 'podroznik-testy';
const get = url => new Promise(res => { const r = http.request(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode })); }); r.on('error', () => res({ status: 0 })); r.end(); });
(async () => {
  if (!(await get('http://127.0.0.1:8085/')).status) { console.log('SKIP brak emulatora Firestore (port 8085)'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone() {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const A = await phone(), K = await phone();
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-name-in', { timeout: 15000 });
  await A.fill('#zn-name-in', 'Ania'); await A.click('#zn-name button'); await A.waitForTimeout(400);
  const link = await A.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Rzym', destination: 'Rzym', start: '2027-04-10', end: '2027-04-13' });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Kraków KRK', to: 'Rzym FCO', depart: '2027-04-10T07:00', arrive: '2027-04-10T09:10' });
    const mk = (date, time, title, order) => DB.put('planItems', { tripId: t.id, date, time, title, cat: 'zwiedzanie', place: title, order });
    await mk('2027-04-11', '09:00', 'Koloseum', 0); await mk('2027-04-11', '13:00', 'Forum Romanum', 1); await mk('2027-04-11', '', 'Lody', 2);
    await mk('2027-04-12', '10:00', 'Watykan', 0);
    await App.Social.setVisibility(t.id, 'public');
    return App.Social.publicLink(t.id); });
  const mine = await K.evaluate(async () => { const t = await DB.put('trips', { name: 'Mój Rzym', start: '2027-06-01', end: '2027-06-05' });
    await DB.put('planItems', { tripId: t.id, date: '2027-06-02', time: '08:00', title: 'Śniadanie', cat: 'jedzenie', order: 0 }); return t.id; });
  await K.goto(link.replace('https://chiniak.github.io/podroznik/', B)); await K.waitForSelector('.zn-day', { timeout: 15000 });
  ok(await K.$('#zn-copytop') !== null, 'przycisk „Skopiuj całą wycieczkę” na górze');
  ok(await K.$$eval('[data-copyday]', e => e.map(x => x.dataset.copyday).join()) === '2027-04-11,2027-04-12', 'przycisk „Skopiuj dzień” przy dniach z punktami');
  // dzień 2 (11.04) → mój dzień 2 (02.06)
  await K.click('[data-copyday="2027-04-11"]'); await K.waitForSelector('.tp-sheet[open] [data-day]');
  ok(await K.$eval('.tp-sheet .tp-trip.on', e => e.dataset.day) === '2027-06-02', 'proponowany ten sam dzień podróży (dzień 2)');
  await K.screenshot({ path: `${dir}/t57-dzien.png` });
  await K.click('.tp-sheet [data-day="2027-06-02"]'); await K.waitForTimeout(800);
  const day = await K.evaluate(id => DB.byIndex('planItems', 'tripId', id).then(a => a.filter(i => i.date === '2027-06-02').sort((x, y) => x.order - y.order).map(i => `${i.time}|${i.title}`)), mine);
  ok(day.join(',') === '08:00|Śniadanie,09:00|Koloseum,13:00|Forum Romanum,|Lody', 'skopiowany dzień z godzinami, po moich punktach: ' + day.join(', '));
  ok(/Skopiowano/.test(await K.textContent('[data-copyday="2027-04-11"]')), 'przycisk → „Skopiowano”');
  // cała wycieczka od 1.08
  await K.click('#zn-copytop'); await K.waitForSelector('.tp-sheet[open] form');
  await K.fill('.tp-sheet input[name=start]', '2027-08-01');
  ok(/Powrót: .*4 sierpnia/.test(await K.textContent('#zn-copyend')), 'podgląd daty powrotu: ' + await K.textContent('#zn-copyend'));
  await K.click('.tp-sheet button[type=submit]'); await K.waitForTimeout(1500);
  const copy = await K.evaluate(async () => { const t = (await DB.all('trips')).find(x => x.name === 'Rzym'); const segs = await DB.byIndex('segments', 'tripId', t.id); const its = await DB.byIndex('planItems', 'tripId', t.id);
    return { start: t.start, end: t.end, dep: segs[0].depart, dates: [...new Set(its.map(i => i.date))].sort().join() }; });
  ok(copy.start === '2027-08-01' && copy.end === '2027-08-04' && copy.dep === '2027-08-01T07:00' && copy.dates === '2027-08-02,2027-08-03', 'cała wycieczka przesunięta: ' + JSON.stringify(copy));
  ok(/#\/podroze\//.test(K.url()), 'otwarta skopiowana podróż');
  for (const p of [A, K]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
