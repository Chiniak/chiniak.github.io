// aplikacja na Androida (Capacitor): native.js – udawany Capacitor z wtyczkami Filesystem i Share.
// Kopia zapasowa, .ics, rozliczenie i skan PDF idą przez natywne „Udostępnij”; anulowanie nie pokazuje błędu.
// Bez Capacitora (przeglądarka / stary APK) – nic się nie zmienia.
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
const MOCK = () => {
  window.__calls = [];
  window.__cancel = false;
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      Filesystem: {
        writeFile: async o => { __calls.push(['write', o.path, o.directory, o.data.length]); return { uri: 'file:///cache/' + o.path }; },
        rmdir: async o => { __calls.push(['rmdir', o.path]); },
      },
      Share: { share: async o => { __calls.push(['share', o.title || '', (o.text || '').slice(0, 30), o.files || []]); if (__cancel) throw new Error('Share canceled'); } },
    },
  };
};
(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  let downloads = 0; p.on('download', () => downloads++);
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  console.log('native:', await p.evaluate(() => [PodroznikNative.isNative, PodroznikNative.platform, document.documentElement.classList.contains('native-app'), navigator.canShare({ files: [] })]));
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const id = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Laos', destination: 'Luang Prabang', start: App.addDays(T, 5), end: App.addDays(T, 12) });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'WAW', to: 'LPQ', depart: `${App.addDays(T, 5)}T10:00`, arrive: `${App.addDays(T, 6)}T08:00` });
    await DB.put('docs', { type: 'paszport', name: 'Paszport', number: 'EA123', expires: App.addDays(T, 900), blob: new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }) });
    return t.id;
  });

  // kopia zapasowa
  await p.goto('http://localhost:8765/podroznik/#/ustawienia/kopia'); await p.waitForTimeout(700);
  await p.click('#bk-export button[type=submit]'); await p.waitForTimeout(1200);
  const c1 = await p.evaluate(() => __calls.filter(c => c[0] !== 'rmdir'));
  console.log('backup:', JSON.stringify(c1.map(c => c[0] === 'share' ? ['share', c[1], c[3].map(u => u.replace(/\d{10,}/, 'T'))] : c.slice(0, 3))));
  console.log('backup toast:', await p.$eval('.toast', e => e.textContent).catch(() => '-'));

  // anulowanie udostępniania – bez błędu i bez pobierania
  await p.evaluate(() => { __calls.length = 0; __cancel = true; });
  await p.click('#bk-export button[type=submit]'); await p.waitForTimeout(1200);
  console.log('cancel → share calls:', await p.evaluate(() => __calls.filter(c => c[0] === 'share').length), '| downloads:', downloads);
  await p.evaluate(() => { __cancel = false; __calls.length = 0; });

  // .ics
  await p.evaluate(async id => App.Reminders.exportTrips([id], 'Laos'), id); await p.waitForTimeout(800);
  console.log('ics:', JSON.stringify(await p.evaluate(() => __calls.filter(c => c[0] === 'share').map(c => c[3].map(u => u.split('-').pop())))));

  // skan PDF w dokumentach (link blob:)
  await p.evaluate(() => { __calls.length = 0; });
  await p.goto('http://localhost:8765/podroznik/#/dokumenty'); await p.waitForTimeout(600);
  await p.click('.card, a[href*="dokument"]'); await p.waitForTimeout(700);
  const pages = ctx.pages().length;
  const link = await p.$('#doc-scan a');
  if (link) { await link.click(); await p.waitForTimeout(900); }
  console.log('pdf link:', !!link, '| new tabs:', ctx.pages().length - pages, '| shared:', JSON.stringify(await p.evaluate(() => __calls.filter(c => c[0] === 'share').map(c => c[3].map(u => u.split('-').pop())))));
  console.log('downloads total:', downloads);

  // zwykła przeglądarka – bez zmian
  const ctx2 = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx2.route(/^https:/, r => r.abort());
  const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://localhost:8765/podroznik/#/podroze'); await q.waitForTimeout(500);
  console.log('web:', await q.evaluate(() => [PodroznikNative.isNative, PodroznikNative.platform, document.documentElement.classList.contains('native-app'), typeof navigator.share]));
  console.log('errors:', errs); await b.close();
})();
