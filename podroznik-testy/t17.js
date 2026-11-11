const { chromium, devices } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' })).newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('http://localhost:8765/podroznik/#/ustawienia'); await p.waitForTimeout(800);
  console.log('apk link:', (await p.textContent('a[href="Podroznik.apk"]')).replace(/\s+/g,' ').trim(), '| version:', await p.textContent('.card .row b'));
  const r = await p.request.get('http://localhost:8765/podroznik/Podroznik.apk'); console.log('apk served:', r.status(), (await r.body()).length);
  const a = await p.request.get('http://localhost:8765/.well-known/assetlinks.json'); console.log('assetlinks entries:', (await a.json()).length);
  console.log('errors:', errs); await b.close(); })();
