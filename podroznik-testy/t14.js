const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  const PLACES = { 'Kraków Główny': null, 'Kraków': {latitude:50.06,longitude:19.94,country_code:'PL',name:'Kraków'}, 'Gdańsk': {latitude:54.35,longitude:18.65,country_code:'PL',name:'Gdańsk'},
    'Lizbona': {latitude:38.72,longitude:-9.14,country_code:'PT',name:'Lizbona'}, 'Porto': {latitude:41.15,longitude:-8.61,country_code:'PT',name:'Porto'}, 'Berlin': {latitude:52.52,longitude:13.40,country_code:'DE',name:'Berlin'} };
  const asked = [];
  await ctx.route('https://geocoding-api.open-meteo.com/**', r => { const n = new URL(r.request().url()).searchParams.get('name'); asked.push(n); const hit = PLACES[n];
    r.fulfill({ contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify(hit ? { results: [hit] } : {}) }); });
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(600);
  await p.evaluate(async()=>{
    const t1=await DB.put('trips',{name:'Lizbona',destination:'Lizbona',start:'2026-05-01',end:'2026-05-05'});
    await DB.put('segments',{tripId:t1.id,type:'lot',from:'Warszawa WAW',to:'Lizbona LIS',depart:'2026-05-01T06:40'});
    await DB.put('segments',{tripId:t1.id,type:'pociag',from:'Lizbona Oriente',to:'Porto Campanhã',depart:'2026-05-03T09:00'});
    await DB.put('segments',{tripId:t1.id,type:'lot',from:'Porto OPO',to:'Warszawa WAW',depart:'2026-05-05T18:00'});
    await DB.put('segments',{tripId:t1.id,type:'nocleg',name:'Hotel',address:'Av. da Liberdade 1, Lizbona',depart:'2026-05-01T15:00',arrive:'2026-05-03T11:00'});
    const t2=await DB.put('trips',{name:'Gdańsk',start:'2025-07-10',end:'2025-07-12'});
    await DB.put('segments',{tripId:t2.id,type:'pociag',from:'Kraków Główny',to:'Gdańsk Główny',depart:'2025-07-10T07:00'});
    await DB.put('trips',{name:'Przyszła',start:'2027-01-01',end:'2027-01-03'}); });
  await p.goto(B+'#/bilety'); await p.goto(B+'#/podroze'); await p.waitForTimeout(400); await p.click('a[href="#/statystyki"]'); await p.waitForTimeout(800);
  const tiles = async () => (await p.textContent('.st-tiles')).replace(/\s+/g,' ').trim();
  console.log('offline tiles:', await tiles());
  console.log('missing:', (await p.textContent('.st-missing p')).trim());
  await p.screenshot({ path: SP+'/s-before.png', fullPage: true });
  await p.click('#st-geo'); await p.waitForTimeout(1500);
  console.log('asked:', asked.join(' | '));
  console.log('after geo tiles:', await tiles());
  console.log('countries:', (await p.textContent('.st-countries')).replace(/\s+/g,' ').trim());
  console.log('km rows:', (await p.textContent('.section + .card')).replace(/\s+/g,' ').trim());
  console.log('records:', (await p.locator('.card').last().textContent()).replace(/\s+/g,' ').trim());
  console.log('fun:', await p.textContent('.st-fun').catch(()=>'-'));
  await p.screenshot({ path: SP+'/s-after.png', fullPage: true });
  await p.click('.st-chip:has-text("2025")'); await p.waitForTimeout(600); console.log('2025:', await tiles());
  await p.check('#st-plan'); await p.waitForTimeout(600); await p.click('.st-chip:has-text("Wszystkie")'); await p.waitForTimeout(600); console.log('with planned:', await tiles());
  // airports + km sanity
  console.log('WAW-LIS km:', await p.evaluate(async()=>{ const a=await App.Stats.airports(); return Math.round(App.Stats.km(a.get('WAW'), a.get('LIS'))); }));
  await p.emulateMedia({colorScheme:'dark'}); await p.click('.st-chip:has-text("2026")'); await p.waitForTimeout(600); await p.screenshot({ path: SP+'/s-dark.png' });
  console.log('errors:', errs); await b.close(); })();
