const { chromium, devices } = require('playwright');
const fs = require('fs'); const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'], permissions: ['notifications'], acceptDownloads: true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  const shot = async (n, full) => { await p.waitForTimeout(400); await p.screenshot({ path: `${SP}/${n}.png`, fullPage: !!full }); };
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(800);
  const ids = await p.evaluate(async()=>{
    const T=App.todayStr(), R=Reminders, now=R.nowStr();
    const t=await DB.put('trips',{name:'Lizbona',start:App.addDays(T,11),end:App.addDays(T,15),color:'#2f6fd6'});
    const s=await DB.put('segments',{tripId:t.id,type:'lot',from:'Warszawa WAW',to:'Lizbona LIS',depart:App.addDays(T,11)+'T06:40',arrive:App.addDays(T,11)+'T09:55',number:'LO 281',seat:'14A'});
    await DB.put('files',{tripId:t.id,segmentId:s.id,kind:'code',label:'Bilet',code:{text:'X',format:'qr_code'}});
    for (const n of ['Paszport','Ładowarka']) await DB.put('packItems',{tripId:t.id,list:'pack',name:n,cat:'inne',status:'pack',order:1});
    await DB.put('packItems',{tripId:t.id,list:'todo',name:'Kupić walutę',cat:'inne',status:'pack',due:T,order:2});
    // ongoing trip with train in 2h (=> "Za 1 h" is not due yet; "Jutro" day-before passed) 
    const b2=await DB.put('trips',{name:'Berlin',start:App.addDays(T,-1),end:App.addDays(T,1),color:'#d08a17'});
    await DB.put('segments',{tripId:b2.id,type:'pociag',from:'Berlin Hbf',to:'Warszawa Centralna',depart:R.addMin(now,45),arrive:R.addMin(now,400),number:'EC 48',car:'5',seat:'42'});
    return {t:t.id, s:s.id, b:b2.id};
  });
  const list = await p.evaluate(async()=> (await Reminders.load()).list.map(r=>`${r.at} | ${r.title} | due-until ${r.eventAt}`));
  console.log(list.join('\n'));
  // tick -> notifications
  await p.evaluate(()=>App.Reminders.tick()); await p.waitForTimeout(800);
  const notes = await p.evaluate(async()=> (await (await navigator.serviceWorker.ready).getNotifications()).map(n=>n.title));
  console.log('notifications:', JSON.stringify(notes));
  await p.evaluate(()=>App.Reminders.tick()); await p.waitForTimeout(300);
  console.log('no duplicates:', JSON.stringify(await p.evaluate(async()=>Object.keys(await DB.getSetting('remShown',{})))));
  // SW path: clear shown, close notifications, ask SW
  await p.evaluate(async()=>{ await DB.setSetting('remShown',{}); for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close(); 
     (await navigator.serviceWorker.ready).active.postMessage({type:'check-reminders'}); });
  await p.waitForTimeout(1500);
  console.log('SW notifications:', JSON.stringify(await p.evaluate(async()=> (await (await navigator.serviceWorker.ready).getNotifications()).map(n=>n.title))));
  // home
  await p.goto(B+'#/bilety'); await p.goto(B+'#/podroze'); await p.waitForTimeout(600);
  const t1 = await p.textContent('#cd-time'); await p.waitForTimeout(2100); const t2 = await p.textContent('#cd-time');
  console.log('countdown ticks:', t1.replace(/\s+/g,' '), '->', t2.replace(/\s+/g,' '));
  console.log('cd label:', (await p.textContent('.cd-label')).trim());
  await shot('r-home');
  // dismiss banner
  const before = await p.locator('.rm-row').count(); await p.click('.rm-x >> nth=0'); await p.waitForTimeout(300);
  await p.goto(B+'#/bilety'); await p.goto(B+'#/podroze'); await p.waitForTimeout(500);
  console.log('banner rows', before, '->', await p.locator('.rm-row').count());
  // future-only countdown: remove berlin
  await p.evaluate(async(b)=>{ for (const s of await DB.byIndex('segments','tripId',b)) await DB.del('segments',s.id); await DB.del('trips',b); }, ids.b);
  await p.goto(B+'#/bilety'); await p.goto(B+'#/podroze'); await p.waitForTimeout(500);
  console.log('cd label 2:', (await p.textContent('.cd-label')).trim(), '|', (await p.textContent('#cd-time')).replace(/\s+/g,' ').trim(), '| actions:', (await p.textContent('.cd-actions')).replace(/\s+/g,' ').trim());
  console.log('separate nearest ticket card shown:', await p.locator('.next-ticket').count());
  await shot('r-home2');
  // settings
  await p.goto(B+'#/ustawienia'); await p.waitForTimeout(400); await p.click('text=Przypomnienia i kalendarz'); await p.waitForTimeout(600);
  await shot('r-settings', true);
  await p.selectOption('.rm-type[data-type=lot] select[name=before]', '120'); await p.waitForTimeout(400);
  console.log('saved:', JSON.stringify((await p.evaluate(()=>DB.getSetting('reminders',null))).types.lot));
  await p.goto(B+'#/podroze'); await p.goto(B+'#/ustawienia/przypomnienia'); await p.waitForTimeout(500);
  console.log('upcoming has 2h:', (await p.textContent('.rm-up >> nth=1')).replace(/\s+/g,' ').trim());
  // test notification
  await p.click('#rm-test'); await p.waitForTimeout(500); console.log('test toast:', await p.textContent('#toast'));
  // ICS
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rm-ics')]);
  const path = SP+'/out.ics'; await dl.saveAs(path); const ics = fs.readFileSync(path,'utf8');
  const lines = ics.split('\r\n'); const long = lines.filter(l=>Buffer.byteLength(l)>75).length;
  console.log('ics file:', dl.suggestedFilename(), '| events', (ics.match(/BEGIN:VEVENT/g)||[]).length, '| alarms', (ics.match(/BEGIN:VALARM/g)||[]).length, '| lines>75B', long, '| CRLF ok', !/[^\r]\n/.test(ics));
  console.log(ics.split('\r\n').filter(l=>/^(SUMMARY|DTSTART|TRIGGER)/.test(l)).join('\n'));
  // gcal on segment page + trip page ics button
  await p.goto(B+'#/odcinek/'+ids.s); await p.waitForTimeout(400);
  console.log('gcal:', await p.getAttribute('a:has-text("Google Kalendarza")','href'));
  await p.goto(B+'#/podroze/'+ids.t); await p.waitForTimeout(400);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#ics-trip')]); console.log('trip ics:', dl2.suggestedFilename());
  await p.emulateMedia({colorScheme:'dark'}); await p.goto(B+'#/podroze'); await p.waitForTimeout(500); await shot('r-dark');
  console.log('errors:', errs); await b.close(); })();
