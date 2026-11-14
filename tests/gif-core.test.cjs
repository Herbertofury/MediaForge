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

test('palette caches do not merge distinct exact colors in the same coarse bin', async () => {
  const q = await import('../src/quantize.mjs');
  const palette = [[0,0,0], [7,3,7]];
  for (const pixels of [[0,0,0,255,7,3,7,255], [7,3,7,255,0,0,0,255]]) {
    const rgba = Uint8Array.from(pixels);
    const expected = pixels[0] === 0 ? [0,1] : [1,0];
    assert.deepEqual([...q.applyPalette(rgba, palette)], expected);
    assert.deepEqual([...q.applyPaletteDither(rgba, palette, 2, 0)], expected);
  }
});

test('bounded palette caches match uncached weighted nearest-color references', async () => {
  const q = await import('../src/quantize.mjs');
  const palette = Array.from({length:32}, (_, i) => [i % 8, (i * 3) % 8, (i * 7) % 8]);
  const rgba = Uint8Array.from(Array.from({length:256}, (_, i) => [i % 8, (i >> 3) % 8, (i * 5) % 8, 255]).flat());
  function reference(greenWeight) {
    return Array.from({length:rgba.length/4}, (_, i) => {
      let best=0, distance=Infinity;
      palette.forEach((c,j) => {
        const p=i*4, d=2*(rgba[p]-c[0])**2+greenWeight*(rgba[p+1]-c[1])**2+(rgba[p+2]-c[2])**2;
        if(d<distance){distance=d;best=j;}
      });
      return best;
    });
  }
  assert.deepEqual([...q.applyPalette(rgba,palette)],reference(3));
  assert.deepEqual([...q.applyPaletteDither(rgba,palette,16,0)],reference(4));
});
