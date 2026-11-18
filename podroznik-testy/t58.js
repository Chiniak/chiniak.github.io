// t58: konto – ekran #/konto: założenie konta przez Google i Facebooka, łączenie obu w jeden profil, odłączanie, ostatni dostawca,
// logowanie drugim dostawcą na nowym telefonie → ten sam profil. Emulator Firebase (porty 8085/9099), bez niego test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const get = url => new Promise(res => { const r = http.request(url, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); r.on('error', () => res(0)); r.end(); });
const gtok = (sub, email) => JSON.stringify({ sub, email, email_verified: true, name: sub });
const ftok = (sub, email) => JSON.stringify({ sub, name: 'Ania FB', email });
(async () => {
  if (!(await get('http://127.0.0.1:8085/'))) { console.log('SKIP brak emulatora'); return; }
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone() {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => { localStorage.setItem('podroznik-emu', '1'); localStorage.setItem('podroznik-emu-fb', '1'); });
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const suf = Date.now().toString(36), mail = `ania.${suf}@example.com`;
  const A = await phone();
  await A.goto(B + '#/konto'); await A.waitForSelector('[data-sign="google.com"]', { timeout: 15000 });
  ok(await A.$('[data-sign="facebook.com"]') !== null, 'ekran bez konta: przyciski Google i Facebook');
  const uid0 = await A.evaluate(() => App.Social.profile());
  // konto przez Facebooka
  const a1 = await A.evaluate(t => App.Social.signInFacebook({ accessToken: t }), ftok('fb-' + suf, mail));
  ok(a1 && a1.facebook && !a1.google, 'konto założone przez Facebooka');
  ok(await A.evaluate(() => App.Social.profile()) === uid0, 'ten sam profil po założeniu konta');
  await A.reload(); await A.waitForSelector('[data-prov]', { timeout: 15000 });
  ok(await A.$('[data-unlink]') === null, 'jedyny dostawca – brak „Odłącz”');
  const e1 = await A.evaluate(() => App.Social.unlink('facebook.com').then(() => 'ok', e => e.code));
  ok(e1 === 'last-provider', 'nie da się odłączyć jedynego dostawcy: ' + e1);
  // dołącz Google
  const a2 = await A.evaluate(t => App.Social.signInGoogle({ idToken: t }), gtok('g-' + suf, mail));
  ok(a2 && a2.google && a2.facebook, 'Google dołączony do konta Facebook');
  ok(await A.evaluate(() => App.Social.profile()) === uid0, 'nadal ten sam profil');
  await A.reload(); await A.waitForSelector('[data-unlink]', { timeout: 15000 });
  ok(await A.$$eval('[data-unlink]', n => n.length) === 2, 'oba połączone – „Odłącz” przy obu');
  // nowy telefon: logowanie samym Google → ten sam profil
  await A.waitForTimeout(2000);
  const A2 = await phone();
  await A2.evaluate(t => App.Social.signInGoogle({ idToken: t }), gtok('g-' + suf, mail));
  ok(await A2.evaluate(() => App.Social.profile()) === uid0, 'nowy telefon: Google → ten sam profil co Facebook');
  // odłącz Facebooka
  await A.click('[data-unlink="facebook.com"]'); await A.waitForTimeout(1500);
  const acc = await A.evaluate(() => App.Social.account());
  ok(acc && acc.google && !acc.facebook, 'Facebook odłączony, Google zostaje');
  const fbdoc = await A.evaluate(async id => { const f = await App.Sync.firebase(); return (await f.db.collection('fbids').doc(id).get()).exists; }, 'fb-' + suf);
  ok(fbdoc === false, 'wpis fbids usunięty');
  await A.waitForSelector('[data-sign="facebook.com"]', { timeout: 8000 });
  ok(true, 'po odłączeniu znowu „Połącz” przy Facebooku');
  // EN
  await A.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await A.reload(); await A.waitForSelector('.ac-list', { timeout: 15000 }); await A.waitForTimeout(400);
  ok(/Connected accounts/.test(await A.textContent('body')), 'EN: Connected accounts');
  await A.screenshot({ path: 'podroznik-testy/t58-konto.png' });
  const N = await phone(); await N.evaluate(() => DB.setSetting('lang', 'pl'));
  for (const p of [A, A2]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
