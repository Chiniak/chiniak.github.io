const { chromium, devices } = require('playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text())});
  let promptAnswer = 'Mój weekend';
  p.on('dialog', d => d.type()==='prompt' ? d.accept(promptAnswer) : d.accept());
  const shot = async (n, full) => { await p.waitForTimeout(400); await p.screenshot({ path: `${SP}/${n}.png`, fullPage: !!full }); };
  const B='http://localhost:8765/podroznik/';
  await p.goto(B); await p.waitForTimeout(500);
  const tid = await p.evaluate(async()=>{ const T=App.todayStr();
    const t=await DB.put('trips',{name:'Lizbona',destination:'Lizbona',start:App.addDays(T,11),end:App.addDays(T,15),color:'#2f6fd6'});
    await DB.put('trips',{name:'Berlin',start:App.addDays(T,-1),end:App.addDays(T,2)}); return t.id; });
  await p.goto(B+'#/pakowanie'); await p.waitForTimeout(500);
  console.log('picked:', p.url().split('#')[1], '(berlin ongoing expected)');
  await p.goto(B+'#/pakowanie/'+tid); await p.waitForTimeout(400);
  await shot('k-empty');
  // templates
  await p.click('text=Wybierz z szablonu'); await p.waitForTimeout(300);
  await p.click('[data-tpl=b-podstawa]'); await p.waitForTimeout(800);
  console.log('toast1:', await p.textContent('#toast'));
  await p.click('text=📋 Szablony'); await p.waitForTimeout(300);
  await p.click('[data-tpl=b-lot]'); await p.waitForTimeout(800);
  console.log('toast2:', await p.textContent('#toast'));
  // quick add twice, focus stays
  await p.fill('#pk-add [name=name]', 'Aparat'); await p.selectOption('#pk-add [name=cat]', 'elektronika'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  await p.fill('#pk-add [name=name]', 'aparat'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  console.log('dup toast:', await p.textContent('#toast'));
  console.log('focus on input:', await p.evaluate(()=>document.activeElement.name));
  // check items & buy
  const scrollBefore = await p.evaluate(()=>{ scrollTo(0,600); return scrollY; });
  await p.click('.pk-row:has(.pk-name:text-is("Telefon")) .pk-check');
  await p.click('.pk-row:has(.pk-name:text-is("Powerbank")) .pk-check');
  await p.click('.pk-row:has-text("Słuchawki") .pk-buy');
  await p.waitForTimeout(300);
  console.log('scroll kept:', scrollBefore, await p.evaluate(()=>scrollY));
  console.log('progress:', (await p.textContent('#pk-progress')).replace(/\s+/g,' ').trim());
  await p.evaluate(()=>scrollTo(0,0)); await shot('k-list');
  await shot('k-list-full', true);
  // hide done
  await p.check('#pk-hide'); await p.waitForTimeout(200);
  console.log('rows visible after hide:', await p.locator('.pk-row').count(), '| hidden note:', await p.textContent('.pk-hidden'));
  await p.uncheck('#pk-hide');
  // todo tab with due date
  await p.click('[data-l=todo]'); await p.waitForTimeout(400);
  const yest = await p.evaluate(()=>App.addDays(App.todayStr(),-1));
  await p.fill('#pk-add [name=name]', 'Kupić walutę'); await p.fill('#pk-add [name=due]', yest); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('late:', await p.textContent('.pk-due.late'));
  await p.click('.pk-row:has-text("Odprawa online") .pk-check'); await p.waitForTimeout(200);
  await shot('k-todo');
  // edit item: change status & qty
  await p.click('[data-l=pack]'); await p.waitForTimeout(300);
  await p.click('.pk-name:has-text("Skarpetki")'); await p.waitForTimeout(300);
  await p.fill('[name=qty]', '5'); await p.click('.pk-st:has-text("Do kupienia")'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
  console.log('edited:', (await p.textContent('.pk-row:has-text("Skarpetki")')).replace(/\s+/g,' ').trim());
  // save template, reset
  await p.click('#pk-save'); await p.waitForTimeout(300);
  await p.click('#pk-reset'); await p.waitForTimeout(400);
  console.log('after reset:', (await p.textContent('.pk-prog-top')).replace(/\s+/g,' ').trim());
  await p.click('text=📋 Szablony'); await p.waitForTimeout(300); await shot('k-templates');
  console.log('own template:', await p.textContent('.tpl >> nth=0'));
  // trip page link
  await p.goto(B+'#/podroze/'+tid); await p.waitForTimeout(400);
  console.log('trip link:', (await p.textContent('.plan-link >> nth=1')).replace(/\s+/g,' ').trim());
  await shot('k-trip');
  await p.emulateMedia({ colorScheme: 'dark' }); await p.goto(B+'#/pakowanie/'+tid); await p.waitForTimeout(400); await shot('k-dark');
  console.log('errors:', errs); await b.close(); })();
