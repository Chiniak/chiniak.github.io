// mapa: cel podróży z wyszukiwarki OSM (nie z Open-Meteo), pusty dzień, „gdzie jestem”, dotknięcie mapy → nowy punkt, wyszukiwanie nad mapą
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', geolocation: { latitude: 50.0614, longitude: 19.9366 }, permissions: ['geolocation'] });
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
  // Open-Meteo myli „Teneryfa” z San Juan (tak jak u użytkownika)
  await ctx.route(/geocoding-api\.open-meteo/, r => r.fulfill({ json: { results: [{ latitude: 18.4655, longitude: -66.1057, country_code: 'PR', name: 'San Juan' }] } }));
  await ctx.route(/api\.open-meteo|archive-api/, r => r.abort());
  const nom = [];
  await ctx.route(/nominatim/, r => { const u = new URL(r.request().url()); nom.push(u.pathname + ':' + (u.searchParams.get('q') || u.searchParams.get('lat')));
    if (u.pathname.startsWith('/reverse')) return r.fulfill({ json: { name: 'Plaza de España', display_name: 'Plaza de España, Santa Cruz de Tenerife, Wyspy Kanaryjskie, Hiszpania' } });
    const q = u.searchParams.get('q');
    if (q === 'Teneryfa') return r.fulfill({ json: [{ name: 'Teneryfa', display_name: 'Teneryfa, Wyspy Kanaryjskie, Hiszpania', lat: '28.2916', lon: '-16.6291', type: 'island' }] });
    if (q === 'Loro Parque') return r.fulfill({ json: [{ name: 'Loro Parque', display_name: 'Loro Parque, Puerto de la Cruz, Hiszpania', lat: '28.4113', lon: '-16.5644', type: 'zoo' }] });
    r.fulfill({ json: [] }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(400);
  const id = await p.evaluate(() => DB.put('trips', { name: 'Teneryfa', destination: 'Teneryfa', start: '2027-03-01', end: '2027-03-05' }).then(t => t.id));
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}`); await p.waitForTimeout(2500);
  const tilePos = await p.evaluate(() => { const t = [...document.querySelectorAll('.leaflet-tile')].map(x => x.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/).slice(1).map(Number)); return t[0]; });
  // kafelek z=13: Teneryfa ~ x 3717 y 3420; San Juan ~ x 2591 y 3681
  console.log('tile z/x/y:', tilePos, '| nominatim:', nom.join(' '));
  console.log('trip.geo:', await p.evaluate(i => DB.get('trips', i).then(t => t.geo && [t.geo.text, t.geo.lat]), id));
  await p.screenshot({ path: `${dir}/t24-map.png` });
  // gdzie jestem
  await p.click('.mp-locate'); await p.waitForTimeout(800);
  console.log('me marker:', await p.$$eval('path.leaflet-interactive', e => e.length), '| tile now:', await p.evaluate(() => document.querySelector('.leaflet-tile').src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/).slice(1).join('/')));
  // dotknięcie mapy
  const box = await p.$('#mp-map').then(e => e.boundingBox());
  await p.mouse.click(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40); await p.waitForTimeout(400);
  console.log('popup:', await p.textContent('.mp-pop'));
  await p.click('.mp-pop a'); await p.waitForTimeout(2000);
  console.log('form:', await p.textContent('#title'), '|', await p.inputValue('[name=title]'), '|', await p.inputValue('[name=place]'), '|', await p.inputValue('[name=lat]'), await p.inputValue('select[name=date]'));
  await p.click('button[type=submit]'); await p.waitForTimeout(500);
  // wyszukiwanie nad mapą
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-03-02`); await p.waitForTimeout(1200);
  await p.fill('#mp-search input', 'Loro Parque'); await p.click('#mp-search button'); await p.waitForSelector('.pl-hit', { timeout: 5000 });
  await p.click('.pl-hit'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('items:', await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.map(x => [x.title, x.date, x.lat != null])), id));
  // pogoda bierze cel z OSM, nie San Juan
  console.log('weather place:', await p.evaluate(i => DB.get('trips', i).then(t => App.Places.center(t)).then(c => [c.label, c.lat]), id));
  console.log('errors:', errs); await b.close(); })();
