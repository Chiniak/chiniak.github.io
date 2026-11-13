// kopia poza telefonem: przypomnienie 3 dni przed wyjazdem (tylko gdy są zmiany od ostatniej kopii), krok w „Przygotuj offline”,
// ekran kopii (ostrzeżenie o zmianach, porady, powrót do listy), przełącznik w ustawieniach przypomnień, wersja angielska.
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', acceptDownloads: true });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Tajlandia', destination: 'Bangkok', start: App.addDays(T, 2), end: App.addDays(T, 9) });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'WAW', to: 'BKK', depart: `${App.addDays(T, 2)}T13:00`, arrive: `${App.addDays(T, 3)}T06:00` });
    return t.id;
  });
  const rem = () => p.evaluate(async () => { const { list } = await Reminders.load(); return Reminders.active(list).filter(r => r.id.startsWith('backup:')).map(r => `${r.title} | ${r.body}`); });

  console.log('reminder (no backup yet):', await rem());

  // ekran „Przygotuj offline” – krok i przycisk
  await p.goto(`http://localhost:8765/podroznik/#/przygotuj/${id}`); await p.waitForTimeout(800);
  const step = () => p.$eval('.pr-row[data-k="backup"]', e => `${e.querySelector('.pr-mark').textContent} ${e.querySelector('.pr-txt').textContent}`);
  console.log('prep step:', await step(), '| button:', !!(await p.$('.pr-backup')));
  await p.click('.pr-backup'); await p.waitForTimeout(600);
  console.log('backup screen:', await p.evaluate(() => location.hash), '| warn:', !!(await p.$('.bk-warn')), '| tips:', await p.$$eval('.bk-tips li', e => e.length),
    '| back →', await (async () => { await p.evaluate(() => history.replaceState(null, '', location.href)); return ''; })());
  await p.screenshot({ path: `${dir}/t33-backup.png`, fullPage: true });

  // zapis kopii z hasłem (w testowej przeglądarce: pobranie pliku)
  await p.fill('input[name=pw]', 'tajne123'); await p.fill('input[name=pw2]', 'tajne123');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bk-export button[type=submit]')]);
  console.log('file:', dl.suggestedFilename()); await p.waitForTimeout(600);
  console.log('warn after backup:', !!(await p.$('.bk-warn')), '| reminder:', await rem());

  await p.goto(`http://localhost:8765/podroznik/#/przygotuj/${id}`); await p.waitForTimeout(800);
  console.log('prep step after:', await step(), '| button:', !!(await p.$('.pr-backup')));

  // nowa zmiana (nocleg) → znowu nieaktualna
  await p.waitForTimeout(20);
  await p.evaluate(async id => DB.put('segments', { tripId: id, type: 'nocleg', name: 'Hotel Sala', depart: `${App.addDays(App.todayStr(), 3)}T14:00` }), id);
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(300);
  await p.goto(`http://localhost:8765/podroznik/#/przygotuj/${id}`); await p.waitForTimeout(800);
  console.log('after change reminder:', (await rem()).length, '| step:', await step());
  await p.goto('http://localhost:8765/podroznik/#/ustawienia/kopia'); await p.waitForTimeout(600);
  console.log('warn on backup screen:', !!(await p.$('.bk-warn')));
  // powrót: z „Przygotuj offline” wraca do listy
  await p.goto(`http://localhost:8765/podroznik/#/ustawienia/kopia?wroc=/przygotuj/${id}`); await p.waitForTimeout(600);
  await p.click('#back'); await p.waitForTimeout(600);
  console.log('back →', await p.evaluate(() => location.hash.split('/')[1]));

  // przełącznik w ustawieniach przypomnień
  await p.goto('http://localhost:8765/podroznik/#/ustawienia/przypomnienia'); await p.waitForTimeout(600);
  const sw = await p.$('input[name=backup]');
  console.log('toggle:', !!sw, sw ? await sw.isChecked() : null);
  if (sw) { await p.evaluate(() => { const i = document.querySelector('input[name=backup]'); i.click(); }); await p.waitForTimeout(600);
    console.log('saved backup:', (await p.evaluate(() => DB.getSetting('reminders', null))).backup, '| reminder:', (await rem()).length); }

  // po angielsku
  await p.evaluate(() => localStorage.setItem('podroznik-lang', 'en'));
  await p.goto('http://localhost:8765/podroznik/#/ustawienia/kopia'); await p.reload(); await p.waitForTimeout(800);
  console.log('EN tips:', await p.$eval('.bk-tips', e => e.innerText.replace(/\s+/g, ' ')));
  await p.goto(`http://localhost:8765/podroznik/#/przygotuj/${id}`); await p.waitForTimeout(800);
  console.log('EN step:', await p.$eval('.pr-row[data-k="backup"]', e => e.innerText.replace(/\s+/g, ' ')));
  console.log('errors:', errs);
  await b.close();
})();
