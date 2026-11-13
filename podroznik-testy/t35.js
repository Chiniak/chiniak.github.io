// odczyt rezerwacji z maili i plików: Booking.com (lot, hotel PL), Gotogate (zmiana rozkładu), Trip.com (lot, pociąg w Chinach),
// Trainline (przesiadki), Rail Europe, Agoda, Airbnb (12 h AM/PM), AirAsia, 12Go (autobus), HTML zamiast tekstu,
// fałszywe numery lotów (VAT „FR 58 …”), pliki: PDF (bilet dołączony do odcinka), .ics, .eml (quoted-printable, HTML).
// Dane w przykładach są zmyślone (układ jak w prawdziwych mailach).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const M = f => fs.readFileSync(path.join(__dirname, 'mails', f), 'utf8');
const FX = path.join(__dirname, 'fx');
const dir = process.argv[2] || 'podroznik-testy';
let fails = 0;
const check = (name, got, want) => {
  const bad = Object.entries(want).filter(([k, v]) => String(got && got[k]) !== String(v)).map(([k, v]) => `${k}: ${got && got[k]} ≠ ${v}`);
  console.log(`${bad.length ? '✗' : '✓'} ${name}${bad.length ? ' — ' + bad.join('; ') : ''}`);
  if (bad.length) fails++;
};
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  const parse = t => p.evaluate(t => App.Email.parse(t), t);

  let r = await parse(M('booking-lot.txt'));
  check('Booking.com lot – tam', r[0], { type: 'lot', number: 'TG 921', from: 'Warsaw WAW', to: 'Bangkok BKK', depart: '2026-12-15T21:10', arrive: '2026-12-16T15:20', seat: '46L', booking: 'QX4T7M', carrier: 'Thai Airways' });
  check('Booking.com lot – powrót z przesiadką', r[1], { number: 'TG 950, LO 336', from: 'Bangkok BKK', to: 'Warsaw WAW', depart: '2027-01-10T18:35', arrive: '2027-01-11T07:10', seat: '47A' });
  r = await parse(M('gotogate.txt'));
  check('Gotogate – 3 loty', { n: r.length }, { n: 3 });
  check('Gotogate – przylot następnego dnia', r[0], { number: 'CX 1350', depart: '2026-12-16T22:30', arrive: '2026-12-17T15:40' });
  check('Gotogate – nowa godzina (21:00 zamiast 20:55)', r[1], { number: 'CX 615', depart: '2027-01-05T18:35', arrive: '2027-01-05T21:00' });
  check('Gotogate – nocny lot', r[2], { number: 'TG 930', depart: '2027-01-06T02:25', arrive: '2027-01-06T07:10', booking: 'QX4T7M' });
  r = await parse(M('tripcom-lot.txt'));
  check('Trip.com lot (godzina przed lotniskiem, PNR)', r[0], { number: 'MU 5730', carrier: 'China Eastern', depart: '2027-04-02T07:00', arrive: '2027-04-02T09:35', terminal: '1', booking: 'KZ7QWE' });
  check('Trip.com lot – lotniska', { ok: /KMG$/.test(r[0].from) && /XIY$/.test(r[0].to) }, { ok: true });
  r = await parse(M('trainline.txt'));
  check('Trainline – bez fałszywego lotu „FR 58” z numeru VAT', { types: r.map(x => x.type).join(',') }, { types: 'pociag,pociag' });
  check('Trainline – odcinek 1', r[0], { from: 'Manchester Piccadilly', to: 'London Euston', depart: '2026-12-18T09:15', arrive: '2026-12-18T11:20', carrier: 'Avanti West Coast', booking: 'ABCD123E', price: '71.89', currency: 'GBP' });
  check('Trainline – odcinek 2', r[1], { from: 'London Victoria', to: 'Gatwick Airport', carrier: 'Gatwick Express', depart: '2026-12-18T11:45' });
  r = await parse(M('raileurope.txt'));
  check('Rail Europe', r[0], { type: 'pociag', from: 'Edinburgh Waverley', to: 'Glasgow Queen Street', number: 'SR2154', carrier: 'ScotRail', depart: '2027-04-03T10:30', booking: 'QWER12TY', price: '19.29' });
  r = await parse(M('tripcom-train.txt'));
  check('Trip.com pociąg w Chinach', r[0], { type: 'pociag', number: 'D8661', from: 'Kunming South', to: 'Dali', depart: '2026-12-16T08:00', arrive: '2026-12-16T10:05', car: '5', seat: '12F', price: '145.5', currency: 'CNY' });
  r = await parse(M('booking-hotel-pl.txt'));
  check('Booking.com hotel (PL)', r[0], { type: 'nocleg', name: 'Bamboo Lake Hotel Hanoi', depart: '2026-12-24T14:00', arrive: '2026-12-27T12:00', booking: '1234567890', price: '2450000', currency: 'VND', phone: '+84 24 1234 5678' });
  check('Booking.com hotel – adres z kilku wierszy', { ok: /Hang Be Street.*Hanoi, Wietnam/.test(r[0].address) }, { ok: true });
  r = await parse(M('agoda.txt'));
  check('Agoda', r[0], { type: 'nocleg', name: 'Riverside Boutique Hotel Luang Prabang', depart: '2026-12-17T14:00', arrive: '2026-12-20T12:00', booking: '987654321', price: '96', currency: 'USD' });
  r = await parse(M('airbnb.txt'));
  check('Airbnb (3:00 PM)', r[0], { type: 'nocleg', name: 'Old Quarter loft with balcony', depart: '2026-12-24T15:00', arrive: '2026-12-27T11:00', booking: 'HMABC12345', price: '142.5' });
  r = await parse(M('airasia.txt'));
  check('AirAsia', r[0], { number: 'FD 3433', carrier: 'Thai AirAsia', from: 'Bangkok DMK', to: 'Chiang Mai CNX', depart: '2026-12-12T07:05', arrive: '2026-12-12T08:15', seat: '14C', price: '1590', currency: 'THB' });
  r = await parse(M('12go.txt'));
  check('12Go autobus nocny', r[0], { type: 'autobus', carrier: 'Nakhonchai Air', from: 'Bangkok Mo Chit Bus Terminal', to: 'Chiang Mai Arcade Bus Terminal', depart: '2026-12-14T20:00', arrive: '2026-12-15T06:30', price: '950' });
  // HTML zamiast tekstu
  const html = `<html><head><style>.x{color:red}</style></head><body><table><tr><td>Booking reference: QX4T7M</td></tr><tr><td>Warsaw (WAW) to Bangkok (BKK)</td></tr>
    <tr><td>Tue 15 Dec &middot; 21:10 - Wed 16 Dec &middot; 15:20</td></tr><tr><td>Thai Airways &middot; TG921</td></tr></table></body></html>`;
  r = await parse(html);
  check('HTML', r[0], { number: 'TG 921', depart: '2026-12-15T21:10', arrive: '2026-12-16T15:20' });
  // stare przykłady dalej działają
  r = await parse(M('lot.txt')); check('LOT (stary przykład)', r[0], { number: 'LO 281', depart: '2026-11-20T06:40', seat: '14A' });
  r = await parse(M('flix.txt')); check('FlixBus (stary przykład)', r[0], { type: 'autobus', number: 'N1234', depart: '2026-11-14T08:30' });
  r = await parse(M('pkp.txt')); check('PKP (stary przykład)', r[0], { number: 'EIP 5300', car: '5', seat: '42' });

  // pliki przez ekran „Z maila”
  const id = await p.evaluate(async () => (await DB.put('trips', { name: 'Azja', destination: 'Wietnam', start: '2026-12-08', end: '2027-01-06' })).id);
  await p.goto(`http://localhost:8765/podroznik/#/wklej?trip=${id}`); await p.waitForTimeout(600);
  await p.setInputFiles('#em-file', path.join(FX, 'kalendarz-ics.txt')); await p.waitForSelector('.em-card', { timeout: 8000 });
  console.log('ics →', await p.$$eval('.em-card .tl-route', e => e.map(x => x.textContent.trim())), await p.$eval('.em-card .tl-time', e => e.textContent));
  await p.setInputFiles('#em-file', path.join(__dirname, 'mails', 'agoda.eml')); await p.waitForTimeout(1200);
  console.log('eml →', await p.$$eval('.em-card .tl-route', e => e.map(x => x.textContent.trim())), await p.$eval('.em-card .tl-time', e => e.textContent));
  await p.setInputFiles('#em-file', path.join(FX, 'vietjet.pdf')); await p.waitForTimeout(2500);
  console.log('pdf →', await p.$$eval('.em-card .tl-route', e => e.map(x => x.textContent.trim())), await p.$eval('.em-card .tl-time', e => e.textContent), await p.$eval('.em-card .chips', e => e.textContent));
  await p.screenshot({ path: `${dir}/t35-pdf.png`, fullPage: true });
  await p.click('#em-all'); await p.waitForTimeout(2500);
  const saved = await p.evaluate(async id => { const s = (await DB.byIndex('segments', 'tripId', id))[0]; const f = s ? await DB.byIndex('files', 'segmentId', s.id) : [];
    return s && { number: s.number, depart: s.depart, files: f.map(x => x.kind) }; }, id);
  check('PDF zapisany jako bilet odcinka', saved, { number: 'VJ 899', depart: '2026-12-28T06:15', files: 'pdf' });
  console.log(fails ? `BŁĘDY: ${fails}` : 'wszystko OK');
  console.log('errors:', errs);
  await b.close();
})();
