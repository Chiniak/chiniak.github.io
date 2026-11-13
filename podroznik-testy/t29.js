// tło ze zdjęć: lista z Commons (symulowana), pobieranie po kolei, losowa zmiana przy przejściu na inny ekran, ustawienia, offline
const { chromium, devices } = require('playwright');
const zlib = require('zlib');
const dir = process.argv[2] || 'podroznik-testy';
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
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', colorScheme: 'dark' });
  await ctx.route(/open-meteo|nominatim|overpass|tile|carto|wikipedia/, r => r.abort());
  let apiCalls = 0, imgCalls = 0;
  await ctx.route(/commons\.wikimedia\.org\/w\/api/, r => {
    apiCalls++; const term = new URL(r.request().url()).searchParams.get('gsrsearch').split(' ').slice(2).filter(w => !w.startsWith('-')).join('_');
    const pages = {};
    for (let i = 0; i < 25; i++) pages[i] = { title: i % 5 === 1 ? `File:Jesus Christ ${term} ${i}.jpg` : `File:${term} ${i}.jpg`,
      categories: i % 5 === 2 ? [{ title: 'Category:Churches in Italy' }] : [{ title: 'Category:Landscapes' }], imageinfo: [{ thumburl: `https://upload.wikimedia.org/t/${term}-${i}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${term}_${i}.jpg`,
      width: i === 3 ? 800 : 4000, height: 2600, extmetadata: { Artist: { value: '<a href="x">Foto Graf</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, ObjectName: { value: `${term} ${i}` },
        // jak na prawdziwym Commons: ukryte kategorie techniczne ma prawie każde zdjęcie (przez nie tło było czarne)
        Categories: { value: 'Featured pictures of landscapes|Pages with maps|Media with locations|Quality images|CC-BY-SA-4.0' },
        ...(i % 5 === 4 ? { ImageDescription: { value: 'View of the old cathedral above the valley' } } : {}) } }] };
    pages[99] = { title: 'File:Map of Laos.png', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/t/map.png', width: 4000, height: 3000 }] };
    r.fulfill({ json: { query: { pages } } });
  });
  await ctx.route(/upload\.wikimedia\.org/, r => { imgCalls++; const n = [...r.request().url()].reduce((a, c) => a + c.charCodeAt(0), 0);
    r.fulfill({ body: png(n * 7 % 255, n * 13 % 255, n * 29 % 255), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // telefon ze starą wersją tła (v1): lista bez wersji i pobrane zdjęcie religijne – mają zniknąć
  await p.goto('http://localhost:8765/podroznik/#/ustawienia/blokada'); await p.waitForTimeout(500);
  await p.evaluate(async () => { await DB.setSetting('bgPool', { at: Date.now(), items: [{ src: 'https://upload.wikimedia.org/t/jesus.jpg', title: 'Jesus' }] });
    await (await caches.open('tla-zdjecia')).put('https://upload.wikimedia.org/t/jesus.jpg', new Response('x')); });
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.reload(); await p.waitForTimeout(2500);
  console.log('old v1 photo purged:', await p.evaluate(async () => !(await (await caches.open('tla-zdjecia')).match('https://upload.wikimedia.org/t/jesus.jpg'))));
  const bgNow = () => p.evaluate(() => { const l = document.querySelector('.bg-img.on'); return l ? l.style.backgroundImage.slice(0, 40) : null; });
  const cnt = () => p.evaluate(async () => (await (await caches.open('tla-zdjecia')).keys()).length);
  console.log('first screen: has-bg', await p.evaluate(() => document.documentElement.classList.contains('has-bg')), '| cached', await cnt(), '| api', apiCalls);
  const pool = await p.evaluate(() => DB.getSetting('bgPool').then(x => [x.items.length, x.items.some(i => /map/i.test(i.src)), x.items.some(i => /-3\.jpg/.test(i.src)), x.items[0].by]));
  console.log('pool size, map filtered out?, small filtered out?, credit:', pool);
  console.log('religious in pool:', await p.evaluate(() => DB.getSetting('bgPool').then(x => [x.v, x.items.filter(i => /jesus|christ/i.test(i.title + i.src)).length, x.items.filter(i => / 2$/.test(i.title) || /-(2|7|12|17|22)\.jpg/.test(i.src)).length, x.items.filter(i => /-(4|9|14|19|24)\.jpg/.test(i.src)).length, 'pool:', x.items.length])));
  const seen = new Set();
  for (const h of ['#/bilety', '#/plan', '#/pakowanie', '#/ustawienia', '#/podroze', '#/bilety', '#/plan', '#/pakowanie', '#/podroze', '#/bilety']) {
    await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(900); seen.add(await bgNow());
  }
  console.log('distinct backgrounds over 10 screens:', seen.size, '| cached:', await cnt(), '| api calls total:', apiCalls);
  await p.screenshot({ path: `${dir}/t29-dark.png` });
  await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(1200);
  console.log('settings:', (await p.textContent('#bg-info')).replace(/\s+/g, ' '));
  await p.screenshot({ path: `${dir}/t29-settings.png` });
  // „nie pokazuj tego zdjęcia”
  const cur = await p.evaluate(() => App.Backdrop.info().then(i => i.current && i.current.src));
  await p.click('#bg-block'); await p.waitForTimeout(1200);
  console.log('blocked:', await p.evaluate(async s => [(await DB.getSetting('bgBlocked', [])).includes(s), !(await (await caches.open('tla-zdjecia')).match(s)), (await DB.getSetting('bgPool')).items.some(i => i.src === s)], cur),
    '| new current differs:', await p.evaluate(() => App.Backdrop.info().then(i => i.current && i.current.src)) !== cur);
  // jasny motyw
  await p.click('[data-theme-opt="light"]'); await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(1000);
  await p.screenshot({ path: `${dir}/t29-light.png` });
  // offline: nadal zmienia się z pobranych
  await ctx.setOffline(true); const before = await cnt(); const s2 = new Set();
  for (const h of ['#/bilety', '#/podroze', '#/bilety', '#/podroze']) { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(700); s2.add(await bgNow()); }
  console.log('offline distinct:', s2.size, '| cache unchanged:', before === await cnt());
  await ctx.setOffline(false);
  // wyłączenie
  await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(500);
  await p.click('[data-bg-opt="0"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = '#/bilety'; }); await p.waitForTimeout(700);
  console.log('off: has-bg', await p.evaluate(() => document.documentElement.classList.contains('has-bg')), '| after reload:', await p.reload().then(() => p.waitForTimeout(1200)).then(() => p.evaluate(() => document.documentElement.classList.contains('has-bg'))));
  console.log('errors:', errs); await b.close(); })();
