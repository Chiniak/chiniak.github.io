const { chromium, devices } = require('playwright');
const SP = process.argv[2], FX = SP + '/fx';
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  p.on('dialog', d => d.accept());
  const B='http://localhost:8765/podroznik/';
  // 1) old v1 database with data (as on a phone with etap 0–6)
  await p.goto('http://localhost:8765/podroznik/lib/README.txt');
  await p.evaluate(()=>new Promise((res,rej)=>{ const r=indexedDB.open('podroznik',1); r.onupgradeneeded=()=>{ const db=r.result;
    for (const [n,ix] of Object.entries({trips:['start'],segments:['tripId','depart'],files:['segmentId','tripId'],planItems:['tripId','date'],packItems:['tripId'],templates:[],reminders:['tripId','at']})) { const s=db.createObjectStore(n,{keyPath:'id'}); ix.forEach(i=>s.createIndex(i,i)); }
    db.createObjectStore('settings',{keyPath:'key'}); };
    r.onsuccess=()=>{ const db=r.result; const t=db.transaction('trips','readwrite'); t.objectStore('trips').put({id:'old1',name:'Stara podróż',start:'2026-12-01',end:'2026-12-20'}); t.oncomplete=()=>{db.close();res();}; }; r.onerror=()=>rej(r.error); }));
  await p.goto(B); await p.waitForTimeout(800);
  console.log('upgrade kept data:', await p.evaluate(async()=>{ const db=await DB.open(); return db.version+' '+[...db.objectStoreNames].join(',')+' | trips: '+(await DB.all('trips')).map(t=>t.name); }));
  // 2) documents
  await p.goto(B+'#/bilety'); await p.waitForTimeout(400);
  console.log('tickets link:', (await p.textContent('a[href="#/dokumenty"]')).replace(/\s+/g,' ').trim());
  await p.click('a[href="#/dokumenty"]'); await p.waitForTimeout(300); await p.click('text=Dodaj dokument'); await p.waitForTimeout(300);
  await p.fill('[name=person]','Jan'); await p.fill('[name=number]','ea1234567'); await p.fill('[name=country]','Polska');
  const exp = await p.evaluate(()=>App.addDays('2026-12-20', 100)); // < 6 months after trip end
  await p.fill('[name=issued]','2017-03-01'); await p.fill('[name=expires]', exp);
  await p.setInputFiles('#doc-pick', FX+'/qr.png');
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('doc view:', (await p.textContent('.doc-head')).replace(/\s+/g,' ').trim());
  console.log('scan img:', await p.locator('.doc-img').count());
  await p.screenshot({ path: SP+'/d-view.png' });
  // expired insurance + soon id
  await p.evaluate(async()=>{ const T=App.todayStr(); await DB.put('docs',{type:'ubezpieczenie',person:'Ania',expires:App.addDays(T,-3),remind:30});
    await DB.put('docs',{type:'dowod',person:'Ania',number:'ABC123456',expires:App.addDays(T,20),remind:30}); });
  await p.goto(B+'#/bilety'); await p.goto(B+'#/dokumenty'); await p.waitForTimeout(500);
  console.log('order:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.doc-card')].map(c=>c.className.split(' ')[1]+': '+c.querySelector('.doc-valid').textContent))));
  await p.screenshot({ path: SP+'/d-list.png' });
  await p.goto(B+'#/bilety'); await p.waitForTimeout(300); console.log('tickets link now:', (await p.textContent('a[href="#/dokumenty"]')).replace(/\s+/g,' ').trim());
  // reminders
  console.log('doc reminders:', JSON.stringify(await p.evaluate(async()=>(await Reminders.load()).list.filter(r=>r.id.startsWith('doc:')).map(r=>r.at+' '+r.title))));
  console.log('active now:', JSON.stringify(await p.evaluate(async()=>Reminders.active((await Reminders.load()).list).filter(r=>r.id.startsWith('doc:')).map(r=>r.title))));
  // edit + remove scan
  const id = await p.evaluate(async()=>(await DB.all('docs')).find(d=>d.type==='paszport').id);
  await p.goto(B+'#/dokument/'+id+'/edytuj'); await p.waitForTimeout(300); await p.click('#doc-rm'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
  console.log('scan removed:', await p.evaluate(async(i)=>!(await DB.get('docs',i)).blob, id));
  // backup includes doc blob
  const snap = await p.evaluate(async()=>{ await DB.put('docs',{type:'wiza',blob:new File(['hello'],'w.txt',{type:'text/plain'})}); const s=await App.Backup.snapshot(); return [s.counts.docs, s.stores.docs.filter(d=>d.blobData).length]; });
  console.log('backup docs/blobs:', JSON.stringify(snap));
  console.log('errors:', errs); await b.close(); })();
