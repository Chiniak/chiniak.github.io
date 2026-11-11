const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  p.on('dialog', d => d.accept());
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(600);
  const tid = await p.evaluate(async()=>{ const T=App.todayStr();
    const t=await DB.put('trips',{name:'Lizbona',start:App.addDays(T,-1),end:App.addDays(T,3)});
    await DB.put('segments',{tripId:t.id,type:'lot',from:'WAW',to:'LIS',depart:App.addDays(T,-1)+'T06:40',price:'899',currency:'PLN'});
    await DB.put('segments',{tripId:t.id,type:'nocleg',name:'Hotel Avenida',depart:App.addDays(T,-1)+'T15:00',arrive:App.addDays(T,3)+'T11:00',price:'320',currency:'EUR'});
    await DB.put('planItems',{tripId:t.id,date:App.addDays(T,1),time:'10:00',title:'Oceanarium',cost:'25',currency:'EUR',order:0});
    return t.id; });
  await p.goto(B+'#/podroze/'+tid); await p.waitForTimeout(400);
  console.log('trip link:', (await p.textContent('a[href^="#/budzet"]')).replace(/\s+/g,' ').trim());
  await p.click('a[href^="#/budzet"]'); await p.waitForTimeout(500);
  console.log('summary 1:', (await p.textContent('.bg-sum')).replace(/\s+/g,' ').trim());
  // add expenses
  const add = async (title, amount, cur, cat) => { await p.fill('#bg-add [name=title]', title); await p.fill('#bg-add [name=amount]', amount); await p.fill('#bg-add [name=currency]', cur); await p.selectOption('#bg-add [name=cat]', cat); await p.click('#bg-add button[type=submit]'); await p.waitForTimeout(500); };
  await add('Kawa i pastel de nata', '4,50', 'eur', 'jedzenie');
  await add('Tramwaj 28', '3', 'EUR', 'transport');
  await add('Pamiątki', '60', 'PLN', 'zakupy');
  console.log('currency remembered:', await p.inputValue('#bg-add [name=currency]'));
  // set budget + rate
  await p.fill('#bg-cfg [name=budget]', '3000'); await p.fill('#bg-cfg [name=rate_EUR]', '4,30'); await p.click('#bg-cfg button[type=submit]'); await p.waitForTimeout(600);
  console.log('summary 2:', (await p.textContent('.bg-sum')).replace(/\s+/g,' ').trim());
  console.log('cats:', (await p.textContent('.bg-cats')).replace(/\s+/g,' ').trim());
  await p.screenshot({ path: SP+'/g-budget.png', fullPage: true });
  // NBP (offline in sandbox -> graceful)
  await p.click('#bg-nbp'); await p.waitForTimeout(3000); console.log('nbp:', await p.textContent('#toast'));
  // edit expense
  await p.click('.bg-row:has-text("Tramwaj")'); await p.waitForTimeout(300); await p.fill('[name=amount]','6'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
  console.log('after edit:', (await p.textContent('.bg-top')).replace(/\s+/g,' ').trim());
  // over budget
  await p.fill('#bg-cfg [name=budget]', '2000'); await p.click('#bg-cfg button[type=submit]'); await p.waitForTimeout(500);
  console.log('over:', (await p.textContent('.bg-sum .bg-sub')).replace(/\s+/g,' ').trim());
  await p.goto(B+'#/podroze/'+tid); await p.waitForTimeout(400);
  console.log('trip link 2:', (await p.textContent('a[href^="#/budzet"]')).replace(/\s+/g,' ').trim());
  // delete trip removes expenses
  await p.click('#action a'); await p.waitForTimeout(300); await p.click('#del'); await p.waitForTimeout(600);
  console.log('expenses left:', await p.evaluate(async()=>(await DB.all('expenses')).length));
  console.log('errors:', errs.filter(e=>!/nbp|Failed to fetch|ERR_/.test(e))); await b.close(); })();
