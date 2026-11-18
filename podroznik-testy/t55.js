// t55: znajomi – etap 3: Facebook (emulator Firebase, fałszywe tokeny Facebooka, lista znajomych z Graph API podana w teście):
// logowanie przez Facebooka, rejestracja fbids, znajomi z Facebooka, którzy są w Tripwillow → zaproszenie, reguły fbids, przycisk ukryty bez konfiguracji.
// Bez emulatora (porty 8085/9099) test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const dir = process.argv[2] || 'podroznik-testy';
const get = url => new Promise(res => { const r = http.request(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', () => res({ status: 0, body: '' })); r.end(); });
(async () => {
  if (!(await get('http://127.0.0.1:8085/')).status) { console.log('SKIP brak emulatora Firestore (port 8085)'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone(fbOn = true) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(on => { localStorage.setItem('podroznik-emu', '1'); if (on) localStorage.setItem('podroznik-emu-fb', '1'); }, fbOn);
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const suf = Date.now().toString(36);
  const fbA = 'fbA' + suf, fbT = 'fbT' + suf;
  const tok = (sub, name) => JSON.stringify({ sub, name, email: `${sub}@example.com` });

  const N = await phone(false);
  await N.goto(B + '#/znajomi'); await N.waitForSelector('#zn-google', { timeout: 15000 });
  ok(await N.$('#zn-facebook') === null, 'bez konfiguracji Facebooka – brak przycisku');

  const A = await phone(), T = await phone();
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-facebook', { timeout: 15000 });
  ok(/Zaloguj przez Facebooka/.test(await A.textContent('#zn-facebook')), 'przycisk „Zaloguj przez Facebooka”');
  await A.fill('#zn-name-in', 'Ania'); await A.click('#zn-name button'); await A.waitForTimeout(500);
  const accA = await A.evaluate(t => App.Social.signInFacebook({ accessToken: t }), tok(fbA, 'Ania Kowalska'));
  ok(accA && accA.facebook, 'Ania: konto Facebook połączone');
  const uidA = await A.evaluate(() => App.Social.profile());
  await A.reload(); await A.waitForSelector('#zn-fbfriends', { timeout: 15000 });
  ok(/Konto Facebook/.test(await A.textContent('.zn-acc')) && await A.$('#zn-google') !== null, 'ekran: konto Facebook + „Dołącz też konto Google”');

  await T.goto(B + '#/znajomi'); await T.waitForSelector('#zn-facebook', { timeout: 15000 });
  await T.fill('#zn-name-in', 'Tomek'); await T.click('#zn-name button'); await T.waitForTimeout(500);
  await T.evaluate(t => App.Social.signInFacebook({ accessToken: t }), tok(fbT, 'Tomek Nowak'));
  // Graph API zwraca znajomych, którzy też używają aplikacji: Ania + ktoś bez Tripwillow
  const fbIdA = await A.evaluate(() => App.Sync.firebase().then(f => f.auth.currentUser.providerData.find(p => p.providerId === 'facebook.com').uid));
  const list = await T.evaluate(g => App.Social.facebookFriends({ graph: g }), [{ id: fbIdA, name: 'Ania Kowalska' }, { id: '999999', name: 'Ktoś Inny' }]);
  ok(list.length === 1 && list[0].uid === uidA && list[0].name === 'Ania', 'znajomi z Facebooka w Tripwillow: ' + JSON.stringify(list.map(x => x.name)));
  await T.evaluate(id => App.Social.addFriend(id), uidA);
  const ok2 = await (async () => { const end = Date.now() + 10000; while (Date.now() < end) { if (await A.evaluate(id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'in'), await T.evaluate(() => App.Social.profile()))) return true; await A.waitForTimeout(250); } return false; })();
  ok(ok2, 'Ania dostaje zaproszenie od znajomego z Facebooka');

  // reguły: nie można podpiąć cudzego identyfikatora Facebooka
  const r = await T.evaluate(async id => { const f = await App.Sync.firebase(); try { await f.db.collection('fbids').doc(id).set({ uid: f.auth.currentUser.uid }); return 'ok'; } catch (e) { return e.code; } }, fbIdA);
  ok(r === 'permission-denied', 'reguły: cudzy identyfikator Facebooka zablokowany');
  const r2 = await N.evaluate(async () => { const f = await App.Sync.firebase(); try { await f.db.collection('fbids').doc('123').set({ uid: f.auth.currentUser.uid }); return 'ok'; } catch (e) { return e.code; } });
  ok(r2 === 'permission-denied', 'reguły: anonimowy nie zapisze fbids');
  // kopia na koncie działa też dla konta Facebook
  await A.waitForTimeout(2000);
  const v = await A.evaluate(async () => { const f = await App.Sync.firebase(); const d = await f.db.collection('vault').doc(f.auth.currentUser.uid).get(); return d.exists; });
  ok(v, 'kopia na koncie dla konta Facebook');

  // EN
  await A.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await A.reload(); await A.waitForSelector('#zn-fbfriends', { timeout: 15000 }); await A.waitForTimeout(400);
  ok(/Facebook friends on Tripwillow/.test(await A.textContent('#zn-fbfriends')), 'EN: ' + await A.textContent('#zn-fbfriends'));
  await A.screenshot({ path: `${dir}/t55-fb.png` });

  for (const p of [A, T, N]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
