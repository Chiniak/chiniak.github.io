// zdjęcia miejsc w planie i pomysłach: Wikipedia (geosearch i wyszukiwanie), Commons (okolica), zdjęcie z Odkrywaj,
// własne zdjęcie, usuwanie (bez ponownego szukania), offline. Sieć symulowana.
const { chromium, devices } = require('playwright');
const zlib = require('zlib');
const dir = process.argv[2] || 'podroznik-testy';
// kolorowy PNG 40×40 (żeby było widać na zrzucie)
function png(r, g, b) {
  const w = 40, h = 40, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3); }
  const crc = buf => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/open-meteo|nominatim|overpass|tile|carto/, r => r.abort());
  const calls = [];
  await ctx.route(/upload\.wikimedia\.org/, r => { const u = r.request().url(); r.fulfill({ body: png(/wat/i.test(u) ? 200 : 30, /street/i.test(u) ? 160 : 60, 90), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route(/wikipedia\.org\/w\/api|commons\.wikimedia\.org\/w\/api/, r => {
    const u = new URL(r.request().url()), s = u.searchParams, host = u.hostname.split('.')[0];
    calls.push(`${host}:${s.get('generator')}:${s.get('gsrsearch') || ''}`);
    const T = src => ({ source: `https://upload.wikimedia.org/x/${src}.jpg` });
    if (u.hostname.startsWith('commons')) return r.fulfill({ json: { query: { pages: {
      1: { title: 'File:Charoen Krung street.jpg', coordinates: [{ lat: 13.72462, lon: 100.51432 }], imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/street.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:x', extmetadata: { Artist: { value: '<a>Jan K.</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } } });
    if (s.get('generator') === 'geosearch' && host === 'pl') return r.fulfill({ json: { query: { pages: {
      5: { title: 'Wat Pho', index: 1, coordinates: [{ lat: 13.7465, lon: 100.4930 }], thumbnail: T('watpho') },
      6: { title: 'Wielki Pałac Królewski', index: 2, coordinates: [{ lat: 13.75, lon: 100.49 }], thumbnail: T('palace') } } } } });
    if (s.get('generator') === 'search' && /Muzeum Narodowe/.test(s.get('gsrsearch')) && host === 'en')
      return r.fulfill({ json: { query: { pages: { 7: { title: 'Bangkok National Museum', index: 1, thumbnail: T('museum') } } } } });
    if (s.get('generator') === 'search' && /Bangkok National Museum/.test(s.get('gsrsearch')))
      return r.fulfill({ json: { query: { pages: { 7: { title: 'Bangkok National Museum', index: 1, thumbnail: T('museum') } } } } });
    r.fulfill({ json: { batchcomplete: '' } });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  const id = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Bangkok', destination: 'Bangkok', start: App.addDays(T, 5), end: App.addDays(T, 8) });
    const d = App.addDays(T, 6);
    await DB.put('planItems', { tripId: t.id, title: 'Wat Pho', date: d, order: 0, place: 'Wat Pho, Bangkok', lat: 13.7464, lon: 100.4927 });
    await DB.put('planItems', { tripId: t.id, title: 'Bangkok National Museum', date: d, order: 1, place: 'Bangkok' });
    await DB.put('planItems', { tripId: t.id, title: 'Kolacja u Somchaia', date: d, order: 2, place: 'Charoen Krung', lat: 13.7246, lon: 100.5143 });
    await DB.put('planItems', { tripId: t.id, title: 'Nic takiego', date: '', order: 0 });
    await DB.put('planItems', { tripId: t.id, title: 'Z Odkrywaj', date: '', order: 1, photoUrl: 'https://upload.wikimedia.org/x/watarun.jpg', wikiUrl: 'https://pl.wikipedia.org/wiki/Wat_Arun' });
    return t.id;
  });
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(4000);
  const state = () => p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.map(x => [x.title, x.photo ? x.photo.credit : null, !!x.photoTry])), id);
  console.log('photos:', await state());
  console.log('row thumbs on screen:', await p.$$eval('.pl-main.has-ph .pl-photo', e => e.filter(x => x.complete && x.naturalWidth > 0).length));
  console.log('api calls:', calls.length, calls.join(' '));
  await p.evaluate(() => document.querySelector('.pl-ideas').open = true);
  await p.screenshot({ path: `${dir}/t28-plan.png`, fullPage: true });
  // ponowne otwarcie planu: brak nowych zapytań (zdjęcia zapisane, brak trafienia = przerwa 7 dni)
  const n0 = calls.length;
  await p.goto(`http://localhost:8765/podroznik/#/podroze`); await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(1500);
  console.log('rendered with photos:', await p.$$eval('.pl-photo', e => e.length), '| new calls:', calls.length - n0);
  // formularz: podgląd, usunięcie → bez ponownego szukania
  const watId = await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.find(x => x.title === 'Wat Pho').id), id);
  await p.goto(`http://localhost:8765/podroznik/#/punkt/${watId}`); await p.waitForTimeout(600);
  console.log('form preview:', !!(await p.$('.pl-ph-big')), '|', await p.textContent('#pl-ph .small'));
  await p.screenshot({ path: `${dir}/t28-form.png`, fullPage: true });
  await p.click('#pl-ph-del'); await p.click('button[type=submit]'); await p.waitForTimeout(800);
  console.log('after delete:', await p.evaluate(i => DB.get('planItems', i).then(x => [!!x.photo, x.photoOff]), watId));
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(1500);
  console.log('deleted stays deleted:', await p.evaluate(i => DB.get('planItems', i).then(x => !!x.photo), watId));
  // „Znajdź” w formularzu przywraca
  await p.goto(`http://localhost:8765/podroznik/#/punkt/${watId}`); await p.waitForTimeout(500);
  await p.click('#pl-ph-find'); await p.waitForSelector('.pl-ph-big', { timeout: 5000 });
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('found again:', await p.evaluate(i => DB.get('planItems', i).then(x => [x.photo && x.photo.credit, x.photoOff]), watId));
  // własne zdjęcie
  const nicId = await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.find(x => x.title === 'Nic takiego').id), id);
  await p.goto(`http://localhost:8765/podroznik/#/punkt/${nicId}`); await p.waitForTimeout(500);
  await p.setInputFiles('#pl-ph-file', `${dir}/fx/qr.png`); await p.waitForSelector('.pl-ph-big', { timeout: 5000 });
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('own photo:', await p.evaluate(i => DB.get('planItems', i).then(x => [x.photo && x.photo.auto, x.photo && x.photo.data.slice(0, 15)]), nicId));
  // zmiana nazwy punktu ze zdjęciem automatycznym → zdjęcie szukane od nowa
  const musId = await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.find(x => x.title === 'Bangkok National Museum').id), id);
  await p.goto(`http://localhost:8765/podroznik/#/punkt/${musId}`); await p.waitForTimeout(500);
  await p.fill('[name=title]', 'Muzeum Narodowe'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('renamed → reset:', await p.evaluate(i => DB.get('planItems', i).then(x => [!!x.photo, x.photoTry]), musId));
  // offline
  await ctx.setOffline(true);
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(1200);
  console.log('offline thumbs:', await p.$$eval('.pl-photo', e => e.filter(x => x.complete && x.naturalWidth > 0).length));
  await ctx.setOffline(false);
  console.log('errors:', errs); await b.close(); })();
