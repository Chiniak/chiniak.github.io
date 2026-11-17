// przewodniki Wikivoyage offline: pobieranie (sieć z plików fx), czyszczenie HTML, sekcje, obiekty → pomysły, szukanie, linki, usuwanie, EN
const { chromium, devices } = require('playwright'); const fs = require('fs');
const dir = process.argv[2] || 'podroznik-testy';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const MINI = '<div class="mw-parser-output"><p>Krótki tekst.</p><div class="mw-heading mw-heading2"><h2 id="Atrakcje">Atrakcje</h2></div><ul><li><bdi class="vcard"><span class="fn org listing-name">Zamek</span> <span class="adr listing-address">Ulica 1</span></bdi></li></ul></div>';
const EVIL = '<div class="mw-parser-output"><p onclick="alert(1)">A<script>alert(2)</script><img src=x onerror=alert(3)><a href="javascript:alert(4)">j</a><a href="/wiki/Wawel">W</a><a href="https://ex.com/" onmouseover="x">E</a><style>p{}</style><iframe src="https://evil"></iframe></p>' +
  '<div class="mw-heading mw-heading2"><h2>See</h2></div><ul><li><bdi class="vcard"><span class="fn org listing-name">Na&lt;b&gt;me</span><span class="geo"><abbr class="latitude">50.1</abbr><abbr class="longitude">19.9</abbr></span><bdi class="listing-content">Opis <img src=y onerror=alert(5)></bdi></bdi></li></ul></div>';
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let online = true; const calls = [];
  await ctx.route(/^https:\/\/(?!localhost).*/, r => {
    const u = new URL(r.request().url());
    if (!/wikivoyage/.test(u.host) || !online) return r.abort();
    const lang = u.host.slice(0, 2), a = u.searchParams.get('action');
    calls.push(lang + ':' + a + ':' + (u.searchParams.get('page') || u.searchParams.get('srsearch')));
    if (u.searchParams.get('origin') !== '*') return r.fulfill({ status: 400, body: 'no origin' });
    if (a === 'parse') {
      if (u.searchParams.get('page') === 'Mini') return r.fulfill({ json: { parse: { title: 'Mini', revid: 1, text: MINI } } });
      const f = { 'pl:Kraków': 'wv-pl-krakow', 'en:Lisbon': 'wv-en-lisbon' }[lang + ':' + u.searchParams.get('page')];
      return f ? r.fulfill({ body: fs.readFileSync(`${__dirname}/fx/${f}.json`), contentType: 'application/json' }) : r.fulfill({ json: { error: { code: 'missingtitle' } } });
    }
    if (a === 'query') return r.fulfill({ json: { query: { search: u.searchParams.get('srsearch') === 'Krakow' ? [{ title: 'Kraków', snippet: 'miasto na prawach <span class="searchmatch">powiatu</span>' }] : [] } } });
    r.abort();
  });
  await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(600);

  // czyszczenie: brak skryptów, atrybutów zdarzeń, obrazków, stylów; linki tylko http(s) / wewnętrzne
  const x = await p.evaluate(h => App.Guide.clean(h, 'pl'), EVIL);
  const all = JSON.stringify(x);
  ok(!/script|onerror|onclick|onmouseover|javascript:|<img|<style|<iframe/i.test(all), 'czyszczenie usuwa skrypty, zdarzenia, obrazki, ramki');
  ok(all.includes('data-wv=\\"Wawel\\"') && all.includes('href=\\"https://ex.com/\\" target=\\"_blank\\"'), 'linki: wewnętrzny → przewodnik, zewnętrzny → nowa karta');
  ok(x.listings.length === 1 && x.listings[0].name === 'Na<b>me' && x.listings[0].lat === 50.1 && x.listings[0].cat === 'zwiedzanie', 'obiekt: nazwa jako tekst, położenie, kategoria z sekcji „See”');

  const ids = await p.evaluate(async () => {
    const t = await DB.put('trips', { name: 'Kraków', destination: 'Kraków, Polska', start: '2027-06-01', end: '2027-06-03' });
    const t2 = await DB.put('trips', { name: 'Lizbona', destination: 'Lisbon', start: '2027-07-01', end: '2027-07-03' });
    return { t: t.id, t2: t2.id };
  });
  // szczegóły podróży → wiersz „Przewodnik”
  await p.goto(`http://localhost:8765/podroznik/#/podroze/${ids.t}`); await p.waitForTimeout(700);
  ok(await p.$(`a[href="#/przewodnik/${ids.t}"]`) !== null, 'wiersz „Przewodnik” w podróży');

  // ekran pobierania: propozycja z celu podróży (bez kraju)
  await p.goto(`http://localhost:8765/podroznik/#/przewodnik/${ids.t}`); await p.waitForTimeout(600);
  ok(await p.inputValue('#gd-form input') === 'Kraków', 'propozycja: „Kraków”');
  // literówka → podobne artykuły → wybór
  await p.fill('#gd-form input', 'Krakow'); await p.click('#gd-form button'); await p.waitForSelector('.gd-hit', { timeout: 5000 });
  ok(/Nie ma artykułu „Krakow”/.test(await p.textContent('#gd-res')), 'brak artykułu → podpowiedzi');
  await p.click('.gd-hit'); await p.waitForTimeout(1500);
  ok(/\?g=pl%3AKrak/.test(p.url()), 'pobrano i otwarto przewodnik');
  const secs = await p.$$eval('.gd-sec summary .gd-sec-t', e => e.map(x => x.textContent));
  ok(secs.includes('Atrakcje') && secs.includes('Dojazd') && secs.length >= 8, 'sekcje: ' + secs.join(', '));
  ok(/Kraków/.test(await p.textContent('.gd-lead')), 'wstęp widoczny');
  ok(/CC BY-SA 4\.0/.test(await p.textContent('.gd-foot')), 'licencja i autorzy w stopce');
  await p.screenshot({ path: `${dir}/t49-pl.png` });

  // szukanie w przewodniku
  await p.fill('#gd-find input', 'tramwaj'); await p.waitForTimeout(200);
  const vis = await p.$$eval('.gd-sec', e => e.filter(x => !x.hidden).map(x => x.querySelector('.gd-sec-t').textContent + (x.open ? '+' : '')));
  ok(vis.length >= 1 && vis.every(v => v.endsWith('+')), 'szukanie rozwija pasujące sekcje: ' + vis.join(', '));
  ok(await p.$$eval('mark.gd-mark', e => e.length) > 0, 'podświetlenie');
  await p.fill('#gd-find input', ''); await p.waitForTimeout(100);
  ok(await p.$$eval('.gd-sec', e => e.every(x => !x.hidden)), 'czyszczenie szukania – wszystko widać');

  // offline: przewodnik czyta się bez sieci (po przeładowaniu)
  online = false;
  await p.reload(); await p.waitForTimeout(800);
  ok((await p.$$('.gd-sec')).length === secs.length, 'offline: przewodnik dalej jest');
  online = true;

  // drugi przewodnik po angielsku (Lizbona) – obiekty
  await p.goto(`http://localhost:8765/podroznik/#/przewodnik/${ids.t2}?l=en`); await p.waitForTimeout(500);
  await p.click('#gd-form button'); await p.waitForTimeout(2500);
  const nLi = await p.$$eval('.gd-li', e => e.length);
  ok(nLi > 30, 'Lizbona EN: karty obiektów ' + nLi);
  ok(/z opisem/.test(await p.textContent('.gd-head')), 'licznik obiektów');
  await p.click('summary:has-text("Get in")'); await p.waitForTimeout(200);
  const card = p.locator('.gd-li', { hasText: 'Aeroporto de Lisboa' }).first();
  ok(/Alameda das Comunidades/.test(await card.textContent()), 'karta: adres');
  await card.locator('.gd-add').click(); await p.waitForTimeout(400);
  let it = await p.evaluate(id => DB.byIndex('planItems', 'tripId', id), ids.t2);
  ok(it.length === 1 && it[0].title === 'Aeroporto de Lisboa' && it[0].date === '' && Math.abs(it[0].lat - 38.7712) < 1e-4 && /Alameda/.test(it[0].place), 'Do pomysłów: punkt bez dnia z położeniem i adresem');
  ok(/w planie/.test(await card.locator('.gd-add').textContent()), 'przycisk: „w planie”');
  await card.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${dir}/t49-en.png` });
  await card.locator('.gd-add').click(); await p.waitForTimeout(400);
  it = await p.evaluate(id => DB.byIndex('planItems', 'tripId', id), ids.t2);
  ok(it.length === 0, 'drugie dotknięcie usuwa pomysł');
  // link do innego artykułu → pobiera kolejny przewodnik
  calls.length = 0;
  await p.evaluate(() => { const a = document.querySelector('[data-wv]'); a.dataset.wv = 'Mini'; a.click(); });
  await p.waitForTimeout(1500);
  ok(calls.includes('en:parse:Mini') && /\?g=en%3AMini/.test(p.url()), 'link w tekście pobiera kolejny artykuł');
  ok(await p.$$eval('.gd-chips .st-chip', e => e.length) === 2, 'dwa przewodniki w podróży – przełącznik');
  ok(await p.$$eval('.gd-li', e => e.length) === 1, 'mały artykuł: obiekt w sekcji');

  // usuwanie z podróży
  p.once('dialog', d => d.accept());
  await p.click('#gd-del'); await p.waitForTimeout(700);
  ok(!(await p.evaluate(() => DB.get('guides', 'en:Mini'))), 'usunięty przewodnik znika z telefonu');
  ok(await p.evaluate(() => !DB.stores.includes('guides')), 'przewodniki poza kopią zapasową');
  await p.evaluate(async id => { await App.Guide.detachAll(id); }, ids.t);
  ok(!(await p.evaluate(() => DB.get('guides', 'pl:Kraków'))), 'usunięcie podróży – przewodnik znika');

  // EN interfejs
  await p.evaluate(() => { localStorage.setItem('podroznik-lang', 'en'); return DB.setSetting('lang', 'en'); });
  await p.goto(`http://localhost:8765/podroznik/#/przewodnik/${ids.t2}`); await p.reload(); await p.waitForTimeout(900);
  const en = (await p.textContent('body')).replace(/\s+/g, ' ');
  ok(/Search in the guide/.test(await p.getAttribute('#gd-find input', 'placeholder')) && /Download again/.test(en) && /places with a description/.test(en), 'EN: interfejs przetłumaczony');
  await p.goto(`http://localhost:8765/podroznik/#/przewodnik/${ids.t}`); await p.waitForTimeout(700);
  const en2 = (await p.textContent('body')).replace(/\s+/g, ' ');
  ok(/Offline guide/.test(en2) && /Wikivoyage article/.test(en2), 'EN: ekran pobierania');
  await p.evaluate(() => { localStorage.removeItem('podroznik-lang'); return DB.setSetting('lang', 'pl'); });

  ok(!errs.length, 'bez błędów JS ' + errs.join(' | '));
  await b.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
