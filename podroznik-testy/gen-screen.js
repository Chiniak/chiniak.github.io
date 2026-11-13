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
  await p.screenshot({ path: path.join(__dirname, 'fx', 'bilet-screen.png') });
  // karta przejazdu w trybie ciemnym (jasny tekst na ciemnym tle) – jak w Gmailu / Google
  await p.setContent(`<body style="font-family:Roboto,Arial,sans-serif;margin:0;background:#202124;color:#e8eaed;padding:24px">
    <div style="background:#3c4043;border-radius:18px;padding:22px 22px 22px 70px;position:relative">
      <div style="font-size:15px;color:#bdc1c6">Leeds</div>
      <div style="font-size:26px;margin:4px 0 22px">Departs at 09:12</div>
      <div style="font-size:15px;color:#bdc1c6">York</div>
      <div style="font-size:26px;margin:4px 0 6px">Arrives at 09:41</div>
      <div style="font-size:14px;color:#bdc1c6;margin-bottom:22px">29 m</div>
      <div style="font-size:15px;color:#bdc1c6">Reservation number</div>
      <div style="font-size:16px">QX77120, 04/09/2027 09:12</div>
    </div>
    <div style="font-size:13px;color:#9aa0a6;margin-top:14px">Based on this email &nbsp;&nbsp;&nbsp; Correct?</div></body>`);
  await p.setViewportSize({ width: 412, height: 420 });
  await p.screenshot({ path: path.join(__dirname, 'fx', 'bilet-ciemny.png') }); await b.close(); })();
