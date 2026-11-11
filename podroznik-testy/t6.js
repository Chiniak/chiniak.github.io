const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  await p.goto('http://localhost:8765/podroznik/'); await p.waitForTimeout(400);
  const tid = await p.evaluate(async()=>{ const T=App.todayStr(); const t=await DB.put('trips',{name:'X',start:T,end:T});
    for (const [i,n] of ['A','B','C','D'].entries()) await DB.put('planItems',{tripId:t.id,date:T,time:'',title:n,order:i}); return t.id; });
  await p.goto('http://localhost:8765/podroznik/#/plan/'+tid); await p.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(p);
  const h = await p.locator('.pl-user:has-text("D") .pl-handle').boundingBox(); const top = await p.locator('.pl-user').first().boundingBox();
  const x=h.x+20; let y=h.y+20;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for (; y>top.y+5; y-=10) { await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]}); await p.waitForTimeout(25); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(700);
  console.log('touch order:', await p.evaluate(()=>[...document.querySelectorAll('.pl-user .pl-title')].map(e=>e.textContent.trim()).join('')));
  await b.close(); })();
