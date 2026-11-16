// t45: dziennik podróży (journal.js): lista dni, nastrój, tekst (zapis w trakcie pisania), zdjęcia (dodawanie, podgląd, usuwanie),
// „co było w planie”, strzałki dni, wejścia (Dziś, podróż), przypomnienie o 21:00, pamiątka HTML, tekst, kopia zapasowa, usuwanie z podróżą,
// aktualizacja bazy v2 → v3, angielski
const { chromium, devices } = require('playwright');
const path = require('path');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', acceptDownloads: true });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  const fails = [];
  const ok = (c, w) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + w); if (!c) fails.push(w); };
  const txt = async s => ((await p.innerText(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const B = 'http://localhost:8765/podroznik/';
  const IMG = [path.join(__dirname, '..', 'podroznik', 'icon-512.png'), path.join(__dirname, '..', 'podroznik', 'apple-touch-icon.png')];

  // ---------- aktualizacja bazy: stara wersja 2 bez dziennika → v3, dane zostają ----------
  await p.goto(B + 'manifest.webmanifest');
  await p.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('podroznik', 2);
    // dokładnie magazyny i indeksy wersji 2 (db.js przed dziennikiem)
    const V2 = { trips: ['start'], segments: ['tripId', 'depart'], files: ['segmentId', 'tripId'], planItems: ['tripId', 'date'], packItems: ['tripId'], templates: [], reminders: ['tripId', 'at'], docs: ['type'], expenses: ['tripId', 'date'] };
    r.onupgradeneeded = () => { const db = r.result; for (const [n, ix] of Object.entries(V2)) { const s = db.createObjectStore(n, { keyPath: 'id' }); ix.forEach(i => s.createIndex(i, i)); } db.createObjectStore('settings', { keyPath: 'key' }); };
    r.onsuccess = () => { const db = r.result; const t = db.transaction('trips', 'readwrite'); t.objectStore('trips').put({ id: 'old1', name: 'Stara podróż', start: '2025-05-01', end: '2025-05-03' }); t.oncomplete = () => { db.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }));
  await p.goto(B + '#/podroze'); await p.waitForTimeout(800);
  const up = await p.evaluate(async () => { const db = await DB.open(); return [db.version, [...db.objectStoreNames].includes('journal'), [...db.objectStoreNames].includes('journalPhotos'), !!(await DB.get('trips', 'old1'))]; });
  ok(JSON.stringify(up) === '[3,true,true,true]', 'baza v2 → v3: nowe magazyny, stara podróż zostaje – ' + JSON.stringify(up));

  const ids = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Gruzja', destination: 'Tbilisi', start: App.addDays(T, -2), end: App.addDays(T, 3) });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T, -1), time: '10:00', title: 'Twierdza Narikala', cat: 'zwiedzanie', order: 0 });
    await DB.put('segments', { tripId: t.id, type: 'pociag', from: 'Tbilisi', to: 'Batumi', depart: App.addDays(T, -1) + 'T15:00', arrive: App.addDays(T, -1) + 'T20:00' });
    await DB.put('expenses', { tripId: t.id, title: 'chaczapuri', amount: 40, currency: 'PLN', cat: 'jedzenie', date: App.addDays(T, -1) });
    const f = await DB.put('trips', { name: 'Przyszła', start: App.addDays(T, 10), end: App.addDays(T, 12) });
    return { t: t.id, f: f.id, T, y: await (async () => App.addDays(T, -1))() };
  });

  // ---------- wejścia ----------
  await p.goto(B + `#/podroze/${ids.t}`); await p.waitForTimeout(800);
  ok(/Dziennik podróży/.test(await txt('.td-tools')), 'podróż: wiersz Dziennik podróży');
  await p.goto(B + `#/podroze/${ids.f}`); await p.waitForTimeout(800);
  ok(!/Dziennik podróży/.test(await txt('.td-tools')), 'przyszła podróż: bez dziennika');
  await p.goto(B + `#/dzis/${ids.t}`); await p.waitForTimeout(800);
  ok(/Jak minął dzień\?/.test(await txt('.dz-journal')), 'Dziś: karta „Jak minął dzień?”');
  await p.click('.dz-journal'); await p.waitForTimeout(800);
  ok(p.url().endsWith(`#/dziennik/${ids.t}/${ids.T}`), 'karta prowadzi do wpisu z dziś');

  // ---------- wpis: nastrój, tekst, zapis w trakcie pisania ----------
  ok(/dzień 3 z 6/i.test(await txt('.jr-dhead')), 'nagłówek: dzień 3 z 6');
  ok(!!(await p.$('.jr-dhead .dz-arrow.off[aria-hidden]')) && (await p.$$('.jr-dhead a.dz-arrow')).length === 1, 'dziś: tylko strzałka wstecz (przyszłe dni zablokowane)');
  await p.click('.jr-mood-opt:has-text("świetny")'); await p.waitForTimeout(400);
  await p.fill('#jr-txt', 'Rano spacer po Starym Mieście.\n\nWieczorem kolacja z widokiem na rzekę.'); await p.waitForTimeout(1200);
  let e = await p.evaluate(async ([id, T]) => App.Journal.entry(id, T), [ids.t, ids.T]);
  ok(e && e.mood === '5' && /kolacja z widokiem/.test(e.text), 'zapis w trakcie pisania: nastrój 5 i tekst');
  ok(await txt('#jr-saved') === 'Zapisane', 'informacja „Zapisane”');
  // tekst wpisany i od razu wyjście – zapis przy opuszczeniu ekranu
  await p.fill('#jr-txt', e.text + ' Dopisek.');
  await p.evaluate(() => { location.hash = '#/podroze'; }); await p.waitForTimeout(800);
  e = await p.evaluate(async ([id, T]) => App.Journal.entry(id, T), [ids.t, ids.T]);
  ok(/Dopisek\.$/.test(e.text), 'zapis przy wyjściu z ekranu');

  // ---------- zdjęcia ----------
  await p.goto(B + `#/dziennik/${ids.t}/${ids.T}`); await p.waitForTimeout(800);
  await p.setInputFiles('#jr-file', IMG); await p.waitForTimeout(2000);
  ok((await p.$$('.jr-photos [data-ph]')).length === 2, 'dodane 2 zdjęcia');
  const ph = await p.evaluate(async id => (await DB.byIndex('journalPhotos', 'tripId', id)).map(x => [x.blob.type, x.blob.size > 0, x.date]), ids.t);
  ok(ph.length === 2 && ph.every(x => x[0] === 'image/jpeg' && x[1] && x[2] === ids.T), 'zdjęcia zmniejszone do JPEG – ' + JSON.stringify(ph));
  await p.click('.jr-photos [data-ph]'); await p.waitForTimeout(300);
  ok(await p.isVisible('#jr-viewer'), 'podgląd zdjęcia na pełnym ekranie');
  await p.click('#jr-del'); await p.waitForTimeout(800);
  ok((await p.$$('.jr-photos [data-ph]')).length === 1 && !(await p.isVisible('#jr-viewer')), 'usunięte zdjęcie');
  await p.screenshot({ path: `${SP}/t45-day.png`, fullPage: true });

  // ---------- wczoraj: podpowiedź z planu, strzałki ----------
  await p.click('.jr-dhead a.dz-arrow'); await p.waitForTimeout(800);
  ok(p.url().endsWith(`#/dziennik/${ids.t}/${ids.y}`), 'strzałka wstecz → wczoraj');
  const facts = await txt('.jr-facts');
  ok(/Twierdza Narikala/.test(facts) && /Tbilisi → Batumi/.test(facts) && /Wydano 40 PLN/.test(facts) && await p.$eval('.jr-facts', d => d.open), 'wczoraj: podpowiedź – plan, pociąg, wydatki (rozwinięta, gdy brak tekstu)');
  await p.fill('#jr-txt', 'Pociąg do Batumi.'); await p.waitForTimeout(1200);

  // ---------- lista dni ----------
  await p.goto(B + `#/dziennik/${ids.t}`); await p.waitForTimeout(800);
  const days = await p.$$eval('.jr-day', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log('lista:', JSON.stringify(days));
  ok(days.length === 3 && /^Dziś · dzień 3/i.test(days[0]) && /😍/.test(days[0]) && /Rano spacer/.test(days[0]), 'lista: 3 dni, dziś na górze z nastrojem i tekstem');
  ok(/Pociąg do Batumi/.test(days[1]) && /Dopisz wspomnienie/.test(days[2]), 'lista: wczoraj z tekstem, pierwszy dzień pusty');
  ok((await p.$$('.jr-day.is-today .jr-thumbs img')).length === 1, 'miniatura zdjęcia');
  ok(/2 dni opisane z 6 · 1 zdjęcie/.test(await txt('.jr-head')), 'licznik – ' + await txt('.jr-head'));
  await p.screenshot({ path: `${SP}/t45-list.png`, fullPage: true });

  // pamiątka HTML
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('#jr-html')]);
  if (dl) {
    const f = path.join(SP, await dl.suggestedFilename()); await dl.saveAs(f);
    const html = require('fs').readFileSync(f, 'utf8');
    require('fs').unlinkSync(f); // plik testowy – nie zostawiamy w repozytorium
    ok(/^dziennik-gruzja\.html$/.test(dl.suggestedFilename()) && /Rano spacer/.test(html) && /Pociąg do Batumi/.test(html) && (html.match(/<img src="data:image\/jpeg/g) || []).length === 1 && /😍/.test(html), 'pamiątka HTML: tekst, nastrój, zdjęcie wbudowane');
  } else ok(false, 'pamiątka HTML: brak pobrania');
  // tekst (schowek)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.evaluate(() => { navigator.share = undefined; });
  await p.click('#jr-text'); await p.waitForTimeout(500);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(/^Gruzja \(/.test(clip) && /dzień 2\)\n/.test(clip) && /Pociąg do Batumi/.test(clip), 'tekst dziennika w schowku');

  // ---------- przypomnienie o 21:00 ----------
  const rem = async () => p.evaluate(async id => (await Reminders.load()).list.filter(r => r.id.startsWith('journal:' + id)).map(r => r.id.split(':')[2] + '@' + r.at.slice(11)), ids.t);
  const r1 = await rem();
  console.log('przypomnienia dziennika:', JSON.stringify(r1));
  ok(!r1.some(x => x.startsWith(ids.T)) && !r1.some(x => x.startsWith(ids.y)) && r1.includes(`${await p.evaluate(T => App.addDays(T, 1), ids.T)}@21:00`), 'przypomnienie 21:00 tylko dla dni bez wpisu');
  ok(r1.length === 4, 'dni bez wpisu: 4 z 6 – ' + r1.length);

  // ---------- kopia zapasowa ----------
  const snap = await p.evaluate(async () => { const s = await App.Backup.snapshot(); return [s.counts.journal, s.counts.journalPhotos, !!s.stores.journalPhotos[0].blobData]; });
  ok(JSON.stringify(snap) === '[2,1,true]', 'kopia zapasowa: wpisy i zdjęcie (data URL) – ' + JSON.stringify(snap));

  // ---------- angielski ----------
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'en'));
  await p.goto(B + `#/dziennik/${ids.t}/${ids.y}`); await p.reload(); await p.waitForTimeout(1000);
  const en = await txt('#view');
  const pl = ['dzień', 'świetny', 'Zdjęcia', 'Dodaj', 'Co było', 'Wydano', 'Zapisane'].filter(w => en.includes(w));
  ok(!pl.length, 'angielski (dzień): bez polskich tekstów ' + JSON.stringify(pl));
  await p.goto(B + `#/dziennik/${ids.t}`); await p.waitForTimeout(800);
  const en2 = await txt('#view');
  const pl2 = ['dzień', 'Dopisz', 'opisan', 'zdjęci', 'Zapisz', 'Udostępnij'].filter(w => en2.includes(w));
  ok(!pl2.length, 'angielski (lista): bez polskich tekstów ' + JSON.stringify(pl2));
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'pl'));

  // ---------- usunięcie podróży usuwa dziennik ----------
  await p.goto(B + `#/podroze/${ids.t}/edytuj`); await p.reload(); await p.waitForTimeout(800);
  await p.click('#del'); await p.waitForTimeout(1200);
  const left = await p.evaluate(async id => [(await DB.byIndex('journal', 'tripId', id)).length, (await DB.byIndex('journalPhotos', 'tripId', id)).length], ids.t);
  ok(JSON.stringify(left) === '[0,0]', 'usunięcie podróży usuwa wpisy i zdjęcia dziennika');

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL OK');
  console.log('errors:', errs);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
