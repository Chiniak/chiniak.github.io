// t44: przelicznik walut offline (waluty.js): liczenie w polu kwoty, waluty podróży (kraje, wydatki), kursy (budżet, ręcznie, NBP symulowany),
// zamiana, ściąga, wydatek, wejścia (Dziś, podróż, budżet, Przygotuj offline), działanie offline (service worker), angielski
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  // NBP symulowany: tabela A (THB, USD, EUR), tabela B (VND, KHR)
  const NBP = { a: { THB: 0.1125, USD: 3.65, EUR: 4.24 }, b: { VND: 0.000148, KHR: 0.00091 } };
  let nbpCalls = 0;
  await ctx.route(/^https:\/\/api\.nbp\.pl\//, r => {
    nbpCalls++;
    const m = /rates\/([ab])\/(\w+)/.exec(r.request().url());
    const v = m && NBP[m[1]][m[2].toUpperCase()];
    return v ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ rates: [{ mid: v }] }) }) : r.fulfill({ status: 404, body: 'Not Found' });
  });
  await ctx.route(/^https:\/\/(?!api\.nbp\.pl)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const fails = [];
  const ok = (c, w) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + w); if (!c) fails.push(w); };
  const txt = async s => ((await p.innerText(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const res = () => txt('#cv-res');
  const B = 'http://localhost:8765/podroznik/';

  // ---------- liczenie w polu kwoty ----------
  await p.goto(B + '#/podroze'); await p.waitForTimeout(600);
  const calc = await p.evaluate(() => ['120 000 + 35 000', '3 × 45000', '1,5 * 20', '1.200.000', '1,200,000', '(10+5)/3', '-5+10', '2x', 'abc', '12,5', ''].map(x => App.Money.calc(x)));
  ok(JSON.stringify(calc) === JSON.stringify([155000, 135000, 30, 1200000, 1200000, 5, 5, null, null, 12.5, null]), 'calc: ' + JSON.stringify(calc));

  const ids = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Indochiny', destination: 'Wietnam i Kambodża', start: App.addDays(T, -1), end: App.addDays(T, 20), rates: { EUR: 4.3 } });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Bangkok BKK', depart: App.addDays(T, -1) + 'T10:00', arrive: T + 'T06:00' });
    await DB.put('expenses', { tripId: t.id, title: 'muzeum', amount: 20, currency: 'EUR', cat: 'atrakcje', date: T });
    return { t: t.id, T };
  });

  // ---------- wejścia ----------
  await p.goto(B + `#/dzis/${ids.t}`); await p.waitForTimeout(800);
  ok(await p.getAttribute('.dz-tools a[href^="#/waluty"]', 'href') === `#/waluty/${ids.t}`, 'Dziś: kafelek Waluty');
  await p.goto(B + `#/podroze/${ids.t}`); await p.waitForTimeout(800);
  ok(!!(await p.$(`.td-tools a[href="#/waluty/${ids.t}"]`)), 'podróż: wiersz Przelicznik walut');
  await p.goto(B + `#/budzet/${ids.t}`); await p.waitForTimeout(800);
  ok(!!(await p.$(`a[href="#/waluty/${ids.t}"]`)), 'budżet: link do przelicznika');
  await p.goto(B + `#/przygotuj/${ids.t}`); await p.waitForTimeout(1200);
  ok(!!(await p.$(`a[href="#/waluty/${ids.t}"]`)), 'Przygotuj offline: krok kursów prowadzi do przelicznika');
  await p.goto(B + '#/waluty'); await p.waitForTimeout(800);
  ok(p.url().endsWith(`#/waluty/${ids.t}`), '#/waluty → trwająca podróż');

  // ---------- waluty podróży i kursy ----------
  const curs = await p.$$eval('.cv-rate-row', r => r.map(x => x.dataset.cur));
  console.log('waluty:', curs.join(','));
  ok(['THB', 'VND', 'KHR', 'USD', 'EUR'].every(c => curs.includes(c)) && !curs.includes('PLN'), 'waluty: THB (lot), VND i KHR (cel), USD (Kambodża), EUR (wydatek)');
  ok(await p.inputValue('#cv-from') === 'EUR', 'domyślnie pierwsza waluta z kursem (EUR)');
  ok(/brak kursu: THB, VND, KHR, USD/.test(await txt('.cv-top')), 'chip: brak kursów');
  ok(/kurs z budżetu/.test(await txt('.cv-rate-row[data-cur="EUR"]')), 'EUR: kurs z budżetu');
  await p.fill('#cv-amt', '10'); await p.waitForTimeout(150);
  ok(await res() === '43', '10 EUR = 43 PLN – ' + await res());

  // NBP (online, symulowany)
  await p.click('#cv-nbp'); await p.waitForTimeout(1500);
  const t1 = await p.evaluate(async id => DB.get('trips', id), ids.t);
  ok(t1.rates.THB === 0.1125 && t1.rates.VND === 0.000148 && t1.rates.KHR === 0.00091 && t1.rates.USD === 3.65, 'NBP: kursy z tabel A i B zapisane w podróży');
  ok(t1.ratesInfo.VND.src === 'NBP' && t1.ratesInfo.VND.at === ids.T, 'NBP: źródło i data kursu');
  ok(/NBP · \d+\.\d\d/.test(await txt('.cv-rate-row[data-cur="VND"]')), 'wiersz kursu: „NBP · data”');

  // przeliczanie z wyrażeniem
  await p.selectOption('#cv-from', 'VND'); await p.selectOption('#cv-to', 'PLN');
  await p.fill('#cv-amt', '120 000 + 35 000'); await p.waitForTimeout(150);
  ok(/= 155 000 VND/.test(await txt('#cv-calc')) && await res() === '22,94', '120 000 + 35 000 VND = 22,94 PLN – ' + await res());
  ok(/1 VND = 0,000148 PLN · 1 PLN = 6756,76 VND/.test(await txt('#cv-rate')), 'kurs pod wynikiem – ' + await txt('#cv-rate'));
  // waluta obca → obca (przez PLN)
  await p.selectOption('#cv-to', 'USD'); await p.waitForTimeout(150);
  ok(await res() === '6,28', '155 000 VND → 6,28 USD – ' + await res());
  await p.selectOption('#cv-to', 'PLN');
  // ściąga
  const cheat = await p.$$eval('.cv-cheat-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log('ściąga:', JSON.stringify(cheat));
  ok(cheat.length === 8 && /^10 000 VND 1,48 PLN$/.test(cheat[0]) && cheat.some(x => /^500 000 VND 74 PLN$/.test(x)), 'ściąga VND → PLN (banknoty)');
  await p.click('.cv-cheat-row:has-text("200 000 VND")'); await p.waitForTimeout(150);
  ok(await p.inputValue('#cv-amt') === '200000' && await res() === '29,60', 'dotknięcie ściągi wpisuje kwotę');
  // zamiana
  await p.click('#cv-swap'); await p.waitForTimeout(150);
  ok(await p.inputValue('#cv-from') === 'PLN' && await p.inputValue('#cv-to') === 'VND' && await p.inputValue('#cv-amt') === '29,60', 'zamiana: PLN → VND z wynikiem jako kwotą');
  ok(await res() === '200 000', 'zamiana: 29,60 PLN = 200 000 VND – ' + await res());
  ok(/Ściąga: VND → PLN/i.test(await txt('#cv-cheat-h')), 'ściąga zostaje dla waluty obcej');
  // wybór chipem
  await p.click('[data-pick="THB"]'); await p.waitForTimeout(150);
  ok(await p.inputValue('#cv-from') === 'THB' && await p.inputValue('#cv-to') === 'VND', 'chip THB: z THB');
  await p.selectOption('#cv-to', 'PLN'); await p.fill('#cv-amt', '1000'); await p.waitForTimeout(150);
  ok(await res() === '112,50', '1000 THB = 112,50 PLN');

  // wydatek
  await p.click('#cv-exp'); await p.waitForTimeout(600);
  const exp = await p.evaluate(async id => (await DB.byIndex('expenses', 'tripId', id)).map(e => `${e.amount} ${e.currency} ${e.date}`), ids.t);
  ok(exp.includes(`1000 THB ${ids.T}`), 'Dodaj jako wydatek: 1000 THB dziś – ' + JSON.stringify(exp));

  // kurs ręcznie (np. z kantoru) i zapamiętanie wyboru
  await p.fill('.cv-rate-row[data-cur="USD"] input', '3,80'); await p.press('.cv-rate-row[data-cur="USD"] input', 'Tab'); await p.waitForTimeout(800);
  const t2 = await p.evaluate(async id => DB.get('trips', id), ids.t);
  ok(t2.rates.USD === 3.8 && t2.ratesInfo.USD.src === 'ręcznie', 'kurs wpisany ręcznie: 3,80, źródło „ręcznie”');
  ok(/wpisany ręcznie/.test(await txt('.cv-rate-row[data-cur="USD"]')), 'wiersz: „wpisany ręcznie”');
  ok(await p.inputValue('#cv-from') === 'THB' && await p.inputValue('#cv-amt') === '1000', 'po zapisie kursu: waluty i kwota zostają');
  // dodaj walutę
  await p.selectOption('#cv-add', 'JPY'); await p.waitForTimeout(700);
  ok((await p.$$eval('.cv-rate-row', r => r.map(x => x.dataset.cur))).includes('JPY'), 'dodana waluta JPY');
  // budżet: kurs z NBP przez budżet ma źródło
  await p.goto(B + `#/budzet/${ids.t}`); await p.waitForTimeout(800);
  ok(/1000 THB|1 000 THB/.test(await txt('#bg-list')), 'budżet: wydatek z przelicznika');

  // ---------- offline ----------
  await p.goto(B + `#/waluty/${ids.t}`); await p.waitForTimeout(800);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(1200);
  ok(/offline – zapisane kursy/.test(await txt('#view')) && await p.isDisabled('#cv-nbp'), 'offline: przycisk NBP wyłączony, informacja');
  await p.selectOption('#cv-from', 'VND'); await p.selectOption('#cv-to', 'PLN'); await p.fill('#cv-amt', '50000'); await p.waitForTimeout(150);
  ok(await res() === '7,40', 'offline: 50 000 VND = 7,40 PLN');
  await p.screenshot({ path: `${SP}/t44-waluty.png`, fullPage: true });
  await ctx.setOffline(false);

  // ---------- angielski ----------
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'en'));
  await p.reload(); await p.waitForTimeout(1000);
  const en = await txt('#view');
  const pl = ['Kwota', 'Ściąga', 'Kursy na drogę', 'Dodaj', 'wpisany ręcznie', 'Pobierz', 'Kursy zapisują', 'brak kursu'].filter(w => en.includes(w));
  ok(!pl.length, 'angielski: bez polskich tekstów ' + JSON.stringify(pl));
  ok(/Currencies/.test(await txt('#title')) && /Rates for the road/i.test(en), 'angielski: tytuł i sekcje');

  console.log(`NBP zapytań: ${nbpCalls}`);
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL OK');
  console.log('errors:', errs);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
