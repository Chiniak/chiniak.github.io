// przewodnik w „Przygotuj offline” (krok guide: cel + noclegi, brak artykułu zapamiętany) i skrót w trybie „Dziś”
const { chromium, devices } = require('playwright'); const fs = require('fs');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const calls = [];
  await ctx.route(/^https:\/\/(?!localhost).*/, r => {
    const u = new URL(r.request().url());
    if (!/wikivoyage/.test(u.host)) return r.abort();
    const lang = u.host.slice(0, 2), a = u.searchParams.get('action'), page = u.searchParams.get('page');
    calls.push(lang + ':' + page);
    if (a === 'parse') {
      const f = { 'pl:Kraków': 'wv-pl-krakow', 'en:Lisbon': 'wv-en-lisbon' }[lang + ':' + page];
      return f ? r.fulfill({ body: fs.readFileSync(`${__dirname}/fx/${f}.json`), contentType: 'application/json' }) : r.fulfill({ json: { error: { code: 'missingtitle' } } });
    }
    r.abort();
  });
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  const today = await p.evaluate(() => App.todayStr());
  const id = await p.evaluate(async d => {
    const t = await DB.put('trips', { name: 'Polska i Portugalia', destination: 'Kraków', start: d, end: App.addDays(d, 4) });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', city: 'Lisbon', start: d + 'T15:00', end: App.addDays(d, 2) + 'T10:00' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', city: 'Nibylandia', start: App.addDays(d, 2) + 'T15:00', end: App.addDays(d, 4) + 'T10:00' });
    return t.id;
  }, today);

  const st = await p.evaluate(async id => (await App.Prep.check(id)).steps.find(s => s.key === 'guide'), id);
  ok(st && st.done === false && /Kraków/.test(st.txt) && /Lisbon/.test(st.txt), 'krok „Przewodnik”: do pobrania – ' + (st && st.txt));
  await p.goto(`http://localhost:8765/podroznik/#/przygotuj/${id}`); await p.waitForTimeout(800);
  ok(await p.$('.pr-row[data-k="guide"]') !== null, 'wiersz na liście kontrolnej');

  // tylko krok przewodnika (reszta bez sieci i tak by się nie udała)
  const n = await p.evaluate(async id => App.Guide.prefetch(await DB.get('trips', id)), id);
  ok(n === 2, 'pobrano 2 przewodniki (Kraków po polsku, Lisbon po angielsku): ' + n);
  const g = await p.evaluate(async id => (await App.Guide.forTrip(id)).map(x => x.id), id);
  ok(g.includes('pl:Kraków') && g.includes('en:Lisbon'), 'przewodniki przypięte do podróży: ' + g.join(', '));
  ok(calls.includes('pl:Lisbon') && calls.includes('en:Lisbon') && calls.includes('en:Nibylandia'), 'kolejne języki przy braku artykułu');
  const st2 = await p.evaluate(async id => (await App.Prep.check(id)).steps.find(s => s.key === 'guide'), id);
  ok(st2.done === true && /offline/.test(st2.txt), 'po pobraniu krok gotowy (Nibylandii nie ma – nie wraca): ' + st2.txt);
  calls.length = 0;
  ok(await p.evaluate(async id => App.Guide.prefetch(await DB.get('trips', id)), id) === 0 && !calls.length, 'drugie uruchomienie nic nie pobiera');

  // ten sam artykuł w innej podróży – bez sieci, tylko dopięcie
  const id2 = await p.evaluate(async () => (await DB.put('trips', { name: 'Kraków 2', destination: 'Kraków', start: '2028-01-01', end: '2028-01-02' })).id);
  ok(await p.evaluate(async id => App.Guide.prefetch(await DB.get('trips', id)), id2) === 1 && !calls.length, 'artykuł z innej podróży dopięty bez pobierania');

  // brak sieci → błąd, nie zapamiętuje jako „nie ma”
  const id3 = await p.evaluate(async () => (await DB.put('trips', { name: 'X', destination: 'Gdańsk', start: '2028-02-01', end: '2028-02-02' })).id);
  await ctx.unroute(/^https:\/\/(?!localhost).*/); await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  const e3 = await p.evaluate(async id => App.Guide.prefetch(await DB.get('trips', id)).then(() => 'ok', e => 'err'), id3);
  ok(e3 === 'err', 'bez sieci – błąd (krok do powtórzenia)');
  ok(await p.evaluate(async id => (await App.Guide.missing(await DB.get('trips', id))).length, id3) === 1, 'Gdańsk dalej do pobrania');

  // tryb Dziś – skrót
  await p.goto(`http://localhost:8765/podroznik/#/dzis/${id}`); await p.waitForTimeout(800);
  ok(await p.$(`.dz-tools a[href="#/przewodnik/${id}"]`) !== null, 'skrót „Przewodnik” w trybie Dziś');
  await p.screenshot({ path: `${dir}/t67-dzis.png` });
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
