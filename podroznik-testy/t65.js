// t65: biblioteka planów (biblioteka.js) i profile – dwa telefony przez emulator Firebase (8085/9099):
// publikacja całej podróży i jednego dnia (bez cen, notatek, numerów lotów, prawdziwych dat), wyszukiwanie po kraju / mieście /
// kilku miejscach, filtry (rodzaj, dni, pora roku), oceny 1–10 (jedna na osobę, zmiana, średnia), reguły (bez własnej oceny,
// bez ręcznej zmiany sumy), kopiowanie do moich podróży z nową datą, zgłoszenie, blokowanie autora, „O mnie” i plany w profilu,
// usunięcie konta kasuje plany. EN.
const { chromium, devices } = require('playwright');
const http = require('http');
const get = url => new Promise(res => { const r = http.request(url, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); r.on('error', () => res(0)); r.end(); });
(async () => {
  if (!(await get('http://127.0.0.1:8085/'))) { console.log('SKIP brak emulatora'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone(name) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'spam' : undefined));
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    await p.evaluate(n => DB.setSetting('myName', n), name);
    await p.evaluate(() => App.Social.enable());
    return p;
  }
  const until = async (p, fn, arg, ms = 10000) => { const end = Date.now() + ms;
    while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); } return false; };
  const suf = Date.now().toString(36);
  const A = await phone('Ania ' + suf), T = await phone('Tomek');
  const uA = await A.evaluate(() => App.Social.profile());

  // podróż Ani: Rzym + Florencja, w lipcu
  const trip = await A.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Włochy latem', destination: 'Rzym, Włochy', start: '2026-07-10', end: '2026-07-13', color: '#d6602f' });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Rzym FCO', depart: '2026-07-10T08:00', arrive: '2026-07-10T10:30', number: 'LO 327', price: 900 });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Roma', city: 'Rzym', address: 'Via Tajna 7', depart: '2026-07-10T14:00', arrive: '2026-07-12T10:00' });
    await DB.put('segments', { tripId: t.id, type: 'pociag', from: 'Rzym Termini', to: 'Florencja SMN', depart: '2026-07-12T11:00', arrive: '2026-07-12T12:40', number: 'FR 9521' });
    const P = (date, time, title, order) => DB.put('planItems', { tripId: t.id, date, time, title, cat: 'zwiedzanie', place: title + ', Italia', note: 'TAJNA NOTATKA', cost: '25', currency: 'EUR', order });
    await P('2026-07-11', '09:00', 'Koloseum', 0); await P('2026-07-11', '13:00', 'Forum Romanum', 1); await P('2026-07-11', '17:00', 'Fontanna di Trevi', 2);
    await P('2026-07-12', '15:00', 'Duomo', 0);
    return t.id;
  });
  // ekran publikacji
  await A.goto(B + `#/biblioteka/opublikuj/${trip}`); await A.waitForSelector('#lb-pf', { timeout: 15000 });
  ok(/Rzym/.test(await A.inputValue('[name=cities]')), 'propozycja miast: ' + await A.inputValue('[name=cities]'));
  ok(await A.$('[name=cc][value=IT]') !== null, 'propozycja kraju: Włochy');
  await A.fill('[name=cities]', 'Rzym, Florencja'); await A.fill('[name=desc]', 'Klasyka w 4 dni.');
  await A.check('[name=ok]'); await A.click('#lb-pf button[type=submit]');
  ok(await until(A, () => /#\/biblioteka\/p\//.test(location.hash), null, 15000), 'opublikowano całą podróż');
  const idTrip = await A.evaluate(() => location.hash.split('/').pop());
  // jeden dzień
  await A.goto(B + `#/biblioteka/opublikuj/${trip}?d=2026-07-11`); await A.waitForSelector('#lb-pf', { timeout: 15000 });
  ok(/1 dzień/.test(await A.inputValue('[name=title]')), 'tytuł dnia: ' + await A.inputValue('[name=title]'));
  await A.fill('[name=cities]', 'Rzym'); await A.check('[name=ok]'); await A.click('#lb-pf button[type=submit]');
  ok(await until(A, id => /#\/biblioteka\/p\//.test(location.hash) && !location.hash.endsWith(id), idTrip, 15000), 'opublikowano jeden dzień');
  const idDay = await A.evaluate(() => location.hash.split('/').pop());
  const doc = await A.evaluate(id => App.Library.get(id), idTrip);
  const raw = JSON.stringify(doc.plan);
  ok(doc.kind === 'trip' && doc.days === 4 && doc.month === 7 && doc.countries.includes('IT'), 'plan: 4 dni, lipiec, IT');
  ok(!/TAJNA|LO 327|FR 9521|Via Tajna|900|"cost"|2026-07/.test(raw), 'bez notatek, cen, numerów, adresu i prawdziwych dat');
  ok(doc.tags.includes('k:IT') && doc.tags.includes('m:rzym') && doc.tags.includes('m:florencja'), 'tagi: ' + doc.tags.join(','));
  const dday = await A.evaluate(id => App.Library.get(id), idDay);
  ok(dday.kind === 'day' && dday.days === 1 && dday.plan.items.length === 3, 'plan dnia: 3 punkty');
  // podgląd: „Dzień 1…”, właściciel nie ocenia
  await A.goto(B + '#/x'); await A.goto(B + `#/biblioteka/p/${idTrip}`); await A.waitForSelector('.lb-head', { timeout: 15000 }); await A.waitForTimeout(600);
  ok(/Dzień 2/.test(await A.textContent('#view')) && !/lipca/.test(await A.textContent('#view')), 'podgląd: Dzień 2, bez dat autora');
  ok(await A.$('[data-r]') === null && await A.$('#lb-del') !== null, 'autor: bez gwiazdek, z „Usuń z biblioteki”');
  const selfRate = await A.evaluate(id => App.Library.rate(id, 10).then(() => 'ok', e => e.code || e.message), idTrip);
  ok(selfRate !== 'ok', 'reguły: autor nie oceni własnego planu (' + selfRate + ')');

  // Tomek: wyszukiwanie
  const s = q => T.evaluate(([q, u]) => App.Library.search(q).then(r => r.list.filter(p => p.owner === u).map(p => p.id)), [q, uA]);
  ok((await s({ q: 'Włochy' })).includes(idTrip), 'szukanie: Włochy');
  ok((await s({ q: 'Italy' })).includes(idTrip), 'szukanie: Italy (nazwa kraju po angielsku)');
  ok((await s({ q: 'rzym, florencja' })).includes(idTrip) && !(await s({ q: 'rzym, florencja' })).includes(idDay), 'kilka miast: tylko plan z obydwoma');
  ok(!(await s({ q: 'Paryż' })).length || !(await s({ q: 'Paryż' })).includes(idTrip), 'Paryż – bez planu Ani');
  ok((await s({ q: 'Włochy', k: 'day' })).join() === idDay, 'filtr: plan dnia');
  ok((await s({ q: 'Włochy', d: '2-4' })).join() === idTrip, 'filtr: 2–4 dni');
  ok((await s({ q: 'Włochy', s: 'lato' })).length === 2 && !(await s({ q: 'Włochy', s: 'zima' })).length, 'filtr: lato / zima');
  await T.goto(B + '#/biblioteka?q=W%C5%82ochy'); await T.waitForSelector('.lb-card', { timeout: 15000 });
  ok(await T.$$eval('.lb-card', n => n.length) >= 2, 'ekran wyszukiwarki: karty planów');
  // oceny
  await T.goto(B + `#/biblioteka/p/${idTrip}`); await T.waitForSelector('[data-r="8"]', { timeout: 15000 });
  await T.click('[data-r="8"]'); await T.waitForTimeout(1500);
  let d1 = await T.evaluate(id => App.Library.get(id), idTrip);
  ok(d1.ratingSum === 8 && d1.ratingCount === 1, 'ocena 8 → średnia 8 (1 ocena)');
  await T.waitForSelector('[data-r="6"]'); await T.click('[data-r="6"]'); await T.waitForTimeout(1500);
  d1 = await T.evaluate(id => App.Library.get(id), idTrip);
  ok(d1.ratingSum === 6 && d1.ratingCount === 1, 'zmiana oceny na 6 → nadal 1 ocena');
  ok(/6\/10/.test(await T.textContent('.lb-mine')), 'ekran: „Twoja ocena: 6/10”');
  const cheat = await T.evaluate(async id => { const f = await App.Sync.firebase(); return f.db.collection('library').doc(id).update({ ratingSum: 100, ratingCount: 10 }).then(() => 'ok', e => e.code); }, idTrip);
  ok(cheat !== 'ok', 'reguły: ręczna zmiana sumy ocen odrzucona (' + cheat + ')');
  const cheat2 = await T.evaluate(async id => { const f = await App.Sync.firebase(); return f.db.collection('library').doc(id).update({ title: 'hack', t: f.now() }).then(() => 'ok', e => e.code); }, idTrip);
  ok(cheat2 !== 'ok', 'reguły: cudzy plan nie do edycji');
  // kopiowanie
  await T.click('#zn-copytrip'); await T.waitForSelector('dialog.tp-sheet input[name=start]');
  await T.fill('dialog.tp-sheet input[name=start]', '2027-05-01'); await T.click('dialog.tp-sheet button[type=submit]');
  ok(await until(T, () => DB.all('trips').then(a => a.some(t => t.name === 'Włochy latem' && t.start === '2027-05-01' && t.end === '2027-05-04'))), 'skopiowano: 1–4 maja 2027');
  ok(await until(T, () => DB.all('planItems').then(a => a.some(i => i.title === 'Koloseum' && i.date === '2027-05-02'))), 'Koloseum w dniu 2 kopii');
  // zgłoszenie i blokowanie
  await T.waitForTimeout(800); await T.goto(B + `#/biblioteka/p/${idDay}`); await T.waitForSelector('#lb-rep', { timeout: 15000 }); await T.waitForTimeout(800);
  await T.click('#lb-rep'); await T.waitForTimeout(1000);
  ok(!T.errs.length, 'zgłoszenie wysłane bez błędu');
  // profil Ani: O mnie + plany
  await A.evaluate(() => App.Social.setBio('Lubię Włochy i pizzę.'));
  await T.goto(B + `#/osoba/${uA}`); await T.waitForSelector('.lb-list, .zn-prof', { timeout: 15000 }); await T.waitForTimeout(800);
  const prof = await T.textContent('#view');
  ok(/Lubię Włochy/.test(prof) && /Plany w bibliotece/.test(prof) && (await T.$$eval('.lb-card', n => n.length)) === 2, 'profil autora: O mnie i 2 plany');
  await T.screenshot({ path: 'podroznik-testy/t65-profil.png' });
  await T.click('#zn-block'); await T.waitForTimeout(800);
  ok(!(await s({ q: 'Włochy' })).length, 'zablokowany autor – plany ukryte');
  await T.evaluate(id => App.Library.block(id, false), uA);
  ok((await s({ q: 'Włochy' })).length === 2, 'odblokowany – plany wracają');
  // mój profil Ani
  await A.goto(B + '#/profil'); await A.waitForSelector('#zn-bioform', { timeout: 15000 }); await A.waitForTimeout(600);
  ok((await A.$$eval('.lb-card', n => n.length)) === 2 && /6\/10/.test(await A.textContent('#view')), 'mój profil: 2 plany, średnia 6/10');
  // wejścia
  await A.goto(B + '#/podroze'); await A.waitForTimeout(800);
  ok(await A.$('a[href="#/biblioteka"]') !== null, 'ekran główny: „Biblioteka planów”');
  await A.goto(B + `#/podroze/${trip}`); await A.waitForTimeout(800);
  ok(await A.$(`a[href="#/biblioteka/opublikuj/${trip}"]`) !== null, 'szczegóły podróży: „Biblioteka planów”');
  // EN
  await T.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await T.goto(B + '#/biblioteka?q=Italy'); await T.reload(); await T.waitForSelector('.lb-card', { timeout: 15000 }); await T.waitForTimeout(500);
  const en = await T.textContent('#view');
  ok(/Plan library|Top rated/.test(en) && !/Najlepiej/.test(en), 'EN: wyszukiwarka po angielsku');
  await T.screenshot({ path: 'podroznik-testy/t65-biblioteka.png' });
  await T.goto(B + '#/x'); await T.goto(B + `#/biblioteka/p/${idTrip}`); await T.waitForSelector('.lb-head', { timeout: 15000 }); await T.waitForTimeout(800);
  ok(/Day 2/.test(await T.textContent('#view')), 'EN: Day 2');
  await T.screenshot({ path: 'podroznik-testy/t65-plan.png', fullPage: true });
  await T.evaluate(() => DB.setSetting('lang', 'pl'));
  // usunięcie konta Ani → plany znikają
  await A.evaluate(() => App.Social.deleteAccount());
  ok(!(await s({ q: 'Włochy' })).length, 'usunięcie konta autora – plany usunięte');
  // usunięcie konta Tomka → jego ocena znika (plan już nie istnieje – nic nie zostaje)
  await T.evaluate(() => App.Social.deleteAccount());
  for (const p of [A, T]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
