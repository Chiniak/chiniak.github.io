const { chromium, devices } = require('playwright');
const SP = process.argv[2], FX = SP + '/fx';
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FX}/cam.y4m`] });
  const ctx = await b.newContext({ ...devices['Pixel 7'], permissions: ['camera'] });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  p.on('dialog', d => { console.log('dialog:', d.message()); d.accept(); });
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${SP}/${n}.png` }); };
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(600);
  console.log('BarcodeDetector:', await p.evaluate(()=>'BarcodeDetector' in window));
  const ids = await p.evaluate(async()=>{ const t=await DB.put('trips',{name:'Lizbona',destination:'Lizbona',start:'2026-11-20',end:'2026-11-24',color:'#2f6fd6'});
    const s1=await DB.put('segments',{tripId:t.id,type:'lot',from:'Warszawa WAW',to:'Lizbona LIS',depart:'2026-11-20T06:40',arrive:'2026-11-20T09:55',number:'LO 281',seat:'14A',gate:'27',booking:'X7K2PQ'});
    const s2=await DB.put('segments',{tripId:t.id,type:'pociag',from:'Lizbona Oriente',to:'Porto Campanhã',depart:'2026-11-22T09:00',arrive:'2026-11-22T11:50',car:'5',seat:'42'});
    return {t:t.id,s1:s1.id,s2:s2.id}; });
  // add screenshot + pdf to flight
  await p.goto(B+'#/odcinek/'+ids.s1); await p.waitForTimeout(400);
  await p.setInputFiles('#pick', [FX+'/screenshot.png', FX+'/boarding.pdf']);
  await p.waitForTimeout(6000);
  console.log('toast:', await p.textContent('#toast'));
  const files = await p.evaluate(async()=>(await DB.all('files')).map(f=>({kind:f.kind,label:f.label,code:f.code})));
  console.log(JSON.stringify(files));
  await shot('t-seg');
  // open viewer
  await p.click('.tk-tile >> nth=0'); await p.waitForTimeout(1200); await shot('t-view-code');
  await p.click('[data-mode=oryginal]'); await p.waitForTimeout(800); await shot('t-view-orig');
  await p.click('[data-go="1"]'); await p.waitForTimeout(2000); await shot('t-view-pdf417');
  await p.click('[data-mode=oryginal]'); await p.waitForTimeout(2500); await shot('t-view-pdf');
  await p.click('#tv-close'); await p.waitForTimeout(400); console.log('after close:', p.url().split('#')[1]);
  // scanner with fake camera on train
  await p.goto(B+'#/odcinek/'+ids.s2); await p.waitForTimeout(300);
  await p.click('text=Skanuj kod'); await p.waitForTimeout(5000);
  console.log('scan result visible:', await p.isVisible('#sc-result'), await p.textContent('#sc-fmt'));
  await shot('t-scan');
  await p.click('#sc-save'); await p.waitForTimeout(1200);
  const f2 = await p.evaluate(async()=>(await DB.all('files')).filter(f=>f.kind==='code').map(f=>f.code));
  console.log('scanned:', JSON.stringify(f2));
  await shot('t-view-aztec');
  // round trip: rendered code must decode to the same text
  const rt = await p.evaluate(async()=>{ const c=document.querySelector('.tv-code'); const r=await App.Tickets._.detect(c); return r; });
  console.log('roundtrip equal:', JSON.stringify(rt)===JSON.stringify(f2[0]), JSON.stringify(rt));
  // home + bilety tab
  await p.goto(B+'#/podroze'); await p.waitForTimeout(600); await shot('t-home');
  await p.goto(B+'#/bilety'); await p.waitForTimeout(600); await shot('t-tab');
  await p.goto(B+'#/podroze/'+ids.t); await p.waitForTimeout(600); await shot('t-trip');
  // offline: libs cached?
  await ctx.setOffline(true); await p.goto(B+'#/bilet/'+(await p.evaluate(async()=>(await DB.all('files')).find(f=>f.kind==='pdf').id))); await p.waitForTimeout(2500);
  console.log('offline pdf canvases:', await p.locator('canvas').count());
  console.log('errors:', errs);
  await b.close();
})();
