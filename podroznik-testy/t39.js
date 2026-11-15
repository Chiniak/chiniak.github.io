// „📬 Z Gmaila” – limit zapytań Google (zgłoszone 15.11 z telefonu: „Quota exceeded … Units per minute per user”).
// Zapytania po kolei z odstępem; po 429/403 „quota” aplikacja czeka i czyta dalej; przy uporczywym limicie zapisuje przeczytane
// i kończy z informacją (reszta przy następnym sprawdzeniu, bez pętli ponownych prób).
const { chromium, devices } = require('playwright');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mail = i => ({ id: 'q' + i, internalDate: String(Date.now()), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Rezerwacja ' + i }, { name: 'From', value: 'Test <t@example.com>' }],
  body: { data: b64u('Zwykła wiadomość bez rezerwacji ' + i) } } });
const QUOTA = { status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'", errors: [{ reason: 'rateLimitExceeded' }] } } };
(async () => { const b = await chromium.launch(); const errs = [];
  const run = async (failFor) => {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
    let n = 0, quotaHits = 0; const times = [];
    await ctx.route(/^https:/, async r => {
      const u = new URL(r.request().url());
      if (u.host !== 'gmail.googleapis.com') return r.abort();
      const p = u.pathname.replace('/gmail/v1/users/me', '');
      if (p === '/profile') return r.fulfill({ json: { emailAddress: 'anna.test@gmail.com' } });
      if (p === '/messages') return r.fulfill({ json: { messages: Array.from({ length: 12 }, (_, i) => ({ id: 'q' + i })) } });
      const m = p.match(/^\/messages\/(\w+)$/);
      if (m) { n++; times.push(Date.now()); if (failFor(n)) { quotaHits++; return r.fulfill(QUOTA); } return r.fulfill({ json: mail(+m[1].slice(1)) }); }
      r.fulfill({ status: 404, json: {} });
    });
    await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      Filesystem: { writeFile: async () => ({ uri: '' }), rmdir: async () => {} }, Share: { share: async () => {} },
      GoogleAuth: { authorize: async () => ({ accessToken: 't', scopes: [] }), revoke: async () => {} } } }; });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765/podroznik/#/podroze'); await p.waitForTimeout(500);
    await p.evaluate(() => { App.Backdrop && App.Backdrop.setEnabled(false); App.Gmail.PACE.wait = 1500; App.Gmail.PACE.gap = 50; });
    await p.goto('http://localhost:8765/podroznik/#/gmail'); await p.waitForTimeout(300);
    const msgs = new Set(); const poll = setInterval(async () => { try { const t = await p.$eval('#gm-prog', e => e.textContent); if (t) msgs.add(t); } catch (e) {} }, 150);
    await p.click('#gm-connect'); await p.waitForTimeout(12000); clearInterval(poll);
    const toast = await p.$eval('#toast', e => e.textContent).catch(() => '-');
    const st = await p.evaluate(async () => { const c = await DB.getSetting('gmail', null); const s = await DB.getSetting('gmailSeen', {}); return { read: Object.keys(s).length, partial: c.partial, lastScan: !!c.lastScan, error: c.error }; });
    const gaps = times.slice(1).map((t, i) => t - times[i]); const parallel = gaps.filter(g => g < 30).length;
    await ctx.close();
    return { gets: n, quotaHits, parallel, waitMsg: [...msgs].find(m => /czekam/.test(m)) || '-', toast, ...st };
  };
  // 2 odmowy w środku – czeka i kończy wszystko
  const a = await run(n => n === 4 || n === 5);
  console.log('temporary quota:', JSON.stringify(a));
  // limit cały czas od 6. maila – zapisane 5, informacja, bez pętli
  const c = await run(n => n >= 6);
  console.log('persistent quota:', JSON.stringify(c));
  console.log('errors:', errs); await b.close();
})();
