// mapa: dotknięcie → pinezka z nazwą, zapis do pomysłów / dnia jednym dotknięciem (widok zostaje), 🏛️ atrakcje na mapie;
// Odkrywaj: szybkie wyniki z Wikipedii, gdy serwer map jest wolny; serwery pytane wyścigiem. Sieć symulowana.
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', geolocation: { latitude: 13.7465, longitude: 100.4927 }, permissions: ['geolocation'] });
  await ctx.route(/tile|carto|open-meteo|upload\.wikimedia|commons/, r => /tile|carto|upload/.test(r.request().url()) ? r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }) : r.abort());
  let rev = 0;
  await ctx.route(/nominatim/, r => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/reverse')) { const n = ++rev === 1 ? 'Sala Rattanakosin' : `Kawiarnia ${rev}`; return r.fulfill({ json: { name: n, display_name: `${n}, Maharat Road, Bangkok, Tajlandia` } }); }
    r.fulfill({ json: [] });
  });
  const over = [];
  await ctx.route(/overpass|maps\.mail\.ru/, async r => {
    const host = new URL(r.request().url()).hostname; over.push(`${host}@${Date.now()}`);
    if (host === 'overpass-api.de') return r.fulfill({ status: 504, body: 'busy' }); // główny przeciążony
    await sleep(4000); // drugi wolny, ale odpowiada
    r.fulfill({ json: { elements: [
      { type: 'way', id: 1, center: { lat: 13.7500, lon: 100.4913 }, tags: { name: 'Grand Palace', 'name:pl': 'Wielki Pałac', tourism: 'attraction', wikidata: 'Q1' } },
      { type: 'node', id: 2, lat: 13.7437, lon: 100.4889, tags: { name: 'Wat Arun', tourism: 'attraction', wikipedia: 'en:Wat Arun' } } ] } }); });
  await ctx.route(/wikipedia\.org\/w\/api/, r => {
    const s = new URL(r.request().url()).searchParams;
    if (s.get('generator') === 'geosearch') return r.fulfill({ json: { query: { pages: {
      1: { pageid: 1, title: 'Wat Pho', coordinates: [{ lat: 13.7465, lon: 100.4930 }], description: 'świątynia', thumbnail: { source: 'https://upload.wikimedia.org/x/watpho.jpg' } },
      2: { pageid: 2, title: 'Muzeum Siam', coordinates: [{ lat: 13.7442, lon: 100.4942 }], thumbnail: { source: 'https://upload.wikimedia.org/x/siam.jpg' } } } } } });
    r.fulfill({ json: { query: { pages: {} } } });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Bangkok', destination: 'Bangkok', start: T, end: App.addDays(T, 3), geo: { text: 'Bangkok', lat: 13.7465, lon: 100.4927 } });
    await DB.put('planItems', { tripId: t.id, title: 'Śniadanie', date: T, order: 0, lat: 13.744, lon: 100.497, place: 'x' });
    return t.id;
  });
  const T = await p.evaluate(() => App.todayStr());

  // Odkrywaj „Tutaj”: pierwsze wyniki (Wikipedia) zanim odpowie wolny serwer map
  await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${id}`); await p.waitForTimeout(300);
  let t0 = Date.now();
  await p.click('#dc-gps');
  await p.waitForSelector('.dc-card', { timeout: 15000 });
  const firstMs = Date.now() - t0;
  console.log('first results after', firstMs, 'ms:', await p.$$eval('.dc-card b', e => e.map(x => x.textContent)), '| note:', !!(await p.$('.dc-more')));
  await p.waitForFunction(() => !document.querySelector('.dc-more'), null, { timeout: 20000 });
  console.log('full results after', Date.now() - t0, 'ms:', await p.$$eval('.dc-card b', e => e.map(x => x.textContent)));
  console.log('overpass servers asked:', over.map(x => x.split('@')[0]).join(', '));
  // powrót – z pamięci, bez nowego szukania
  const n0 = over.length;
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(300);
  await p.goBack(); await p.waitForTimeout(800);
  console.log('cached again:', await p.$$eval('.dc-card', e => e.length), '| new overpass calls:', over.length - n0);

  // mapa dnia: dotknięcie → pinezka i nazwa
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=${T}`); await p.waitForTimeout(1500);
  const box = await p.$('#mp-map').then(e => e.boundingBox());
  await p.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 - 30); await p.waitForTimeout(150);
  console.log('pin at once:', !!(await p.$('.mp-new')), '| popup:', (await p.textContent('.mp-pop-box')).replace(/\s+/g, ' ').trim());
  await p.waitForTimeout(1500);
  console.log('after reverse:', (await p.textContent('.mp-pop-box')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: `${dir}/t30-pin.png` });
  const zoomBefore = await p.evaluate(() => document.querySelector('.leaflet-tile') && document.querySelector('.leaflet-tile').src.match(/\/(\d+)\/\d+\/\d+\.png/)[1]);
  await p.click('.mp-pop-box [data-act="day"]'); await p.waitForTimeout(1500);
  console.log('saved to day:', await p.evaluate(([i, d]) => DB.byIndex('planItems', 'tripId', i).then(a => a.filter(x => x.date === d).map(x => [x.title, x.order, x.lat != null])), [id, T]));
  console.log('map kept zoom:', zoomBefore, '→', await p.evaluate(() => document.querySelector('.leaflet-tile').src.match(/\/(\d+)\/\d+\/\d+\.png/)[1]), '| list rows:', await p.$$eval('.mp-row', e => e.length));
  // pomysł
  await p.mouse.click(box.x + 60, box.y + 80); await p.waitForTimeout(1600);
  await p.click('.mp-pop-box [data-act="idea"]'); await p.waitForTimeout(1200);
  console.log('ideas:', await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.filter(x => !x.date).map(x => x.title)), id));
  // zamknięcie okienka usuwa tymczasową pinezkę
  await p.mouse.click(box.x + 80, box.y + 200); await p.waitForTimeout(300);
  await p.click('.leaflet-popup-close-button'); await p.waitForTimeout(300);
  console.log('temp pin removed on close:', !(await p.$('.mp-new')));

  // 🏛️ atrakcje na mapie
  t0 = Date.now();
  await p.click('.mp-poi-btn');
  await p.waitForSelector('.mp-poi', { timeout: 10000 });
  console.log('poi first after', Date.now() - t0, 'ms:', await p.$$eval('.mp-poi', e => e.length));
  await p.waitForFunction(() => !document.querySelector('.mp-poi-btn.busy'), null, { timeout: 20000 });
  console.log('poi total:', await p.$$eval('.mp-poi', e => e.length));
  await p.screenshot({ path: `${dir}/t30-pois.png` });
  await p.evaluate(() => { const el = [...document.querySelectorAll('.leaflet-marker-icon')].find(m => m.title === 'Wat Pho'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(400);
  console.log('poi popup:', (await p.textContent('.mp-pop-box')).replace(/\s+/g, ' ').trim(), '| img:', !!(await p.$('.mp-pop-img')));
  await p.screenshot({ path: `${dir}/t30-poi-pop.png` });
  await p.click('.mp-pop-box [data-act="idea"]'); await p.waitForTimeout(1500);
  console.log('poi saved:', await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.filter(x => x.title === 'Wat Pho').map(x => [x.date, !!x.photoUrl])), id),
    '| pois still shown:', await p.$$eval('.mp-poi', e => e.length), '| marked:', await p.$$eval('.mp-poi.on', e => e.length));
  console.log('errors:', errs); await b.close(); })();
