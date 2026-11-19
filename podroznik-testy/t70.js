// t70: powiadomienia o wiadomościach przy zamkniętej aplikacji – całość na emulatorze Firebase:
// strona (push.js) buduje konfigurację u Tomka → Java (PushCheck, test JVM w podroznik-app) pyta Firestore REST
// tokenem Tomka i odszyfrowuje: czat wspólnej podróży (Ania), czat 1:1 (Ania), zaproszenie (Celina); bez własnych i systemowych.
// Bez emulatora (porty 8085/9099) test się pomija; bez Androida SDK – pomija część z Javą.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
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
  const until = async (p, fn, arg, ms = 12000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); } return false; };
  const A = await phone(), T = await phone(), C = await phone();

  // znajomi: Ania ↔ Tomek
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-name-in', { timeout: 15000 });
  await A.fill('#zn-name-in', 'Ania'); await A.click('#zn-name button'); await A.waitForTimeout(800);
  const uidA = (await A.evaluate(() => App.Social.myLink())).split('#z.')[1];
  await T.goto(B + 'dolacz.html#z.' + uidA); await T.waitForSelector('#zn-inv', { timeout: 15000 });
  await T.fill('#zn-inv input[name=n]', 'Tomek'); await T.click('#zn-inv button'); await T.waitForTimeout(1200);
  const uidT = await T.evaluate(() => App.Social.profile());
  ok(await until(A, () => !!document.querySelector('[data-ok]')), 'Ania: zaproszenie od Tomka');
  await A.click('[data-ok]');
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA), 'Ania i Tomek – znajomi');

  // wspólna podróż: Ania zaprasza, Tomek dołącza
  const trip = await A.evaluate(async () => { const T0 = App.todayStr(); return (await DB.put('trips', { name: 'Rzym razem', destination: 'Rzym', start: App.addDays(T0, 10), end: App.addDays(T0, 13) })).id; });
  await A.goto(B + `#/razem/${trip}`); await A.waitForSelector('#rz-start', { timeout: 15000 });
  await A.fill('#rz-start input[name=name]', 'Ania'); await A.click('#rz-start button');
  ok(await until(A, id => !!App.Sync.link(id), trip), 'Ania: link zaproszenia');
  const code = (await A.evaluate(id => App.Sync.link(id), trip)).split('#')[1];
  await T.goto(B + 'dolacz.html#' + code);
  ok(await until(T, () => !!document.querySelector('#rz-join')), 'Tomek: ekran dołączenia');
  await T.fill('#rz-join input[name=name]', 'Tomek'); await T.click('#rz-join button');
  ok(await until(T, id => location.hash === `#/razem/${id}?z=czat`, trip, 15000), 'Tomek dołączył');
  await T.waitForTimeout(1500);

  // konfiguracja powiadomień u Tomka (tak jak przy schowaniu aplikacji)
  const cfg = await T.evaluate(() => App.Push.build());
  ok(cfg && cfg.uid === uidT && cfg.refreshToken && cfg.rooms.length === 1 && cfg.rooms[0].name === 'Rzym razem', 'konfiguracja: użytkownik, token, pokój „Rzym razem”');
  ok(cfg.friends.length === 1 && cfg.friends[0].name === 'Ania' && cfg.friends[0].conv === [uidA, uidT].sort().join('_') && cfg.friends[0].aes.length === 43, 'konfiguracja: znajoma Ania z kluczem rozmowy');
  ok(cfg.inbox === true && /Zaproszenie/.test(cfg.texts.reqTitle), 'konfiguracja: zaproszenia i teksty');
  const sample = await T.evaluate(async k => ({ key: k, c: await App.Sync._seal(k, { x: 'zażółć 🙂' }) }), cfg.rooms[0].aes);
  await T.goto(B + '#/podroze'); await T.waitForTimeout(800); // „zamknięta” – Tomek nie ogląda czatu
  await new Promise(r => setTimeout(r, 1200));

  // nowe wiadomości po zapisaniu konfiguracji
  await A.goto(B + `#/razem/${trip}?z=czat`); await A.waitForSelector('#rz-in');
  await A.fill('#rz-in', 'Cześć z Rzymu! Kto bierze bilety?'); await A.press('#rz-in', 'Enter'); await A.waitForTimeout(600);
  await A.fill('#rz-in', 'I jeszcze pizza 🍕'); await A.press('#rz-in', 'Enter'); await A.waitForTimeout(600);
  await A.evaluate(async id => DB.put('planItems', { tripId: id, date: '', title: 'Koloseum', cat: 'zwiedzanie' }), trip); // zmiana planu – bez powiadomienia
  await A.goto(B + `#/czat/${uidT}`); await A.waitForSelector('#zn-in');
  await A.fill('#zn-in', 'Hej Tomek, masz chwilę?'); await A.press('#zn-in', 'Enter'); await A.waitForTimeout(600);
  await T.evaluate(id => App.Social.sendMessage(id, 'moja własna'), uidA); // własna – bez powiadomienia
  await C.goto(B + '#/znajomi'); await C.waitForSelector('#zn-name-in', { timeout: 15000 });
  await C.goto(B + 'dolacz.html#z.' + uidT); await C.waitForSelector('#zn-inv', { timeout: 15000 });
  await C.fill('#zn-inv input[name=n]', 'Celina'); await C.click('#zn-inv button'); await C.waitForTimeout(1500);
  await A.waitForTimeout(1500); // zapis na serwerze

  // Java (PushCheck) na emulatorze
  const android = path.join(__dirname, '..', 'podroznik-app', 'android');
  if (!fs.existsSync('/opt/android-sdk') || !fs.existsSync(path.join(android, 'gradlew'))) { console.log('SKIP część Java – brak Android SDK'); }
  else {
    const outDir = path.join(android, 'app', 'build', 'push-test');
    fs.mkdirSync(outDir, { recursive: true });
    fs.rmSync(path.join(outDir, 'out.json'), { force: true });
    fs.writeFileSync(path.join(outDir, 'cfg.json'), JSON.stringify({ cfg, sample }));
    let jvmOk = true;
    try { execSync('./gradlew testDebugUnitTest --tests io.github.chiniak.podroznik.PushCheckTest --rerun-tasks -q', { cwd: android, stdio: 'pipe', timeout: 480000 }); }
    catch (e) { jvmOk = false; console.log(String(e.stdout || '').slice(-1500), String(e.stderr || '').slice(-1500)); }
    ok(jvmOk, 'testy JVM (PushCheckTest) zielone');
    fs.rmSync(path.join(outDir, 'cfg.json'), { force: true }); // token testowy – nie zostawiać
    const out = fs.existsSync(path.join(outDir, 'out.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'out.json'), 'utf8')) : null;
    ok(!!out, 'test JVM uruchomiony');
    if (out) {
      console.log('  powiadomienia:', JSON.stringify(out.first));
      ok(out.sample === JSON.stringify({ x: 'zażółć 🙂' }), 'szyfr WebCrypto odszyfrowany w Javie');
      const room = out.first.find(n => n.key === 'r:' + trip), dm = out.first.find(n => n.key === 'd:' + uidA), inb = out.first.find(n => n.key === 'inbox');
      ok(room && room.title === 'Rzym razem' && room.lines.join('|') === 'Ania: Cześć z Rzymu! Kto bierze bilety?|Ania: I jeszcze pizza 🍕' && room.route === `#/razem/${trip}?z=czat`,
        'czat podróży: 2 wiadomości Ani, bez zmian planu i wiadomości systemowych');
      ok(dm && dm.title === 'Ania' && dm.lines.join('|') === 'Hej Tomek, masz chwilę?' && dm.route === `#/czat/${uidA}`, 'czat 1:1: wiadomość Ani, bez własnej');
      ok(inb && inb.lines.length === 1 && /Celina/.test(inb.lines[0]) && inb.route === '#/znajomi', 'zaproszenie od Celiny');
      ok(out.first.length === 3 && out.second === 0, 'drugie sprawdzenie – nic nowego');
    }
  }
  const errs = [A, T, C].flatMap(p => p.errs);
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
