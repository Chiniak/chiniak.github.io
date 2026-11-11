// tworzy przykładową kartę pokładową .pkpass (ZIP: pass.json skompresowany + manifest.json bez kompresji)
const zlib = require('zlib'), fs = require('fs');
const crc32 = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
function zip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, data, deflate] of files) {
    const body = deflate ? zlib.deflateRawSync(data) : data, nm = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, nm, body); centrals.push(c, nm); off += 30 + nm.length + body.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}
const pass = { formatVersion: 1, organizationName: 'Zmyślone Linie', description: 'Karta pokładowa', serialNumber: '1',
  barcodes: [{ message: 'M1KOWALSKI/JAN       EABC123 WAWLISLO 0281 121Y014A0001 100', format: 'PKBarcodeFormatAztec', messageEncoding: 'iso-8859-1' }],
  boardingPass: { transitType: 'PKTransitTypeAir',
    headerFields: [{ key: 'gate', label: 'GATE', value: 'B12' }],
    primaryFields: [{ key: 'origin', label: 'Warszawa', value: 'WAW' }, { key: 'destination', label: 'Lizbona', value: 'LIS' }],
    auxiliaryFields: [{ key: 'seat', label: 'SEAT', value: '14A' }, { key: 'boarding', label: 'BOARDING', value: '07:20' }],
    backFields: [{ key: 'pnr', label: 'Booking reference', value: 'ABC123' }] } };
fs.writeFileSync(process.argv[2] || 'karta.pkpass', zip([['manifest.json', Buffer.from('{}'), false], ['pass.json', Buffer.from(JSON.stringify(pass)), true]]));
