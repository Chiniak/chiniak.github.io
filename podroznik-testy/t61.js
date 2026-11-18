// t61: języki de/es/it/pt/zh (+ en, pl jako punkt odniesienia): aplikacja startuje w każdym języku bez błędów JS, wybór w Ustawieniach,
// daty/locale, brak „polskich” liter na ekranach (ą ę ł ś ż ź ć ń – nie występują w de/es/it/pt/zh/en poza nazwami własnymi z danych),
// słownik kompletny (każdy klucz z angielskiego ma tłumaczenie i tyle samo {}), tr() daje wartość ze słownika, fallback do angielskiego.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const B = 'http://localhost:8765/podroznik/';
(async () => {
  const b = await chromium.launch();
  let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
  const LANGS = { de: 'Reisen', es: 'Viajes', it: 'Viaggi', pt: 'Viagens', zh: '旅行', en: 'Trips', pl: 'Podróże' };
  const LOC = { de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', zh: 'zh-CN', en: 'en-GB', pl: 'pl-PL' };
  // 1) słowniki: kompletność i placeholdery
  const sandbox = { self: {} }; sandbox.self.self = sandbox.self;
  new Function('self', fs.readFileSync('podroznik/i18n-en.js', 'utf8'))(sandbox.self);
  const EN = sandbox.self.I18N_EN, keys = Object.keys(EN), cnt = s => (s.match(/\{\}/g) || []).length;
  for (const l of ['de', 'es', 'it', 'pt', 'zh']) {
    new Function('self', fs.readFileSync(`podroznik/i18n-${l}.js`, 'utf8'))(sandbox.self);
    const D = sandbox.self.I18N_DICTS[l];
    const missing = keys.filter(k => !(k in D)), badPh = keys.filter(k => k in D && cnt(D[k]) !== cnt(k)), empty = keys.filter(k => !String(D[k] || '').trim());
    ok(!missing.length && !badPh.length && !empty.length, `${l}: słownik kompletny (${Object.keys(D).length}/${keys.length}), braki ${missing.length}, złe {} ${badPh.length}, puste ${empty.length}`);
  }
  // 2) ekrany w przeglądarce
  const trips = async p => p.evaluate(async () => {
    const T0 = App.todayStr();
    const t = await DB.put('trips', { name: 'Lizbona', destination: 'Lizbona', start: App.addDays(T0, 5), end: App.addDays(T0, 8) });
    await DB.put('segments', { tripId: t.id, type: 'lot', from: 'Warszawa WAW', to: 'Lizbona LIS', depart: App.addDays(T0, 5) + 'T08:00', arrive: App.addDays(T0, 5) + 'T11:30', number: 'LO 281' });
    await DB.put('planItems', { tripId: t.id, date: App.addDays(T0, 6), time: '10:00', title: 'Oceanarium', cat: 'zwiedzanie', order: 0 });
    return t.id;
  });
  const POL = /[ąęłśżźćń]/g;
  for (const l of Object.keys(LANGS)) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    await ctx.addInitScript(x => { localStorage.setItem('podroznik-lang', x); }, l);
    await ctx.route(/^https:/, r => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '#/podroze'); await p.waitForTimeout(1200);
    const tid = await trips(p);
    const info = await p.evaluate(() => ({ lang: I18N.lang, locale: I18N.locale }));
    ok(info.lang === l && info.locale === LOC[l], `${l}: język ${info.lang}, locale ${info.locale}`);
    let polish = 0; const samples = [];
    for (const h of ['#/podroze', `#/podroze/${tid}`, '#/bilety', '#/plan', '#/pakowanie', '#/ustawienia', '#/statystyki', '#/waluty', '#/budzet', '#/dokumenty']) {
      await p.goto(B + h); await p.waitForTimeout(900);
      const txt = await p.evaluate(() => (document.querySelector('.topbar').innerText + ' ' + document.querySelector('#view').innerText + ' ' + document.querySelector('.tabbar').innerText));
      const m = (txt.match(POL) || []).length;
      if (l !== 'pl') { polish += m; if (m) samples.push(h + ': ' + (txt.match(/[^\n]*[ąęłśżźćń][^\n]*/) || [''])[0].slice(0, 60)); }
    }
    if (l !== 'pl') ok(polish <= 6, `${l}: polskich liter na ekranach ${polish} ${samples.slice(0, 3).join(' | ')}`);
    const tab = (await p.textContent('.tabbar')).replace(/\s+/g, ' ');
    ok(tab.includes(LANGS[l]), `${l}: zakładki „${tab.trim()}”`);
    await p.goto(B + '#/ustawienia'); await p.waitForTimeout(600);
    ok(await p.$eval('#lang-sel', s => s.value) === l && await p.$$eval('#lang-sel option', o => o.length) === 8, `${l}: wybór języka w Ustawieniach (8 opcji, bieżący ${l})`);
    ok(!errs.length, `${l}: bez błędów JS ${errs.slice(0, 2).join(' | ')}`);
    if (l === 'de' || l === 'zh') await p.screenshot({ path: `podroznik-testy/t61-${l}.png` });
    await ctx.close();
  }
  // 3) zmiana języka w Ustawieniach → przeładowanie w nowym języku; auto wg języka telefonu
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pt-PT' });
  await ctx.route(/^https:/, r => r.abort());
  const p = await ctx.newPage(); await p.goto(B + '#/ustawienia'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => I18N.lang) === 'pt', 'auto: telefon po portugalsku → portugalski');
  await p.selectOption('#lang-sel', 'it'); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => I18N.lang) === 'it' && /Viaggi/.test(await p.textContent('.tabbar')), 'zmiana w Ustawieniach → włoski po przeładowaniu');
  const fb = await p.evaluate(() => { I18N.setLang('de'); const r = I18N.tr('Zupełnie nieznany tekst xyz'); I18N.setLang('it'); return r; });
  ok(fb === 'Zupełnie nieznany tekst xyz', 'nieznany tekst zostaje bez zmian');
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
