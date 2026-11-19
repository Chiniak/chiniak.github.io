// mapa bez klucza CARTO (od 2026 CARTO bez klucza zwraca „API KEY REQUIRED”): tylko OpenStreetMap, żadnych zapytań do CARTO,
// mapa offline wyłączona z komunikatem; sw.js usuwa stare kafelki CARTO (bez „v=2”) z pamięci, OSM zostaje
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const hosts = [];
  await ctx.route(/^https:\/\/(?!localhost).*/, r => {
    const u = new URL(r.request().url());
    if (/cartocdn|openstreetmap\.org$/.test(u.hostname) && /\.png/.test(u.pathname)) { hosts.push(u.hostname); return r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); }
    r.abort();
  });
  await p.goto('http://localhost:8765/podroznik/#/podroze');
  await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !self.MAP_CONFIG.cartoKey && !App.Places.LAYERS.latin && !App.Offline.ready), 'bez klucza: brak warstwy CARTO, mapa offline wyłączona');

  // stare kafelki w pamięci (sprzed zmiany: CARTO bez v=2 – mogą być „API KEY REQUIRED”)
  await p.evaluate(async () => {
    const png = () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const k = await caches.open('mapa-kafelki');
    await k.put('https://a.basemaps.cartocdn.com/rastertiles/voyager/5/17/10.png', png());
    await k.put('https://a.basemaps.cartocdn.com/rastertiles/voyager/5/17/11.png?v=2', png());
    await k.put('https://tile.openstreetmap.org/5/17/10.png', png());
    const o = await caches.open('mapa-offline-x');
    await o.put('https://a.basemaps.cartocdn.com/rastertiles/voyager/6/34/20.png', png());
    // ponowna aktywacja service workera (jak przy aktualizacji aplikacji)
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  });
  await p.reload(); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(1200);
  const left = await p.evaluate(async () => ({
    k: (await (await caches.open('mapa-kafelki')).keys()).map(r => r.url.replace(/^https:\/\/([^/]+).*\/(\d+\/\d+\/\d+\.png.*)$/, '$1 $2')).sort(),
    o: (await (await caches.open('mapa-offline-x')).keys()).length,
  }));
  ok(left.k.join() === 'a.basemaps.cartocdn.com 5/17/11.png?v=2,tile.openstreetmap.org 5/17/10.png' && left.o === 0, 'stare kafelki CARTO usunięte, nowe i OSM zostają: ' + left.k.join(' | '));

  // mapa: tylko OpenStreetMap, bez przełącznika warstw
  const id = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Hanoi', destination: 'Hanoi', start: '2027-03-01', end: '2027-03-04', geo: { lat: 21.03, lon: 105.85 } });
    await DB.put('planItems', { tripId: t.id, date: '2027-03-01', title: 'Jezioro', lat: 21.03, lon: 105.85, order: 0 });
    await DB.setSetting('mapLayer', 'latin'); // zapisany wybór sprzed zmiany
    return t.id;
  });
  hosts.length = 0;
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-03-01`); await p.waitForTimeout(2500);
  ok(hosts.length > 0 && hosts.every(h => h === 'tile.openstreetmap.org'), `kafelki tylko z OpenStreetMap (${hosts.length})`);
  ok(await p.$('.leaflet-control-layers') === null, 'bez przełącznika warstw (jest tylko jedna)');
  ok(/OpenStreetMap/.test(await p.textContent('#mp-attr-src')) && !/CARTO/.test(await p.textContent('#mp-attr-src')), 'podpis: OpenStreetMap');

  await p.goto(`http://localhost:8765/podroznik/#/mapa-offline/${id}`); await p.waitForTimeout(800);
  ok(/wymaga teraz klucza/.test(await p.textContent('#view')) && await p.$('#of-go') === null, 'Mapa offline: komunikat, bez przycisku pobierania');
  const st = await p.evaluate(async id => (await App.Prep.check(id)).steps.find(s => s.key === 'map'), id);
  ok(st.done === null && /niedostępna/.test(st.txt), 'Przygotuj offline: krok mapy „nie dotyczy” – ' + st.txt);
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
