// etap 10: wyszukiwanie miejsc, mapa i trasa dnia, układanie trasy, pomysły, odkrywanie (sieć symulowana)
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const calls = { nom: 0, ovp: 0, wiki: 0 };
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await ctx.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ json: { results: [{ latitude: 38.7223, longitude: -9.1393, country_code: 'PT', name: 'Lizbona', timezone: 'Europe/Lisbon' }] } }));
  await ctx.route('https://api.open-meteo.com/**', r => r.abort());
  await ctx.route('https://archive-api.open-meteo.com/**', r => r.abort());
  await ctx.route('https://nominatim.openstreetmap.org/**', r => { calls.nom++; const q = new URL(r.request().url()).searchParams.get('q');
    const db = { 'Oceanarium': [{ name: 'Oceanário de Lisboa', display_name: 'Oceanário de Lisboa, Esplanada Dom Carlos I, Parque das Nações, Lisboa, 1990-005, Portugalia', lat: '38.7635', lon: '-9.0937', type: 'aquarium' }],
      'Rua Augusta 100, Lizbona': [{ name: 'Rua Augusta', display_name: 'Rua Augusta, Baixa, Lisboa', lat: '38.7104', lon: '-9.1373', type: 'residential' }],
      'Castelo de São Jorge': [{ name: 'Castelo de São Jorge', display_name: 'Castelo de São Jorge, Lisboa', lat: '38.7139', lon: '-9.1335', type: 'castle' }] };
    r.fulfill({ json: db[q] || [] }); });
  await ctx.route('https://overpass-api.de/**', r => { calls.ovp++; const food = /amenity"~"\^\(restaurant/.test(decodeURIComponent(r.request().postData()));
    r.fulfill({ json: { elements: food ? [
      { type: 'node', id: 1, lat: 38.711, lon: -9.138, tags: { amenity: 'restaurant', name: 'Tasca do Chico', cuisine: 'portuguese;seafood', opening_hours: 'Mo-Su 12:00-23:00' } },
      { type: 'node', id: 2, lat: 38.712, lon: -9.139, tags: { amenity: 'cafe', name: 'Café A Brasileira' } } ] : [
      { type: 'way', id: 3, center: { lat: 38.6916, lon: -9.2160 }, tags: { tourism: 'attraction', historic: 'monument', name: 'Torre de Belém', wikidata: 'Q208', wikipedia: 'pl:Wieża Belém' } },
      { type: 'node', id: 4, lat: 38.6979, lon: -9.2063, tags: { tourism: 'museum', name: 'Mosteiro dos Jerónimos', wikipedia: 'en:Jerónimos Monastery', wikidata: 'Q1' } },
      { type: 'node', id: 5, lat: 38.7139, lon: -9.1335, tags: { tourism: 'viewpoint', name: 'Miradouro' } } ] } }); });
  await ctx.route('https://*.wikipedia.org/**', r => { calls.wiki++; const u = new URL(r.request().url()); const lang = u.hostname.split('.')[0];
    const pages = lang === 'pl' ? { 1: { title: 'Wieża Belém', description: 'wieża obronna w Lizbonie', thumbnail: { source: 'https://upload.example/belem.jpg' } } }
      : { 2: { title: 'Jerónimos Monastery', description: 'monastery in Lisbon' } };
    r.fulfill({ json: { query: { pages } } }); });
  await ctx.route('https://upload.example/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));

  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: '2027-05-01', end: '2027-05-03' });
    const h = await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Baixa', address: 'Rua Augusta 100, Lizbona', depart: '2027-05-01T15:00', arrive: '2027-05-03T11:00' });
    // punkty dnia 1 w złej kolejności: Belém (zachód) – Alfama (centrum) – Oceanarium (wschód) – Jerónimos (zachód)
    const mk = (title, lat, lon, order, extra = {}) => DB.put('planItems', { tripId: t.id, date: '2027-05-02', time: '', title, cat: 'zwiedzanie', place: title, lat, lon, order, ...extra });
    await mk('Torre de Belém', 38.6916, -9.2160, 0); await mk('Alfama', 38.7118, -9.1300, 1); await mk('Jerónimos', 38.6979, -9.2063, 2);
    await mk('Obiad 13:00', 38.7100, -9.1400, 3, { time: '13:00' });
    await DB.put('planItems', { tripId: t.id, date: '2027-05-02', time: '', title: 'Zamek', cat: 'zwiedzanie', place: 'Castelo de São Jorge', order: 4 });
    return { t: t.id, h: h.id };
  });

  // formularz: wyszukiwarka miejsca
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}/nowy?d=2027-05-01`); await p.waitForTimeout(500);
  await p.fill('input[name=place]', 'Oceanarium'); await p.click('#pl-find'); await p.waitForSelector('.pl-hit', { timeout: 5000 });
  console.log('hits:', await p.$$eval('.pl-hit', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.click('.pl-hit');
  console.log('after pick:', await p.inputValue('input[name=title]'), '|', await p.inputValue('input[name=place]'), await p.inputValue('input[name=lat]'));
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('saved:', await p.evaluate(id => DB.byIndex('planItems', 'tripId', id).then(a => a.filter(i => i.date === '2027-05-01').map(i => [i.title, i.lat, i.lon])), ids.t));

  // mapa dnia 2 – brakujące położenia (zamek + nocleg)
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${ids.t}?d=2027-05-02`); await p.waitForTimeout(1200);
  console.log('markers:', await p.$$eval('.mp-pin', e => e.map(x => x.textContent.trim())).then(a => a.join(',')), '| missing btn:', (await p.textContent('#mp-geo')).trim());
  await p.click('#mp-geo'); await p.waitForTimeout(3500);
  console.log('after locate:', await p.$$eval('.mp-pin', e => e.map(x => x.textContent.trim())).then(a => a.join(',')), '| nominatim calls:', calls.nom);
  console.log('legs:', await p.$$eval('.mp-leg', e => e.map(x => x.textContent.trim())));
  console.log('polyline:', await p.$$eval('path.leaflet-interactive', e => e.length));
  await p.screenshot({ path: `${dir}/t20-map.png` });
  const order = () => p.evaluate(id => DB.byIndex('planItems', 'tripId', id).then(a => a.filter(i => i.date === '2027-05-02').sort((x, y) => x.order - y.order).map(i => i.title)), ids.t);
  console.log('order before:', await order());
  await p.click('#mp-opt'); await p.waitForTimeout(800);
  console.log('toast:', await p.textContent('#toast'));
  console.log('order after:', await order());
  // plan: odcinki dojścia między punktami
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(700);
  console.log('plan legs:', await p.$$eval('.pl-day[data-date="2027-05-02"] .pl-leg', e => e.map(x => x.textContent.trim())));

  // odkrywanie
  await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${ids.t}`); await p.waitForSelector('.dc-card', { timeout: 5000 });
  console.log('attractions:', await p.$$eval('.dc-card .dc-main', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 80))));
  console.log('thumbs:', await p.$$eval('.dc-card img', e => e.length), '| wiki calls:', calls.wiki);
  await p.click('.dc-add'); await p.waitForTimeout(300);
  console.log('btn after add:', await p.textContent('.dc-add'));
  await p.screenshot({ path: `${dir}/t20-discover.png` });
  await p.click('a.st-chip[href*="t=jedzenie"]'); await p.waitForSelector('.dc-card'); await p.waitForTimeout(200);
  console.log('food:', await p.$$eval('.dc-card .dc-main b', e => e.map(x => x.textContent)), await p.textContent('.dc-card .muted'));
  await p.click('.dc-add'); await p.waitForTimeout(300);
  await p.goBack(); await p.waitForTimeout(500);
  console.log('cached (overpass calls):', calls.ovp);
  // pomysły w planie → przeniesienie do dnia
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(700);
  console.log('ideas:', await p.$$eval('.pl-idea .pl-title', e => e.map(x => x.textContent.trim())));
  await p.screenshot({ path: `${dir}/t20-plan.png`, fullPage: true });
  await p.selectOption('.pl-idea select', '2027-05-03'); await p.waitForTimeout(700);
  console.log('ideas left:', await p.$$eval('.pl-idea', e => e.length), '| day 3:', await p.$$eval('.pl-day[data-date="2027-05-03"] .pl-user .pl-title', e => e.map(x => x.textContent.trim())));
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${ids.t}?d=pomysly`); await p.waitForTimeout(900);
  console.log('ideas map pins:', await p.$$eval('.mp-pin', e => e.length));
  // nowy pomysł z formularza
  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}/nowy?d=pomysl`); await p.waitForTimeout(400);
  console.log('form title:', await p.textContent('#title'), '| date select:', await p.inputValue('select[name=date]'));
  console.log('errors:', errs); await b.close(); })();
