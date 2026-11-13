// zdjęcia miejsc na mapie (okienko pinezki, lista pod mapą) i na kartach dla kierowcy. Sieć symulowana.
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/tile|carto/, r => r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route(/open-meteo|nominatim|overpass|wiki|commons|mail\.ru/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  // obrazek „zdjęcia” 120×80 w kolorze
  const data = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const g = c.getContext('2d');
    g.fillStyle = '#2a8'; g.fillRect(0, 0, 120, 80); g.fillStyle = '#fd3'; g.fillRect(20, 20, 40, 30); return c.toDataURL('image/jpeg'); });
  const { id, pid } = await p.evaluate(async data => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Bangkok', destination: 'Bangkok', start: T, end: App.addDays(T, 3), geo: { text: 'Bangkok', lat: 13.7465, lon: 100.4927 } });
    const loc = { lat: 13.7465, lon: 100.4930, cc: 'th', lang: 'th', name: 'วัดโพธิ์', addr: '2 ถนนสนามไชย กรุงเทพมหานคร' };
    const it = await DB.put('planItems', { tripId: t.id, title: 'Wat Pho', date: T, time: '10:00', order: 0, lat: loc.lat, lon: loc.lon, place: 'Sanam Chai Rd', local: loc, photo: { data, page: '', credit: 'test', auto: true } });
    await DB.put('planItems', { tripId: t.id, title: 'Kawiarnia', date: T, order: 1, lat: 13.744, lon: 100.497, place: 'x', photoTry: Date.now() });
    return { id: t.id, pid: it.id };
  }, data);
  const T = await p.evaluate(() => App.todayStr());

  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=${T}`); await p.waitForTimeout(1500);
  console.log('list thumbs:', await p.$$eval('.mp-row .mp-thumb', e => e.length));
  await p.click('.leaflet-marker-icon[title="Wat Pho"]'); await p.waitForTimeout(500);
  const pop = await p.$eval('.mp-pop', e => ({ name: e.querySelector('.mp-pop-name').textContent, sub: e.querySelector('.mp-pop-sub').textContent,
    img: !!e.querySelector('.mp-pop-img'), btns: [...e.querySelectorAll('.btn')].map(x => x.textContent.trim()) }));
  console.log('pin popup:', pop, '| hash still map:', (await p.evaluate(() => location.hash)).startsWith('#/mapa'));
  await p.screenshot({ path: `${dir}/t31-map.png` });
  await p.click('.mp-pop .btn.primary'); await p.waitForTimeout(600);
  console.log('open →', await p.evaluate(() => location.hash) === `#/punkt/${pid}`);
  // drugie dotknięcie tej samej pinezki → od razu punkt; nazwa w okienku też prowadzi do punktu
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=${T}`); await p.waitForTimeout(1500);
  await p.click('.leaflet-marker-icon[title="Wat Pho"]'); await p.waitForTimeout(400);
  console.log('1st tap → popup:', !!(await p.$('.mp-pop')), (await p.evaluate(() => location.hash)).startsWith('#/mapa'));
  await p.$eval('.leaflet-marker-icon[title="Wat Pho"]', e => e.click()); await p.waitForTimeout(600);
  console.log('2nd tap →', await p.evaluate(() => location.hash) === `#/punkt/${pid}`);
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=${T}`); await p.waitForTimeout(1500);
  await p.click('.leaflet-marker-icon[title="Kawiarnia"]'); await p.waitForTimeout(400);
  await p.$eval('.leaflet-marker-icon[title="Wat Pho"]', e => e.click()); await p.waitForTimeout(400);
  console.log('other pin → new popup, not navigation:', await p.$$eval('.mp-pop', e => e.length), 'popup(s)', await p.$eval('.mp-pop-name', e => e.textContent), (await p.evaluate(() => location.hash)).startsWith('#/mapa'));
  await p.click('.mp-pop-link'); await p.waitForTimeout(600);
  console.log('name link →', await p.evaluate(() => location.hash) === `#/punkt/${pid}`);
  // druga pinezka (bez zdjęcia) – okienko bez obrazka
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=${T}`); await p.waitForTimeout(1500);
  await p.click('.leaflet-marker-icon[title="Kawiarnia"]'); await p.waitForTimeout(400);
  console.log('2nd popup img:', !!(await p.$('.mp-pop .mp-pop-img')), await p.$eval('.mp-pop-name', e => e.textContent));

  await p.goto(`http://localhost:8765/podroznik/#/karty/${id}`); await p.waitForTimeout(800);
  console.log('card rows thumbs:', await p.$$eval('.tx-row .tx-thumb', e => e.length), '| icons:', await p.$$eval('.tx-row .tx-ic', e => e.length));
  await p.screenshot({ path: `${dir}/t31-list.png` });
  await p.click('.tx-row[data-k^="p:"]'); await p.waitForTimeout(500);
  const im = await p.$eval('.tx-full .tx-photo', e => ({ w: e.clientWidth, h: e.clientHeight })).catch(() => null);
  console.log('full card photo:', im, '| local name:', await p.$eval('.tx-full .tx-name', e => e.textContent));
  await p.screenshot({ path: `${dir}/t31-card.png` });
  // rozmówki w grupach
  await p.goto(`http://localhost:8765/podroznik/#/karty/${id}?j=lo`); await p.waitForTimeout(700);
  console.log('phrase groups (lo):', await p.$$eval('.tx-group', e => e.map(x => `${x.textContent}:${x.nextElementSibling.querySelectorAll('.tx-ph').length}`).join(', ')));
  await p.goto(`http://localhost:8765/podroznik/#/karty/${id}?j=zh`); await p.waitForTimeout(700);
  console.log('zh phrases:', await p.$$eval('.tx-ph', e => e.length));
  await p.click('.tx-ph[data-p="noice"]'); await p.waitForTimeout(300);
  console.log('no ice card:', await p.$eval('.tx-full .tx-phrase', e => e.textContent), '|', await p.$eval('.tx-full .tx-pron', e => e.textContent));
  await p.screenshot({ path: `${dir}/t31-phrases.png` });
  console.log('errors:', errs);
  await b.close();
})();
