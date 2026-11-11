// angielski: przełącznik języka, przegląd ekranów – wypisuje teksty, które zostały po polsku
const { chromium, devices } = require('playwright');
const dir = process.argv[2] || 'podroznik-testy';
(async () => { const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', locale: 'en-GB', timezoneId: 'Europe/Warsaw' });
  await ctx.route(/open-meteo|nominatim|overpass|wikipedia|nbp|tile|carto/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);
  console.log('auto (phone en-GB) lang:', await p.evaluate(() => I18N.lang), '| title:', await p.textContent('#title'));
  const ids = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: App.addDays(T, -1), end: App.addDays(T, 3), people: ['Ja', 'Ania'] });
    const s1 = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: App.addDays(T, 2) + 'T08:00', arrive: App.addDays(T, 2) + 'T10:50', number: 'LO 281', seat: '14A', price: '500', currency: 'PLN' });
    await DB.put('segments', { tripId: t.id, type: 'nocleg', name: 'Hotel Avenida', address: 'Av. da Liberdade, Lizbona', depart: App.addDays(T, -1) + 'T15:00', arrive: App.addDays(T, 3) + 'T11:00', lat: 38.72, lon: -9.14 });
    await DB.put('planItems', { tripId: t.id, date: T, time: '23:59', title: 'Oceanarium', cat: 'zwiedzanie', place: 'Oceanário', lat: 38.76, lon: -9.09, cost: '25', currency: 'EUR', order: 0 });
    await DB.put('planItems', { tripId: t.id, date: '', title: 'Belém', cat: 'zwiedzanie', order: 0 });
    await DB.put('packItems', { tripId: t.id, list: 'pack', name: 'Paszport', cat: 'dokumenty', status: 'pack' });
    await DB.put('expenses', { tripId: t.id, amount: 30, currency: 'PLN', cat: 'jedzenie', date: T, title: 'kawa', paidBy: 'Ania' });
    await DB.put('docs', { type: 'paszport', owner: 'Jan', number: 'EA1', expires: App.addDays(T, 100) });
    return { t: t.id, s1: s1.id };
  });
  const PL = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]|\b(dni|dzień|podróż\w*|bilet\w*|dodaj|usuń|zapisz|nie|jest|oraz|albo|lub|bez|przed|po|za|na|do|od|się|wyjazd\w*|noclegi?|odcinek|punkt\w*|pomysł\w*|zostało|wydano|teraz|dalej)\b/i;
  const USER = /Lizbona|Hotel Avenida|Oceanarium|Oceanário|Belém|Paszport|kawa|Warszawa|Ania|\bJa\b|Av\. da Liberdade|Jan\b/;
  const report = async name => {
    await p.waitForTimeout(700);
    const left = await p.evaluate(() => {
      const out = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const v = n.nodeValue.trim(); if (v && n.parentElement && n.parentElement.offsetParent !== null && !n.parentElement.closest('[translate=no],textarea')) out.add(v); }
      document.querySelectorAll('[placeholder],[aria-label]').forEach(e => { if (e.getAttribute('placeholder')) out.add('ph:' + e.getAttribute('placeholder')); if (e.getAttribute('aria-label')) out.add('aria:' + e.getAttribute('aria-label')); });
      return [...out];
    });
    const bad = left.filter(v => PL.test(v.replace(/^(ph|aria):/, '')) && !USER.test(v));
    console.log(`[${name}]`, bad.length ? JSON.stringify(bad) : 'OK');
  };
  const go = async (h, name) => { await p.goto('http://localhost:8765/podroznik/#' + h); await report(name || h); };
  await go('/podroze'); await go('/podroze/' + ids.t); await go('/podroze/' + ids.t + '/edytuj'); await go('/podroze/' + ids.t + '/dodaj?typ=lot');
  await go('/odcinek/' + ids.s1); await go('/bilety'); await go('/plan/' + ids.t); await go('/plan/' + ids.t + '/nowy'); await go('/mapa/' + ids.t);
  await go('/odkrywaj/' + ids.t); await go('/pakowanie/' + ids.t); await go('/pakowanie/' + ids.t + '?l=todo'); await go('/budzet/' + ids.t); await go('/rozliczenie/' + ids.t);
  await go('/dokumenty'); await go('/statystyki?plan=1'); await go('/wklej'); await go('/udostepnij/' + ids.t); await go('/udostepnij');
  await go('/ustawienia'); await go('/ustawienia/przypomnienia'); await go('/ustawienia/kopia'); await go('/ustawienia/blokada');
  await p.goto('http://localhost:8765/podroznik/#/plan/' + ids.t); await p.waitForTimeout(600); await p.screenshot({ path: `${dir}/t26-plan-en.png` });
  await p.goto('http://localhost:8765/podroznik/#/podroze/' + ids.t); await p.waitForTimeout(600); await p.screenshot({ path: `${dir}/t26-trip-en.png` });
  // dialog
  p.once('dialog', d => { console.log('confirm EN:', d.message()); d.dismiss(); });
  await p.goto('http://localhost:8765/podroznik/#/podroze/' + ids.t + '/edytuj'); await p.waitForTimeout(400); await p.click('#del');
  console.log('share text:\n' + await p.evaluate(i => App.Share.planText(i), ids.t));
  // przełączenie na polski
  await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(400);
  await Promise.all([p.waitForNavigation(), p.click('[data-lang-opt="pl"]')]); await p.waitForTimeout(600);
  console.log('after PL:', await p.evaluate(() => I18N.lang), await p.textContent('#title'), '| db:', await p.evaluate(() => DB.getSetting('lang')));
  console.log('errors:', errs); await b.close(); })();
