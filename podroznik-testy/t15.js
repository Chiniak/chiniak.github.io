const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  const calls = [];
  const daily = (u, arch) => { const s=new Date(u.searchParams.get('start_date')), e=new Date(u.searchParams.get('end_date')); const time=[],code=[],mx=[],mn=[],pp=[];
    for (let d=new Date(s), i=0; d<=e; d.setDate(d.getDate()+1), i++) { time.push(d.toISOString().slice(0,10)); code.push([0,2,61,3,95][i%5]); mx.push(20+i); mn.push(12+i); pp.push(arch? (i%2?3:0) : [5,10,80,40,90][i%5]); }
    return { daily: Object.assign({ time, weather_code: code, temperature_2m_max: mx, temperature_2m_min: mn }, arch ? { precipitation_sum: pp } : { precipitation_probability_max: pp }) }; };
  await ctx.route(/open-meteo\.com/, r => { const u = new URL(r.request().url()); calls.push(u.hostname+' '+(u.searchParams.get('name')||u.searchParams.get('start_date')+'..'+u.searchParams.get('end_date')));
    let body;
    if (u.hostname.startsWith('geocoding')) body = { results: [{ latitude: 38.72, longitude: -9.14, country_code: 'PT', name: 'Lizbona' }] };
    else body = daily(u, u.hostname.startsWith('archive'));
    r.fulfill({ contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify(body) }); });
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(600);
  const ids = await p.evaluate(async()=>{ const T=App.todayStr();
    const near=await DB.put('trips',{name:'Lizbona',destination:'Lizbona',start:App.addDays(T,3),end:App.addDays(T,7)});
    const far=await DB.put('trips',{name:'Porto',start:App.addDays(T,40),end:App.addDays(T,44)});
    await DB.put('segments',{tripId:far.id,type:'lot',from:'Warszawa WAW',to:'Porto OPO',depart:App.addDays(T,40)+'T06:00'});
    return {near:near.id, far:far.id}; });
  await p.goto(B+'#/podroze/'+ids.near); await p.waitForTimeout(1500);
  console.log('near strip:', (await p.textContent('.wx')).replace(/\s+/g,' ').trim());
  await p.screenshot({ path: SP+'/w-trip.png' });
  await p.goto(B+'#/plan/'+ids.near); await p.waitForTimeout(800);
  console.log('plan badges:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.wx-badge')].map(e=>e.textContent))));
  await p.screenshot({ path: SP+'/w-plan.png' });
  await p.goto(B+'#/podroze/'+ids.far); await p.waitForTimeout(1500);
  console.log('far strip:', (await p.textContent('.wx')).replace(/\s+/g,' ').trim());
  const n = calls.length;
  await p.goto(B+'#/bilety'); await p.goto(B+'#/podroze/'+ids.near); await p.waitForTimeout(800);
  console.log('no refetch within 3h:', calls.length === n);
  console.log('calls:', calls.join(' | '));
  // offline: cached shows
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(1200);
  console.log('offline strip present:', await p.locator('.wx').count());
  console.log('errors:', errs); await b.close(); })();
