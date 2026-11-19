// t64: usunięcie konta (wymóg Google Play) – Ania z kontem Google ma znajomego (Tomek), czat, podróż publiczną i dla znajomych,
// obserwuje Tomka i jest w Odkrywaj. Po „Usuń konto” na serwerze nie ma jej profilu, zaproszeń, wiadomości, podróży, kluczy,
// spisu publicznego, wpisu w Odkrywaj, wpisu e-mail, kopii na koncie; Tomek dostaje „bye”, jego wiadomości zostają u niego;
// konto Firebase znika (to samo konto Google → nowy, pusty profil); plany na telefonie zostają. Emulator Firebase (8085/9099).
const { chromium, devices } = require('playwright');
const http = require('http');
const get = url => new Promise(res => { const r = http.request(url, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); r.on('error', () => res(0)); r.end(); });
const gtok = (sub, email) => JSON.stringify({ sub, email, email_verified: true, name: sub });
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
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const until = async (p, fn, arg, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); }
    return false;
  };
  const suf = Date.now().toString(36), mail = `ania.${suf}@example.com`;
  const A = await phone(), T = await phone();
  await A.evaluate(() => DB.setSetting('myName', 'Ania')); await T.evaluate(() => DB.setSetting('myName', 'Tomek'));
  await A.evaluate(() => App.Social.enable()); await T.evaluate(() => App.Social.enable());
  await A.evaluate(t => App.Social.signInGoogle({ idToken: t }), gtok('g-' + suf, mail));
  const uidA = await A.evaluate(() => App.Social.profile()), uidT = await T.evaluate(() => App.Social.profile());
  // znajomi + czat
  await T.evaluate(id => App.Social.addFriend(id), uidA);
  ok(await until(A, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'in'), uidT), 'Ania dostała zaproszenie');
  await A.evaluate(id => App.Social.accept(id), uidT);
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA), 'znajomi');
  await A.evaluate(id => App.Social.sendMessage(id, 'Od Ani'), uidT);
  await T.evaluate(id => App.Social.sendMessage(id, 'Od Tomka'), uidA);
  ok(await until(A, () => DB.all('dms').then(a => a.length === 2)), 'czat w obie strony');
  // podróże i obserwowanie
  const tA = await A.evaluate(() => DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: '2027-05-01', end: '2027-05-05', color: '#0f6e6e' }).then(t => t.id));
  const tB = await A.evaluate(() => DB.put('trips', { name: 'Rzym', destination: 'Rzym', start: '2027-06-01', end: '2027-06-03', color: '#0f6e6e' }).then(t => t.id));
  await A.evaluate(id => App.Social.setVisibility(id, 'public'), tA);
  await A.evaluate(id => App.Social.setVisibility(id, 'friends'), tB);
  await A.evaluate(() => App.Social.setExplore(true));
  await A.evaluate(id => App.Social.follow(id), uidT);
  await T.evaluate(id => App.Social.follow(id), uidA);
  await A.waitForTimeout(2500); // kopia na koncie (1,5 s)
  const srv = (p, uid) => p.evaluate(async ({ uid, mail }) => {
    const f = await App.Sync.firebase(), d = f.db, ex = async r => (await r.get().catch(() => ({ exists: false }))).exists;
    const n = async q => (await q.get().catch(() => ({ size: -1 }))).size;
    const conv = [uid, ...Object.keys((await App.Social.state()).friends)].sort().join('_');
    return {
      people: await ex(d.collection('people').doc(uid)), index: await ex(d.collection('pub').doc(uid).collection('index').doc('public')),
      explore: await ex(d.collection('explore').doc(uid)), email: await ex(d.collection('emails').doc(mail)), vault: await ex(d.collection('vault').doc(uid)),
      trips: await n(d.collection('pub').doc(uid).collection('trips')), keys: await n(d.collection('pub').doc(uid).collection('keys')),
      followers: await n(d.collection('people').doc(uid).collection('followers')),
      mine: await n(d.collection('dm').doc(conv).collection('msgs').where('by', '==', uid)),
    };
  }, { uid, mail });
  const before = await srv(A, uidA);
  ok(before.people && before.index && before.explore && before.email && before.vault && before.trips === 2 && before.keys === 1 && before.followers === 1 && before.mine === 1,
    'przed: dane Ani na serwerze ' + JSON.stringify(before));
  // ekran konta: przycisk usuwania
  await A.goto(B + '#/konto'); await A.waitForSelector('#ac-del', { timeout: 15000 });
  ok(/Usuń konto/.test(await A.textContent('.ac-del')), 'ekran konta: sekcja „Usuń konto”');
  await A.click('#ac-del');
  ok(await until(A, () => /#\/ustawienia$/.test(location.hash), null, 20000), 'po usunięciu – powrót do Ustawień');
  ok(await until(A, () => App.Social.account().then(a => a === null)), 'telefon: brak konta');
  const uidA2 = await A.evaluate(async () => (await App.Sync.firebase()).auth.currentUser.uid);
  ok(uidA2 && uidA2 !== uidA, 'nowy anonimowy identyfikator');
  // serwer – czytane przez Tomka (Ania nie ma już uprawnień do swoich starych dokumentów)
  const tview = await T.evaluate(async ({ uid, mail, me }) => {
    const d = (await App.Sync.firebase()).db, ex = async r => (await r.get().catch(() => ({ exists: 'err' }))).exists;
    const conv = [uid, me].sort().join('_');
    const msgs = (await d.collection('dm').doc(conv).collection('msgs').get()).docs.map(x => x.data().by);
    return { people: await ex(d.collection('people').doc(uid)), index: await ex(d.collection('pub').doc(uid).collection('index').doc('public')),
      email: await ex(d.collection('emails').doc(mail)), keyForMe: await ex(d.collection('pub').doc(uid).collection('keys').doc(me)),
      fromAnia: msgs.filter(b => b === uid).length, fromMe: msgs.filter(b => b === me).length,
      explore: (await d.collection('explore').get()).docs.some(x => x.id === uid) };
  }, { uid: uidA, mail, me: uidT });
  ok(!tview.people && !tview.index && !tview.email && !tview.keyForMe && !tview.explore, 'serwer: profil, spis, e-mail, klucze, Odkrywaj usunięte ' + JSON.stringify(tview));
  ok(tview.fromAnia === 0 && tview.fromMe === 1, 'czat: wiadomości Ani usunięte, Tomka zostają');
  ok(await until(T, id => App.Social.state().then(s => !s.friends[id]), uidA), 'Tomek: Ania zniknęła ze znajomych (bye)');
  const after = await A.evaluate(async () => ({ trips: (await DB.all('trips')).length, dms: (await DB.all('dms')).length, st: await App.Social.state() }));
  ok(after.trips === 2 && after.dms === 0 && !Object.keys(after.st.friends).length && !Object.keys(after.st.trips).length, 'telefon: plany zostały, czat i znajomi usunięci');
  // to samo konto Google → nowy profil bez kopii
  await A.evaluate(t => App.Social.signInGoogle({ idToken: t }), gtok('g-' + suf, mail));
  const uidA3 = await A.evaluate(() => App.Social.profile());
  ok(uidA3 !== uidA, 'ponowne logowanie tym samym Google – nowy profil (stare konto usunięte)');
  ok(!Object.keys((await A.evaluate(() => App.Social.state())).friends).length, 'nowy profil bez starych znajomych');
  // EN
  await A.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await A.goto(B + '#/konto'); await A.reload(); await A.waitForSelector('#ac-del', { timeout: 15000 }); await A.waitForTimeout(400);
  ok(/Delete account/.test(await A.textContent('.ac-del')), 'EN: Delete account');
  await A.screenshot({ path: 'podroznik-testy/t64-usun.png', fullPage: true });
  await A.evaluate(() => DB.setSetting('lang', 'pl'));
  for (const p of [A, T]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
