// odczyt tekstu ze zdjęcia/screena biletu (OCR, ocr.js): „📎 Z biletu lub screena” → nazwa, dzień, godzina, miejsce, cena;
// wpisane ręcznie pola nie są nadpisywane; pliki OCR w pamięci „ocr-pliki” (offline). Fixture: fx/bilet-screen.png (gen-screen.js)
const { chromium, devices } = require('playwright');
const path = require('path');
const dir = process.argv[2] || 'podroznik-testy';
const FX = path.join(__dirname, 'fx');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => (await DB.put('trips', { name: 'Warszawa', destination: 'Warszawa', start: '2027-03-14', end: '2027-03-18' })).id);

  // 1. screen → nowy punkt z wypełnionymi polami
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(700);
  const t0 = Date.now();
  await p.setInputFiles('#pl-from-file', path.join(FX, 'bilet-screen.png'));
  await p.waitForFunction(() => location.hash.includes('/nowy'), null, { timeout: 5000 });
  await p.waitForFunction(() => { const f = document.querySelector('#pl-form'); return f && f.title.value && document.querySelector('#toast.show'); }, null, { timeout: 90000 }).catch(() => {});
  const form = () => p.evaluate(() => { const f = document.querySelector('#pl-form');
    return { title: f.title.value, date: f.date.value, time: f.time.value, place: f.place.value, cost: f.cost.value, currency: f.currency.value }; });
  const toast = await p.$eval('#toast', e => e.textContent).catch(() => '-');
  console.log('ocr form:', JSON.stringify(await form()), `| ${((Date.now() - t0) / 1000).toFixed(1)} s | toast:`, toast);
  await p.screenshot({ path: `${dir}/t36-form.png`, fullPage: true });
  console.log('ocr cache:', await p.evaluate(() => App.Ocr.cached()));

  // 2. nazwa wpisana wcześniej zostaje (tylko puste pola)
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}/nowy?d=2027-03-14`); await p.waitForTimeout(600);
  await p.fill('#pl-form input[name=title]', 'Moja nazwa');
  await p.setInputFiles('#pl-file', path.join(FX, 'bilet-screen.png'));
  await p.waitForFunction(() => document.querySelector('#pl-form').time.value, null, { timeout: 90000 }).catch(() => {});
  console.log('keep typed:', JSON.stringify(await form()));

  // 3. offline (bez sieci) – pliki z pamięci
  await ctx.setOffline(true);
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(800);
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}/nowy?d=2027-03-15`); await p.waitForTimeout(600);
  console.log('offline empty form:', JSON.stringify(await form()));
  await p.setInputFiles('#pl-file', path.join(FX, 'bilet-screen.png'));
  await p.waitForFunction(() => document.querySelector('#pl-form').title.value, null, { timeout: 90000 }).catch(() => {});
  console.log('offline:', JSON.stringify(await form()));
  console.log('errors:', errs);
  await b.close();
})();
