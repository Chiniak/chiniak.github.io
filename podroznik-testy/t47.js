// t47: wspólna podróż na żywo (sync.js, razem.js) – dwa telefony (Ania, Tomek) przez emulator Firebase
// (firebase emulators:start --only firestore,auth, reguły z podroznik-app/firebase/firestore.rules):
// zaproszenie + QR, dołączenie z linku dolacz.html#…, kopia podróży u Tomka, uczestnicy, czat na żywo, pomysły,
// głosy i komentarze, zmiana i usunięcie od drugiej osoby, offline → online, serwer widzi tylko szyfr, reguły, wyjście.
// Bez emulatora (porty 8085/9099) test się pomija.
const { chromium, devices } = require('playwright');
const http = require('http');
const get = (url, opts = {}, body) => new Promise(res => {
  const r = http.request(url, { method: body ? 'POST' : 'GET', ...opts }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d })); });
  r.on('error', () => res({ status: 0, body: '' }));
  if (body) r.write(body);
  r.end();
});
(async () => {
  if (!(await get('http://127.0.0.1:8085/')).status) { console.log('SKIP brak emulatora Firestore (port 8085)'); return; }
  const PRJ = 'http://127.0.0.1:8085/v1/projects/demo-podroznik/databases/(default)/documents';
  const b = await chromium.launch();
  const fails = [];
  const ok = (c, w) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + w); if (!c) fails.push(w); };
  const B = 'http://localhost:8765/podroznik/';
  async function phone(who) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(() => localStorage.setItem('podroznik-emu', '1'));
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|net::/.test(m.text())) p.errs.push(m.text()); });
    p.on('dialog', d => d.accept());
    p.ctx = ctx; p.who = who;
    return p;
  }
  const until = async (p, fn, arg, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); }
    return false;
  };

  const A = await phone('Ania'), T = await phone('Tomek');
  await A.goto(B + '#/podroze'); await A.waitForTimeout(600);
  const ids = await A.evaluate(async () => {
    const d = n => App.addDays(App.todayStr(), n);
    const t = await DB.put('trips', { name: 'Lizbona razem', destination: 'Lizbona', start: d(20), end: d(24) });
    const s = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: d(20) + 'T10:00', arrive: d(20) + 'T13:30', number: 'TP 123' });
    const pi = await DB.put('planItems', { tripId: t.id, title: 'Tramwaj 28', date: d(21), cat: 'zwiedzanie', order: 0 });
    const idea = await DB.put('planItems', { tripId: t.id, title: 'Pastéis de Belém', date: '', cat: 'jedzenie', order: 1e6 });
    await DB.put('files', { tripId: t.id, segmentId: s.id, name: 'bilet.pdf', mime: 'application/pdf', blob: new Blob(['x']) });
    return { trip: t.id, seg: s.id, pi: pi.id, idea: idea.id };
  });

  // ---------- Ania: przed udostępnieniem ----------
  await A.goto(B + `#/podroze/${ids.trip}`); await A.waitForTimeout(800);
  ok(await A.$(`a[href="#/razem/${ids.trip}"]`) !== null, 'szczegóły podróży: wiersz „Razem”');
  await A.goto(B + `#/razem/${ids.trip}`); await A.waitForTimeout(600);
  ok(await A.$('#rz-start') !== null, 'Razem (nieudostępniona): formularz z imieniem');
  await A.fill('#rz-start input[name=name]', 'Ania');
  await A.click('#rz-start button');
  ok(await until(A, () => location.hash.includes('z=osoby') && !!document.querySelector('#rz-qr')), 'po zaproszeniu: zakładka Osoby z kodem QR');
  await A.waitForTimeout(800);
  ok(await A.$eval('#rz-qr', c => c.width > 50).catch(() => false), 'kod QR narysowany');
  const link = await A.evaluate(id => App.Sync.link(id), ids.trip);
  ok(/^https:\/\/chiniak\.github\.io\/podroznik\/dolacz\.html#[\w-]{16,32}\.[\w-]{43}$/.test(link), 'link zaproszenia: ' + link.slice(0, 60) + '…');
  const code = link.split('#')[1], room = code.split('.')[0];
  ok(await A.evaluate(async id => (await DB.get('trips', id)).people.includes('Ania'), ids.trip), 'Ania w uczestnikach (trips.people – rozliczenie)');

  // ---------- Tomek dołącza ----------
  await T.goto(B + 'dolacz.html#' + code);
  ok(await until(T, () => location.hash.startsWith('#/dolacz/') && !!document.querySelector('#rz-join')), 'dolacz.html → ekran „Dołącz do podróży”');
  await T.fill('#rz-join input[name=name]', 'Tomek');
  await T.click('#rz-join button');
  ok(await until(T, id => location.hash === `#/razem/${id}?z=czat`, ids.trip, 15000), 'Tomek dołączył → czat');
  const tData = await T.evaluate(async x => ({
    trip: await DB.get('trips', x.trip), seg: await DB.get('segments', x.seg), pi: await DB.get('planItems', x.pi),
    idea: await DB.get('planItems', x.idea), files: (await DB.byIndex('files', 'tripId', x.trip)).length,
  }), ids);
  ok(tData.trip && tData.trip.name === 'Lizbona razem', 'u Tomka: podróż');
  ok(tData.seg && tData.seg.number === 'TP 123', 'u Tomka: lot');
  ok(tData.pi && tData.idea, 'u Tomka: plan i pomysł');
  ok(tData.files === 0, 'bilety (files) nie są wysyłane');
  ok(tData.trip.people.includes('Ania') && tData.trip.people.includes('Tomek'), 'u Tomka: uczestnicy Ania i Tomek');
  ok(/Ania[\s\S]*zaczyna wspólne planowanie/.test(await T.innerText('#rz-chat')), 'czat Tomka: wiadomość systemowa Ani');

  // ---------- Ania widzi Tomka na żywo ----------
  ok(await until(A, () => /Tomek/.test(document.querySelector('main').innerText)), 'Ania (Osoby) widzi Tomka na żywo');
  ok(await until(A, async id => (await DB.get('trips', id)).people.includes('Tomek'), ids.trip), 'u Ani: Tomek w uczestnikach');

  // ---------- czat ----------
  await A.goto(B + `#/razem/${ids.trip}?z=czat`); await A.waitForTimeout(500);
  await T.fill('#rz-in', 'Cześć! Kto rezerwuje nocleg?');
  await T.press('#rz-in', 'Enter');
  await T.waitForTimeout(400);
  ok(/Kto rezerwuje nocleg/.test(await T.innerText('#rz-chat')), 'Tomek: wiadomość u siebie');
  ok(await until(A, () => /Kto rezerwuje nocleg/.test(document.querySelector('#rz-chat').innerText)), 'Ania: wiadomość Tomka na żywo');
  ok(/Tomek/.test(await A.innerText('.rz-msg:not(.me) .rz-who').catch(() => '')), 'Ania: podpis „Tomek” przy dymku');
  // Ania pisze, a w tym czasie przychodzi wiadomość – szkic nie znika
  await A.fill('#rz-in', 'Ja zare');
  await T.fill('#rz-in', 'Super'); await T.press('#rz-in', 'Enter');
  ok(await until(A, () => /Super/.test(document.querySelector('#rz-chat').innerText)), 'Ania: druga wiadomość');
  ok(await A.$eval('#rz-in', i => i.value) === 'Ja zare', 'szkic Ani zostaje po odświeżeniu czatu');
  await A.fill('#rz-in', 'Ja zarezerwuję'); await A.press('#rz-in', 'Enter');
  ok(await until(T, () => /Ja zarezerwuję/.test(document.querySelector('#rz-chat').innerText)), 'Tomek: odpowiedź Ani');

  // ---------- pomysły: dodanie, głos, komentarz, do planu ----------
  await T.goto(B + `#/razem/${ids.trip}?z=pomysly`); await T.waitForTimeout(500);
  await A.goto(B + `#/razem/${ids.trip}?z=pomysly`); await A.waitForTimeout(500);
  await A.fill('#rz-add input', 'Oceanarium');
  await A.click('#rz-add button');
  ok(await until(T, () => /Oceanarium/.test(document.querySelector('main').innerText)), 'Tomek: nowy pomysł Ani na żywo');
  ok(/dodał\(a\): Ania/.test(await T.innerText('main')), 'pomysł: kto dodał');
  const oce = await T.evaluate(async id => (await DB.byIndex('planItems', 'tripId', id)).find(i => i.title === 'Oceanarium').id, ids.trip);
  await T.click(`[data-vote="${oce}"]`); await T.waitForTimeout(300);
  ok(await T.$eval(`[data-vote="${oce}"]`, b => b.getAttribute('aria-pressed') === 'true' && b.innerText.includes('1')), 'Tomek: 👍 zaznaczone, 1 głos');
  ok(await until(A, id => (document.querySelector(`[data-vote="${id}"]`) || {}).innerText === '👍 1', oce), 'Ania: 1 głos na żywo');
  await A.click(`[data-vote="${oce}"]`); await A.waitForTimeout(300);
  ok(await until(T, id => /2/.test((document.querySelector(`[data-vote="${id}"]`) || {}).innerText || ''), oce), 'Tomek: 2 głosy');
  ok(await T.$eval('.rz-idea', el => /Oceanarium/.test(el.innerText)), 'najwięcej głosów – pierwszy na liście');
  await T.click(`[data-cm="${oce}"]`); await T.waitForTimeout(300);
  await T.fill(`.rz-cform[data-idea="${oce}"] input`, 'Bilety online taniej');
  await T.click(`.rz-cform[data-idea="${oce}"] button`);
  ok(await until(A, id => /1/.test((document.querySelector(`[data-cm="${id}"]`) || {}).innerText || ''), oce), 'Ania: 💬 1 komentarz');
  await A.goto(B + `#/razem/${ids.trip}?z=czat`); await A.waitForTimeout(500);
  ok(/💡 Oceanarium/.test(await A.innerText('#rz-chat')) && /Bilety online taniej/.test(await A.innerText('#rz-chat')), 'komentarz w czacie z odnośnikiem do pomysłu');
  await T.selectOption(`[data-move="${oce}"]`, { index: 2 }); await T.waitForTimeout(500);
  ok(await until(A, async id => !!(await DB.get('planItems', id)).date, oce), 'Tomek: pomysł do planu → u Ani ma dzień');

  // ---------- zmiana i usunięcie od drugiej osoby; ekran podróży odświeża się sam ----------
  await A.goto(B + `#/podroze/${ids.trip}`); await A.waitForTimeout(800);
  await T.evaluate(async id => { const s = await DB.get('segments', id); await DB.put('segments', { ...s, number: 'TP 999' }); }, ids.seg);
  ok(await until(A, () => /TP 999/.test(document.querySelector('main').innerText)), 'Ania: numer lotu zmieniony przez Tomka (ekran odświeżony)');
  await T.evaluate(async id => DB.del('planItems', id), ids.pi);
  ok(await until(A, async id => !(await DB.get('planItems', id)), ids.pi), 'Ania: punkt usunięty przez Tomka');

  // ---------- nieprzeczytane ----------
  await T.goto(B + `#/razem/${ids.trip}?z=czat`); await T.waitForTimeout(400);
  await T.fill('#rz-in', 'Widzisz to?'); await T.press('#rz-in', 'Enter');
  ok(await until(A, () => /nowa wiadomość/.test(document.querySelector('main').innerText)), 'Ania (ekran podróży): „1 nowa wiadomość”');
  await A.goto(B + `#/plan/${ids.trip}`); await A.waitForTimeout(500);
  await T.fill('#rz-in', 'Halo'); await T.press('#rz-in', 'Enter');
  ok(await until(A, () => /Tomek: Halo/.test((document.querySelector('.toast') || {}).innerText || document.body.innerText)), 'Ania (Plan): powiadomienie „💬 Tomek: Halo”');

  // ---------- offline → online ----------
  await T.ctx.setOffline(true);
  await T.evaluate(() => window.dispatchEvent(new Event('offline')));
  await T.fill('#rz-in', 'Pisane w samolocie'); await T.press('#rz-in', 'Enter');
  await T.evaluate(async id => DB.put('packItems', { tripId: id, title: 'Krem z filtrem', done: false }), ids.trip);
  await T.waitForTimeout(1500);
  ok(/Pisane w samolocie/.test(await T.innerText('#rz-chat')), 'Tomek offline: wiadomość widoczna u siebie');
  ok(!(await A.evaluate(async id => (await DB.byIndex('chat', 'tripId', id)).some(m => m.text === 'Pisane w samolocie'), ids.trip)), 'Ania: jeszcze nic (Tomek offline)');
  await T.ctx.setOffline(false);
  await T.evaluate(() => window.dispatchEvent(new Event('online')));
  ok(await until(A, async id => (await DB.byIndex('chat', 'tripId', id)).some(m => m.text === 'Pisane w samolocie'), ids.trip, 20000), 'po powrocie sieci: wiadomość dotarła do Ani');
  ok(await until(A, async id => (await DB.byIndex('packItems', 'tripId', id)).some(m => m.title === 'Krem z filtrem'), ids.trip, 10000), 'po powrocie sieci: rzecz do spakowania u Ani');

  // ---------- serwer widzi tylko szyfr; reguły ----------
  const all = await get(`${PRJ}/rooms/${room}/ops?pageSize=500`, { headers: { Authorization: 'Bearer owner' } });
  const docs = (JSON.parse(all.body || '{}').documents || []);
  ok(docs.length > 10, 'w pokoju operacje: ' + docs.length);
  ok(!/Lizbona|Oceanarium|Tomek|Ania|TP 123|Halo/.test(all.body), 'na serwerze brak jawnego tekstu (tylko szyfr)');
  ok(docs.every(d => Object.keys(d.fields).sort().join() === 'by,c,t,v'), 'dokumenty: tylko by, c, t, v');
  const anon = await get(`${PRJ}/rooms/${room}/ops`, { headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ fields: { c: { stringValue: 'x' } } }));
  ok(anon.status === 403, 'reguły: zapis bez logowania odrzucony (' + anon.status + ')');
  const anonRead = await get(`${PRJ}/rooms/${room}/ops`);
  ok(anonRead.status === 403, 'reguły: odczyt bez logowania odrzucony (' + anonRead.status + ')');
  const listRooms = await get(`${PRJ}/rooms`, { headers: { Authorization: 'Bearer owner' } });
  // (owner omija reguły – sprawdzamy w aplikacji, że zalogowany użytkownik nie wylistuje pokoi)
  const canList = await A.evaluate(async () => { try { await firebase.firestore().collection('rooms').get(); return true; } catch (e) { return e.code; } });
  ok(canList === 'permission-denied', 'reguły: lista pokoi niedostępna (' + canList + ')');
  const forge = await A.evaluate(async r => { try { await firebase.firestore().collection('rooms').doc(r).collection('ops').doc('zz').set({ by: 'ktos-inny', t: firebase.firestore.FieldValue.serverTimestamp(), c: 'x', v: 1 }); return true; } catch (e) { return e.code; } }, room);
  ok(forge === 'permission-denied', 'reguły: podszycie się pod innego (by) odrzucone (' + forge + ')');
  const edit = await A.evaluate(async r => { const s = await firebase.firestore().collection('rooms').doc(r).collection('ops').limit(1).get();
    try { await s.docs[0].ref.update({ c: 'x' }); return true; } catch (e) { return e.code; } }, room);
  ok(edit === 'permission-denied', 'reguły: zmiana zapisanej operacji odrzucona (' + edit + ')');

  // ---------- zły klucz ----------
  const badKey = code.split('.')[0] + '.' + 'A'.repeat(43);
  const C = await phone('Obcy');
  await C.goto(B + '#/dolacz/' + badKey); await C.waitForTimeout(600);
  await C.fill('#rz-join input[name=name]', 'Obcy'); await C.click('#rz-join button');
  ok(await until(C, () => { const e = document.querySelector('#err'); return e && !e.hidden && /niepełny/.test(e.textContent); }, null, 15000), 'link ze złym kluczem: komunikat „link jest niepełny”');
  ok(await C.evaluate(async () => (await DB.all('trips')).length === 0), 'zły klucz: nic nie dodano');

  // ---------- wyjście ----------
  await A.goto(B + `#/razem/${ids.trip}?z=czat`); await A.waitForTimeout(400);
  await T.goto(B + `#/razem/${ids.trip}?z=osoby`); await T.waitForTimeout(600);
  await T.click('#rz-leave');
  ok(await until(T, id => location.hash === `#/podroze/${id}`, ids.trip), 'Tomek: po wyjściu ekran podróży');
  ok(!(await T.evaluate(id => App.Sync.isShared(id), ids.trip)), 'Tomek: podróż już nie jest wspólna');
  ok(await T.evaluate(async id => !!(await DB.get('trips', id)), ids.trip), 'Tomek: podróż zostaje u niego');
  ok(await until(A, () => /Tomek opuszcza wspólną podróż/.test(document.querySelector('#rz-chat').innerText)), 'Ania: „Tomek opuszcza wspólną podróż”');
  await T.evaluate(async id => { const s = await DB.get('segments', id); await DB.put('segments', { ...s, number: 'PO WYJŚCIU' }); }, ids.seg);
  await A.waitForTimeout(2500);
  ok(await A.evaluate(async id => (await DB.get('segments', id)).number === 'TP 999', ids.seg), 'po wyjściu zmiany Tomka nie trafiają do Ani');

  // ---------- usunięcie wspólnej podróży u Ani nie kasuje u innych ----------
  const T2 = await phone('Tomek2');
  await T2.goto(B + '#/dolacz/' + code); await T2.waitForTimeout(500);
  await T2.fill('#rz-join input[name=name]', 'Ola'); await T2.click('#rz-join button');
  ok(await until(T2, id => location.hash.startsWith(`#/razem/${id}`), ids.trip, 15000), 'Ola dołącza');
  await A.goto(B + `#/podroze/${ids.trip}/edytuj`); await A.waitForTimeout(700);
  await A.click('#del'); await A.waitForTimeout(1500);
  ok(await A.evaluate(async id => !(await DB.get('trips', id)), ids.trip), 'Ania usunęła podróż u siebie');
  await T2.waitForTimeout(2000);
  const olaHas = await T2.evaluate(async x => ({ t: !!(await DB.get('trips', x.trip)), s: !!(await DB.get('segments', x.seg)), n: (await DB.byIndex('planItems', 'tripId', x.trip)).length }), ids);
  ok(olaHas.t && olaHas.s && olaHas.n >= 2, 'u Oli podróż, lot i plan zostają: ' + JSON.stringify(olaHas));

  // ---------- angielski ----------
  await T2.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  const PL = /[ąćęłńóśźż]|\b(Dodaj|Wyślij|Zaproś|pomysł|Twoje|wiadomoś|Osoby|Czat)\b/i;
  for (const z of ['czat', 'pomysly', 'osoby']) {
    await T2.goto(B + `#/razem/${ids.trip}?z=${z}`); await T2.reload(); await T2.waitForTimeout(1200);
    const en = (await T2.innerText('main')).replace(/Pastéis de Belém|Lizbona razem|Lizbona|Oceanarium|Tomek|Ania|Ola|Pisane w samolocie|Bilety online taniej|Kto rezerwuje nocleg\?|Cześć!|Ja zarezerwuję|Widzisz to\?|Halo|Super/g, '');
    const left = en.split('\n').filter(l => PL.test(l));
    ok(!left.length, `EN ${z}: bez polskich tekstów ` + left.slice(0, 3).join(' | '));
  }
  await T2.goto(B + `#/podroze/${ids.trip}`); await T2.waitForTimeout(900);
  ok(/Together/.test(await T2.innerText('main')), 'EN: wiersz „Together” w podróży');

  for (const p of [A, T, C, T2]) ok(p.errs.length === 0, `${p.who}: brak błędów strony ` + p.errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nWSZYSTKO OK');
  process.exit(fails.length ? 1 : 0);
})();
