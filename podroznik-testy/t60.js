// t60: wysyłanie w czacie pomysłu z planu i podróży (karty w wiadomościach), „+” przy odebranym pomyśle, otwarcie podróży z karty,
// udostępnienie prywatnej podróży przy wysyłaniu, odrzucenie złośliwych pól. Emulator Firebase (8085/9099); bez niego pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const get = url => new Promise(res => { const r = http.request(url, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); r.on('error', () => res(0)); r.end(); });
(async () => {
  if (!(await get('http://127.0.0.1:8085/'))) { console.log('SKIP brak emulatora'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone() {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/znajomi'); await p.waitForSelector('#zn-name', { timeout: 15000 });
    return p;
  }
  const until = async (p, fn, arg, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); } return false; };
  const A = await phone(), T = await phone();
  for (const [p, n] of [[A, 'Ania'], [T, 'Tomek']]) { await p.fill('#zn-name-in', n); await p.click('#zn-name button'); await p.waitForTimeout(500); }
  const uidA = await A.evaluate(() => App.Social.profile()), uidT = await T.evaluate(() => App.Social.profile());
  await T.evaluate(id => App.Social.addFriend(id), uidA);
  ok(await until(A, () => App.Social.state().then(s => Object.values(s.friends).some(f => f.state === 'in'))), 'zaproszenie dotarło');
  await A.evaluate(id => App.Social.accept(id), uidT);
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA), 'znajomi');
  await A.evaluate(id => App.Social.startChat(id), uidT); await T.evaluate(id => App.Social.startChat(id), uidA);
  // Ania ma prywatną podróż z planem
  const tripId = await A.evaluate(async () => {
    const T0 = App.todayStr();
    const t = await DB.put('trips', { name: 'Wiedeń', destination: 'Wiedeń', start: App.addDays(T0, 10), end: App.addDays(T0, 12) });
    await DB.put('planItems', { tripId: t.id, date: '', time: '', title: 'Café Central', cat: 'jedzenie', place: 'Herrengasse 14', order: 0 });
    return t.id;
  });
  await A.goto(B + '#/czat/' + uidT); await A.waitForSelector('#zn-attach', { timeout: 10000 });
  // pomysł
  await A.click('#zn-attach'); await A.waitForSelector('.tp-sheet [data-idea]', { timeout: 5000 });
  ok(await A.$('.tp-sheet [data-trip]') !== null, 'arkusz: podróże i pomysły');
  await A.click('.tp-sheet [data-idea="0"]'); await A.waitForTimeout(800);
  ok(/Café Central/.test(await A.textContent('.rz-chat')) && await A.$('.rz-chat .zn-card') !== null, 'Ania widzi swoją kartę pomysłu');
  await T.goto(B + '#/czat/' + uidA); await T.waitForSelector('.rz-chat .zn-card', { timeout: 12000 });
  ok(/Café Central/.test(await T.textContent('.rz-chat')) && await T.$('.rz-chat .zn-take') !== null, 'Tomek dostaje kartę pomysłu z „+”');
  ok(await A.$('.rz-chat .zn-take') === null, 'u nadawcy brak „+”');
  await T.evaluate(() => DB.put('trips', { name: 'Moja Austria', destination: 'Austria', start: '2027-06-01', end: '2027-06-04' }));
  await T.click('.rz-chat .zn-take'); await T.waitForTimeout(800);
  ok((await T.evaluate(() => DB.all('planItems'))).some(i => i.title === 'Café Central' && /Ania/.test(i.note)), 'po „+” pomysł w moich pomysłach (od Ani)');
  // podróż prywatna → udostępnienie przy wysyłaniu
  ok(await A.evaluate(id => App.Social.visibility(id), tripId) === 'private', 'podróż Ani jest prywatna');
  await A.click('#zn-attach'); await A.waitForSelector('.tp-sheet [data-trip]', { timeout: 5000 });
  await A.click('.tp-sheet [data-trip]'); await A.waitForTimeout(1500);
  ok(await A.evaluate(id => App.Social.visibility(id), tripId) === 'friends', 'wysłanie podróży udostępniło ją znajomym');
  await T.waitForSelector('.rz-chat a.zn-card', { timeout: 12000 }).catch(() => {});
  await T.reload(); await T.waitForSelector('.rz-chat a.zn-card', { timeout: 12000 });
  await T.click('.rz-chat a.zn-card'); await T.waitForSelector('.zn-day, .gd-intro, h2', { timeout: 10000 }); await T.waitForTimeout(1200);
  ok(/Wiedeń/.test(await T.textContent('#view')), 'karta podróży otwiera plan Ani');
  // oczyszczanie: złośliwe pola
  const clean = await A.evaluate(async id => { const r = await App.Social.sendMessage(id, '', { k: 'idea', it: { title: 'X'.repeat(500), place: 'https://zly.example', cat: 'inne', evil: 1 }, extra: 1 }); return r.share; }, uidT);
  ok(clean && clean.it.title.length === 120 && clean.it.place === '' && !('evil' in clean.it), 'pola załącznika przycięte i oczyszczone');
  ok(await A.evaluate(id => App.Social.sendMessage(id, '', { k: 'trip', doc: '../x' }), uidT) === null, 'zły identyfikator podróży odrzucony');
  // skrzynka pokazuje podpis załącznika
  await T.goto(B + '#/wiadomosci'); await T.waitForSelector('.zn-row', { timeout: 8000 });
  ok(/Wiedeń|XXXX/.test(await T.textContent('#view')), 'skrzynka: podgląd załącznika');
  await T.goto(B + '#/czat/' + uidA); await T.waitForSelector('.rz-chat', { timeout: 8000 }); await T.waitForTimeout(500);
  await T.screenshot({ path: 'podroznik-testy/t60-czat.png' });
  for (const p of [A, T]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
