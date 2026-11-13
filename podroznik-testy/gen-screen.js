// screen biletu (zmyślone dane) do testu odczytu tekstu ze zdjęcia – fx/bilet-screen.png
const { chromium } = require('playwright');
const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2.625 });
  await p.setContent(`<body style="font-family:Roboto,Arial,sans-serif;margin:0;background:#fff;color:#111">
    <div style="background:#1a73e8;color:#fff;padding:14px 18px;font-size:15px">12:41 &nbsp; ▾ &nbsp; 87%</div>
    <div style="padding:22px 20px">
      <div style="font-size:14px;color:#555">E-TICKET</div>
      <h1 style="font-size:26px;margin:6px 0 18px">Teatr Muzyczny Roma</h1>
      <div style="font-size:16px;line-height:1.7">
        <div><b>Wydarzenie:</b> Upiór w operze</div>
        <div><b>Data:</b> 16.03.2027, godz. 19:00</div>
        <div><b>Miejsce:</b> Teatr Roma, ul. Nowogrodzka 49</div>
        <div><b>Rząd:</b> 7 &nbsp; <b>Miejsce:</b> 14</div>
        <div><b>Cena:</b> 189,00 zł</div>
        <div><b>Nr zamówienia:</b> 58213377</div>
      </div>
      <div style="margin-top:26px;width:180px;height:180px;background:repeating-linear-gradient(45deg,#000 0 6px,#fff 6px 12px)"></div>
    </div></body>`);
  await p.screenshot({ path: path.join(__dirname, 'fx', 'bilet-screen.png') }); await b.close(); })();
