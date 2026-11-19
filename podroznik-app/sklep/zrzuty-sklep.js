// Uruchom: node zrzuty-sklep.js <katalog> (serwer niepotrzebny – pliki czytane z repozytorium)
// Zrzuty do Google Play: dla każdego języka 8 ekranów (1080×1920) z przykładową podróżą, potem kadry z podpisem.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = '/home/user/chiniak.github.io', OUT = process.argv[2];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const FONT = f => fs.readFileSync(ROOT + '/podroznik/lib/fonts/' + f).toString('base64');
const LANGS = ['pl', 'en', 'de', 'es', 'it', 'pt', 'zh'];
const LOC = { pl: 'pl-PL', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', zh: 'zh-CN' };
const DATA = {
  pl: { vn: 'Wietnam – północ', rome: 'Rzym na majówkę', lis: 'Lizbona', bp: 'Karta pokładowa', bus: 'Bilet autobusowy', tr: 'Bilet SP3', seat: 'wagon 4, miejsce 12',
    plan: ['Pho na śniadanie', 'Jezioro Hoan Kiem', 'Teatr lalek na wodzie', 'Ulica Piwna – kolacja', 'Trang An – łódki', 'Rejs po zatoce Ha Long'],
    exp: ['kawa jajeczna', 'Grab z lotniska', 'hotel – 3 noce', 'bilety do teatru', 'pho'],
    pack: ['Paszport', 'Ładowarka', 'Powerbank', 'Krem z filtrem', 'Kurtka przeciwdeszczowa', 'Adapter gniazdka', 'Leki'],
    j1: 'Pierwszy pełny dzień w Hanoi. Rano kawa jajeczna, potem spacer po Starym Mieście i skutery wszędzie. Wieczorem street food na Ta Hien.',
    j2: 'Lot długi, ale bez przygód. Hotel super, pokój z balkonem.', pass: 'Paszport' },
  en: { vn: 'Northern Vietnam', rome: 'Rome in spring', lis: 'Lisbon', bp: 'Boarding pass', bus: 'Bus ticket', tr: 'Ticket SP3', seat: 'car 4, berth 12',
    plan: ['Pho for breakfast', 'Hoan Kiem Lake', 'Water puppet theatre', 'Beer Street – dinner', 'Trang An boat ride', 'Ha Long Bay cruise'],
    exp: ['egg coffee', 'Grab from the airport', 'hotel – 3 nights', 'theatre tickets', 'pho'],
    pack: ['Passport', 'Charger', 'Power bank', 'Sunscreen', 'Rain jacket', 'Plug adapter', 'Medicines'],
    j1: 'First full day in Hanoi. Egg coffee in the morning, then a walk around the Old Quarter with scooters everywhere. Street food on Ta Hien in the evening.',
    j2: 'Long flight but no surprises. Great hotel, room with a balcony.', pass: 'Passport' },
};
const CAP = {
  pl: ['Wszystkie podróże w jednym miejscu', 'Dziś w podróży: co teraz, co dalej', 'Plan dzień po dniu', 'Bilety i karty pokładowe offline', 'Pakowanie bez stresu', 'Budżet i wydatki w każdej walucie', 'Dziennik podróży na pamiątkę', 'Adres dla kierowcy w lokalnym piśmie'],
  en: ['All your trips in one place', 'Today: what\'s now, what\'s next', 'Your plan, day by day', 'Tickets and boarding passes offline', 'Stress-free packing', 'Budget and expenses in any currency', 'A travel journal to keep', 'Addresses for drivers in the local script'],
  de: ['Alle Reisen an einem Ort', 'Heute: was jetzt, was als Nächstes', 'Dein Plan, Tag für Tag', 'Tickets und Bordkarten offline', 'Packen ohne Stress', 'Budget und Ausgaben in jeder Währung', 'Ein Reisetagebuch als Andenken', 'Adressen für Fahrer in lokaler Schrift'],
  es: ['Todos tus viajes en un solo lugar', 'Hoy: qué toca ahora y qué sigue', 'Tu plan, día a día', 'Billetes y tarjetas de embarque sin conexión', 'Haz la maleta sin estrés', 'Presupuesto y gastos en cualquier moneda', 'Un diario de viaje para recordar', 'Direcciones para el conductor en la escritura local'],
  it: ['Tutti i tuoi viaggi in un unico posto', 'Oggi: cosa ora, cosa dopo', 'Il tuo piano, giorno per giorno', 'Biglietti e carte d\'imbarco offline', 'La valigia senza stress', 'Budget e spese in ogni valuta', 'Un diario di viaggio da ricordare', 'Indirizzi per l\'autista nella scrittura locale'],
  pt: ['Todas as suas viagens em um só lugar', 'Hoje: o que agora, o que vem depois', 'Seu plano, dia a dia', 'Passagens e cartões de embarque offline', 'Arrume a mala sem estresse', 'Orçamento e gastos em qualquer moeda', 'Um diário de viagem para guardar', 'Endereços para o motorista na escrita local'],
  zh: ['所有旅行，一处管理', '今天：现在做什么，接下来做什么', '每日行程，一目了然', '票据和登机牌，离线可用', '轻松整理行李', '任意货币的预算与支出', '留作纪念的旅行日记', '写有当地文字地址的司机卡片'],
};
const NAMES = ['01-podroze', '02-dzis', '03-plan', '04-bilet', '05-pakowanie', '06-budzet', '07-dziennik', '08-karty'];
(async () => {
  const b = await chromium.launch();
  for (const lang of LANGS) {
    const D = DATA[lang === 'pl' ? 'pl' : 'en'];
    const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: LOC[lang], serviceWorkers: 'block' });
    await ctx.addInitScript(l => localStorage.setItem('podroznik-lang', l), lang);
    await ctx.route('**/*', r => { const u = new URL(r.request().url());
      if (u.host !== 'localhost:8765') return r.abort();
      let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html';
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    const B = 'http://localhost:8765/podroznik/';
    await p.goto(B + '#/podroze'); await p.waitForTimeout(800);
    await p.evaluate(l => Promise.all([DB.setSetting('lang', l), DB.setSetting('myName', l === 'pl' ? 'Ania' : 'Anna'), DB.setSetting('currency', l === 'pl' ? 'PLN' : 'EUR')]), lang);
    const ids = await p.evaluate(async ({ D, cur }) => {
      const T = App.todayStr(), d = n => App.addDays(T, n);
      const t = await DB.put('trips', { name: D.vn, destination: 'Hanoi', start: d(-3), end: d(6), color: '#1f9e8f', budget: { amount: cur === 'PLN' ? 6000 : 1400, currency: cur }, rates: { VND: cur === 'PLN' ? 0.00016 : 0.000037 } });
      await DB.put('trips', { name: D.rome, destination: 'Roma', start: d(45), end: d(49), color: '#d6602f' });
      await DB.put('trips', { name: D.lis, destination: 'Lisboa', start: d(-60), end: d(-55), color: '#2f6fd6' });
      const s1 = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Hanoi HAN', depart: d(-3) + 'T13:20', arrive: d(-2) + 'T06:40', number: 'VN 64', seat: '23A' });
      const LC = (lat, lon, name, addr) => ({ lat, lon, local: { lat, lon, cc: 'vn', lang: 'vi', name, addr, at: Date.now() } });
      const hotel = await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Lotus', address: '12 Hang Bac, Hanoi', phone: '+84 24 1234 567', room: '305', depart: d(-2) + 'T14:00', arrive: d(1) + 'T12:00', ...LC(21.0341, 105.8523, 'Khách sạn Hoa Sen', '12 Phố Hàng Bạc, Phường Hàng Bạc, Quận Hoàn Kiếm, Hà Nội') });
      const s2 = await DB.put('segments', { tripId: t.id, type: 'autobus', from: 'Hanoi', to: 'Ninh Binh', depart: T + 'T21:30', arrive: T + 'T23:30', number: 'VX 12' });
      await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Ha Long Cruise', address: 'Tuan Chau, Ha Long', depart: d(2) + 'T13:00', arrive: d(3) + 'T10:00' });
      const s3 = await DB.put('segments', { tripId: t.id, type: 'pociag', from: 'Hanoi', to: 'Sa Pa (Lao Cai)', depart: d(3) + 'T21:40', arrive: d(4) + 'T05:50', number: 'SP3', seat: D.seat });
      await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Hanoi HAN', to: 'Warszawa WAW', depart: d(6) + 'T23:30', arrive: d(7) + 'T07:10', number: 'VN 65' });
      await DB.put('files', { tripId: t.id, segmentId: s1.id, kind: 'code', label: D.bp, code: { format: 'pdf417', text: 'M1KOWALSKI/ANNA EABC123 WAWHANVN 0064 317Y023A0001 100' } });
      const f2 = await DB.put('files', { tripId: t.id, segmentId: s2.id, kind: 'code', label: D.bus, code: { format: 'qr_code', text: 'VX12-HAN-NBH-2026-SEAT14' } });
      await DB.put('files', { tripId: t.id, segmentId: s3.id, kind: 'code', label: D.tr, code: { format: 'qr_code', text: 'SP3-HANOI-LAOCAI-W4-12' } });
      const P = (date, time, title, cat, place, order, xy) => DB.put('planItems', { tripId: t.id, date, time, title, cat, place: place || '', order, ...(xy || {}) });
      await P(T, '08:00', D.plan[0], 'jedzenie', 'Pho Gia Truyen, Hanoi', 0, LC(21.0335, 105.8466, 'Phở Gia Truyền', '49 Bát Đàn, Quận Hoàn Kiếm, Hà Nội'));
      await P(T, '10:30', D.plan[1], 'natura', 'Hoan Kiem Lake, Hanoi', 1, LC(21.0287, 105.8524, 'Hồ Hoàn Kiếm', 'Đinh Tiên Hoàng, Quận Hoàn Kiếm, Hà Nội'));
      await P(T, '14:00', D.plan[2], 'zwiedzanie', 'Thang Long Water Puppet Theatre', 2, LC(21.0318, 105.8535, 'Nhà hát Múa rối Thăng Long', '57B Đinh Tiên Hoàng, Quận Hoàn Kiếm, Hà Nội'));
      await P(T, '18:30', D.plan[3], 'jedzenie', 'Ta Hien, Hanoi', 3, LC(21.0352, 105.8510, 'Phố Tạ Hiện', 'Phố Tạ Hiện, Quận Hoàn Kiếm, Hà Nội'));
      await P(d(1), '09:00', D.plan[4], 'natura', 'Trang An, Ninh Binh', 0, LC(20.2531, 105.8977, 'Khu du lịch Tràng An', 'Trường Yên, Hoa Lư, Ninh Bình'));
      await P(d(2), '13:00', D.plan[5], 'zwiedzanie', '', 0);
      const E = (title, amount, currency, cat, date) => DB.put('expenses', { tripId: t.id, title, amount, currency, cat, date });
      await E(D.exp[0], 60000, 'VND', 'jedzenie', T); await E(D.exp[1], 280000, 'VND', 'transport', d(-2));
      await E(D.exp[2], cur === 'PLN' ? 1200 : 280, cur, 'nocleg', d(-2)); await E(D.exp[3], 300000, 'VND', 'atrakcje', T); await E(D.exp[4], 70000, 'VND', 'jedzenie', d(-1));
      const cats = ['dokumenty', 'elektronika', 'elektronika', 'kosmetyki', 'ubrania', 'elektronika', 'zdrowie'], stt = ['done', 'done', 'done', 'pack', 'pack', 'done', 'pack'];
      for (let o = 0; o < 7; o++) await DB.put('packItems', { tripId: t.id, list: 'pack', name: D.pack[o], cat: cats[o], qty: '', status: stt[o], order: o });
      await DB.put('journal', { tripId: t.id, date: d(-1), mood: '5', text: D.j1 });
      await DB.put('journal', { tripId: t.id, date: d(-2), mood: '4', text: D.j2 });
      await DB.put('docs', { type: 'paszport', name: D.pass, number: 'EA1234567', expires: App.addDays(T, 1500) });
      return { t: t.id, s2: s2.id, f2: f2.id, hotel: hotel.id };
    }, { D, cur: lang === 'pl' ? 'PLN' : 'EUR' });
    await p.reload(); await p.waitForTimeout(800);
    const hs = ['#/podroze', '#/dzis/' + ids.t, '#/plan/' + ids.t, '#/bilet/' + ids.f2, '#/pakowanie/' + ids.t, '#/budzet/' + ids.t, '#/dziennik/' + ids.t, '#/karty/' + ids.t + '?k=s:' + ids.hotel];
    fs.mkdirSync(`${OUT}/raw/${lang}`, { recursive: true });
    for (let i = 0; i < hs.length; i++) {
      await p.goto(B + '#/x'); await p.goto(B + hs[i]); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/raw/${lang}/${NAMES[i]}.png` });
    }
    console.log(lang, 'errs', errs.length, errs.slice(0, 3));
    await ctx.close();
  }
  // kadry z podpisem
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const lang of LANGS) {
    fs.mkdirSync(`${OUT}/${lang}`, { recursive: true });
    for (let i = 0; i < NAMES.length; i++) {
      const img = 'data:image/png;base64,' + fs.readFileSync(`${OUT}/raw/${lang}/${NAMES[i]}.png`).toString('base64');
      await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face{font-family:PJ;font-weight:200 800;src:url(data:font/woff2;base64,${FONT('plus-jakarta-sans-latin-wght-normal.woff2')}) format('woff2');unicode-range:U+0000-00FF}@font-face{font-family:PJ;font-weight:200 800;src:url(data:font/woff2;base64,${FONT('plus-jakarta-sans-latin-ext-wght-normal.woff2')}) format('woff2');unicode-range:U+0100-024F,U+2000-206F}
        html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
        body{background:radial-gradient(120% 80% at 30% 0%,#2b5a4f 0%,#123a31 45%,#0b2620 100%);font-family:PJ,"Noto Sans CJK SC","WenQuanYi Zen Hei",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center}
        h1{color:#fff;font-size:70px;line-height:1.12;font-weight:700;text-align:center;margin:120px 80px 0;letter-spacing:-.5px;min-height:170px;display:flex;align-items:center}
        .bar{width:120px;height:8px;border-radius:4px;background:#d9b25f;margin:36px 0 64px}
        .ph{width:780px;height:1387px;border-radius:56px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 14px #0a1d18,0 0 0 16px rgba(217,178,95,.55)}
        .ph img{width:100%;display:block}
      </style></head><body><h1>${CAP[lang][i]}</h1><div class="bar"></div><div class="ph"><img src="${img}"></div></body></html>`);
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${OUT}/${lang}/${NAMES[i]}.png` });
    }
  }
  await b.close();
})();
