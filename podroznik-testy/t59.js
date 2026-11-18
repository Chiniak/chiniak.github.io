// t59: stały pasek Znajomi/Wiadomości w nagłówku (licznik), skrzynka #/wiadomosci, profil znajomego z pomysłami i „+”, mój profil.
// Emulator Firebase (8085/9099); bez niego test się pomija.
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
  // Ania: podróż dla znajomych z planem
  await A.evaluate(async () => {
    const T0 = App.todayStr();
    const t = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: App.addDays(T0, 20), end: App.addDays(T0, 23) });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T0, 21), time: '10:00', title: 'Torre de Belém', cat: 'zwiedzanie', place: 'Belém', order: 0 });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T0, 22), time: '', title: 'Pastéis de Belém', cat: 'jedzenie', place: '', order: 0 });
    await App.Social.setVisibility(t.id, 'friends');
  });
  // pasek w nagłówku na dowolnym ekranie
  await T.goto('http://localhost:8765/podroznik/#/podroze'); await T.waitForSelector('#social-top:not([hidden])', { timeout: 10000 });
  ok(await T.$$eval('#social-top a', n => n.length) === 2, 'pasek Znajomi + Wiadomości w nagłówku');
  await T.goto(B + '#/ustawienia'); await T.waitForTimeout(600);
  ok(!(await T.$eval('#social-top', n => n.hidden)), 'pasek widoczny także w Ustawieniach');
  // zaproszenie → licznik
  await T.evaluate(id => App.Social.addFriend(id), uidA);
  ok(await until(A, () => document.querySelector('#social-top .zn-dot') !== null, null, 12000), 'Ania: licznik zaproszeń na pasku');
  await A.click('#notif-btn'); await A.waitForSelector('#notif-pop [data-np-ok]', { timeout: 8000 });
  ok(/Tomek/.test(await A.textContent('#notif-pop')) && /Powiadomienia/.test(await A.textContent('#notif-pop')), 'dzwonek: panel z zaproszeniem od Tomka');
  await A.click('#notif-pop [data-np-ok]'); await A.waitForTimeout(800);
  ok(await A.evaluate(id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidT), 'zaproszenie przyjęte z panelu powiadomień');
  await A.keyboard.press('Escape'); ok(await A.$('#notif-pop') === null, 'Escape zamyka panel');
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA), 'znajomi');
  await T.evaluate(id => App.Social.startChat(id), uidA);
  await A.evaluate(id => App.Social.sendMessage(id, 'Cześć, zobacz mój plan Lizbony'), uidT);
  ok(await until(T, () => document.querySelector('#social-top a[href="#/wiadomosci"] .zn-dot') !== null, null, 12000), 'Tomek: licznik wiadomości na pasku');
  await T.click('#notif-btn'); await T.waitForSelector('#notif-pop .np-row', { timeout: 8000 });
  ok(/zobacz mój plan/.test(await T.textContent('#notif-pop')), 'dzwonek: nowa wiadomość w panelu');
  await T.click('#notif-scrim', { position: { x: 5, y: 600 } });
  ok(await T.$('#notif-pop') === null, 'kliknięcie obok zamyka panel');
  await T.click('#social-top a[href="#/wiadomosci"]'); await T.waitForSelector('.zn-row', { timeout: 8000 });
  ok(/Ania/.test(await T.textContent('#view')) && /zobacz mój plan/.test(await T.textContent('#view')), 'skrzynka: rozmowa z Anią i podgląd wiadomości');
  // profil znajomego: podróże + pomysły
  await T.goto(B + '#/znajomy/' + uidA); await T.waitForSelector('.zn-ideas', { timeout: 15000 });
  ok(/Pomysły od Ania/.test(await T.textContent('#view')) && await T.$$eval('.zn-ideas [data-take]', n => n.length) === 2, 'profil: pomysły z planów Ani (2 miejsca)');
  await T.evaluate(() => DB.put('trips', { name: 'Moja Portugalia', destination: 'Portugalia', start: '2027-05-01', end: '2027-05-05' }));
  await T.click('.zn-ideas [data-take="0"]'); await T.waitForTimeout(800);
  const mine = await T.evaluate(() => DB.all('planItems'));
  ok(mine.some(i => /Torre|Pastéis/.test(i.title) && /Ania/.test(i.note)), 'po „+” pomysł trafił do moich pomysłów z adnotacją od Ani');
  // mój profil
  await A.goto(B + '#/profil'); await A.waitForSelector('.zn-stats', { timeout: 15000 });
  const txt = await A.textContent('#view');
  ok(/1 znajomy/.test(txt) && /Lizbona/.test(txt) && /dla znajomych/.test(txt), 'mój profil: znajomi i widoczność podróży');
  // EN
  await T.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await T.goto(B + '#/wiadomosci'); await T.reload(); await T.waitForSelector('#view .li', { timeout: 10000 }); await T.waitForTimeout(500);
  ok(/Messages/.test(await T.textContent('#title')), 'EN: Messages');
  await T.screenshot({ path: 'podroznik-testy/t59-wiadomosci.png' });
  await T.click('#notif-btn'); await T.waitForTimeout(400); await T.screenshot({ path: 'podroznik-testy/t59-powiadomienia.png' });
  for (const p of [A, T]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
