// t62: dokumenty – formularz dopasowuje się do rodzaju (etykiety, podpowiedzi, pola), nazwa własna (szczepienie, wiza), odmiana
// „ważna / ważne”, karta zapisuje tylko 4 cyfry i pokazuje je zamaskowane, ostrzeżenia o podróży nie dotyczą szczepień, język niemiecki.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:8765/podroznik/';
(async () => {
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(B + '#/dokumenty/nowy'); await p.waitForSelector('#doc-form', { timeout: 10000 });
  const lab = id => p.textContent(id);
  const vis = async sel => !(await p.$eval(sel, e => e.hidden));
  // paszport (domyślny)
  ok(await lab('#l-number') === 'Numer paszportu' && await p.getAttribute('[name=number]', 'placeholder') === 'np. EA1234567', 'paszport: „Numer paszportu”, podpowiedź EA1234567');
  ok(!(await vis('#f-name')), 'paszport: brak pola Nazwa');
  // szczepienie
  await p.click('.type-chip:has(input[value=szczepienie])');
  ok(await lab('#l-issued') === 'Data szczepienia' && /Następna dawka/.test(await lab('#l-expires')) && await lab('#l-country') === 'Kraj szczepienia', 'szczepienie: etykiety dat i kraju');
  ok(await vis('#f-name') && await lab('#l-name') === 'Nazwa szczepienia' && /żółta febra/.test(await p.getAttribute('[name=name]', 'placeholder')), 'szczepienie: pole „Nazwa szczepienia” z podpowiedzią');
  ok(/dawka 2 z 3/.test(await p.getAttribute('[name=note]', 'placeholder')), 'szczepienie: podpowiedź do notatki');
  // wiza
  await p.click('.type-chip:has(input[value=wiza])');
  ok(await lab('#l-issued') === 'Ważna od' && await lab('#l-expires') === 'Ważna do' && await lab('#l-name') === 'Rodzaj wizy' && await lab('#l-country') === 'Kraj, którego dotyczy', 'wiza: Ważna od / do, rodzaj wizy, kraj, którego dotyczy');
  // karta
  await p.click('.type-chip:has(input[value=karta])');
  ok(!(await vis('#f-country')) && !(await vis('#f-issued')) && await vis('#h-type') && /ostatnie 4 cyfry/.test(await lab('#h-type')), 'karta: ukryte kraj i data wydania, ostrzeżenie o numerze');
  // zapis: szczepienie z nazwą
  const T0 = await p.evaluate(() => App.todayStr());
  await p.evaluate(async () => { const T0 = App.todayStr(); await DB.put('trips', { name: 'Tajlandia', destination: 'Tajlandia', start: App.addDays(T0, 10), end: App.addDays(T0, 20) }); });
  const save = async (type, f) => {
    await p.goto(B + '#/dokumenty/nowy'); await p.waitForSelector('#doc-form');
    await p.click(`.type-chip:has(input[value=${type}])`);
    for (const [k, v] of Object.entries(f)) await p.fill(`[name=${k}]`, v);
    await p.click('#doc-form button[type=submit]'); await p.waitForTimeout(500);
  };
  const plus = async n => p.evaluate(x => App.addDays(App.todayStr(), x), n);
  await save('szczepienie', { name: 'Żółta febra', person: 'Ania', expires: await plus(5) });
  await save('wiza', { name: 'Turystyczna', person: 'Ania', country: 'Tajlandia', expires: await plus(200) });
  await save('karta', { number: '4111 1111 1111 9876', person: 'Ania', expires: await plus(400) });
  await save('paszport', { number: 'ea1234567', person: 'Ania', expires: await plus(15) });
  await p.goto(B + '#/dokumenty'); await p.waitForSelector('.doc-card');
  const cards = await p.$$eval('.doc-card', n => n.map(e => e.innerText.replace(/\s+/g, ' ')));
  const find = re => cards.find(c => re.test(c)) || '';
  const vac = find(/Żółta febra/), visa = find(/Turystyczna/), card = find(/Karta płatnicza/), pass = find(/Paszport/);
  ok(/Żółta febra – Ania/.test(vac) && !/Szczepienie –/.test(vac), 'szczepienie: karta z własną nazwą „' + vac.slice(0, 40) + '”');
  ok(/wkrótce wygasa/.test(vac) && /ważne jeszcze/.test(vac) && !/Wygaśnie przed końcem/.test(vac), 'szczepienie: „ważne jeszcze…”, bez ostrzeżenia o podróży');
  ok(/ważna jeszcze/.test(visa) && /ważna/.test(visa), 'wiza: odmiana żeńska „ważna jeszcze”');
  ok(/•••• 9876/.test(card) && !/4111/.test(card), 'karta: tylko 4 cyfry, zamaskowane (' + (card.match(/•••• \d+/) || [''])[0] + ')');
  ok(/EA1234567/.test(pass) && /Wygaśnie przed końcem podróży/.test(pass), 'paszport: numer wielkimi literami i ostrzeżenie o podróży');
  // szczegóły szczepienia
  await p.click('.doc-card:has-text("Żółta febra")'); await p.waitForSelector('.doc-head');
  const det = (await p.textContent('#view')).replace(/\s+/g, ' ');
  ok(/Szczepienie/.test(det) && /Następna dawka \/ ważne do/.test(det), 'szczegóły szczepienia: rodzaj i „Następna dawka / ważne do”');
  // edycja zachowuje typ i nazwę
  await p.click('a[aria-label="Edytuj"]'); await p.waitForSelector('#doc-form');
  ok(await p.inputValue('[name=name]') === 'Żółta febra' && await p.isChecked('input[value=szczepienie]') && await lab('#l-issued') === 'Data szczepienia', 'edycja: typ, nazwa i etykiety zachowane');
  // niemiecki
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'de'); return DB.setSetting('lang', 'de'); });
  await p.goto(B + '#/dokumenty/nowy'); await p.reload(); await p.waitForSelector('#doc-form');
  await p.click('.type-chip:has(input[value=wiza])'); await p.waitForTimeout(500);
  ok(await lab('#l-issued') === 'Gültig ab' && await lab('#l-name') === 'Visumart', 'DE: etykiety po zmianie rodzaju (Gültig ab, Visumart)');
  await p.goto(B + '#/dokumenty'); await p.waitForSelector('.doc-card'); await p.waitForTimeout(500);
  ok(/noch .* gültig/.test(await p.textContent('#view')), 'DE: „noch … gültig”');
  ok(!errs.length, 'bez błędów JS ' + errs.slice(0, 2).join(' | '));
  await p.screenshot({ path: 'podroznik-testy/t62-dokumenty.png' });
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
