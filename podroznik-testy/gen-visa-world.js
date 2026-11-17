// Generuje podroznik/lib/visa-world.js z bazy Passport Index (MIT, github.com/imorte/passport-index-data).
// Użycie: node podroznik-testy/gen-visa-world.js passport-index-tidy-iso2.csv "2026-02-17"
// Kodowanie wiersza paszportu: wartości dla krajów z DEST, po przecinku:
//   liczba = bez wizy (dni), f = bez wizy (dni nieznane), o = wiza po przylocie, t = ETA, e = e-wiza,
//   r = wiza wymagana, n = brak wjazdu, - = własny kraj
const fs = require("fs");
const [csv, asOf] = process.argv.slice(2);
const rows = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(1).map(l => l.split(","));
const CODE = { "visa free": "f", "visa on arrival": "o", eta: "t", "e-visa": "e", "visa required": "r", "no admission": "n", "-1": "-" };
const dest = [...new Set(rows.map(r => r[1]))].sort();
const idx = Object.fromEntries(dest.map((d, i) => [d, i]));
const by = {};
for (const [p, d, v] of rows) {
  const t = /^\d+$/.test(v) ? v : CODE[v];
  if (t == null) throw new Error("nieznana wartość: " + v);
  (by[p] || (by[p] = new Array(dest.length).fill("")))[idx[d]] = t;
}
const out = `/* Wymagania wizowe – wszystkie paszporty × kraje docelowe. Źródło: Passport Index Data (MIT),
   https://github.com/imorte/passport-index-data – stan: ${asOf}. Generator: podroznik-testy/gen-visa-world.js.
   Kodowanie: liczba = bez wizy (dni), f = bez wizy, o = wiza po przylocie, t = ETA, e = e-wiza, r = wiza, n = brak wjazdu, - = własny kraj */
self.VISA_WORLD = { asOf: ${JSON.stringify(asOf)}, dest: ${JSON.stringify(dest.join(","))}, rows: {
${Object.keys(by).sort().map(p => `${p}: ${JSON.stringify(by[p].join(","))}`).join(",\n")}
} };
`;
fs.writeFileSync(__dirname + "/../podroznik/lib/visa-world.js", out);
console.log(`paszporty: ${Object.keys(by).length}, kraje: ${dest.length}, bajty: ${out.length}`);
