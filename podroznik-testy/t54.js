// t54: znajomi – etap 2: konto Google (emulator Firebase, fałszywe tokeny Google): logowanie dołącza konto do profilu,
// szukanie po e-mailu, nowy telefon z tym samym kontem odtwarza znajomych, klucz, widoczność i historię czatu,
// ukrycie e-maila, reguły (obcy nie czyta kopii i nie podszyje się pod cudzy e-mail), wylogowanie.
// Bez emulatora (porty 8085/9099) test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const dir = process.argv[2] || 'podroznik-testy';
const get = url => new Promise(res => { const r = http.request(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', () => res({ status: 0, body: '' })); r.end(); });
const tok = (sub, email) => JSON.stringify({ sub, email, email_verified: true, name: sub });
(async () => {
  if (!(await get('http://127.0.0.1:8085/')).status) { console.log('SKIP brak emulatora Firestore (port 8085)'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone() {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const until = async (p, fn, arg, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); } return false; };
  const suf = Date.now().toString(36);
  const mailA = `ania.${suf}@example.com`, mailT = `tomek.${suf}@example.com`;
  const A = await phone(), T = await phone();

  // Ania: profil, podróż dla znajomych, logowanie Google
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-google', { timeout: 15000 });
  await A.fill('#zn-name-in', 'Ania'); await A.click('#zn-name button'); await A.waitForTimeout(600);
  const uidA0 = await A.evaluate(() => App.Social.profile());
  const acc = await A.evaluate(t => App.Social.signInGoogle({ idToken: t }), tok('ania-' + suf, mailA));
  ok(acc && acc.email === mailA, 'zalogowano: ' + (acc && acc.email));
  ok(await A.evaluate(() => App.Social.profile()) === uidA0, 'identyfikator bez zmian – profil dołączony do konta');
  await A.reload(); await A.waitForSelector('#zn-out', { timeout: 15000 });
  ok((await A.textContent('.zn-acc')).includes(mailA) && await A.isChecked('#zn-find') && await A.isChecked('#zn-vault'), 'ekran: konto, e-mail do znalezienia, kopia na koncie');
  const trip = await A.evaluate(async () => { const T0 = App.todayStr(); const t = await DB.put('trips', { name: 'Rzym', destination: 'Rzym', start: App.addDays(T0, 30), end: App.addDays(T0, 33) }); await App.Social.setVisibility(t.id, 'friends'); return t.id; });

  // Tomek: loguje się, szuka Ani po e-mailu
  await T.goto(B + '#/znajomi'); await T.waitForSelector('#zn-google', { timeout: 15000 });
  await T.fill('#zn-name-in', 'Tomek'); await T.click('#zn-name button'); await T.waitForTimeout(600);
  await T.evaluate(t => App.Social.signInGoogle({ idToken: t }), tok('tomek-' + suf, mailT));
  await T.reload(); await T.waitForSelector('#zn-mail', { timeout: 15000 });
  await T.fill('#zn-mail-in', mailA.toUpperCase()); await T.click('#zn-mail button');
  await T.waitForSelector('#zn-inv', { timeout: 10000 });
  ok(/Ania/.test(await T.textContent('.gd-intro')), 'znaleziona po e-mailu (wielkość liter bez znaczenia)');
  await T.click('#zn-inv button'); await T.waitForTimeout(800);
  ok(await until(A, () => !!document.querySelector('[data-ok]') || App.Social.state().then(s => Object.values(s.friends).some(f => f.state === 'in'))), 'Ania dostaje zaproszenie');
  const uidT = await T.evaluate(() => App.Social.profile());
  await A.evaluate(id => App.Social.accept(id), uidT);
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA0), 'znajomi');
  await T.evaluate(id => App.Social.sendMessage(id, 'Pierwsza wiadomość do Ani'), uidA0);
  ok(await until(A, () => DB.all('dms').then(a => a.some(m => /Pierwsza wiadomość/.test(m.text)))), 'Ania dostaje wiadomość');
  await A.waitForTimeout(2000); // kopia na koncie (co 1,5 s)

  // nowy telefon Ani – to samo konto Google
  const A2 = await phone();
  await A2.goto(B + '#/znajomi'); await A2.waitForSelector('#zn-google', { timeout: 15000 });
  const uidNew = await A2.evaluate(() => App.Social.profile());
  ok(uidNew !== uidA0, 'nowy telefon zaczyna od innego, anonimowego identyfikatora');
  await A2.evaluate(t => App.Social.signInGoogle({ idToken: t }), tok('ania-' + suf, mailA));
  ok(await A2.evaluate(() => App.Social.profile()) === uidA0, 'po zalogowaniu – identyfikator Ani z poprzedniego telefonu');
  const s2 = await A2.evaluate(() => App.Social.state());
  ok(s2.friends[uidT] && s2.friends[uidT].state === 'ok' && s2.friends[uidT].name === 'Tomek', 'odtworzeni znajomi');
  ok(Object.keys(s2.trips).length === 1 && Object.values(s2.trips)[0].vis === 'friends', 'odtworzona widoczność podróży');
  ok(await until(A2, () => DB.all('dms').then(a => a.some(m => /Pierwsza wiadomość/.test(m.text)))), 'historia czatu pobrana na nowy telefon');
  await A2.evaluate(id => App.Social.sendMessage(id, 'Piszę z nowego telefonu'), uidT);
  ok(await until(T, () => DB.all('dms').then(a => a.some(m => /nowego telefonu/.test(m.text)))), 'Tomek odczytuje wiadomość z nowego telefonu (ten sam klucz)');
  await A2.reload(); await A2.waitForSelector('#zn-out', { timeout: 15000 });
  ok(/Tomek/.test(await A2.textContent('main, body')), 'ekran: Tomek na liście');
  ok(await A2.inputValue('#zn-name-in') === 'Ania', 'odtworzone imię');
  await A2.screenshot({ path: `${dir}/t54-konto.png` });

  // ukrycie e-maila
  await A2.click('#zn-find'); await A2.waitForTimeout(800);
  ok(await T.evaluate(e => App.Social.findByEmail(e), mailA) === null, 'ukryty e-mail – nie da się znaleźć');
  await A2.click('#zn-find'); await A2.waitForTimeout(800);
  ok(await T.evaluate(e => App.Social.findByEmail(e), mailA) === uidA0, 'znowu widoczny');

  // reguły
  const r = await T.evaluate(async ([a, mail]) => {
    const f = await App.Sync.firebase(), out = {};
    const t = async (k, fn) => { try { await fn(); out[k] = 'ok'; } catch (e) { out[k] = e.code || 'err'; } };
    await t('vaultRead', () => f.db.collection('vault').doc(a).get());
    await t('emailSteal', () => f.db.collection('emails').doc(mail).set({ uid: f.auth.currentUser.uid }));
    await t('emailsList', () => f.db.collection('emails').get());
    return out; }, [uidA0, mailA]);
  ok(Object.values(r).every(v => v === 'permission-denied'), 'reguły: obcy nie czyta kopii, nie przejmie e-maila, nie wylistuje: ' + JSON.stringify(r));
  const anon = await (await phone()).evaluate(async () => { const f = await App.Sync.firebase(); try { await f.db.collection('vault').doc(f.auth.currentUser.uid).set({ v: 1 }); return 'ok'; } catch (e) { return e.code; } });
  ok(anon === 'permission-denied', 'anonimowy profil nie ma kopii na koncie');

  // wylogowanie
  await A2.click('#zn-out'); await A2.waitForTimeout(1500);
  const s3 = await A2.evaluate(() => App.Social.state());
  ok(!Object.keys(s3.friends).length && await A2.evaluate(() => DB.all('dms').then(a => a.length)) === 0, 'po wylogowaniu telefon bez znajomych i czatów');
  ok(await A2.evaluate(() => App.Social.account()) === null && await A2.$('#zn-google') !== null, 'z powrotem „Zaloguj kontem Google”');

  // EN
  await T.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await T.goto(B + '#/znajomi'); await T.reload(); await T.waitForSelector('#zn-out', { timeout: 15000 }); await T.waitForTimeout(400);
  const en = (await T.textContent('.zn-acc')).replace(/\s+/g, ' ');
  ok(/Google account/.test(en) && /Sign out/.test(en) && /Friends can find me by e-mail/.test(en), 'EN: ' + en.slice(0, 120));
  await T.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  for (const p of [A, T, A2]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
