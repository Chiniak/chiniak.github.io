// „Udostępnij → Tripwillow”: PWA share_target (POST przez sw.js), ekran wyboru, rezerwacja z PDF, bilet do odcinka, dokument, punkt planu, sam tekst
const { chromium, devices } = require('playwright'); const fs = require('fs');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const FX = `${__dirname}/fx`;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/^https:\/\/(?!localhost).*/, r => r.abort());
  await p.goto('http://localhost:8765/podroznik/#/podroze');
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker steruje stroną');
  const m = await p.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).share_target);
  ok(m.method === 'POST' && m.enctype === 'multipart/form-data' && m.params.files[0].accept.includes('application/pdf'), 'manifest: share_target z plikami');

  const today = await p.evaluate(() => App.todayStr());
  const ids = await p.evaluate(async d => {
    const t = await DB.put('trips', { name: 'Hanoi', destination: 'Hanoi', start: d, end: App.addDays(d, 5) });
    const s = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Hanoi HAN', depart: App.addDays(d, 1) + 'T10:00', arrive: App.addDays(d, 2) + 'T06:00' });
    return { t: t.id, s: s.id };
  }, today);

  // 1) PWA: formularz POST jak przy udostępnianiu (2 pliki + tekst) → sw.js → #/udostepnione
  await p.evaluate(() => {
    const f = document.createElement('form'); f.method = 'POST'; f.action = 'udostepnij-do'; f.enctype = 'multipart/form-data';
    f.innerHTML = '<input type="file" name="files" multiple><input name="title" value="Bilet">'; f.id = 'tf'; document.body.append(f);
  });
  await p.setInputFiles('#tf input[type=file]', [`${FX}/boarding.pdf`, `${FX}/qr.png`]);
  await Promise.all([p.waitForNavigation(), p.evaluate(() => document.getElementById('tf').submit())]);
  await p.waitForSelector('.sh-files .li', { timeout: 8000 });
  ok(p.url().endsWith('#/udostepnione') && !p.url().includes('?'), 'po udostępnieniu: ekran „Udostępnione”, adres bez ?udostepnione');
  const names = await p.$$eval('.sh-files b', e => e.map(x => x.textContent));
  ok(names.join() === 'boarding.pdf,qr.png', 'oba pliki odebrane: ' + names.join(', '));
  const opts = await p.$$eval('.sh-opt', e => e.map(x => x.dataset.k));
  ok(opts.join() === 'read,plan,seg', 'opcje dla PDF + zdjęcia: ' + opts.join(', '));
  ok(await p.evaluate(async () => !(await caches.keys()).includes('tw-udostepnione')), 'pamięć udostępnień wyczyszczona');
  await p.screenshot({ path: `${dir}/t69-wybor.png`, fullPage: true });

  // bilet do odcinka
  await p.selectOption('#sh-seg', '0'); await p.click('[data-go=seg]');
  await p.waitForFunction(id => location.hash === `#/odcinek/${id}`, ids.s, { timeout: 15000 });
  const nf = await p.evaluate(async id => (await DB.byIndex('files', 'segmentId', id)).map(f => f.kind).sort().join(), ids.s);
  ok(nf === 'image,pdf', 'bilety dodane do lotu: ' + nf);

  // 2) PDF → rezerwacja (#/wklej odczytuje plik)
  const send = async (paths, extra = {}) => p.evaluate(async ({ list, extra }) => {
    const files = list.map(([name, type, b64]) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type }));
    App.Shared.receive({ files, ...extra });
  }, { list: paths.map(([f, type, name]) => [name || f, type, fs.readFileSync(`${FX}/${f}`).toString('base64')]), extra });
  await send([['vietjet.pdf', 'application/pdf']]);
  await p.waitForSelector('[data-go=read]');
  ok(await p.$('[data-go=doc]') !== null, 'jeden PDF: także „Dokument”');
  await p.click('[data-go=read]'); await p.waitForFunction(() => location.hash === '#/wklej');
  await p.waitForSelector('#em-out .em-card, #em-out .error', { timeout: 15000 });
  ok((await p.$$('#em-out .em-card')).length >= 1 && (await p.inputValue('#em-text')).length > 50, 'PDF odczytany na ekranie „Dodaj z maila”: ' + (await p.textContent('#em-out')).slice(0, 200));

  // 3) .ics jako plik tekstowy
  await send([['kalendarz-ics.txt', 'text/calendar', 'lot.ics']]);
  await p.waitForSelector('[data-go=read]');
  ok((await p.$$eval('.sh-opt', e => e.map(x => x.dataset.k))).join() === 'read', '.ics: tylko „Rezerwacja”');

  // 4) zdjęcie → dokument
  await send([['qr.png', 'image/png', 'paszport.png']]);
  await p.waitForSelector('[data-go=doc]'); await p.click('[data-go=doc]');
  await p.waitForFunction(() => location.hash === '#/dokumenty/nowy');
  await p.waitForSelector('#doc-file-name');
  ok((await p.textContent('#doc-file-name')) === 'paszport.png', 'formularz dokumentu ze skanem: ' + await p.textContent('#doc-file-name'));

  // 5) screen → punkt planu
  await send([['screenshot.png', 'image/png']]);
  await p.waitForSelector('[data-go=plan]'); await p.click('[data-go=plan]');
  await p.waitForFunction(id => location.hash.startsWith(`#/plan/${id}/nowy`) && location.hash.includes('plik=1'), ids.t);
  ok(true, 'punkt planu z pliku: ' + await p.evaluate(() => location.hash));

  // 6) sam tekst → „Dodaj z maila”
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
  await p.evaluate(() => App.Shared.receive({ text: 'Booking confirmation VN 123' }));
  await p.waitForFunction(() => location.hash === '#/wklej');
  ok((await p.inputValue('#em-text')).includes('VN 123'), 'tekst trafia do „Dodaj z maila”');

  // 7) nieobsługiwany plik i pusty ekran
  await send([['cam.y4m', 'video/x-y4m']]);
  await p.waitForSelector('.sh-opts .error'); ok(true, 'nieobsługiwany plik: komunikat');
  await p.click('#sh-drop'); await p.waitForTimeout(300);
  await p.goto('http://localhost:8765/podroznik/#/udostepnione'); await p.waitForTimeout(500);
  ok(/Nic tu nie ma/.test(await p.textContent('#view')), 'po „Odrzuć” – pusty ekran');
  ok(!errs.length, 'bez błędów strony ' + errs.join(' | '));
  await b.close(); console.log(bad ? `BŁĘDY: ${bad}` : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})();
