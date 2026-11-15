// t43: wizy i zezwolenia na wjazd (visas.js): rozpoznanie krajów (loty, przesiadki, cel, noclegi), rodzaje wymagań, limit dni,
// „Mam”, „Nie jadę”, „Dodaj kraj”, wiza w Dokumentach, przypomnienia (terminy, wyłącznik), service worker, angielski
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const fails = [];
  const ok = (c, w) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + w); if (!c) fails.push(w); };
  const B = 'http://localhost:8765/podroznik/';
  const row = cc => p.locator(`.vz-row[data-cc="${cc}"]`);
  const rowTxt = async cc => ((await row(cc).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const ccs = () => p.$$eval('.vz-row', r => r.map(x => x.dataset.cc));
  await p.goto(B + '#/podroze'); await p.waitForTimeout(600);

  const ids = await p.evaluate(async () => {
    const T = App.todayStr(), d = n => App.addDays(T, n);
    // Azja: WAW → DOH (przesiadka 4 h) → HAN, nocleg w Hanoi, HAN → BKK po 50 dniach; Laos tylko w celu podróży
    const a = await DB.put('trips', { name: 'Azja zimą', destination: 'Wietnam i Laos', start: d(20), end: d(80) });
    await DB.put('segments', { tripId: a.id, type: 'lot', from: 'Warszawa WAW', to: 'Doha DOH', depart: d(20) + 'T15:00', arrive: d(20) + 'T22:00' });
    await DB.put('segments', { tripId: a.id, type: 'lot', from: 'Doha DOH', to: 'Hanoi HAN', depart: d(21) + 'T02:00', arrive: d(21) + 'T13:00' });
    await DB.put('segments', { tripId: a.id, type: 'nocleg', name: 'Lotus', address: '1 Hang Bac, Hanoi', depart: d(21) + 'T14:00', arrive: d(25) + 'T12:00' });
    await DB.put('segments', { tripId: a.id, type: 'lot', from: 'Hanoi HAN', to: 'Bangkok BKK', depart: d(71) + 'T10:00', arrive: d(71) + 'T12:00' });
    // Meksyk przez USA (przesiadka w JFK – ESTA potrzebna także w tranzycie)
    const m = await DB.put('trips', { name: 'Jukatan', destination: 'Cancún', start: d(40), end: d(50) });
    await DB.put('segments', { tripId: m.id, type: 'lot', from: 'Warszawa WAW', to: 'Nowy Jork JFK', depart: d(40) + 'T10:00', arrive: d(40) + 'T13:00' });
    await DB.put('segments', { tripId: m.id, type: 'lot', from: 'Nowy Jork JFK', to: 'Cancun CUN', depart: d(40) + 'T17:00', arrive: d(40) + 'T21:00' });
    // Lizbona – tylko UE, Londyn – UK ETA (z adresu noclegu)
    const l = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona, Portugalia', start: d(10), end: d(14) });
    const u = await DB.put('trips', { name: 'Weekend', destination: '', start: d(5), end: d(7) });
    await DB.put('segments', { tripId: u.id, type: 'nocleg', name: 'Hotel', address: '10 Baker Street, London', depart: d(5) + 'T15:00', arrive: d(7) + 'T11:00' });
    return { a: a.id, m: m.id, l: l.id, u: u.id, T };
  });

  // ---------- Azja ----------
  await p.goto(B + `#/podroze/${ids.a}`); await p.waitForTimeout(900);
  const asia = await ccs();
  console.log('Azja:', asia.join(','));
  ok(asia.includes('VN') && asia.includes('LA') && asia.includes('TH'), 'Azja: Wietnam (lot), Laos (cel), Tajlandia (lot)');
  ok(!asia.includes('QA'), 'Azja: Katar tylko przesiadka – pominięty');
  ok(/bez wizy/.test(await rowTxt('VN')) && /45 dni/.test(await rowTxt('VN')) && /31\.12\.2028/.test(await rowTxt('VN')), 'Wietnam: bez wizy 45 dni, zwolnienie do 2028');
  ok(/dłużej, niż można bez wizy/.test(await rowTxt('VN')), 'Wietnam: 51 dni pobytu (lot HAN → BKK) – ponad limit 45 – ' + await rowTxt('VN'));
  ok(/TDAC/.test(await rowTxt('TH')) && /przypomnę 3 dni/.test(await rowTxt('TH')), 'Tajlandia: TDAC, przypomnienie 3 dni przed przylotem');
  ok(/wiza po przylocie/.test(await rowTxt('LA')) && /przed wyjazdem/.test(await rowTxt('LA')) && !/dłużej/.test(await rowTxt('LA')), 'Laos: wiza po przylocie, bez limitu dni (pobyt nieznany)');
  ok((await p.getAttribute('.vz-row[data-cc="TH"] .vz-acts a', 'href')) === 'https://tdac.immigration.go.th', 'Tajlandia: link do oficjalnej strony');
  ok(/3 do zrobienia/.test(await p.innerText('.sec-h:has-text("Wjazd i wizy")')), 'licznik „do zrobienia” – ' + await p.innerText('.sec-h:has-text("Wjazd i wizy")'));
  ok(/MSZ/.test(await p.innerText('.vz-src')) && (await p.getAttribute('.vz-src a', 'href')).includes('gov.pl'), 'źródło: link do MSZ');
  await p.evaluate(() => document.querySelector('.vz-list').scrollIntoView()); await p.waitForTimeout(200);
  await p.screenshot({ path: `${SP}/t43-asia.png` });

  // przypomnienia
  const rem = async () => p.evaluate(async () => (await Reminders.load()).list.filter(r => r.id.startsWith('visa:')).map(r => `${r.id.split(':')[2]}:${r.id.split(':')[3]}@${r.at.slice(0, 10)}`));
  let r = await rem();
  console.log('przypomnienia:', JSON.stringify(r));
  const d = n => p.evaluate(([T, n]) => App.addDays(T, n), [ids.T, n]);
  ok(r.includes(`TH:3@${await d(68)}`), 'TDAC: 3 dni przed przylotem do Tajlandii');
  ok(r.includes(`LA:14@${await d(6)}`), 'Laos: 14 dni przed wyjazdem');
  ok(r.some(x => x.startsWith('VN:')), 'Wietnam: przypomnienie o przekroczonym limicie dni');
  ok(r.includes(`US:30@${await d(10)}`) && r.includes(`US:7@${await d(33)}`), 'ESTA (przesiadka w USA): 30 i 7 dni przed');
  ok(r.includes(`GB:30@${await d(-25)}`) && r.includes(`GB:7@${await d(-2)}`), 'UK ETA: przypomnienia (także te już minione – liczone)');
  const act = await p.evaluate(async () => Reminders.active((await Reminders.load()).list).filter(x => x.id.startsWith('visa:')).map(x => x.id));
  ok(act.some(x => /:GB:7$/.test(x)) && !act.some(x => /:GB:30$/.test(x)) && new Set(act.map(x => x.split(':')[2])).size === act.length, 'aktywne: jedno przypomnienie na kraj (najnowsze) – ' + JSON.stringify(act));

  // „Mam”, „Nie jadę”, „Dodaj kraj”
  await row('TH').locator('[data-vz-done]').click(); await p.waitForTimeout(700);
  ok(/mam/.test(await rowTxt('TH')) && (await row('TH').getAttribute('class')).includes('is-done'), 'Mam: Tajlandia oznaczona');
  ok((await ccs()).slice(-1)[0] === 'TH', 'oznaczone na końcu listy');
  ok(!(await rem()).some(x => x.startsWith('TH:')), 'Mam: bez przypomnień o TDAC');
  await row('LA').locator('[data-vz-skip]').click(); await p.waitForTimeout(700);
  ok(!(await ccs()).includes('LA'), 'Nie jadę: Laos znika');
  await p.selectOption('#vz-add', 'KH'); await p.waitForTimeout(700);
  ok((await ccs()).includes('KH') && /e-wiza/.test(await rowTxt('KH')), 'Dodaj kraj: Kambodża (e-wiza)');
  await p.selectOption('#vz-add', 'LA'); await p.waitForTimeout(700);
  ok((await ccs()).includes('LA'), 'Dodaj kraj: Laos wraca po „Nie jadę”');
  await row('KH').locator('[data-vz-skip]').click(); await p.waitForTimeout(700);
  ok(!(await ccs()).includes('KH'), 'dodany ręcznie i usunięty');
  const v = await p.evaluate(async id => (await DB.get('trips', id)).visa, ids.a);
  ok(JSON.stringify(v) === JSON.stringify({ add: ['LA'], skip: [], done: ['TH'] }), 'zapis w podróży: ' + JSON.stringify(v));
  await p.goto(B + `#/podroze/${ids.a}/edytuj`); await p.waitForTimeout(600);
  await p.click('button[type=submit]'); await p.waitForTimeout(700);
  ok(JSON.stringify(await p.evaluate(async id => (await DB.get('trips', id)).visa, ids.a)) === JSON.stringify(v), 'edycja podróży zachowuje ustawienia wiz');

  // ---------- Meksyk przez USA ----------
  await p.goto(B + `#/podroze/${ids.m}`); await p.waitForTimeout(900);
  ok((await ccs()).join() === 'US,MX', 'Meksyk: USA (przesiadka) + Meksyk – ' + (await ccs()).join());
  ok(/ESTA/.test(await rowTxt('US')) && /przesiadce/.test(await rowTxt('US')), 'USA: ESTA także przy przesiadce');

  // ---------- wiza w Dokumentach ----------
  await p.evaluate(async T => DB.put('docs', { type: 'wiza', person: '', number: 'ESTA 123', country: 'USA', expires: App.addDays(T, 700), remind: 0 }), ids.T);
  await p.reload(); await p.waitForTimeout(900);
  ok(/Wiza w Dokumentach/.test(await rowTxt('US')) && !(await row('US').locator('[data-vz-done]').count()), 'ESTA w Dokumentach = mam (bez przycisku)');
  ok(!(await rem()).some(x => x.startsWith('US:')), 'ESTA w Dokumentach: bez przypomnień');

  // ---------- tylko UE / Londyn ----------
  await p.goto(B + `#/podroze/${ids.l}`); await p.waitForTimeout(900);
  ok(!(await ccs()).length && /Nie rozpoznano kraju poza Unią/.test(await p.innerText('#view')), 'Lizbona: tylko UE – brak wymagań');
  await p.goto(B + `#/podroze/${ids.u}`); await p.waitForTimeout(900);
  ok((await ccs()).join() === 'GB' && /UK ETA/.test(await rowTxt('GB')), 'Londyn z adresu noclegu: UK ETA');

  // ---------- ekran główny: przypomnienie jako karta ----------
  await p.goto(B + '#/podroze'); await p.waitForTimeout(900);
  ok(/UK ETA: Wielka Brytania/.test(await p.innerText('#view')), 'ekran główny: karta przypomnienia o UK ETA');

  // ---------- wyłącznik w ustawieniach przypomnień ----------
  await p.goto(B + '#/ustawienia/przypomnienia'); await p.waitForTimeout(700);
  const sw = p.locator('input[name=visa]');
  ok(await sw.isChecked(), 'ustawienia: wizy domyślnie włączone');
  await sw.locator('xpath=..').click(); await p.waitForTimeout(800);
  ok(!(await rem()).length, 'wyłączone: brak przypomnień o wizach');
  await sw.locator('xpath=..').click(); await p.waitForTimeout(800);

  // ---------- service worker: przypomnienia w tle (lotniska + wizy) ----------
  const swr = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return new Promise(res => {
      const ch = new MessageChannel();
      ch.port1.onmessage = e => res(e.data);
      reg.active.postMessage({ type: 'visa-status' }, [ch.port2]);
      setTimeout(() => res('timeout'), 4000);
    });
  });
  ok(swr && swr.visas > 0 && swr.airports, 'service worker: visas.js i lotniska wczytane – ' + JSON.stringify(swr));

  // ---------- angielski ----------
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'en'));
  await p.goto(B + `#/podroze/${ids.a}`); await p.reload(); await p.waitForTimeout(1000);
  const en = await p.innerText('.vz-list').catch(() => '') + await p.innerText('.vz-src').catch(() => '');
  const pl = ['bez wizy', 'Bez wizy', 'Wietnam', 'Tajlandia', 'Oficjalna', 'przypomnę', 'Przypomnę', 'dni', 'MSZ', 'Polski paszport', 'wiza', 'Mam'].filter(w => en.includes(w));
  ok(!pl.length, 'angielski: bez polskich tekstów ' + JSON.stringify(pl));
  console.log('EN:', en.replace(/\s+/g, ' ').slice(0, 400));
  ok(/Entry & visas/i.test(await p.innerText('#view')) && /Vietnam/.test(en), 'angielski: nagłówek i nazwy krajów');
  await p.evaluate(() => document.querySelector('.vz-list').scrollIntoView()); await p.waitForTimeout(200);
  await p.screenshot({ path: `${SP}/t43-en.png` });

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL OK');
  console.log('errors:', errs);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
