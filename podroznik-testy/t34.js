// bilety w planie: „📎 Z biletu lub screena” → nowy punkt (dzień i godzina z PDF), 🎫 w planie i na pełnym ekranie,
// screen z kodem QR dodany do istniejącego punktu, zakładka Bilety, usunięcie punktu razem z biletami.
const { chromium, devices } = require('playwright');
const path = require('path');
const dir = process.argv[2] || 'podroznik-testy';
const FX = path.join(__dirname, 'fx');
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => (await DB.put('trips', { name: 'Warszawa', destination: 'Warszawa', start: '2027-03-14', end: '2027-03-18' })).id);

  // 1. plan → „Z biletu lub screena” → PDF
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(700);
  console.log('button:', await p.$eval('.pl-from-file', e => e.textContent.replace(/\s+/g, ' ').trim()));
  await p.setInputFiles('#pl-from-file', path.join(FX, 'koncert.pdf'));
  await p.waitForFunction(() => location.hash.includes('/nowy'), null, { timeout: 5000 });
  await p.waitForFunction(() => document.querySelector('#pl-form') && document.querySelector('#pl-form').time.value, null, { timeout: 15000 }).catch(() => {});
  const form = await p.evaluate(() => { const f = document.querySelector('#pl-form');
    return { date: f.date.value, time: f.time.value, cat: f.querySelector('input[name=cat]:checked').value, files: [...document.querySelectorAll('.pl-file')].map(x => x.textContent.trim()) }; });
  console.log('new form:', JSON.stringify(form), '| toast:', await p.$eval('.toast', e => e.textContent).catch(() => '-'));
  await p.screenshot({ path: `${dir}/t34-form.png`, fullPage: true });
  await p.fill('#pl-form input[name=title]', 'Koncert w Filharmonii');
  await p.click('#pl-form button[type=submit]'); await p.waitForTimeout(1500);
  const db1 = await p.evaluate(async id => { const it = (await DB.byIndex('planItems', 'tripId', id))[0]; const fs = await DB.byIndex('files', 'segmentId', `p:${it.id}`);
    return { it: [it.title, it.date, it.time, it.cat], files: fs.map(f => [f.kind, f.label, f.tripId === id]) }; }, id);
  console.log('saved:', JSON.stringify(db1), '| hash:', await p.evaluate(() => location.hash.split('/')[1]));

  // 2. plan: 🎫 przy punkcie → pełny ekran
  await p.goto(`http://localhost:8765/podroznik/#/plan/${id}`); await p.waitForTimeout(800);
  console.log('ticket buttons in plan:', await p.$$eval('.pl-tk', e => e.length));
  await p.screenshot({ path: `${dir}/t34-plan.png`, fullPage: true });
  await p.click('.pl-tk'); await p.waitForTimeout(1500);
  console.log('viewer:', await p.$eval('.tv-title', e => e.innerText.replace(/\s+/g, ' ')), '| pdf pages:', await p.$$eval('.tv-pdf', e => e.length),
    '| details →', await p.$eval('.tv-foot a.tv-link', e => e.getAttribute('href').split('/')[1]));

  // 3. istniejący punkt: dodaj screen z kodem QR
  await p.click('.tv-foot a.tv-link'); await p.waitForTimeout(800);
  console.log('item form files:', await p.$$eval('#pl-files .pl-file', e => e.map(x => x.textContent.trim())));
  await p.setInputFiles('#pl-file', path.join(FX, 'qr.png')); await p.waitForTimeout(300);
  await p.click('#pl-form button[type=submit]'); await p.waitForTimeout(3000);
  const files2 = await p.evaluate(async id => (await DB.byIndex('files', 'tripId', id)).map(f => [f.kind, !!f.code, f.code ? f.code.format : '']), id);
  console.log('files after QR:', JSON.stringify(files2));

  // 4. zakładka Bilety
  await p.goto('http://localhost:8765/podroznik/#/bilety'); await p.waitForTimeout(1000);
  console.log('tickets tab:', await p.$eval('#view', e => e.innerText.replace(/\s+/g, ' ').slice(0, 200)));
  await p.screenshot({ path: `${dir}/t34-bilety.png`, fullPage: true });

  // 5. usunięcie punktu – razem z biletami
  const pid = await p.evaluate(async id => (await DB.byIndex('planItems', 'tripId', id))[0].id, id);
  await p.goto(`http://localhost:8765/podroznik/#/punkt/${pid}`); await p.waitForTimeout(700);
  let dlg = '';
  p.once('dialog', d => { dlg = d.message(); d.accept(); });
  await p.click('#del'); await p.waitForTimeout(800);
  console.log('confirm:', dlg, '| files left:', await p.evaluate(async id => (await DB.byIndex('files', 'tripId', id)).length, id));
  console.log('errors:', errs);
  await b.close();
})();
