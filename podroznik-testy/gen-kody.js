const bwip = require('bwip-js'); const fs = require('fs'); const D = process.argv[2];
(async () => {
  fs.writeFileSync(D+'/qr.png', await bwip.toBuffer({ bcid:'qrcode', text:'TICKET-WAW-LIS-LO281-14A', scale:6, padding:10, backgroundcolor:'FFFFFF' }));
  fs.writeFileSync(D+'/aztec.png', await bwip.toBuffer({ bcid:'azteccode', text:'PKP IC EIP 5300 Krakow-Gdansk wagon 5 miejsce 42 Zażółć', scale:6, padding:10, backgroundcolor:'FFFFFF' }));
  fs.writeFileSync(D+'/pdf417.png', await bwip.toBuffer({ bcid:'pdf417', text:'M1KOWALSKI/JAN       EX7K2PQ WAWLISLO 0281 324Y014A0001 100', scale:3, height:3, padding:10, backgroundcolor:'FFFFFF' }));
})();
