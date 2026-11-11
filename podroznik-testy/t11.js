const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto'); const SP = process.argv[2], FX = SP + '/fx';
(async () => {
  const b = await chromium.launch({ channel: 'chromium' });
  const errs=[]; const watch = p => { p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())}); };
  const B='http://localhost:8765/podroznik/';
  // ---- phone A: data + backups
  const A = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', acceptDownloads: true }); const p = await A.newPage(); watch(p);
  let answer = null; p.on('dialog', d => d.type()==='prompt' ? d.accept(answer) : d.accept());
  await p.goto(B); await p.waitForTimeout(600);
  const tid = await p.evaluate(async()=>{ const t=await DB.put('trips',{name:'Lizbona',start:'2026-11-20',end:'2026-11-24'});
    const s=await DB.put('segments',{tripId:t.id,type:'lot',from:'WAW',to:'LIS',depart:'2026-11-20T06:40'});
    await DB.put('planItems',{tripId:t.id,date:'2026-11-21',time:'10:00',title:'Oceanarium',order:0});
    await DB.put('packItems',{tripId:t.id,list:'pack',name:'Paszport',cat:'dokumenty',status:'done',order:0});
    await DB.setSetting('theme','dark'); await DB.setSetting('reminders',{packDays:3}); return {t:t.id,s:s.id}; });
  await p.goto(B+'#/odcinek/'+tid.s); await p.waitForTimeout(400);
  await p.setInputFiles('#pick', [FX+'/screenshot.png', FX+'/boarding.pdf']); await p.waitForTimeout(5000);
  const origHash = crypto.createHash('sha256').update(fs.readFileSync(FX+'/boarding.pdf')).digest('hex');
  await p.goto(B+'#/ustawienia'); await p.waitForTimeout(400);
  console.log('settings links:', (await p.textContent('a[href="#/ustawienia/kopia"]')).replace(/\s+/g,' ').trim(), '|', (await p.textContent('a[href="#/ustawienia/blokada"]')).replace(/\s+/g,' ').trim());
  await p.click('a[href="#/ustawienia/kopia"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: SP+'/b-backup.png' });
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bk-export button[type=submit]')]);
  const plain = SP+'/backup.json'; await dl.saveAs(plain);
  const j = JSON.parse(fs.readFileSync(plain,'utf8'));
  console.log('backup:', dl.suggestedFilename(), JSON.stringify(j.counts), 'files with blobData:', j.stores.files.filter(f=>f.blobData).length, 'settings keys:', j.stores.settings.map(s=>s.key).join(','));
  await p.fill('[name=pw]', 'tajne123'); await p.fill('[name=pw2]', 'tajne123');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bk-export button[type=submit]')]);
  const encf = SP+'/backup-enc.json'; await dl.saveAs(encf);
  const e = JSON.parse(fs.readFileSync(encf,'utf8')); console.log('encrypted:', dl.suggestedFilename(), !!e.encrypted, 'no plaintext:', !fs.readFileSync(encf,'utf8').includes('Oceanarium'));
  await p.waitForTimeout(500); console.log('last backup line:', (await p.textContent('.card .row >> nth=1')).replace(/\s+/g,' ').trim());
  // ---- phone B: restore
  const Bc = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const q = await Bc.newPage(); watch(q);
  let ans = 'zle-haslo'; q.on('dialog', d => d.type()==='prompt' ? d.accept(ans) : d.accept());
  await q.goto(B+'#/ustawienia/kopia'); await q.waitForTimeout(600);
  await q.setInputFiles('#bk-file', encf); await q.waitForTimeout(2500);
  console.log('wrong pw:', await q.textContent('#bk-preview'));
  ans = 'tajne123'; await q.setInputFiles('#bk-file', encf); await q.waitForTimeout(2500);
  console.log('preview:', (await q.textContent('.bk-box')).replace(/\s+/g,' ').trim().slice(0,120));
  await q.click('[data-mode=merge]'); await q.waitForTimeout(1500);
  console.log('after restore url:', q.url().split('#')[1], '| toast:', await q.textContent('#toast'));
  const r = await q.evaluate(async()=>{ const files=await DB.all('files'); const pdf=files.find(f=>f.kind==='pdf');
    const buf=await crypto.subtle.digest('SHA-256', await pdf.blob.arrayBuffer());
    return { trips:(await DB.all('trips')).length, files:files.length, codes: files.filter(f=>f.code).length, pdfName: pdf.blob.name, pdfType: pdf.blob.type,
      hash:[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join(''), theme: await DB.getSetting('theme'), rem: JSON.stringify(await DB.getSetting('reminders')) }; });
  console.log('restored:', JSON.stringify({...r, hash: r.hash===origHash ? 'IDENTYCZNY' : 'INNY'}));
  await q.goto(B+'#/bilety'); await q.waitForTimeout(400); await q.click('.next-ticket'); await q.waitForTimeout(1500);
  console.log('restored ticket view canvases:', await q.locator('.tv-body canvas').count());
  // replace mode with plain backup: duplicates must not appear
  await q.goto(B+'#/ustawienia/kopia'); await q.waitForTimeout(400); await q.setInputFiles('#bk-file', plain); await q.waitForTimeout(1500);
  await q.click('[data-mode=replace]'); await q.waitForTimeout(1500);
  console.log('after replace trips:', await q.evaluate(async()=>(await DB.all('trips')).length));
  // bad file
  fs.writeFileSync(SP+'/bad.json', '{"hello":1}'); await q.goto(B+'#/ustawienia/kopia'); await q.waitForTimeout(400);
  await q.setInputFiles('#bk-file', SP+'/bad.json'); await q.waitForTimeout(500); console.log('bad file:', await q.textContent('#bk-preview'));
  // ---- lock on phone B
  await q.goto(B+'#/ustawienia/blokada'); await q.waitForTimeout(400);
  await q.fill('[name=p1]','1234'); await q.fill('[name=p2]','1243'); await q.click('button[type=submit]'); console.log('mismatch:', await q.textContent('#lk-err'));
  await q.fill('[name=p2]','1234'); await q.click('button[type=submit]'); await q.waitForTimeout(800);
  await q.screenshot({ path: SP+'/b-lockset.png' });
  await q.reload(); await q.waitForTimeout(800);
  console.log('locked on reload:', await q.isVisible('#lock'), '| content hidden:', await q.evaluate(()=>getComputedStyle(document.querySelector('main')).visibility));
  await q.screenshot({ path: SP+'/b-lock.png' });
  for (const k of '1111') await q.click(`[data-k="${k}"]`); await q.waitForTimeout(500);
  console.log('wrong pin:', await q.textContent('#lk-msg'), '| still locked:', await q.isVisible('#lock'));
  for (const k of '1234') await q.click(`[data-k="${k}"]`); await q.waitForTimeout(500);
  console.log('unlocked:', !(await q.isVisible('#lock')), '| main visible:', await q.evaluate(()=>getComputedStyle(document.querySelector('main')).visibility));
  // lock not in backup
  await q.goto(B+'#/ustawienia/kopia'); await q.waitForTimeout(300);
  const [dl3] = await Promise.all([q.waitForEvent('download'), q.click('#bk-export button[type=submit]')]); await dl3.saveAs(SP+'/b3.json');
  console.log('lock in backup:', fs.readFileSync(SP+'/b3.json','utf8').includes('"lock"'));
  // disable lock
  await q.goto(B+'#/ustawienia/blokada'); await q.waitForTimeout(400);
  await q.fill('[name=old]','9999'); await q.click('button[value=off]'); await q.waitForTimeout(300); console.log('bad old pin:', await q.textContent('#lk-err'));
  await q.fill('[name=old]','1234'); await q.click('button[value=off]'); await q.waitForTimeout(800);
  await q.reload(); await q.waitForTimeout(800); console.log('no lock after disable:', !(await q.isVisible('#lock')));
  console.log('errors:', errs); await b.close(); })();
