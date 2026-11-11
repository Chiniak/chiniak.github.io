const fs = require('fs'); const out = process.argv[2];
const air = require('airport-codes').toJSON();
// English country name -> ISO2 (via Intl) + aliases used by OpenFlights
const dn = new Intl.DisplayNames(['en'], { type: 'region' }); const name2iso = {};
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) { const c = String.fromCharCode(a, b); try { const n = dn.of(c); if (n && n !== c) name2iso[n.toLowerCase()] = c; } catch (e) {} }
Object.assign(name2iso, { 'czech republic': 'CZ', 'russia': 'RU', 'south korea': 'KR', 'north korea': 'KP', 'burma': 'MM', 'macau': 'MO', 'cape verde': 'CV',
  "cote d'ivoire": 'CI', 'ivory coast': 'CI', 'congo (kinshasa)': 'CD', 'congo (brazzaville)': 'CG', 'east timor': 'TL', 'swaziland': 'SZ', 'macedonia': 'MK',
  'virgin islands': 'VI', 'british virgin islands': 'VG', 'turks and caicos islands': 'TC', 'micronesia': 'FM', 'palestine': 'PS', 'west bank': 'PS',
  'netherlands antilles': 'CW', 'myanmar': 'MM', 'bosnia and herzegovina': 'BA', 'saint kitts and nevis': 'KN', 'saint vincent and the grenadines': 'VC',
  'saint lucia': 'LC', 'svalbard': 'SJ', 'wallis and futuna': 'WF', 'reunion': 'RE', 'saint pierre and miquelon': 'PM', 'falkland islands': 'FK',
  'south sudan': 'SS', 'united states': 'US', 'united kingdom': 'GB', 'hong kong': 'HK', 'taiwan': 'TW', 'vietnam': 'VN', 'laos': 'LA', 'brunei': 'BN',
  'syria': 'SY', 'iran': 'IR', 'moldova': 'MD', 'tanzania': 'TZ', 'bolivia': 'BO', 'venezuela': 'VE', 'cocos (keeling) islands': 'CC', 'gambia': 'GM', 'bahamas': 'BS', 'turkey': 'TR', 'sao tome and principe': 'ST', 'antigua and barbuda': 'AG', 'trinidad and tobago': 'TT', 'korea': 'KR', 'midway islands': 'UM', 'johnston atoll': 'UM', 'wake island': 'UM' });
const tzs = [], tzIdx = {}, missing = new Set(); const lines = [];
for (const r of air) {
  const a = r.attributes || r; if (!a.iata || !/^[A-Z]{3}$/.test(a.iata)) continue;
  const iso = name2iso[(a.country || '').toLowerCase()] || ''; if (!iso) missing.add(a.country);
  let t = a.tz && a.tz !== '\\N' ? a.tz : ''; if (t && !(t in tzIdx)) { tzIdx[t] = tzs.length; tzs.push(t); }
  lines.push([a.iata, (+a.latitude).toFixed(2).replace(/\.?0+$/, ''), (+a.longitude).toFixed(2).replace(/\.?0+$/, ''), iso, t ? tzIdx[t] : '', (a.city || '').replace(/[|\n]/g, ' ')].join('|'));
}
const js = `/* Lotniska (kod IATA → położenie, kraj, strefa czasowa, miasto) – na podstawie OpenFlights (ODbL), przez pakiet airport-codes.
   Format wiersza: KOD|szer.|dł.|kraj ISO|nr strefy|miasto. Używane offline przez statystyki (etap 8). */
self.AIRPORT_TZ = ${JSON.stringify(tzs)};
self.AIRPORT_DATA = ${JSON.stringify(lines.join('\n'))};
`;
fs.writeFileSync(out + '/airports.js', js);
console.log('airports', lines.length, 'bytes', js.length, 'missing countries', missing.size, [...missing].slice(0, 15).join('; '));
// world land outline -> SVG path (equirectangular, viewBox 0 0 360 180)
const topo = require('world-atlas/land-110m.json'); const tc = require('topojson-client');
const land = tc.feature(topo, topo.objects.land);
let d = ''; const r1 = v => Math.round(v * 10) / 10;
const ring = pts => { let s = '', px = null, py = null; for (const [lon, lat] of pts) { const x = r1(lon + 180), y = r1(90 - lat); if (x === px && y === py) continue; s += (s ? 'L' : 'M') + x + ' ' + y; px = x; py = y; } return s + 'Z'; };
for (const f of land.features) { const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) for (const rg of p) d += ring(rg); }
const wjs = `/* Zarys lądów świata (Natural Earth 1:110m, domena publiczna, przez world-atlas) jako ścieżka SVG w odwzorowaniu walcowym: x = dł. + 180, y = 90 − szer. */\nself.WORLD_PATH = ${JSON.stringify(d)};\n`;
fs.writeFileSync(out + '/world.js', wjs); console.log('world bytes', wjs.length);
