const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  p.on('dialog', d => d.accept());
  const shot = async (n, full) => { await p.waitForTimeout(400); await p.screenshot({ path: `${SP}/${n}.png`, fullPage: !!full }); };
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(500);
  const now = await p.evaluate(()=>{const d=new Date(); return d.toTimeString().slice(0,5)});
  console.log('now', now);
  const ids = await p.evaluate(async()=>{
    const pad=n=>String(n).padStart(2,'0'); const d=new Date(); const T=App.todayStr();
    const at = m => { const x=new Date(Date.now()+m*60000); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
    const t=await DB.put('trips',{name:'Berlin służbowo',destination:'Berlin',start:App.addDays(T,-1),end:App.addDays(T,2),color:'#d08a17'});
    await DB.put('trips',{name:'Lizbona',destination:'Lizbona',start:'2026-11-20',end:'2026-11-24',color:'#2f6fd6'});
    await DB.put('segments',{tripId:t.id,type:'pociag',from:'Warszawa Centralna',to:'Berlin Hbf',depart:App.addDays(T,-1)+'T07:10',arrive:App.addDays(T,-1)+'T12:50',number:'EC 41'});
    await DB.put('segments',{tripId:t.id,type:'nocleg',name:'Hotel Adlon',address:'Unter den Linden 77, Berlin',depart:App.addDays(T,-1)+'T15:00',arrive:App.addDays(T,2)+'T11:00'});
    await DB.put('segments',{tripId:t.id,type:'metro',from:'Brandenburger Tor',to:'Alexanderplatz',depart:at(-10),arrive:at(25),number:'U5'});
    await DB.put('segments',{tripId:t.id,type:'pociag',from:'Berlin Hbf',to:'Warszawa Centralna',depart:App.addDays(T,2)+'T16:37',arrive:App.addDays(T,2)+'T22:20',number:'EC 48'});
    return {t:t.id, next: at(90).slice(11)};
  });
  await p.goto(B+'#/plan'); await p.waitForTimeout(600);
  console.log('plan url ok:', p.url().endsWith(ids.t));
  // add points via form
  const add = async (title, time, place, cost, cat) => {
    await p.click('#pl-today .pl-add'); await p.waitForTimeout(300);
    if (cat) await p.click(`.type-chip:has-text("${cat}")`);
    await p.fill('[name=title]', title); if (time) await p.fill('[name=time]', time);
    if (place) await p.fill('[name=place]', place); if (cost) await p.fill('[name=cost]', cost);
    await p.click('button[type=submit]'); await p.waitForTimeout(500);
  };
  await add('Spotkanie z klientem', ids.next, 'Friedrichstraße 43, Berlin', '', 'Spotkanie');
  await add('Kupić prezent', '', '', '30', 'Zakupy');
  await add('Kolacja', '20:00', 'Zur letzten Instanz, Berlin', '45,50', 'Jedzenie');
  await add('Śniadanie', '07:30', '', '', 'Jedzenie');
  const order = async () => p.evaluate(()=>[...document.querySelectorAll('#pl-today .pl-row')].map(r=>(r.querySelector('.pl-time').textContent+' '+r.querySelector('.pl-title').textContent.trim())));
  console.log('today order:', JSON.stringify(await order()));
  console.log('today card:', (await p.textContent('.today-card')).replace(/\s+/g,' ').trim());
  await shot('p-plan');
  // drag "Kupić prezent" to top
  const h = p.locator('#pl-today .pl-user:has-text("Kupić prezent") .pl-handle');
  const hb = await h.boundingBox(); const first = await p.locator('#pl-today .pl-row').first().boundingBox();
  await p.mouse.move(hb.x+20, hb.y+20); await p.mouse.down();
  for (let y=hb.y+20; y>first.y; y-=15) { await p.mouse.move(hb.x+20, y); await p.waitForTimeout(30); }
  await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(700);
  console.log('after drag:', JSON.stringify(await order()));
  console.log('db:', JSON.stringify(await p.evaluate(async()=>(await DB.all('planItems')).filter(i=>i.date===App.todayStr()).sort((a,b)=>a.order-b.order).map(i=>i.order+':'+i.title))));
  console.log('nav href:', await p.getAttribute('#pl-today .pl-user:has-text("Kolacja") .pl-nav','href'));
  console.log('costs:', await p.textContent('#pl-today .pl-cost'));
  await shot('p-plan-full', true);
  // edit + delete
  await p.click('#pl-today .pl-user:has-text("Śniadanie") .pl-main'); await p.waitForTimeout(300);
  await p.click('#del'); await p.waitForTimeout(500);
  console.log('after delete:', JSON.stringify(await order()));
  // switch trip
  await p.selectOption('#pl-trip', { label: /Lizbona/ }).catch(async()=>{ const v=await p.$eval('#pl-trip option:not([selected])', o=>o.value); await p.selectOption('#pl-trip', v); });
  await p.waitForTimeout(500); await shot('p-lisbon');
  console.log('lisbon info:', await p.textContent('.pl-info'));
  // trip page link + segment nav
  await p.goto(B+'#/podroze/'+ids.t); await p.waitForTimeout(400); await shot('p-trip');
  await p.click('.tl-card:has-text("Adlon") >> nth=0'); await p.waitForTimeout(400);
  console.log('segment nav:', await p.textContent('.map-link'));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.goto(B+'#/plan/'+ids.t); await p.waitForTimeout(500); await shot('p-dark');
  console.log('errors:', errs); await b.close();
})();
