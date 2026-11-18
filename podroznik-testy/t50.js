// plan: „Wyczyść plan” (punkty i pomysły, odcinki zostają) i „Usuń całą podróż” z ekranu planu
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Porto', destination: 'Porto', start: '2027-06-01', end: '2027-06-03' });
    const t2 = await DB.put('trips', { name: 'Zostaje', destination: 'Gdańsk', start: '2027-08-01', end: '2027-08-02' });
    await DB.put('segments', { tripId: t.id, type: 'pociag', from: 'Lizbona', to: 'Porto', depart: '2027-06-01T08:39', arrive: '2027-06-01T11:35' });
    for (let i = 0; i < 3; i++) await DB.put('planItems', { tripId: t.id, date: '2027-06-02', time: '', title: 'P' + i, cat: 'zwiedzanie', order: i });
    const idea = await DB.put('planItems', { tripId: t.id, date: '', time: '', title: 'Pomysł', cat: 'inne', order: 0 });
    await DB.put('files', { tripId: t.id, segmentId: 'p:' + idea.id, kind: 'ticket', name: 'b.png', blob: new Blob(['x']) });
    await DB.put('planItems', { tripId: t2.id, date: '2027-08-01', time: '', title: 'Inna podróż', cat: 'inne', order: 0 });
    return { t: t.id, t2: t2.id };
  });
  const count = (store, id) => p.evaluate(([s, id]) => DB.byIndex(s, 'tripId', id).then(a => a.length), [store, id]);

  await p.goto(`http://localhost:8765/podroznik/#/plan/${ids.t}`); await p.waitForTimeout(700);
  ok(await p.$('#pl-clear') !== null && await p.$('#pl-deltrip') !== null, 'przyciski na dole planu');
  // anulowanie – nic nie znika
  p.once('dialog', d => d.dismiss()); await p.click('#pl-clear'); await p.waitForTimeout(300);
  ok(await count('planItems', ids.t) === 4, 'anulowanie: punkty zostają');
  let msg = '';
  p.once('dialog', d => { msg = d.message(); d.accept(); }); await p.click('#pl-clear'); await p.waitForTimeout(700);
  ok(/\(4\)/.test(msg) && /zostają/.test(msg), 'pytanie z liczbą punktów: ' + msg);
  ok(await count('planItems', ids.t) === 0, 'plan wyczyszczony (punkty i pomysły)');
  ok(await count('segments', ids.t) === 1, 'pociąg zostaje');
  ok(await count('files', ids.t) === 0, 'bilet przypięty do punktu usunięty');
  ok(await count('planItems', ids.t2) === 1, 'inna podróż nietknięta');
  ok(await p.$('#pl-clear') === null, 'pusty plan – bez „Wyczyść plan”');

  // usunięcie całej podróży
  p.once('dialog', d => d.accept()); await p.click('#pl-deltrip'); await p.waitForTimeout(1200);
  ok(!(await p.evaluate(id => DB.get('trips', id), ids.t)), 'podróż usunięta');
  ok(await count('segments', ids.t) === 0, 'odcinki usunięte');
  ok(new RegExp(`#/plan/${ids.t2}$`).test(p.url()), 'plan przechodzi do innej podróży: ' + p.url());
  await p.screenshot({ path: `${dir}/t50-plan.png` });

  // usuwanie z edycji podróży nadal działa
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t2}/edytuj`); await p.waitForTimeout(700);
  if (await p.$('#del')) { p.once('dialog', d => d.accept()); await p.click('#del'); await p.waitForTimeout(800);
    ok(!(await p.evaluate(id => DB.get('trips', id), ids.t2)) && /#\/podroze$/.test(p.url()), 'usuwanie w edycji podróży działa'); }
  else ok(false, 'brak #del w edycji podróży');
  await p.goto('http://localhost:8765/podroznik/#/plan'); await p.waitForTimeout(600);
  ok(/Najpierw dodaj podróż/.test(await p.textContent('body')), 'bez podróży – pusty plan');

  // EN
  await p.evaluate(async () => { localStorage.setItem('podroznik-lang', 'en'); await DB.setSetting('lang', 'en'); const t = await DB.put('trips', { name: 'X', start: '2027-01-01', end: '2027-01-02' }); await DB.put('planItems', { tripId: t.id, date: '2027-01-01', time: '', title: 'A', cat: 'inne', order: 0 }); });
  await p.reload(); await p.waitForTimeout(500); await p.goto('http://localhost:8765/podroznik/#/plan'); await p.waitForTimeout(800);
  ok(/Clear plan/.test(await p.textContent('#pl-clear')) && /Delete the whole trip/.test(await p.textContent('#pl-deltrip')), 'EN: przyciski');
  await p.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
