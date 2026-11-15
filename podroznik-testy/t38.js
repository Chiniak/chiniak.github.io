// „📬 Z Gmaila”: logowanie (udawana wtyczka GoogleAuth z aplikacji na Androida), Gmail API symulowane na przykładowych mailach
// ze ZMYŚLONYMI danymi (mails/, fx/koncert.pdf). Sprawdza: wyszukiwanie, odczyt (treść HTML/tekst, załącznik PDF), aktywności
// (wycieczka, restauracja, koncert), grupowanie według podróży, dodawanie, pomijanie, brak powtórek, karta na ekranie głównym, odłączenie.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'podroznik-testy';
const M = f => fs.readFileSync(path.join(dir, 'mails', f), 'utf8');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const msg = (id, from, subject, body, { html = false, pdf = null } = {}) => ({
  id, internalDate: String(Date.now() - 86400e3), payload: {
    mimeType: 'multipart/mixed', headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }],
    parts: [{ mimeType: html ? 'text/html' : 'text/plain', body: { data: b64u(body), size: body.length } },
      ...(pdf ? [{ mimeType: 'application/pdf', filename: 'bilet.pdf', body: { attachmentId: 'att-' + id, size: pdf.length } }] : [])],
  },
});
const PDF = fs.readFileSync(path.join(dir, 'fx', 'koncert.pdf'));
const MSGS = [
  msg('m1', 'AirAsia <no-reply@airasia.com>', 'Your AirAsia booking is confirmed', M('airasia.txt')),
  msg('m2', 'Booking.com <noreply@booking.com>', 'Potwierdzenie rezerwacji', M('booking-hotel-pl.txt')),
  msg('m3', 'GetYourGuide <noreply@getyourguide.com>', 'Your booking is confirmed: Kuang Si Waterfalls and Butterfly Park Half-Day Tour', M('getyourguide.html'), { html: true }),
  msg('m4', 'TheFork <reservations@thefork.com>', 'Your reservation at Baan Suan Thai is confirmed', M('thefork.txt')),
  msg('m5', 'eBilet <bilety@ebilet.pl>', 'Twoje bilety – Koncert Filharmonia', 'Dziękujemy za zakup. Bilety w załączniku.', { pdf: PDF }),
  msg('m6', 'Sklep <news@sklep.pl>', 'Twoje zamówienie zostało wysłane', 'Paczka jest w drodze. Numer przesyłki 123.'),
  msg('m7', 'Trainline <auto@trainline.com>', 'Your trip is confirmed', M('trainline.txt')),
];
const MOCK = () => {
  window.__auth = [];
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    Filesystem: { writeFile: async o => ({ uri: 'file:///c/' + o.path }), rmdir: async () => {} }, Share: { share: async () => {} },
    GoogleAuth: {
      authorize: async o => { __auth.push([o.interactive, o.scopes.join()]); if (window.__deny) throw new Error('Anulowano'); return { accessToken: 'tok-123', scopes: o.scopes }; },
      revoke: async () => { __auth.push(['revoke']); },
    } } };
};
(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const hits = { list: 0, get: 0, att: 0, q: '' , auth: new Set() };
  await ctx.route(/^https:/, async r => {
    const u = new URL(r.request().url());
    if (u.host !== 'gmail.googleapis.com') return r.abort();
    hits.auth.add(r.request().headers().authorization);
    const p = u.pathname.replace('/gmail/v1/users/me', '');
    if (p === '/profile') return r.fulfill({ json: { emailAddress: 'anna.test@gmail.com' } });
    if (p === '/messages') { hits.list++; hits.q = u.searchParams.get('q'); return r.fulfill({ json: { messages: MSGS.map(m => ({ id: m.id })) } }); }
    let m = p.match(/^\/messages\/(\w+)\/attachments\/([\w-]+)$/);
    if (m) { hits.att++; return r.fulfill({ json: { data: b64u(PDF), size: PDF.length } }); }
    m = p.match(/^\/messages\/(\w+)$/);
    if (m) { hits.get++; return r.fulfill({ json: MSGS.find(x => x.id === m[1]) }); }
    r.fulfill({ status: 404, json: {} });
  });
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|Failed to load/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(700);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  console.log('empty home → gmail button:', !!(await p.$('a[href="#/gmail"]')));
  // istniejąca podróż obejmuje lot AirAsia (12.12) i restaurację (15.12)
  await p.evaluate(async () => DB.put('trips', { name: 'Tajlandia', destination: 'Bangkok', start: '2026-12-11', end: '2026-12-17' }));

  await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(500);
  console.log('intro:', await p.$eval('.gm-intro h2', e => e.textContent), '| button:', !!(await p.$('#gm-connect')));
  await p.click('#gm-connect'); await p.waitForTimeout(3500);
  console.log('auth calls:', JSON.stringify(await p.evaluate(() => __auth)), '| token header:', [...hits.auth].join());
  console.log('account:', await p.$eval('.gm-account', e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('query has from/subject:', /from:\(.*getyourguide.*\)/.test(hits.q) && /subject:\(.*rezerwacj/.test(hits.q), '| list:', hits.list, 'get:', hits.get, 'att:', hits.att);
  const groups = await p.$$eval('.gm-group', gs => gs.map(g => g.querySelector('.section').textContent.replace(/\s+/g, ' ').trim() + ' :: ' +
    [...g.querySelectorAll('.gm-item')].map(i => i.querySelector('.tl-route').textContent.trim() + ' @ ' + i.querySelector('.tl-time').textContent.trim()).join(' | ')));
  groups.forEach(g => console.log(' ', g));
  const seen = await p.evaluate(() => DB.getSetting('gmailSeen', {}));
  console.log('none:', Object.entries(seen).filter(([, m]) => m.s === 'none').map(([id]) => id).join(','),
    '| plan items:', JSON.stringify(Object.values(seen).flatMap(m => m.items.filter(i => i.kind === 'plan').map(i => [i.title, i.date, i.time, i.cat, i.place, i.cost, i.currency]))));
  await p.screenshot({ path: `${dir}/t38-list.png`, fullPage: true });

  // pomiń restaurację, dodaj wycieczkę pojedynczo, potem „Dodaj wszystkie” w grupie Tajlandia
  const keyOf = async title => p.evaluate(t => { const it = [...document.querySelectorAll('.gm-item')].find(i => i.textContent.includes(t)); return it && it.querySelector('[data-add]').dataset.add; }, title);
  const fork = await keyOf('Baan Suan Thai');
  await p.click(`[data-skip="${fork}"]`); await p.waitForTimeout(300);
  console.log('after skip items:', await p.$$eval('.gm-item', e => e.length));
  const gyg = await keyOf('Kuang Si');
  await p.click(`[data-add="${gyg}"]`); await p.waitForTimeout(1200);
  const planGyg = await p.evaluate(async () => (await DB.all('planItems')).map(i => [i.title, i.date, i.time, i.cat]));
  console.log('added plan:', JSON.stringify(planGyg), '| trips:', JSON.stringify(await p.evaluate(async () => (await DB.all('trips')).map(t => [t.name, t.start, t.end]))));
  const allBtn = await p.$('.gm-group[data-g] [data-all]');
  if (allBtn) { await allBtn.click(); await p.waitForTimeout(1500); }
  console.log('after all → hash:', await p.evaluate(() => location.hash.replace(/[\w-]{20,}/, 'ID')));
  const segs = await p.evaluate(async () => (await DB.all('segments')).map(s => `${s.type} ${s.from || s.name || ''}→${s.to || ''} ${s.depart} [${s.tripId.slice(0, 4)}]`));
  console.log('segments:', segs.length, JSON.stringify(segs));

  // koncert z PDF – bilet dołączony
  await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(800);
  const conc = await keyOf('Filharmonia');
  console.log('concert proposal:', !!conc);
  if (conc) { await p.click(`[data-add="${conc}"]`); await p.waitForTimeout(1500); }
  const files = await p.evaluate(async () => (await DB.all('files')).map(f => [f.segmentId.slice(0, 2), f.name || (f.blob && f.blob.name), f.mime || (f.blob && f.blob.type)]));
  console.log('ticket files:', JSON.stringify(files), '| att fetches:', hits.att);

  // ponowne sprawdzenie – bez powtórek i bez pobierania tych samych maili
  const before = hits.get;
  await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(500);
  await p.click('#gm-scan'); await p.waitForTimeout(2000);
  console.log('rescan get calls:', hits.get - before, '| proposals left:', await p.$$eval('.gm-item', e => e.map(i => i.querySelector('.tl-route').textContent.trim())));

  // karta na ekranie głównym (jest jeszcze coś do dodania?) + ustawienia
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(700);
  console.log('home card:', await p.$eval('.gm-home', e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '(brak)'), '| link:', !!(await p.$('a[href="#/gmail"]')));
  await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(600);
  console.log('settings:', await p.$eval('a[href^="#/gmail"]', e => e.textContent.replace(/\s+/g, ' ').trim()));

  // kopia zapasowa nie zawiera konta Google ani tematów maili (plik kopii bywa wysyłany drugiej osobie)
  const snap = await p.evaluate(async () => JSON.stringify(await App.Backup.snapshot()));
  console.log('backup has gmail:', /gmailSeen|anna\.test@gmail|Baan Suan Thai is confirmed|"key":"gmail"/.test(snap), '| backup has trips:', /Tajlandia/.test(snap));

  // wersja angielska ekranu
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); }); await p.reload(); await p.waitForTimeout(600);
  await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(800);
  console.log('EN:', await p.$eval('.gm-account', e => e.textContent.replace(/\s+/g, ' ').trim()), '|', await p.$eval('#view', e => e.textContent.replace(/\s+/g, ' ').slice(-160)));
  await p.screenshot({ path: `${dir}/t38-en.png`, fullPage: true });
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'pl'); }); await p.reload(); await p.waitForTimeout(600);

  // odłączenie
  await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(500);
  await p.click('#gm-off'); await p.waitForTimeout(800);
  console.log('after disconnect:', JSON.stringify(await p.evaluate(async () => [await DB.getSetting('gmail', null), Object.keys(await DB.getSetting('gmailSeen', {})).length, __auth.slice(-1)[0]])), '| intro:', !!(await p.$('#gm-connect')),
    '| plan kept:', await p.evaluate(async () => (await DB.all('planItems')).length));

  // przeglądarka bez klienta Web – informacja zamiast przycisku
  const ctx2 = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); await ctx2.route(/^https:/, r => r.abort());
  const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://localhost:8765/podroznik/#/gmail'); await q.waitForTimeout(600);
  console.log('web:', await q.$eval('.gm-intro .error', e => e.textContent.trim()).catch(() => '-'), '| button:', !!(await q.$('#gm-connect')));
  console.log('errors:', errs); await b.close();
})();
