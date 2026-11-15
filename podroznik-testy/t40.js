// Aplikacja na Androida: przypomnienia zaplanowane w telefonie (udawana wtyczka LocalNotifications).
// Zgoda przy pierwszym uruchomieniu, planowanie (czas, ikona, kanał, link), brak ponownego planowania bez zmian,
// odświeżenie po zmianie godziny, odtworzenie po skasowaniu alarmów, zaległe pokazane raz, dotknięcie → ekran, Ustawienia.
const { chromium, devices } = require('playwright');
const MOCK = () => {
  const st = JSON.parse(localStorage.getItem('__ln') || '{"pending":[],"display":"prompt","exact":"denied"}');
  const save = () => localStorage.setItem('__ln', JSON.stringify(st));
  window.__ln = st; window.__lnLog = []; window.__lnListeners = {};
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    Filesystem: { writeFile: async () => ({ uri: '' }), rmdir: async () => {} }, Share: { share: async () => {} },
    LocalNotifications: {
      checkPermissions: async () => ({ display: st.display }),
      requestPermissions: async () => { __lnLog.push(['request']); st.display = 'granted'; save(); return { display: 'granted' }; },
      checkExactNotificationSetting: async () => ({ exact_alarm: st.exact }),
      changeExactNotificationSetting: async () => { __lnLog.push(['exact']); st.exact = 'granted'; save(); return { exact_alarm: 'granted' }; },
      createChannel: async o => { __lnLog.push(['channel', o.id, o.importance]); },
      getPending: async () => ({ notifications: st.pending.map(n => ({ id: n.id })) }),
      cancel: async o => { __lnLog.push(['cancel', o.notifications.length]); const ids = new Set(o.notifications.map(n => n.id)); st.pending = st.pending.filter(n => !ids.has(n.id)); save(); },
      schedule: async o => { __lnLog.push(['schedule', o.notifications.length]);
        o.notifications.forEach(n => st.pending.push({ id: n.id, title: n.title, at: new Date(n.schedule.at).toISOString(), exact: n.isExactNotification, icon: n.smallIcon, ch: n.channelId, href: n.extra.href }));
        save(); return { notifications: o.notifications.map(n => ({ id: n.id })) }; },
      addListener: (ev, fn) => { __lnListeners[ev] = fn; return { remove() {} }; },
    } } };
};
(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  await ctx.route(/^https:/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const U = 'http://localhost:8765/podroznik/';
  await p.goto(U + '#/podroze'); await p.waitForTimeout(600);
  await p.evaluate(() => App.Backdrop && App.Backdrop.setEnabled(false));
  console.log('start without trips → log:', JSON.stringify(await p.evaluate(() => __lnLog)));
  const ids = await p.evaluate(async () => {
    const T = App.todayStr();
    const t = await DB.put('trips', { name: 'Wietnam', destination: 'Hanoi', start: App.addDays(T, 2), end: App.addDays(T, 9) });
    const s = await DB.put('segments', { tripId: t.id, type: 'lot', from: 'WAW', to: 'HAN', depart: `${App.addDays(T, 2)}T10:00`, arrive: `${App.addDays(T, 3)}T06:00` });
    return { trip: t.id, seg: s.id };
  });
  await p.reload(); await p.waitForTimeout(1500);
  const st1 = await p.evaluate(() => ({ log: __lnLog, pending: __ln.pending }));
  console.log('first start log:', JSON.stringify(st1.log));
  console.log('scheduled:', st1.pending.length, JSON.stringify(st1.pending.map(n => [n.title, n.at.slice(0, 16), n.exact, n.icon, n.ch, n.href])));
  console.log('ids are ints:', st1.pending.every(n => Number.isInteger(n.id) && n.id > 0 && n.id < 2 ** 31));

  await p.reload(); await p.waitForTimeout(1500);
  console.log('second start (no changes) log:', JSON.stringify(await p.evaluate(() => __lnLog)));

  // zmiana godziny lotu → po przejściu na inny ekran plan się odświeża
  await p.evaluate(async id => { const s = await DB.get('segments', id); await DB.put('segments', { ...s, depart: s.depart.slice(0, 11) + '15:30' }); }, ids.seg);
  await p.evaluate(id => { location.hash = '#/podroze/' + id; }, ids.trip); await p.waitForTimeout(4500);
  const st2 = await p.evaluate(() => ({ log: __lnLog, pending: __ln.pending }));
  console.log('after change log:', JSON.stringify(st2.log), '| times:', JSON.stringify(st2.pending.map(n => n.at.slice(11, 16))));

  // system skasował alarmy (aktualizacja aplikacji) → przy starcie zaplanowane od nowa
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('__ln')); s.pending = []; localStorage.setItem('__ln', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(1500);
  console.log('after alarms cleared:', JSON.stringify(await p.evaluate(() => __lnLog)), '| pending:', await p.evaluate(() => __ln.pending.length));

  // zaległe (punkt planu za 10 min, przypomnienie 15 min przed) – pokazane raz od razu, nie dwa razy
  await p.evaluate(async id => { const d = new Date(Date.now() + 10 * 60e3); const pad = n => String(n).padStart(2, '0');
    await DB.put('planItems', { tripId: id, date: App.todayStr(), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, title: 'Muzeum Etnografii', order: 0 });
    await DB.setSetting('reminders', { ...(await DB.getSetting('reminders', {})), plan: 15 }); }, ids.trip);
  await p.evaluate(async () => { __lnLog.length = 0; await App.Reminders.tick(); await App.Reminders.tick(); });
  console.log('due now → log:', JSON.stringify(await p.evaluate(() => __lnLog)), '| last:', await p.evaluate(() => __ln.pending.slice(-1)[0].title));

  // dotknięcie powiadomienia
  await p.evaluate(() => __lnListeners.localNotificationActionPerformed({ notification: { extra: { href: '/plan/x' } } })); await p.waitForTimeout(300);
  console.log('tap →', await p.evaluate(() => location.hash));

  // ustawienia przypomnień
  await p.goto(U + '#/ustawienia/przypomnienia'); await p.waitForTimeout(1200);
  console.log('settings:', await p.$eval('.rm-status', e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 260)));
  console.log('buttons:', await p.$$eval('.rm-btns button', e => e.map(x => x.id)));
  await p.evaluate(() => { __lnLog.length = 0; }); await p.click('#rm-exact'); await p.waitForTimeout(1500);
  console.log('exact → log:', JSON.stringify(await p.evaluate(() => __lnLog)), '| all exact:', await p.evaluate(() => __ln.pending.every(n => n.exact)));
  await p.evaluate(() => { __lnLog.length = 0; }); await p.click('#rm-test'); await p.waitForTimeout(500);
  console.log('test →', JSON.stringify(await p.evaluate(() => __lnLog)), await p.$eval('#toast', e => e.textContent));
  await p.goto(U + '#/ustawienia'); await p.waitForTimeout(500);
  console.log('settings link:', await p.$eval('a[href="#/ustawienia/przypomnienia"]', e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('errors:', errs); await b.close();
})();
