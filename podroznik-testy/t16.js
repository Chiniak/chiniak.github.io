const { chromium, devices } = require('playwright'); const fs = require('fs');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', permissions: ['clipboard-read','clipboard-write'] }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(600);
  for (const f of ['lot','ryanair','pkp','booking','flix']) {
    const r = await p.evaluate(t=>App.Email.parse(t), fs.readFileSync(`${SP}/mails/${f}.txt`,'utf8'));
    console.log(`== ${f}`); for (const s of r) console.log('  ', JSON.stringify(s));
  }
  // UI: paste LOT mail -> save all to new trip
  await p.goto(B+'#/wklej'); await p.waitForTimeout(400);
  await p.fill('#em-text', fs.readFileSync(`${SP}/mails/lot.txt`,'utf8')); await p.click('#em-go'); await p.waitForTimeout(600);
  await p.screenshot({ path: SP+'/e-found.png', fullPage: true });
  await p.click('#em-all'); await p.waitForTimeout(800);
  console.log('saved ->', p.url().split('#')[1].slice(0,10), '| trip:', JSON.stringify(await p.evaluate(async()=>{ const t=(await DB.all('trips'))[0]; return [t.name,t.start,t.end,(await DB.byIndex('segments','tripId',t.id)).length]; })));
  // UI: hotel mail -> "popraw i dodaj" prefill into existing trip
  await p.goto(B+'#/wklej'); await p.waitForTimeout(300);
  await p.evaluate(t=>navigator.clipboard.writeText(t), fs.readFileSync(`${SP}/mails/booking.txt`,'utf8'));
  await p.click('#em-paste'); await p.waitForTimeout(600);
  console.log('matched trip option:', await p.$eval('#em-trip', s=>s.options[s.selectedIndex].text));
  await p.click('[data-edit="0"]'); await p.waitForTimeout(600);
  console.log('prefilled form:', await p.inputValue('[name=name]'), '|', await p.inputValue('[name=depart]'), '|', await p.inputValue('[name=arrive]'), '|', await p.inputValue('[name=booking]'));
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('after save url:', p.url().split('#')[1].slice(0,10));
  // share target
  await p.goto(B+'index.html?title=Fwd%3A%20bilet&text='+encodeURIComponent(fs.readFileSync(`${SP}/mails/pkp.txt`,'utf8'))); await p.waitForTimeout(1200);
  console.log('share target url:', p.url().split('/podroznik/')[1].slice(0,30), '| cards:', await p.locator('.em-card').count(), '|', (await p.textContent('.em-card')).replace(/\s+/g,' ').trim().slice(0,90));
  // nonsense
  await p.fill('#em-text', 'Cześć, widzimy się w sobotę!'); await p.click('#em-go'); await p.waitForTimeout(300);
  console.log('nonsense:', (await p.textContent('#em-out')).slice(0,60));
  console.log('errors:', errs); await b.close(); })();
