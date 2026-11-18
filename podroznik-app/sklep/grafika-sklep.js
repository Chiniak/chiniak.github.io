// Uruchom po zrzuty-sklep.js: node grafika-sklep.js <katalog>/feat (czyta <katalog>/store/raw)
const { chromium } = require('playwright'); const fs = require('fs');
const F = '/home/user/chiniak.github.io/podroznik/lib/fonts/', OUT = process.argv[2];
const b64 = f => fs.readFileSync(F + f).toString('base64');
const icon = 'data:image/png;base64,' + fs.readFileSync('/home/user/chiniak.github.io/podroznik/icon-512.png').toString('base64');
const shot = 'data:image/png;base64,' + fs.readFileSync(OUT + '/../store/raw/pl/02-dzis.png').toString('base64');
const TAG = { pl: 'Cała podróż w telefonie – także bez internetu', en: 'Your whole trip on your phone – even offline', de: 'Deine ganze Reise auf dem Handy – auch offline',
  es: 'Todo tu viaje en el móvil, también sin conexión', it: 'Tutto il viaggio nel telefono, anche offline', pt: 'A viagem inteira no celular – também offline', zh: '整趟旅行装进手机，离线也能用' };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
  for (const [l, t] of Object.entries(TAG)) {
    const sh = 'data:image/png;base64,' + fs.readFileSync(`${OUT}/../store/raw/${l}/02-dzis.png`).toString('base64');
    await p.setContent(`<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:NR;src:url(data:font/woff2;base64,${b64('newsreader-latin-500-normal.woff2')})}
@font-face{font-family:PJ;font-weight:200 800;src:url(data:font/woff2;base64,${b64('plus-jakarta-sans-latin-ext-wght-normal.woff2')})}
@font-face{font-family:PJ;font-weight:200 800;src:url(data:font/woff2;base64,${b64('plus-jakarta-sans-latin-wght-normal.woff2')});unicode-range:U+0000-00FF}
html,body{margin:0;width:1024px;height:500px;overflow:hidden}
body{background:radial-gradient(110% 120% at 20% 10%,#2b5a4f 0%,#123a31 50%,#0b2620 100%);font-family:PJ,"WenQuanYi Zen Hei",sans-serif;position:relative}
.ic{position:absolute;left:72px;top:96px;width:120px;height:120px;border-radius:28px;box-shadow:0 12px 30px rgba(0,0,0,.4)}
h1{position:absolute;left:72px;top:232px;margin:0;font-family:NR,serif;font-weight:500;font-size:84px;color:#fff;letter-spacing:-1px}
.bar{position:absolute;left:76px;top:350px;width:90px;height:6px;border-radius:3px;background:#d9b25f}
p{position:absolute;left:72px;top:372px;width:520px;margin:0;color:#d7e6e1;font-size:26px;line-height:1.35;font-weight:500}
.ph{position:absolute;right:70px;top:46px;width:270px;height:600px;border-radius:30px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.5),0 0 0 8px #0a1d18,0 0 0 9px rgba(217,178,95,.6);transform:rotate(-4deg)}
.ph img{width:100%;display:block}
</style><img class="ic" src="${icon}"><h1>Tripwillow</h1><div class="bar"></div><p>${t}</p><div class="ph"><img src="${sh}"></div>`);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/grafika-1024x500-${l}.png` });
  }
  await b.close();
})();
