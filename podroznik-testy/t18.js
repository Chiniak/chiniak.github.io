// etap 9: strefy czasowe lotów, zdjęcie w tle podróży
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', timezoneId: 'Europe/Warsaw' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: '2027-05-01', end: '2027-05-05', color: '#2f6fd6' });
    const s1 = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: '2027-05-01T08:00', arrive: '2027-05-01T10:50', number: 'LO 281' });
    const s2 = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Lizbona LIS', to: 'Nowy Jork JFK', depart: '2027-05-05T11:00', arrive: '2027-05-05T14:00' });
    return { t: t.id, s1: s1.id, s2: s2.id };
  });
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}`); await p.waitForTimeout(800);
  const times = await p.$$eval('.tl-time', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('timeline:', times);
  console.log('stored tz:', await p.evaluate(id => DB.get('segments', id).then(s => [s.tzFrom, s.tzTo]), ids.s1));
  await p.goto(`http://localhost:8765/podroznik/#/odcinek/${ids.s1}`); await p.waitForTimeout(600);
  console.log('details:', (await p.textContent('.seg-head')).replace(/\s+/g, ' ').trim().slice(0, 160));
  // zmiana lotniska → strefa liczona od nowa
  await p.evaluate(async id => { const s = await DB.get('segments', id); await DB.put('segments', { ...s, to: 'Londyn LHR', arrive: '2027-05-01T10:30' }); }, ids.s1);
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}`); await p.waitForTimeout(600);
  console.log('after change:', (await p.textContent('.tl-time')).replace(/\s+/g, ' ').trim());
  // zdjęcie w tle
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}/edytuj`); await p.waitForTimeout(500);
  await p.setInputFiles('#cover', `${dir}/fx/screenshot.png`); await p.waitForTimeout(500);
  console.log('preview:', await p.$eval('#cover-box', e => e.classList.contains('has-photo')));
  await p.click('button[type=submit]'); await p.waitForTimeout(700);
  console.log('head photo:', await p.$eval('.trip-head', e => e.classList.contains('has-photo')));
  await p.screenshot({ path: `${dir}/t18-head.png` });
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  console.log('card photo:', await p.$eval('.trip-card', e => e.classList.contains('has-photo')));
  await p.screenshot({ path: `${dir}/t18-list.png` });
  const cov = await p.evaluate(() => DB.byIndex('files', 'segmentId', 'cover').then(f => f.map(x => [x.mime, x.blob.size])));
  console.log('cover rec:', cov);
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}/edytuj`); await p.waitForTimeout(500);
  await p.click('#cover-del'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}`); await p.waitForTimeout(500);
  console.log('after delete:', await p.$eval('.trip-head', e => e.classList.contains('has-photo')), await p.evaluate(() => DB.byIndex('files', 'segmentId', 'cover').then(f => f.length)));
  console.log('errors:', errs); await b.close(); })();
