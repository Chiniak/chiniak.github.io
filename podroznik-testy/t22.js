// odkrywanie, gdy serwery map nie odpowiadają: zapasowy serwer Overpass, potem Wikipedia (atrakcje) i Nominatim (jedzenie)
const { chromium, devices } = require('playwright');
(async () => { const b = await chromium.launch();
  const run = async (mode) => {
    const ctx = await b.newContext({ ...devices['Pixel 7'], geolocation: { latitude: 50.0614, longitude: 19.9366 }, permissions: ['geolocation'] });
    await ctx.route(/open-meteo/, r => r.abort());
    const hits = [];
    await ctx.route(/overpass|maps\.mail\.ru/, r => { const u = new URL(r.request().url()).hostname; hits.push(u);
      if (mode === 'mirror' && u === 'maps.mail.ru') return r.fulfill({ json: { elements: [{ type: 'node', id: 1, lat: 50.0616, lon: 19.9373, tags: { tourism: 'attraction', name: 'Sukiennice' } }] } });
      r.fulfill({ status: u === 'overpass-api.de' ? 504 : 429, body: 'busy' }); });
    await ctx.route(/wikipedia\.org/, r => { const u = new URL(r.request().url());
      if (u.searchParams.get('generator') === 'geosearch') return r.fulfill({ json: { query: { pages: {
        1: { pageid: 1, title: 'Kościół Mariacki w Krakowie', description: 'bazylika w Krakowie', coordinates: [{ lat: 50.0617, lon: 19.9393 }], thumbnail: { source: 'https://x.example/a.jpg' } },
        2: { pageid: 2, title: 'Ulica Floriańska w Krakowie', description: 'ulica', coordinates: [{ lat: 50.063, lon: 19.940 }] },
        3: { pageid: 3, title: 'Sukiennice', description: 'hala targowa', coordinates: [{ lat: 50.0616, lon: 19.9373 }] } } } } });
      r.fulfill({ json: { query: { pages: {} } } }); });
    await ctx.route(/x\.example/, r => r.fulfill({ status: 404 }));
    await ctx.route(/nominatim/, r => { const q = new URL(r.request().url()).searchParams; hits.push('nominatim:' + q.get('q') + ':' + q.get('bounded'));
      r.fulfill({ json: q.get('q') === 'restaurant' ? [{ name: 'Pod Aniołami', display_name: 'Pod Aniołami, Grodzka 35, Kraków', lat: '50.058', lon: '19.937', type: 'restaurant' }] : [] }); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(400);
    const id = await p.evaluate(() => DB.put('trips', { name: 'Kraków', destination: '', start: '2027-05-01', end: '2027-05-03' }).then(t => t.id));
    await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${id}`); await p.waitForTimeout(400);
    await p.click('#dc-gps'); await p.waitForSelector('.dc-card, .dc-list p:not(:first-child), .dc-list p:has-text("⚠️")', { timeout: 20000 }); await p.waitForTimeout(300);
    console.log(`[${mode}] attractions:`, await p.$$eval('.dc-card b', e => e.map(x => x.textContent)), '| servers:', [...new Set(hits)].join(','));
    if (mode === 'down') {
      await p.click('a.st-chip[href*="t=jedzenie"]'); await p.waitForTimeout(4000);
      console.log(`[${mode}] food:`, await p.$$eval('.dc-card b', e => e.map(x => x.textContent)), '|', hits.filter(h => h.startsWith('nominatim')).join(','));
    }
    if (mode === 'all') console.log('[all] message:', await p.textContent('.dc-list'));
    console.log(`[${mode}] errors:`, errs); await ctx.close();
  };
  await run('mirror'); await run('down');
  // wszystko wyłączone
  const ctx = await b.newContext({ ...devices['Pixel 7'] }); await ctx.route(/overpass|maps\.mail\.ru|wikipedia|open-meteo/, r => r.fulfill({ status: 503, body: '' }));
  const p = await ctx.newPage(); await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(400);
  const id = await p.evaluate(() => DB.put('trips', { name: 'X', start: '2027-05-01', end: '2027-05-03' }).then(t => t.id));
  await p.goto(`http://localhost:8765/podroznik/#/odkrywaj/${id}?t=atrakcje&lat=50.06&lon=19.93&gdzie=tutaj`); await p.waitForSelector('.dc-list p:has-text("⚠️")', { timeout: 20000 });
  console.log('[all down] message:', (await p.textContent('.dc-list')).trim());
  await b.close(); })();
