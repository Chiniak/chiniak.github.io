// t63: przypomnienia – identyczne (ten sam tytuł i treść) pokazują się raz; różne zostają; z kilku dla jednego kraju zostaje najnowsze.
global.self = global; require('../podroznik/reminders-core.js');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const R = global.Reminders, mk = (id, at, title, body) => ({ id, at, eventAt: '2099-01-01T00:00', title, body, href: '/x' });
const t = 'UK ETA: Wielka Brytania', b = '„Lisbon”: wniosek tylko na oficjalnej stronie';
const list = [mk('visa:t1:GB:30', '2026-11-01T10:00', t, b), mk('visa:t1:GB:14', '2026-11-10T10:00', t, b), mk('visa:t2:GB:30', '2026-11-02T10:00', t, b), mk('visa:t3:US:30', '2026-11-03T10:00', 'ESTA: Stany Zjednoczone', b)];
const a = R.active(list, '2026-11-18T12:00');
ok(a.length === 2, 'dwie identyczne podróże → jedno przypomnienie + inne państwo (' + a.length + ')');
ok(a.some(x => x.title === t) && a.some(x => /ESTA/.test(x.title)), 'zostają UK ETA i ESTA');
ok(a.find(x => x.title === t).at === '2026-11-10T10:00', 'z kilku zostaje najnowsze');
console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
