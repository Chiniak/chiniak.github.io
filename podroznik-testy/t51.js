// zdjęcie celu w formularzu nowej podróży: dobierane od razu po wpisaniu celu (mocki jak w t41), zapis z podróżą, usunięcie, własne zdjęcie ma pierwszeństwo
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
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  await p.goto(B + '#/podroze/nowa'); await p.waitForTimeout(600);
  ok(/dobierze się samo/.test(await p.textContent('#cover-auto-txt')), 'podpowiedź: zdjęcie dobierze się samo');
  await p.fill('input[name=name]', 'Majówka');
  await p.fill('input[name=destination]', 'Lizbona, Portugalia');
  await p.waitForFunction(() => document.querySelector('#cover-box').classList.contains('has-photo'), null, { timeout: 8000 });
  ok(true, 'zdjęcie celu pojawia się w formularzu bez zapisywania');
  { const tx = await p.textContent('#cover-auto-txt'); ok(/automatycznie · .*Ana Foto/.test(tx), 'podpis z autorem zdjęcia: ' + tx); }
  ok(await p.isVisible('#cover-auto-del'), 'przycisk „Usuń zdjęcie celu”');
  await p.screenshot({ path: `${dir}/t51-form.png` });
  await p.fill('input[name=start]', '2027-05-01'); await p.fill('input[name=end]', '2027-05-05');
  const nImg = hits.img.length;
  await p.click('button[type=submit]'); await p.waitForTimeout(1200);
  const id = p.url().split('/').pop();
  const tr = await p.evaluate(id => DB.get('trips', id), id);
  ok(tr && tr.coverAuto && tr.coverAuto.q === 'Lizbona, Portugalia' && /^data:image/.test(tr.coverAuto.data), 'zdjęcie zapisane z podróżą');
  ok(hits.img.length === nImg, 'po zapisie bez ponownego pobierania');

  // nowa podróż: usunięcie zdjęcia celu w formularzu → zapis bez zdjęcia i bez szukania w tle
  await p.goto(B + '#/podroze/nowa'); await p.waitForTimeout(500);
  await p.fill('input[name=name]', 'Porto'); await p.fill('input[name=destination]', 'Porto');
  await p.waitForFunction(() => document.querySelector('#cover-box').classList.contains('has-photo'), null, { timeout: 8000 });
  await p.click('#cover-auto-del'); await p.waitForTimeout(200);
  ok(!(await p.$eval('#cover-box', e => e.classList.contains('has-photo'))), 'usunięte w formularzu – okładka w kolorze');
  await p.fill('input[name=start]', '2027-06-01'); await p.click('button[type=submit]'); await p.waitForTimeout(1500);
  const id2 = p.url().split('/').pop();
  const t2 = await p.evaluate(id => DB.get('trips', id), id2);
  ok(t2 && !t2.coverAuto && t2.coverOff === 'Porto', 'zapis bez zdjęcia, bez szukania w tle');

  // cel bez zdjęcia
  await p.goto(B + '#/podroze/nowa'); await p.waitForTimeout(500);
  await p.fill('input[name=name]', 'X'); await p.fill('input[name=destination]', 'Nibylandia');
  await p.waitForFunction(() => /Nie znaleziono/.test(document.querySelector('#cover-auto-txt').textContent), null, { timeout: 8000 });
  ok(true, 'brak zdjęcia – komunikat');

  // własne zdjęcie przed wpisaniem celu – nie szukamy
  await p.goto(B + '#/podroze/nowa'); await p.waitForTimeout(500);
  await p.setInputFiles('#cover', { name: 'a.png', mimeType: 'image/png', buffer: png(200, 50, 50) }); await p.waitForTimeout(500);
  const w0 = hits.wiki;
  await p.fill('input[name=destination]', 'Porto'); await p.waitForTimeout(2000);
  ok(hits.wiki === w0, 'własne zdjęcie – bez szukania');

  // EN
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await p.goto(B + '#/podroze/nowa'); await p.reload(); await p.waitForTimeout(800);
  ok(/picked automatically/.test(await p.textContent('#cover-auto-txt')), 'EN: ' + await p.textContent('#cover-auto-txt'));
  await p.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
