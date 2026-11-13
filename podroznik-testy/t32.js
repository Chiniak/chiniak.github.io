// „Przygotuj offline”: lista kontrolna i jeden przycisk – karty dla kierowcy, zdjęcia, kursy NBP, pogoda, mapa offline.
// Podróż do Chin (ostrzeżenie przed wjazdem). Sieć symulowana; po przygotowaniu sprawdza, że karta działa bez sieci.
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
const IMG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'); // poprawny PNG (da się zdekodować)
const CORS = { 'access-control-allow-origin': '*' };
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const hits = {};
  const hit = k => { hits[k] = (hits[k] || 0) + 1; };
  await ctx.route(/basemaps\.cartocdn|tile\.openstreetmap/, r => { hit('tile'); r.fulfill({ body: PNG, contentType: 'image/png', headers: CORS }); });
  await ctx.route(/upload\.wikimedia/, r => { hit('img'); r.fulfill({ body: IMG, contentType: 'image/png', headers: CORS }); });
  await ctx.route(/nominatim/, r => {
    const u = new URL(r.request().url()); hit('nominatim');
    if (u.pathname.startsWith('/reverse')) {
      if (u.searchParams.get('accept-language') === 'en') return r.fulfill({ json: { address: { country_code: 'cn' } }, headers: CORS });
      const lat = +u.searchParams.get('lat');
      return r.fulfill({ json: { namedetails: { name: lat > 39.915 ? '故宫' : '北京饭店' }, address: { state: '北京市', city_district: '东城区', road: lat > 39.915 ? '景山前街' : '东长安街', house_number: '4' } }, headers: CORS });
    }
    r.fulfill({ json: [{ lat: '39.9042', lon: '116.4074', display_name: 'Pekin, Chiny' }], headers: CORS });
  });
  await ctx.route(/wikipedia\.org\/w\/api|commons\.wikimedia\.org\/w\/api/, r => {
    hit('wiki');
    const s = new URL(r.request().url()).searchParams;
    if (/wikipedia/.test(r.request().url()) && s.get('generator') === 'geosearch') return r.fulfill({ json: { query: { pages: {
      1: { pageid: 1, title: 'Zakazane Miasto', coordinates: [{ lat: 39.9163, lon: 116.3972 }], thumbnail: { source: 'https://upload.wikimedia.org/x/fc.jpg' } } } } }, headers: CORS });
    r.fulfill({ json: { query: { pages: {} } }, headers: CORS });
  });
  await ctx.route(/api\.nbp\.pl/, r => { hit('nbp'); const c = r.request().url().match(/rates\/(\w)\/(\w+)/);
    return c[2] === 'CNY' ? r.fulfill({ json: { rates: [{ mid: 0.5612 }] }, headers: CORS }) : r.fulfill({ status: 404, body: '' }); });
  await ctx.route(/open-meteo/, r => { hit('meteo');
    const u = new URL(r.request().url()); const s = u.searchParams.get('start_date'), e = u.searchParams.get('end_date');
    const days = []; for (let d = new Date(s); d <= new Date(e); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
    r.fulfill({ json: { daily: { time: days, weather_code: days.map(() => 1), temperature_2m_max: days.map(() => 12), temperature_2m_min: days.map(() => 2),
      precipitation_probability_max: days.map(() => 10), precipitation_sum: days.map(() => 0) } }, headers: CORS }); });

  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Chiny', destination: 'Pekin', start: App.addDays(T, 2), end: App.addDays(T, 6), geo: { text: 'Pekin', lat: 39.9042, lon: 116.4074 } });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Beijing Hotel', depart: `${App.addDays(T, 2)}T15:00`, arrive: `${App.addDays(T, 6)}T11:00`, lat: 39.9087, lon: 116.4106, address: 'Dongchang\'an St 33' });
    await DB.put('planItems', { tripId: t.id, title: 'Zakazane Miasto', date: App.addDays(T, 3), order: 0, lat: 39.9163, lon: 116.3972, place: 'Jingshan Front St 4' });
    await DB.put('planItems', { tripId: t.id, title: 'Mur Chiński', date: '', order: 0 });
    return t.id;
  });

  await p.goto(`http://localhost:8765/podroznik/#/podroze/${id}`); await p.waitForTimeout(600);
  console.log('trip link:', await p.$eval('a[href^="#/przygotuj/"]', e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null));
  await p.click('a[href^="#/przygotuj/"]'); await p.waitForTimeout(800);
  const state = () => p.$$eval('.pr-row', r => r.map(x => `${x.querySelector('.pr-mark').textContent} ${x.querySelector('b').textContent} – ${x.querySelector('.pr-txt').textContent}`));
  console.log('china warning:', !!(await p.$('.pr-warn')), '| sum:', await p.$eval('.pr-sum b', e => e.textContent), '| button:', await p.$eval('#pr-go', e => e.textContent));
  console.log((await state()).join('\n'));
  await p.screenshot({ path: `${dir}/t32-before.png`, fullPage: true });

  const t0 = Date.now();
  await p.click('#pr-go');
  await p.waitForTimeout(700);
  console.log('while running:', !!(await p.$('#pr-stop')), '|', (await state()).filter(s => s.startsWith('⏳')).join(' | '));
  await p.waitForFunction(() => !document.querySelector('#pr-stop'), null, { timeout: 120000 }).catch(e => console.log('TIMEOUT'));
  await p.waitForTimeout(500);
  console.log('done in', Math.round((Date.now() - t0) / 1000), 's | sum:', await p.$eval('.pr-sum b', e => e.textContent));
  console.log((await state()).join('\n'));
  console.log('network:', hits);
  await p.screenshot({ path: `${dir}/t32-after.png`, fullPage: true });

  const db = await p.evaluate(async id => {
    const items = await DB.byIndex('planItems', 'tripId', id), segs = await DB.byIndex('segments', 'tripId', id), t = await DB.get('trips', id);
    const c = await caches.open(`mapa-offline-${id}`);
    return { local: segs.concat(items).map(x => x.local && x.local.name || null), photos: items.map(i => !!i.photo), rates: t.rates,
      weather: !!(await DB.getSetting(`weather:${id}`, null)), tiles: (await c.keys()).length, offlineMap: !!t.offlineMap };
  }, id);
  console.log('db:', JSON.stringify(db));

  // drugi raz – nic do pobrania, bez nowych zapytań
  const before = JSON.stringify(hits);
  await p.reload(); await p.waitForTimeout(1200);
  console.log('after reload: ok =', !!(await p.$('.pr-ok')), '| go button:', !!(await p.$('#pr-go')), '| new requests:', JSON.stringify(hits) !== before);

  // bez sieci: karta dla kierowcy i mapa z pamięci
  await ctx.setOffline(true);
  await p.goto(`http://localhost:8765/podroznik/#/karty/${id}`); await p.waitForTimeout(800);
  await p.click('.tx-row[data-k^="p:"]'); await p.waitForTimeout(400);
  console.log('offline card:', await p.$eval('.tx-full .tx-name', e => e.textContent), '|', await p.$eval('.tx-full .tx-addr', e => e.textContent), '| photo:', !!(await p.$('.tx-full .tx-photo')));
  console.log('errors:', errs);
  await b.close();
})();
