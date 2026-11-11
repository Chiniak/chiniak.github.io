// Azja: odznaczanie pomysłu, nazwy łacińskie, podkład z napisami łacińskimi, kafelki offline, nawigacja geo:/Amap, kursy NBP z tabeli B
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const tiles = [];
  // kafelki obsługuje service worker – przechwytujemy na poziomie kontekstu (żądania SW też tu trafiają)
  await ctx.route(/cartocdn|tile\.openstreetmap/, r => { tiles.push(new URL(r.request().url()).hostname); r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }); });
  await ctx.route(/open-meteo|wikipedia/, r => r.abort());
  await ctx.route(/nominatim/, r => r.fulfill({ json: [{ name: 'Luang Prabang', display_name: 'Luang Prabang, Laos', lat: '19.8856', lon: '102.1347', type: 'city' }] }));
  await ctx.route(/overpass|maps\.mail\.ru/, r => r.fulfill({ json: { elements: [
    { type: 'node', id: 1, lat: 19.892, lon: 102.134, tags: { tourism: 'attraction', name: 'ວັດຊຽງທອງ', 'name:en': 'Wat Xieng Thong', wikidata: 'Q1' } } ] } }));
  await ctx.route(/api\.nbp\.pl/, r => { const u = r.request().url();
    if (/\/a\/LAK/.test(u)) return r.fulfill({ status: 404, body: 'NotFound' });
    if (/\/b\/LAK/.test(u)) return r.fulfill({ json: { rates: [{ mid: 0.00018234 }] } });
    if (/\/a\/THB/.test(u)) return r.fulfill({ json: { rates: [{ mid: 0.1123 }] } });
    r.fulfill({ status: 404 }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(800); // service worker przejmuje stronę
  const id = await p.evaluate(() => DB.put('trips', { name: 'Laos', destination: 'Luang Prabang', start: '2027-01-10', end: '2027-01-14' }).then(t => t.id));
  // odkrywanie: nazwa angielska + lokalna, dodaj i odznacz
  await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${id}`); await p.waitForSelector('.dc-card', { timeout: 8000 });
  console.log('name:', await p.textContent('.dc-main b'), '| local:', await p.textContent('.dc-local'));
  await p.click('.dc-add'); await p.waitForTimeout(300); console.log('after add:', await p.textContent('.dc-add'), await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.length), id));
  await p.click('.dc-add'); await p.waitForTimeout(300); console.log('after 2nd click:', await p.textContent('.dc-add'), await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.length), id));
  await p.click('.dc-add'); await p.waitForTimeout(300);
  // przeniesione do dnia → odznaczenie pyta
  await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => DB.put('planItems', { ...a[0], date: '2027-01-11' })), id);
  await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${id}?t=atrakcje`); await p.waitForSelector('.dc-card'); await p.waitForTimeout(200);
  p.once('dialog', d => { console.log('confirm:', d.message()); d.accept(); });
  await p.click('.dc-add'); await p.waitForTimeout(400); console.log('after confirm:', await p.textContent('.dc-add'), await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.length), id));
  // mapa: w Laosie podkład z napisami łacińskimi
  await p.evaluate(i => DB.put('planItems', { tripId: i, date: '2027-01-11', title: 'Wat Xieng Thong', lat: 19.892, lon: 102.134, order: 0 }), id);
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-01-11`); await p.waitForTimeout(1500);
  console.log('tile hosts:', [...new Set(tiles)].join(','), '| attribution:', await p.textContent('#mp-attr-src'));
  const cached = await p.evaluate(async () => (await (await caches.open('mapa-kafelki')).keys()).length);
  console.log('tiles cached:', cached);
  // offline: kafelki z pamięci
  const before = tiles.length; await ctx.setOffline(true);
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=wszystko`); await p.waitForTimeout(400);
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-01-11`); await p.waitForTimeout(1500);
  console.log('offline tiles loaded:', await p.$$eval('.leaflet-tile-loaded', e => e.length), '| network tile requests while offline:', tiles.length - before);
  await ctx.setOffline(false);
  // przełączenie podkładu zapamiętane
  console.log('layers:', await p.$$eval('.leaflet-control-layers-base label', e => e.map(x => x.textContent.trim())));
  await p.evaluate(() => [...document.querySelectorAll('.leaflet-control-layers-base label')].find(l => l.textContent.includes('Nazwy lokalne')).querySelector('input').click()); await p.waitForTimeout(500);
  console.log('layer saved:', await p.evaluate(() => DB.getSetting('mapLayer')));
  // nawigacja
  for (const nav of ['geo', 'amap', 'google']) {
    await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(400);
    await p.selectOption('#nav-app', nav); await p.waitForTimeout(200);
    await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(500);
    console.log(`nav ${nav}:`, await p.evaluate(() => [App.mapsUrl('19.892,102.134'), App.mapsUrl('Hotel Sala, Luang Prabang')].join('  ')));
  }
  // kursy NBP: THB z tabeli A, LAK z tabeli B
  await p.evaluate(async i => { await DB.put('expenses', { tripId: i, amount: 100000, currency: 'LAK', cat: 'jedzenie', date: '2027-01-11' }); await DB.put('expenses', { tripId: i, amount: 200, currency: 'THB', cat: 'jedzenie', date: '2027-01-11' }); }, id);
  await p.goto(`http://localhost:8765/podroznik/#/budzet/${id}`); await p.waitForTimeout(500);
  await p.click('#bg-nbp'); await p.waitForTimeout(800);
  console.log('rates:', await p.inputValue('[name=rate_LAK]'), await p.inputValue('[name=rate_THB]'), '|', await p.textContent('#toast'));
  console.log('errors:', errs); await b.close(); })();
