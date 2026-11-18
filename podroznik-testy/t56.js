// t56: obserwowanie i Odkrywaj (social.js, znajomi.js) – emulator Firebase: podróż publiczna w Odkrywaj (za zgodą),
// obca osoba ją widzi, bierze pomysł do swojej podróży („+”), obserwuje autora, widzi nowe podróże, licznik obserwujących,
// prywatna znika z Odkrywaj i z obserwowanych, reguły, EN. Bez emulatora test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const dir = process.argv[2] || 'podroznik-testy';
const get = url => new Promise(res => { const r = http.request(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', () => res({ status: 0, body: '' })); r.end(); });
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
  const A = await phone(), K = await phone();
  const name = 'Ania' + Date.now().toString(36).slice(-4);
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-name-in', { timeout: 15000 });
  await A.fill('#zn-name-in', name); await A.click('#zn-name button'); await A.waitForTimeout(500);
  const uidA = await A.evaluate(() => App.Social.profile());
  const tr = await A.evaluate(async () => { const T0 = App.todayStr();
    const t = await DB.put('trips', { name: 'Islandia', destination: 'Reykjavík', start: App.addDays(T0, 40), end: App.addDays(T0, 47), color: '#4a7fd6' });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T0, 41), time: '09:00', title: 'Złoty Krąg', cat: 'natura', place: 'Þingvellir', lat: 64.255, lon: -21.13, order: 0 });
    await DB.put('planItems', { tripId: t.id, date: '', time: '', title: 'Błękitna Laguna', cat: 'natura', order: 0 });
    const p = await DB.put('trips', { name: 'Prywatna', start: App.addDays(T0, 60), end: App.addDays(T0, 61) });
    await App.Social.setVisibility(t.id, 'public');
    return { t: t.id, p: p.id }; });
  // zgoda na Odkrywaj
  await A.goto(B + '#/odkrywaj-ludzi'); await A.waitForSelector('#zn-explore', { timeout: 15000 });
  ok(await A.$$eval('.zn-tabs a', e => e.length) === 3, 'zakładki: Znajomi · Obserwuję · Odkrywaj');
  await A.click('#zn-explore'); await A.waitForTimeout(1200);
  ok(await A.isChecked('#zn-explore'), 'Ania pokazuje publiczne podróże w Odkrywaj');

  // Kasia: Odkrywaj → podróż Ani → „+” pomysł do swojej podróży
  const mine = await K.evaluate(async () => (await DB.put('trips', { name: 'Moja Islandia', start: '2027-07-01', end: '2027-07-07' })).id);
  await K.goto(B + '#/odkrywaj-ludzi'); await K.waitForSelector('.zn-tabs', { timeout: 15000 }); await K.waitForTimeout(500);
  const feed = (await K.textContent('main, body')).replace(/\s+/g, ' ');
  ok(feed.includes(name) && /Islandia/.test(feed) && !/Prywatna/.test(feed), 'Kasia widzi podróż Ani w Odkrywaj (bez prywatnej)');
  await K.screenshot({ path: `${dir}/t56-odkrywaj.png` });
  await K.click(`.zn-feed:has-text("${name}")`); await K.waitForSelector('.zn-day', { timeout: 10000 });
  ok(/Złoty Krąg/.test(await K.textContent('main, body')), 'podgląd planu');
  await K.click('.zn-ev-it:has-text("Złoty Krąg") .zn-take'); await K.waitForTimeout(600);
  const took = await K.evaluate(id => DB.byIndex('planItems', 'tripId', id), mine);
  ok(took.length === 1 && took[0].title === 'Złoty Krąg' && took[0].date === '' && took[0].lat === 64.255 && took[0].note.includes(name), 'pomysł trafił do „Moja Islandia” jako punkt bez dnia');
  ok(await K.$eval('.zn-ev-it:has-text("Złoty Krąg") .zn-take', e => e.classList.contains('done')), 'przycisk „+” → ✓');
  await K.screenshot({ path: `${dir}/t56-pomysl.png` });

  // obserwowanie
  await K.click('.zn-addowner'); await K.waitForSelector('#zn-follow', { timeout: 10000 });
  ok(/Obserwuj/.test(await K.textContent('#zn-follow')) && /1 podróż publiczna/.test(await K.textContent('.zn-prof')), 'profil autora: 1 podróż publiczna, „Obserwuj”');
  await K.click('#zn-follow'); await K.waitForTimeout(800);
  ok(/Obserwujesz/.test(await K.textContent('#zn-follow')), 'obserwuje');
  await K.goto(B + '#/obserwowani'); await K.waitForSelector('.zn-tabs'); await K.waitForTimeout(800);
  ok((await K.textContent('main, body')).includes('Islandia'), 'zakładka Obserwuję: podróż Ani');
  // Ania dodaje nową podróż publiczną → u Kasi w obserwowanych
  await A.evaluate(async () => { const T0 = App.todayStr(); const t = await DB.put('trips', { name: 'Norwegia', start: App.addDays(T0, 90), end: App.addDays(T0, 95) }); await App.Social.setVisibility(t.id, 'public'); });
  await K.reload(); await K.waitForSelector('.zn-tabs'); await K.waitForTimeout(800);
  ok((await K.textContent('main, body')).includes('Norwegia'), 'nowa podróż obserwowanej osoby');
  ok(await A.evaluate(() => App.Social.followersCount()) === 1, 'Ania: 1 obserwujący');

  // prywatna → znika
  await A.evaluate(id => App.Social.setVisibility(id, 'private'), tr.t); await A.waitForTimeout(800);
  await K.reload(); await K.waitForSelector('.zn-tabs'); await K.waitForTimeout(800);
  const after = await K.textContent('main, body');
  ok(!after.includes('Islandia') && after.includes('Norwegia'), 'podróż zmieniona na prywatną znika u obserwujących');
  await K.goto(B + '#/odkrywaj-ludzi'); await K.reload(); await K.waitForSelector('.zn-tabs'); await K.waitForTimeout(800);
  ok(!(await K.textContent('main, body')).includes('Islandia'), '…i z Odkrywaj');

  // reguły
  const r = await K.evaluate(async a => {
    const f = await App.Sync.firebase(), out = {};
    const t = async (k, fn) => { try { await fn(); out[k] = 'ok'; } catch (e) { out[k] = e.code || 'err'; } };
    await t('fakeIndex', () => f.db.collection('pub').doc(a).collection('index').doc('public').set({ name: 'x', t: f.now(), v: 1, trips: [] }));
    await t('fakeExplore', () => f.db.collection('explore').doc(a).set({ name: 'x', t: f.now(), v: 1, trips: [] }));
    await t('followersList', () => f.db.collection('people').doc(a).collection('followers').get());
    return out; }, uidA);
  ok(Object.values(r).every(v => v === 'permission-denied'), 'reguły: obcy nie zmieni spisu, Odkrywaj ani nie wylistuje obserwujących: ' + JSON.stringify(r));

  // EN
  await K.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await K.goto(B + '#/obserwowani'); await K.reload(); await K.waitForSelector('.zn-tabs', { timeout: 15000 }); await K.waitForTimeout(400);
  const en = (await K.textContent('.zn-tabs')).replace(/\s+/g, ' ');
  ok(/Friends/.test(en) && /Following/.test(en) && /Explore/.test(en), 'EN: ' + en);

  for (const p of [A, K]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
