// karty dla kierowcy (lokalny adres z Nominatim – symulowany), rozmówki, mapa offline (kafelki CARTO symulowane) i mapa bez internetu
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+v9/PQAJYgPWgaukFQAAAABJRU5ErkJggg==', 'base64');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  let tileHits = 0;
  await ctx.route(/basemaps\.cartocdn\.com|tile\.openstreetmap\.org/, r => { tileHits++; r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route(/open-meteo|archive-api/, r => r.abort());
  const nom = [];
  await ctx.route(/nominatim/, r => {
    const u = new URL(r.request().url()); const lang = u.searchParams.get('accept-language'); const lon = +u.searchParams.get('lon');
    nom.push(`${u.pathname}:${lang}`);
    const th = lon > 100 && lon < 101.5;
    if (lang === 'en') return r.fulfill({ json: { name: 'x', address: { country_code: th ? 'th' : 'la' } } });
    if (lang === 'th') return r.fulfill({ json: { name: 'โรงแรม', namedetails: { name: 'โรงแรมริเวอร์', 'name:en': 'River Hotel' },
      address: { house_number: '12', road: 'ถนนเจริญกรุง', suburb: 'บางรัก', city: 'กรุงเทพมหานคร', postcode: '10500', country: 'ประเทศไทย' } } });
    if (lang === 'lo') return r.fulfill({ json: { namedetails: { name: 'ວັດຊຽງທອງ' }, address: { road: 'ຖະໜົນສັກກະລິນ', city: 'ຫຼວງພະບາງ', country: 'ລາວ' } } });
    r.fulfill({ json: [] });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(500);
  const id = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Azja', destination: 'Bangkok', start: '2027-01-10', end: '2027-01-20',
      geo: { text: 'Bangkok', lat: 13.7563, lon: 100.5018 } });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'River Hotel', address: 'Charoen Krung Rd 12, Bangkok', depart: '2027-01-10T14:00', arrive: '2027-01-13T11:00', lat: 13.7246, lon: 100.5143 });
    await DB.put('planItems', { tripId: t.id, title: 'Wat Pho', date: '2027-01-11', order: 0, place: 'Wat Pho, Bangkok', lat: 13.7465, lon: 100.4927 });
    await DB.put('planItems', { tripId: t.id, title: 'Wat Xieng Thong', date: '2027-01-15', order: 0, place: 'Luang Prabang', lat: 19.8975, lon: 102.1424 });
    await DB.put('planItems', { tripId: t.id, title: 'Bez miejsca', date: '2027-01-12', order: 0 });
    return t.id;
  });
  // plan → link do kart
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(600);
  console.log('plan link:', await p.$$eval('a.plan-link', a => a.map(x => x.getAttribute('href')).filter(h => /karty/.test(h))));
  await p.click('a[href^="#/karty/"]'); await p.waitForTimeout(600);
  console.log('cards:', await p.$$eval('.tx-row[data-k] b', e => e.map(x => x.textContent)), '| prep:', await p.textContent('#tx-prep'));
  await p.click('#tx-prep'); await p.waitForTimeout(9000);
  console.log('nominatim:', nom.join(' '));
  console.log('local:', await p.evaluate(i => Promise.all([DB.byIndex('segments', 'tripId', i), DB.byIndex('planItems', 'tripId', i)]).then(([s, it]) => s.concat(it).filter(x => x.local).map(x => [x.local.lang, x.local.name, x.local.addr])), id));
  console.log('chips:', await p.$$eval('.st-chip', e => e.map(x => x.textContent.trim())), '| phrases:', await p.$$eval('.tx-ph', e => e.length));
  await p.screenshot({ path: `${dir}/t27-list.png`, fullPage: true });
  await p.click('.tx-row[data-k^="s:"]'); await p.waitForTimeout(400);
  console.log('card:', (await p.textContent('.tx-full .tx-body')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: `${dir}/t27-card.png` });
  await p.click('#tx-close'); await p.waitForTimeout(200);
  console.log('overlay closed:', !(await p.$('.tx-full')));
  // rozmówki laotańskie: bez taksometru
  await p.click('.st-chip[href$="j=lo"]'); await p.waitForTimeout(500);
  console.log('lo phrases:', await p.$$eval('.tx-ph', e => e.length), '| first:', await p.textContent('.tx-ph .tx-loc'));
  await p.click('.tx-ph'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${dir}/t27-phrase.png` });
  // nocleg → „Pokaż kierowcy”
  const hid = await p.evaluate(i => DB.byIndex('segments', 'tripId', i).then(s => s[0].id), id);
  await p.goto(`http://localhost:8765/podroznik/#/odcinek/${hid}`); await p.waitForTimeout(600);
  await p.click('a[href*="?k=s:"]'); await p.waitForTimeout(600);
  console.log('direct card open:', !!(await p.$('.tx-full')), '|', await p.textContent('.tx-full .tx-ask'));

  // mapa offline
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-01-11`); await p.waitForTimeout(1500);
  await p.click('#mp-off'); await p.waitForTimeout(800);
  console.log('offline areas:', await p.$$eval('.of-row', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.screenshot({ path: `${dir}/t27-offline.png`, fullPage: true });
  // tylko przegląd + Bangkok (bez „widocznego fragmentu” i Laosu), żeby było szybko
  const boxes = await p.$$('#of-form input:not(:disabled)');
  const names = await p.$$eval('#of-form .of-row', e => e.map(x => x.querySelector('b').textContent));
  for (let k = 0; k < boxes.length; k++) if (!/River|Przegląd/.test(names[k])) await boxes[k].uncheck();
  const before = tileHits;
  await p.click('#of-go');
  await p.waitForFunction(() => !document.querySelector('#of-go') || !document.querySelector('#of-go').disabled, null, { timeout: 120000 });
  await p.waitForTimeout(800);
  const cached = await p.evaluate(async i => (await (await caches.open(`mapa-offline-${i}`)).keys()).length, id);
  const seen = await p.evaluate(async () => (await (await caches.open('mapa-kafelki')).keys()).filter(r => /podroznik-off/.test(r.url)).length);
  console.log('downloaded:', tileHits - before, '| cached:', cached, '| leaked into viewed cache:', seen, '| states:', await p.$$eval('.of-state', e => e.map(x => x.textContent)));
  console.log('trip.offlineMap:', await p.evaluate(i => DB.get('trips', i).then(t => t.offlineMap && t.offlineMap.tiles), id));
  // bez internetu: mapa dnia ładuje kafelki z pamięci
  await ctx.setOffline(true);
  const hitsOff = tileHits;
  await p.goto(`http://localhost:8765/podroznik/#/mapa/${id}?d=2027-01-11`); await p.waitForTimeout(2500);
  const tiles = await p.$$eval('.leaflet-tile', e => e.map(x => [x.complete && x.naturalWidth > 0, x.src.match(/\/(\d+)\/\d+\/\d+\.png/)[1]]));
  console.log('offline tiles loaded:', tiles.filter(t => t[0]).length, '/', tiles.length, '| zooms:', [...new Set(tiles.map(t => t[1]))], '| network hits:', tileHits - hitsOff);
  await ctx.setOffline(false);
  // usuwanie
  p.on('dialog', d => d.accept());
  await p.goto(`http://localhost:8765/podroznik/#/mapa-offline/${id}`); await p.waitForTimeout(800);
  await p.click('#of-del'); await p.waitForTimeout(800);
  console.log('after delete:', await p.evaluate(i => caches.keys().then(k => k.includes(`mapa-offline-${i}`)), id), await p.textContent('#of-have'));
  console.log('errors:', errs); await b.close(); })();
