// etap 10: rozliczenie wydatków w grupie, wspólna podróż (plik) i plan jako tekst
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
(async () => { const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', acceptDownloads: true }); await c.route(/open-meteo|nbp/, r => r.abort()); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const errs = []; const p = await mk();
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  const id = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Łódź z ekipą', destination: 'Łódź', start: '2027-06-01', end: '2027-06-03' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hostel', depart: '2027-06-01T15:00', arrive: '2027-06-03T11:00', price: '600', currency: 'PLN' });
    await DB.put('segments', { tripId: t.id, type: 'pociag', from: 'Warszawa', to: 'Łódź', depart: '2027-06-01T09:00', arrive: '2027-06-01T10:30', number: 'IC 1' });
    await DB.put('planItems', { tripId: t.id, date: '2027-06-02', time: '10:00', title: 'Manufaktura', cat: 'zakupy', place: 'Manufaktura, Łódź', order: 0 });
    await DB.put('planItems', { tripId: t.id, date: '', title: 'Piotrkowska', cat: 'zwiedzanie', order: 0 });
    return t.id; });
  // uczestnicy
  await p.goto(`http://localhost:8765/podroznik/#/budzet/${id}`); await p.waitForTimeout(500);
  await p.fill('#bg-cfg input[name=people]', 'Ja, Ania, Tomek'); await p.click('#bg-cfg button[type=submit]'); await p.waitForTimeout(500);
  // Ja płaci 90 za wszystkich, Ania 60 za wszystkich, Tomek 30 tylko za siebie
  const add = async (title, amount, payer, split) => {
    await p.fill('#bg-add input[name=title]', title); await p.fill('#bg-add input[name=amount]', amount);
    await p.selectOption('#bg-add select[name=paidBy]', payer); await p.selectOption('#bg-add select[name=split]', split);
    await p.click('#bg-add button[type=submit]'); await p.waitForTimeout(400); };
  await add('kolacja', '90', 'Ja', ''); await add('bilety', '60', 'Ania', ''); await add('pamiątka', '30', 'Tomek', 'Tomek');
  console.log('rows:', await p.$$eval('.bg-row-name', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.click('a[href^="#/rozliczenie/"]'); await p.waitForTimeout(500);
  const read = () => p.evaluate(() => ({ t: [...document.querySelectorAll('.sp-transfer')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
    b: [...document.querySelectorAll('.sp-bal')].map(x => x.textContent.trim()), top: document.querySelector('.bg-top b').textContent }));
  console.log('settle:', JSON.stringify(await read()));
  await p.selectOption('#sp-seg select', 'Ja'); await p.waitForTimeout(500);
  console.log('with hostel paid by Ja:', JSON.stringify(await read()));
  await p.screenshot({ path: `${dir}/t21-split.png`, fullPage: true });
  // edycja wydatku: kolacja tylko za Ja i Ania
  await p.goto(`http://localhost:8765/podroznik/#/budzet/${id}`); await p.waitForTimeout(400);
  await p.click('.bg-row:has-text("kolacja")'); await p.waitForTimeout(400);
  await p.uncheck('input[name=split][value=Tomek]'); await p.click('button[type=submit]'); await p.waitForTimeout(400);
  console.log('kolacja split:', await p.evaluate(i => DB.byIndex('expenses', 'tripId', i).then(a => a.find(e => e.title === 'kolacja').split), id));

  // plan jako tekst
  console.log('text:\n' + await p.evaluate(i => App.Share.planText(i), id));
  // wspólna podróż: plik → drugi telefon
  await p.goto(`http://localhost:8765/podroznik/#/udostepnij/${id}`); await p.waitForTimeout(400);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sh-file')]);
  const path = require('os').tmpdir() + '/t21-podroz.json'; await dl.saveAs(path); console.log('file:', dl.suggestedFilename());
  const p2 = await mk();
  await p2.goto('http://localhost:8765/podroznik/#/podroze'); await p2.waitForTimeout(500);
  await p2.click('a[href="#/udostepnij"]'); await p2.waitForTimeout(300);
  await p2.setInputFiles('#sh-in', path); await p2.waitForTimeout(800);
  console.log('phone2 after import:', await p2.textContent('#title'), '|', await p2.textContent('#toast'));
  // telefon 2 dodaje punkt i odsyła; telefon 1 scala
  await p2.evaluate(async i => { await DB.put('planItems', { tripId: i, date: '2027-06-03', title: 'Muzeum Kinematografii', cat: 'zwiedzanie', order: 0 }); }, id);
  const pkg = await p2.evaluate(i => App.Share.buildPackage(i, { withFiles: false }), id);
  const r = await p.evaluate(d => App.Share.mergePackage(d), pkg);
  console.log('merge back:', JSON.stringify(r));
  console.log('phone1 items:', await p.evaluate(i => DB.byIndex('planItems', 'tripId', i).then(a => a.map(x => x.title).sort()), id));
  const r2 = await p.evaluate(d => App.Share.mergePackage(d), pkg); console.log('merge again:', JSON.stringify(r2));
  // backup zamiast pliku podróży
  await p2.goto('http://localhost:8765/podroznik/#/udostepnij'); await p2.waitForTimeout(300);
  await p2.setInputFiles('#sh-in', { name: 'k.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"podroznik","format":1,"stores":{}}') }); await p2.waitForTimeout(400);
  console.log('backup file:', await p2.textContent('#err'));
  console.log('errors:', errs); await b.close(); })();
