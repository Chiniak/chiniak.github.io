// etap 9: import karty .pkpass (Apple Wallet)
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  const sid = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Lizbona', start: '2027-05-01', end: '2027-05-05' });
    return (await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: '2027-05-01T08:00', number: 'LO 281' })).id;
  });
  await p.goto(`http://localhost:8765/podroznik/#/odcinek/${sid}`); await p.waitForTimeout(500);
  await p.setInputFiles('#pick', `${dir}/fx/karta.pkpass`); await p.waitForTimeout(1500);
  const f = await p.evaluate(id => DB.byIndex('files', 'segmentId', id).then(r => r.map(x => ({ kind: x.kind, label: x.label, code: x.code, n: (x.passFields || []).length }))), sid);
  console.log('files:', JSON.stringify(f));
  console.log('segment:', await p.evaluate(id => DB.get('segments', id).then(s => [s.seat, s.gate, s.booking, s.number]), sid));
  console.log('tiles:', await p.$$eval('.tk-tile', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.click('.tk-tile'); await p.waitForTimeout(1000);
  console.log('ticket seat line:', await p.textContent('.tv-seat'));
  await p.click('.tv-pass summary');
  await p.screenshot({ path: `${dir}/t19-pass.png` });
  // narysowany kod da się odczytać i ma te same dane
  const back = await p.evaluate(async () => { const c = document.querySelector('#tv-body canvas'); return c ? (await App.Tickets._.detect(c)) : null; });
  console.log('decoded back:', back && back.format, back && back.text === f[0].code.text);
  // zły plik
  await p.goto(`http://localhost:8765/podroznik/#/odcinek/${sid}`); await p.waitForTimeout(400);
  await p.setInputFiles('#pick', { name: 'zly.pkpass', mimeType: 'application/vnd.apple.pkpass', buffer: Buffer.from('nie zip') }); await p.waitForTimeout(800);
  console.log('bad file toast:', await p.textContent('#toast'));
  console.log('errors:', errs); await b.close(); })();
