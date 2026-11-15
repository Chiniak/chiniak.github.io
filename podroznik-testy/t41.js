// automatyczne zdjęcia celu podróży (covers.js): Wikipedia pl/en + Commons symulowane, filtr motywów religijnych,
// kolaży i map, zapas z wyszukiwania Commons, brak trafienia (ponowna próba za 7 dni), własna okładka ma pierwszeństwo,
// usunięcie zdjęcia w formularzu, zmiana celu = nowe zdjęcie, bez internetu nic nie pobiera.
const { chromium, devices } = require('playwright');
const zlib = require('zlib');
const dir = process.argv[2] || 'podroznik-testy';
function png(r, g, b) {
  const w = 40, h = 30, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3); }
  const crc = buf => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// artykuły: tytuł → [kanoniczny tytuł, plik zdjęcia]
const WIKI = {
  pl: { 'Lizbona': ['Lizbona', 'Lisbon montage 2019.jpg'], 'Kioto': ['Kioto', 'Kiyomizu-dera temple in autumn.jpg'], 'Porto': ['Porto', 'Porto Ribeira at dusk.jpg'] },
  en: { 'Lizbona': ['Lisbon', 'Lisbon from Castelo de São Jorge.jpg'], 'Kioto': ['Kyoto', 'Fushimi Inari shrine gates.jpg'] },
};
const FILES = {
  'Lisbon montage 2019.jpg': { w: 3000, h: 4000, cats: ['Category:Montages of Lisbon'] },
  'Lisbon from Castelo de São Jorge.jpg': { w: 4000, h: 2600, cats: ['Category:Views of Lisbon'] },
  'Kiyomizu-dera temple in autumn.jpg': { w: 4000, h: 2600, cats: ['Category:Kiyomizu-dera'] },
  'Fushimi Inari shrine gates.jpg': { w: 4000, h: 2600, cats: ['Category:Fushimi Inari-taisha'] },
  'Porto Ribeira at dusk.jpg': { w: 4000, h: 2600, cats: ['Category:Ribeira (Porto)'] },
};
const page = (title, f, i = 0) => ({ title: `File:${title}`, index: i, categories: f.cats.map(t => ({ title: t })), imageinfo: [{ thumburl: `https://upload.wikimedia.org/t/${encodeURIComponent(title)}`,
  descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`, width: f.w, height: f.h, mime: 'image/jpeg',
  extmetadata: { Artist: { value: '<a href="x">Ana Foto</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, ObjectName: { value: title.replace(/\.jpg$/, '') } } }] });

(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const hits = { wiki: 0, commons: 0, search: [], img: [] };
  await ctx.route(/^https:/, r => {
    const u = new URL(r.request().url());
    const m = u.host.match(/^(pl|en)\.wikipedia\.org$/);
    if (m) { hits.wiki++; const a = WIKI[m[1]][u.searchParams.get('titles')];
      return r.fulfill({ json: { query: { pages: a ? { 1: { title: a[0], pageimage: a[1].replace(/ /g, '_') } } : { '-1': { title: u.searchParams.get('titles'), missing: '' } } } } }); }
    if (u.host === 'commons.wikimedia.org') {
      hits.commons++;
      const t = u.searchParams.get('titles');
      if (t) { const name = t.slice(5).replace(/_/g, ' '); const f = FILES[name]; return r.fulfill({ json: { query: { pages: f ? { 7: page(name, f) } : { '-1': { title: t, missing: '' } } } } }); }
      const q = u.searchParams.get('gsrsearch'); hits.search.push(q);
      if (/intitle:"Kyoto"/.test(q) && /Featured/.test(q)) return r.fulfill({ json: { query: { pages: {
        1: page('Kyoto Kamo river and cathedral.jpg', { w: 4000, h: 2600, cats: ['Category:Kamo River'] }, 1),
        2: page('Kyoto skyline from Shogunzuka.jpg', { w: 4000, h: 2600, cats: ['Category:Skylines of Kyoto'] }, 2),
        3: page('Kyoto map.jpg', { w: 4000, h: 2600, cats: ['Category:Maps of Kyoto'] }, 3) } } } });
      return r.fulfill({ json: {} });
    }
    if (u.host === 'upload.wikimedia.org') { hits.img.push(decodeURIComponent(u.pathname.split('/').pop()));
      return r.fulfill({ body: png(40, 140, 160), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); }
    return r.abort();
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/ERR_|Failed to load/.test(m.text()) && errs.push(m.text()));
  const B = 'http://localhost:8765/podroznik/';
  await p.goto(B + '#/bilety'); await p.waitForTimeout(500);
  const ids = await p.evaluate(async () => { const T = App.todayStr();
    const a = await DB.put('trips', { name: 'Portugalia', destination: 'Lizbona, Portugalia', start: App.addDays(T, 10), end: App.addDays(T, 15) });
    const k = await DB.put('trips', { name: 'Japonia', destination: 'Kioto', start: App.addDays(T, 60), end: App.addDays(T, 70) });
    const n = await DB.put('trips', { name: 'Gdzieś', destination: 'Nibylandia', start: App.addDays(T, 90), end: App.addDays(T, 95) });
    return { a: a.id, k: k.id, n: n.id }; });
  await p.goto(B + '#/podroze'); await p.waitForTimeout(3500);
  const st = await p.evaluate(async ids => { const g = id => DB.get('trips', id);
    const [a, k, n] = [await g(ids.a), await g(ids.k), await g(ids.n)];
    return { a: a.coverAuto && [a.coverAuto.credit, a.coverAuto.page, a.coverAuto.q, a.coverAuto.data.slice(0, 15)], k: k.coverAuto && k.coverAuto.page,
      n: [!!n.coverAuto, !!n.coverTry], updated: a.updated || null }; }, ids);
  console.log('Lisbon (montage rejected → en article):', JSON.stringify(st.a));
  console.log('Kyoto (temple, shrine, cathedral, map rejected → skyline):', st.k);
  console.log('Nibylandia: photo, retry stamp:', st.n, '| images downloaded:', hits.img);
  console.log('painted without reload: hero', await p.$eval('.hm-hero', e => e.classList.contains('has-photo')),
    '| cards', await p.$$eval('.hm-tcard-img.has-photo', e => e.length));
  // ponowne otwarcie: z pamięci, bez nowych zapytań (Nibylandia – za 7 dni)
  const before = hits.wiki + hits.commons;
  await p.goto(B + '#/bilety'); await p.goto(B + '#/podroze'); await p.waitForTimeout(1500);
  console.log('reopen: painted', await p.$eval('.hm-hero', e => e.classList.contains('has-photo')), '| new requests', hits.wiki + hits.commons - before);
  // szczegóły: zdjęcie i autor
  await p.goto(B + `#/podroze/${ids.a}`); await p.waitForTimeout(600);
  console.log('details: head photo', await p.$eval('.trip-head', e => e.classList.contains('has-photo')), '| credit:', await p.textContent('.cover-credit').catch(() => '(brak)'));
  // własna okładka ma pierwszeństwo
  await p.goto(B + `#/podroze/${ids.a}/edytuj`); await p.waitForTimeout(500);
  console.log('form shows auto photo:', await p.$eval('#cover-box', e => e.classList.contains('has-photo')), '| remove button:', !!(await p.$('#cover-auto-del')));
  await p.setInputFiles('#cover', `${dir}/fx/screenshot.png`); await p.waitForTimeout(400);
  await p.click('button[type=submit]'); await p.waitForTimeout(700);
  await p.goto(B + '#/podroze'); await p.waitForTimeout(800);
  console.log('own cover wins:', await p.$eval('.hm-hero', e => getComputedStyle(e).getPropertyValue('--photo').includes('blob:')));
  // usunięcie własnej → wraca automatyczne; usunięcie automatycznego → gładka karta i brak nowych prób
  await p.goto(B + `#/podroze/${ids.a}/edytuj`); await p.waitForTimeout(500);
  await p.click('#cover-del'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  await p.goto(B + '#/podroze'); await p.waitForTimeout(800);
  console.log('own removed → auto back:', await p.$eval('.hm-hero', e => getComputedStyle(e).getPropertyValue('--photo').includes('data:image')));
  await p.goto(B + `#/podroze/${ids.a}/edytuj`); await p.waitForTimeout(500);
  await p.click('#cover-auto-del'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  const b2 = hits.wiki + hits.commons;
  await p.goto(B + '#/podroze'); await p.waitForTimeout(1500);
  console.log('auto removed: hero photo', await p.$eval('.hm-hero', e => e.classList.contains('has-photo')), '| no new requests', hits.wiki + hits.commons - b2 === 0,
    '| stored', await p.evaluate(id => DB.get('trips', id).then(t => [t.coverAuto, t.coverOff]), ids.a));
  // zmiana celu → nowe zdjęcie
  await p.goto(B + `#/podroze/${ids.a}/edytuj`); await p.waitForTimeout(500);
  await p.fill('input[name=destination]', 'Porto'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  await p.goto(B + '#/podroze'); await p.waitForTimeout(2500);
  console.log('new destination → new photo:', await p.evaluate(id => DB.get('trips', id).then(t => t.coverAuto && [t.coverAuto.q, t.coverAuto.page]), ids.a));
  // bez internetu: nic nie pobiera
  await p.evaluate(async id => { const t = await DB.get('trips', id); await DB.putRaw('trips', { ...t, coverTry: 1 }); }, ids.n);
  const b3 = hits.wiki + hits.commons; await ctx.setOffline(true);
  await p.goto(B + '#/bilety').catch(() => {}); await p.evaluate(() => { location.hash = '#/podroze'; }); await p.waitForTimeout(1500);
  console.log('offline: requests', hits.wiki + hits.commons - b3, '| hero photo still there', await p.$eval('.hm-hero', e => e.classList.contains('has-photo')));
  await ctx.setOffline(false);
  await p.screenshot({ path: `${dir}/t41-home.png` });
  console.log('errors:', errs); await b.close(); })();
