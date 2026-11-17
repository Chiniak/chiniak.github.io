// t46: obywatelstwo (paszport) w Ustawieniach i wizy dla innych paszportów (lib/visa-world.js): PL bez zmian (tabela D),
// UA – USA i UK z wizą, Tajlandia z TDAC; DE – kraje UE bez wiz, USA z ESTA; IN – Polska wymaga wizy; lista „Dodaj kraj”,
// service worker liczy przypomnienia według obywatelstwa, angielski
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const fails = [];
  const ok = (c, w) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + w); if (!c) fails.push(w); };
  const B = 'http://localhost:8765/podroznik/';
  const rowTxt = async cc => ((await p.locator(`.vz-row[data-cc="${cc}"]`).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const ccs = () => p.$$eval('.vz-row', r => r.map(x => x.dataset.cc));
  const open = async id => { await p.goto(B + '#/x'); await p.goto(B + `#/podroze/${id}`); await p.waitForTimeout(900); };
  const setCit = async cc => {
    await p.goto(B + '#/ustawienia'); await p.waitForTimeout(800);
    await p.selectOption('#cit-sel', cc); await p.waitForTimeout(400);
  };
  await p.goto(B + '#/podroze'); await p.waitForTimeout(600);

  const ids = await p.evaluate(async () => {
    const T = App.todayStr(), d = n => App.addDays(T, n);
    const us = await DB.put('trips', { name: 'Nowy Jork', destination: 'Nowy Jork', start: d(30), end: d(36) });
    await DB.put('segments', { tripId: us.id, type: 'lot', from: 'Warszawa WAW', to: 'Nowy Jork JFK', depart: d(30) + 'T10:00', arrive: d(30) + 'T13:00' });
    const th = await DB.put('trips', { name: 'Tajlandia', destination: 'Bangkok', start: d(40), end: d(50) });
    const uk = await DB.put('trips', { name: 'Londyn', destination: 'Londyn', start: d(10), end: d(13) });
    const fr = await DB.put('trips', { name: 'Paryż', destination: 'Paryż, Francja', start: d(15), end: d(18) });
    const pl = await DB.put('trips', { name: 'Kraków', destination: 'Kraków, Polska', start: d(60), end: d(64) });
    await DB.put('segments', { tripId: pl.id, type: 'lot', from: 'Delhi DEL', to: 'Kraków KRK', depart: d(60) + 'T08:00', arrive: d(60) + 'T14:00' });
    return { us: us.id, th: th.id, uk: uk.id, fr: fr.id, pl: pl.id };
  });

  // ---------- domyślnie Polska ----------
  await p.goto(B + '#/ustawienia'); await p.waitForTimeout(800);
  ok(await p.$eval('#cit-sel', s => s.value) === 'PL', 'Ustawienia: obywatelstwo domyślnie Polska');
  const nOpts = await p.$$eval('#cit-sel option', o => o.length);
  ok(nOpts >= 190, 'lista paszportów: ' + nOpts);
  await open(ids.us);
  let t = await rowTxt('US');
  ok(/ESTA/.test(t) && /elektroniczne zezwolenie/.test(t), 'PL → USA: ESTA – ' + t.slice(0, 80));
  ok(/Polski paszport/.test(await p.innerText('.vz-src')), 'PL: opis źródła „Polski paszport” + MSZ');
  ok(await p.$('.vz-src a[href="#/ustawienia"]') !== null, 'PL: link „Inne obywatelstwo?”');
  await open(ids.fr);
  ok((await ccs()).length === 0, 'PL → Francja: nic do zrobienia (UE)');
  await open(ids.pl);
  ok(!(await ccs()).includes('PL'), 'PL → Polska: własny kraj pominięty');

  // ---------- Ukraina ----------
  await setCit('UA');
  ok(await p.evaluate(async () => (await DB.getSetting('citizenship')) === 'UA'), 'zapis ustawienia citizenship = UA');
  await open(ids.us);
  t = await rowTxt('US');
  ok(/wiza/.test(t) && !/ESTA/.test(t), 'UA → USA: wiza (bez ESTA) – ' + t.slice(0, 80));
  const src = await p.innerText('.vz-src');
  ok(/Paszport: Ukraina/.test(src) && /Passport Index/.test(src) && /17\.02\.2026/.test(src), 'UA: opis źródła – ' + src.slice(0, 90));
  await open(ids.uk);
  ok(/wiza/.test(await rowTxt('GB')), 'UA → UK: wiza – ' + (await rowTxt('GB')).slice(0, 60));
  await open(ids.th);
  t = await rowTxt('TH');
  ok(/TDAC/.test(t) && /60 dni/.test(t), 'UA → Tajlandia: bez wizy 60 dni + TDAC – ' + t.slice(0, 90));
  await open(ids.fr);
  t = await rowTxt('FR');
  ok(/bez wizy/i.test(t) && /90 dni/.test(t), 'UA → Francja: bez wizy 90 dni – ' + t.slice(0, 70));
  const addOpts = await p.$$eval('#vz-add option', o => o.map(x => x.value));
  ok(addOpts.includes('PL') && addOpts.includes('ML') && !addOpts.includes('UA'), 'UA: „Dodaj kraj” – cały świat bez własnego kraju (' + addOpts.length + ')');

  // ---------- Niemcy ----------
  await setCit('DE');
  await open(ids.fr);
  ok((await ccs()).length === 0, 'DE → Francja: nic do zrobienia (UE)');
  ok(/Nie rozpoznano kraju poza Unią/.test(await p.innerText('.vz-none')), 'DE: tekst „poza Unią Europejską”');
  await open(ids.pl);
  ok((await ccs()).length === 0, 'DE → Polska: UE, nic do zrobienia');
  await open(ids.us);
  t = await rowTxt('US');
  ok(/ESTA/.test(t) && /Oficjalna strona/.test(t), 'DE → USA: ESTA z oficjalną stroną – ' + t.slice(0, 80));

  // ---------- Indie ----------
  await setCit('IN');
  await open(ids.pl);
  t = await rowTxt('PL');
  ok(/wiza/.test(t), 'IN → Polska: wiza – ' + t.slice(0, 60));
  ok(/Nie rozpoznano kraju podróży/.test(await p.innerText('#view').catch(() => '')) || (await ccs()).includes('PL'), 'IN: lista z Polską');
  // przypomnienia liczone według obywatelstwa (w oknie i w service workerze)
  const rem = await p.evaluate(async () => {
    await Visas.ready();
    const [trips, segments, planItems, docs] = await Promise.all([DB.all('trips'), DB.all('segments'), DB.all('planItems'), DB.all('docs')]);
    return Visas.reminders({ trips, segments, planItems, docs }, App.todayStr()).map(r => r.id.split(':')[2]);
  });
  ok(rem.includes('PL') && rem.includes('US'), 'IN: przypomnienia o wizie do Polski i USA – ' + [...new Set(rem)].join(','));
  const sw = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await new Promise(r => setTimeout(r, 300));
    return !!(self.VISA_WORLD && reg.active);
  });
  ok(sw, 'service worker aktywny, baza światowa w oknie');

  // ---------- angielski ----------
  await p.evaluate(async () => { localStorage.setItem('podroznik-lang', 'en'); await DB.setSetting('lang', 'en'); });
  await setCit('UA');
  await p.reload(); await p.waitForTimeout(900);
  const label = await p.innerText('label:has(#cit-sel)');
  ok(/Citizenship/.test(label) && /Ukraine/.test(label), 'EN: „Citizenship”, nazwa kraju po angielsku – ' + label.replace(/\s+/g, ' ').slice(0, 80));
  await open(ids.us);
  const srcEn = await p.innerText('.vz-src');
  ok(/Passport: Ukraine/.test(srcEn) && /Approximate data from Passport Index/.test(srcEn) && /Change citizenship/.test(srcEn), 'EN: opis źródła – ' + srcEn.slice(0, 100));
  await p.screenshot({ path: `${SP}/t46-en.png` });
  await p.evaluate(async () => { localStorage.setItem('podroznik-lang', 'pl'); await DB.setSetting('lang', 'pl'); await DB.setSetting('citizenship', 'PL'); });

  ok(!errs.length, 'brak błędów JS: ' + JSON.stringify(errs.slice(0, 3)));
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nWSZYSTKO OK');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
