// t53: znajomi (social.js, znajomi.js) – trzy telefony (Ania, Tomek, obcy) przez emulator Firebase:
// link / QR znajomego → zaproszenie → przyjęcie, czat 1:1 w obie strony (szyfr na serwerze), widoczność podróży
// (prywatna / dla znajomych / publiczna z linkiem), historia minionych podróży, podgląd bez szczegółów, aktualizacja na żywo,
// kopia cudzej podróży, reguły (obcy nie czyta czatu ani list kluczy), usunięcie ze znajomych, EN.
// Bez emulatora (porty 8085/9099) test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const dir = process.argv[2] || 'podroznik-testy';
const get = url => new Promise(res => { const r = http.request(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', () => res({ status: 0, body: '' })); r.end(); });
(async () => {
  if (!(await get('http://127.0.0.1:8085/')).status) { console.log('SKIP brak emulatora Firestore (port 8085)'); return; }
  const PRJ = 'http://127.0.0.1:8085/v1/projects/demo-podroznik/databases/(default)/documents';
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const B = 'http://localhost:8765/podroznik/';
  async function phone(who) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(500);
    return p;
  }
  const until = async (p, fn, arg, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); }
    return false;
  };
  const A = await phone('Ania'), T = await phone('Tomek'), X = await phone('Obcy');

  // Ania: profil i link
  await A.goto(B + '#/znajomi'); await A.waitForSelector('#zn-name-in', { timeout: 15000 });
  await A.fill('#zn-name-in', 'Ania'); await A.click('#zn-name button'); await A.waitForTimeout(800);
  const linkA = await A.evaluate(() => App.Social.myLink());
  const uidA = linkA.split('#z.')[1];
  ok(/^https:\/\/chiniak\.github\.io\/podroznik\/dolacz\.html#z\.[A-Za-z0-9]{20,40}$/.test(linkA), 'link znajomego: ' + linkA.replace(/z\..*/, 'z.…'));
  ok(await A.$eval('#zn-qr', c => c.width > 50).catch(() => false), 'kod QR narysowany');

  // Tomek: otwiera link (jak po zeskanowaniu QR) → zaproszenie
  await T.goto(B + 'dolacz.html#z.' + uidA); await T.waitForSelector('#zn-inv', { timeout: 15000 });
  ok(/Ania/.test(await T.textContent('.gd-intro')), 'Tomek widzi imię Ani');
  await T.fill('#zn-inv input[name=n]', 'Tomek'); await T.click('#zn-inv button'); await T.waitForTimeout(1200);
  ok(/#\/znajomi$/.test(T.url()) && /zaproszenie wysłane/.test(await T.textContent('main, body')), 'zaproszenie wysłane');
  const uidT = await T.evaluate(() => App.Social.profile());

  // Ania: zaproszenie na liście → Przyjmij
  ok(await until(A, () => !!document.querySelector('[data-ok]')), 'Ania widzi zaproszenie (na żywo)');
  ok(await A.evaluate(() => App.Social.unreadAll()) === 1, 'licznik: 1 zaproszenie');
  await A.click('[data-ok]'); await A.waitForTimeout(800);
  ok(await until(T, id => App.Social.state().then(s => s.friends[id] && s.friends[id].state === 'ok'), uidA), 'Tomek: Ania przyjęła – jesteście znajomymi');
  ok(await A.evaluate(id => App.Social.state().then(s => s.friends[id].state === 'ok' && s.friends[id].name === 'Tomek'), uidT), 'Ania: Tomek na liście znajomych');

  // czat
  await T.goto(B + '#/czat/' + uidA); await T.waitForSelector('#zn-in');
  await T.fill('#zn-in', 'Cześć Ania! Lecimy?'); await T.press('#zn-in', 'Enter'); await T.waitForTimeout(600);
  ok(/Cześć Ania/.test(await T.textContent('#zn-chat')), 'Tomek: wiadomość na ekranie');
  ok(await until(A, () => DB.all('dms').then(a => a.some(m => /Cześć Ania/.test(m.text) && m.by !== 'me'))), 'Ania dostaje wiadomość');
  ok(await A.evaluate(id => App.Social.unread(id), uidT) === 1, 'Ania: 1 nieprzeczytana');
  await A.goto(B + '#/czat/' + uidA.replace(uidA, uidT)); await A.waitForSelector('#zn-in');
  ok(await A.evaluate(id => App.Social.unread(id), uidT) === 0, 'po otwarciu czatu – przeczytane');
  await A.fill('#zn-in', 'Tak! Plan w aplikacji 🙂'); await A.click('#zn-send .rz-go'); await A.waitForTimeout(400);
  ok(await until(T, () => /Plan w aplikacji/.test(document.querySelector('#zn-chat').textContent)), 'Tomek widzi odpowiedź od razu na ekranie czatu');
  const conv = [uidA, uidT].sort().join('_');
  const raw = await get(`${PRJ}/dm/${conv}/msgs`);
  ok(raw.status === 200 ? false : true, 'serwer bez logowania nie wydaje czatu (status ' + raw.status + ')');
  const adminRaw = await new Promise(res => { const r = http.request(`${PRJ}/dm/${conv}/msgs`, { headers: { Authorization: 'Bearer owner' } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(d)); }); r.end(); });
  ok(/"c"/.test(adminRaw) && !/Cześć|Lecimy|Plan w aplikacji/.test(adminRaw), 'na serwerze tylko szyfr');

  // podróże Ani: nadchodząca (dla znajomych), miniona (dla znajomych), prywatna
  const trips = await A.evaluate(async () => { const T0 = App.todayStr();
    const liz = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: App.addDays(T0, 20), end: App.addDays(T0, 24), color: '#e0604f' });
    await DB.put('segments', { tripId: liz.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: App.addDays(T0, 20) + 'T06:40', arrive: App.addDays(T0, 20) + 'T09:55', number: 'LO 281', booking: 'SEKRET9', price: '1798', seat: '14A' });
    await DB.put('segments', { tripId: liz.id, type: 'nocleg', name: 'Hotel Alfama', address: 'Rua Secreta 1', city: 'Lizbona', depart: App.addDays(T0, 20) + 'T14:00', arrive: App.addDays(T0, 24) + 'T11:00', booking: 'HOTELKOD' });
    await DB.put('planItems', { tripId: liz.id, date: App.addDays(T0, 21), time: '10:00', title: 'Wieża Belém', cat: 'zwiedzanie', place: 'Belém', cost: '15', note: 'notatka prywatna', order: 0 });
    await DB.put('planItems', { tripId: liz.id, date: '', time: '', title: 'Pastéis de Belém', cat: 'jedzenie', order: 0 });
    const kr = await DB.put('trips', { name: 'Kraków 2025', destination: 'Kraków', start: '2025-05-01', end: '2025-05-03' });
    const tj = await DB.put('trips', { name: 'Tajna', destination: 'Gdzieś', start: App.addDays(T0, 60), end: App.addDays(T0, 61) });
    await App.Social.setVisibility(kr.id, 'friends');
    return { liz: liz.id, kr: kr.id, tj: tj.id }; });
  await A.goto(B + `#/widocznosc/${trips.liz}`); await A.waitForSelector('[data-vis=friends]');
  await A.click('[data-vis=friends]'); await A.waitForTimeout(1200);
  ok(await A.$eval('[data-vis=friends]', e => e.classList.contains('on')), 'widoczność: dla znajomych');
  await A.goto(B + `#/podroze/${trips.liz}`); await A.waitForTimeout(800);
  ok(/widzą ją Twoi znajomi/.test(await A.textContent(`a[href="#/widocznosc/${trips.liz}"]`)), 'szczegóły podróży: wiersz „Kto widzi podróż”');

  // Tomek: profil Ani – podróże i historia, bez prywatnej
  await T.goto(B + '#/znajomy/' + uidA); await T.waitForSelector('.zn-prof', { timeout: 15000 }); await T.waitForTimeout(500);
  const prof = (await T.textContent('main, body')).replace(/\s+/g, ' ');
  ok(/Nadchodzące Lizbona/.test(prof) && /Historia Kraków 2025/.test(prof), 'Tomek widzi Lizbonę (nadchodzące) i Kraków (historia)');
  ok(!/Tajna/.test(prof), 'prywatnej podróży nie widać');
  await T.screenshot({ path: `${dir}/t53-profil.png` });
  await T.click('.tp-trip:has-text("Lizbona")'); await T.waitForSelector('.zn-day', { timeout: 10000 });
  const view = (await T.textContent('main, body')).replace(/\s+/g, ' ');
  ok(/Wieża Belém/.test(view) && /Warszawa WAW → Lizbona LIS/.test(view) && /Hotel Alfama/.test(view) && /Pastéis de Belém/.test(view), 'podgląd: trasa, nocleg, plan dnia i pomysły');
  ok(!/SEKRET9|HOTELKOD|1798|Rua Secreta|notatka prywatna|14A/.test(view), 'podgląd bez kodów rezerwacji, cen, adresów, notatek i miejsc');
  await T.screenshot({ path: `${dir}/t53-plan.png` });
  const snapRaw = await new Promise(res => { const r = http.request(`${PRJ}/pub/${uidA}/trips`, { headers: { Authorization: 'Bearer owner' } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(d)); }); r.end(); });
  ok(/"c"/.test(snapRaw) && !/Lizbona|Belém|Kraków/.test(snapRaw), 'na serwerze podróże tylko jako szyfr');

  // zmiana w planie Ani → po chwili u Tomka
  await A.evaluate(async id => { const it = (await DB.byIndex('planItems', 'tripId', id)).find(i => i.title === 'Wieża Belém'); await DB.put('planItems', { ...it, title: 'Wieża Belém i Hieronimici' }); }, trips.liz);
  await T.waitForTimeout(5500); await T.reload(); await T.waitForSelector('.zn-day', { timeout: 10000 });
  ok(/Hieronimici/.test(await T.textContent('main, body')), 'zmiana planu widoczna u znajomego');

  // kopia do siebie
  await T.click('#zn-copytrip'); await T.waitForSelector('.tp-sheet[open] form'); await T.click('.tp-sheet button[type=submit]'); await T.waitForTimeout(1200);
  const copy = await T.evaluate(async () => { const t = (await DB.all('trips')).find(x => x.name === 'Lizbona'); return t && { items: (await DB.byIndex('planItems', 'tripId', t.id)).length, segs: (await DB.byIndex('segments', 'tripId', t.id)).length }; });
  ok(copy && copy.items === 2 && copy.segs === 2, 'kopia podróży u Tomka: ' + JSON.stringify(copy));

  // publiczna z linkiem → obcy
  await A.evaluate(id => App.Social.setVisibility(id, 'public'), trips.tj);
  const pub = await A.evaluate(id => App.Social.publicLink(id), trips.tj);
  ok(/dolacz\.html#p\.[A-Za-z0-9]+\.[\w-]{12}\.[\w-]{43}$/.test(pub), 'link publiczny');
  await X.goto(pub.replace('https://chiniak.github.io/podroznik/', B)); await X.waitForSelector('.zn-thead', { timeout: 15000 });
  ok(/Tajna/.test(await X.textContent('.zn-thead')) && await X.$('.zn-addowner') !== null, 'obcy z linkiem widzi podróż publiczną + „Dodaj autora”');
  await T.goto(B + '#/znajomy/' + uidA); await T.waitForSelector('.zn-prof'); await T.waitForTimeout(500);
  ok(/Tajna/.test(await T.textContent('main, body')), 'publiczna widoczna też dla znajomych');
  // reguły: obcy nie czyta czatu, list kluczy ani listy profili
  const rules = await X.evaluate(async ([a, t, conv]) => {
    const f = await App.Sync.firebase(), out = {};
    const tryIt = async (k, fn) => { try { await fn(); out[k] = 'ok'; } catch (e) { out[k] = e.code || 'err'; } };
    await tryIt('dm', () => f.db.collection('dm').doc(conv).collection('msgs').get());
    await tryIt('keys', () => f.db.collection('pub').doc(a).collection('keys').doc(t).get());
    await tryIt('people', () => f.db.collection('people').get());
    await tryIt('tripsList', () => f.db.collection('pub').doc(a).collection('trips').get());
    await tryIt('fakeProfile', () => f.db.collection('people').doc(a).set({ name: 'Hacker', pub: 'x', v: 1 }));
    await tryIt('fakeMsg', () => f.db.collection('dm').doc(conv).collection('msgs').add({ by: f.auth.currentUser.uid, t: f.now(), c: 'x', v: 1 }));
    return out; }, [uidA, uidT, conv]);
  ok(Object.values(rules).every(v => v === 'permission-denied'), 'reguły blokują obcego: ' + JSON.stringify(rules));
  // z powrotem prywatna → link przestaje działać
  await A.evaluate(id => App.Social.setVisibility(id, 'private'), trips.tj);
  await X.reload(); await X.waitForTimeout(1500);
  ok(/Niedostępna/.test(await X.textContent('main, body')), 'po zmianie na prywatną link nie działa');

  // usunięcie podróży – znika u znajomych
  await A.evaluate(async id => { for (const s of await DB.byIndex('segments', 'tripId', id)) await DB.del('segments', s.id); await DB.del('trips', id); }, trips.kr);
  await A.waitForTimeout(1500);
  await T.goto(B + '#/znajomy/' + uidA); await T.reload(); await T.waitForSelector('.zn-prof'); await T.waitForTimeout(500);
  ok(!/Kraków 2025/.test(await T.textContent('main, body')), 'usunięta podróż znika u znajomego');

  // EN
  await T.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await T.goto(B + '#/znajomi'); await T.reload(); await T.waitForSelector('#zn-add', { timeout: 15000 }); await T.waitForTimeout(500);
  const en = (await T.textContent('body')).replace(/\s+/g, ' ');
  ok(/Friends/.test(en) && /Your friends/.test(en) && /Add a friend/.test(en) && /Who can see my trips/.test(en), 'EN: ' + en.slice(0, 120));
  await T.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  // usunięcie ze znajomych
  await T.goto(B + '#/znajomy/' + uidA); await T.waitForSelector('#zn-del'); await T.click('#zn-del'); await T.waitForTimeout(1000);
  ok(await until(A, id => App.Social.state().then(s => !s.friends[id]), uidT), 'Ania: Tomek usunięty także u niej');
  const after = await T.evaluate(([a]) => App.Sync.firebase().then(f => f.db.collection('pub').doc(a).collection('keys').doc(f.auth.currentUser.uid).get()).then(d => d.exists ? 'exists' : 'gone').catch(e => e.code), [uidA]);
  ok(after === 'gone' || after === 'permission-denied', 'po usunięciu brak listy podróży dla Tomka: ' + after);
  ok(await A.evaluate(() => !DB.stores.includes('dms')), 'czat poza kopią zapasową');

  for (const p of [A, T, X]) ok(!p.errs.length, 'bez błędów JS ' + p.errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
