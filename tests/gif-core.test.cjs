const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('quantizer and GIF encoder produce a valid GIF89a stream', async () => {
  const q = await import(pathToFileURL(path.resolve(__dirname,'../src/quantize.mjs')));
  const g = await import(pathToFileURL(path.resolve(__dirname,'../vendor/gifenc/gifenc.mjs')));
  const rgba = new Uint8ClampedArray([
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255
  ]);
  const palette = q.quantizeFrame(rgba, 256);
  assert.ok(palette.length >= 2 && palette.length <= 256);
  const index = q.applyPalette(rgba, palette);
  assert.equal(index.length, 4);
  const enc = g.GIFEncoder();
  enc.writeFrame(index,2,2,{palette,delay:50,repeat:0});
  enc.writeFrame(index,2,2,{palette,delay:50,repeat:0});
  enc.finish();
  const bytes = enc.bytes();
  assert.equal(Buffer.from(bytes.slice(0,6)).toString('ascii'), 'GIF89a');
  assert.equal(bytes.at(-1), 0x3b);
  assert.ok(bytes.length > 40);
});
