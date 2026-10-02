const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

test('30fps long-video GIF timing stays duration-accurate',async()=>{
  const g=await import(pathToFileURL(path.resolve(__dirname,'../src/gif-utils.mjs')));
  const frames=18_000; // ten minutes at 30 fps
  const total=g.totalScheduledMilliseconds(frames,30);
  assert.ok(Math.abs(total-600_000)<=10,`expected ~600000ms, got ${total}`);
});

test('chunked GIF writer crosses 1MiB without a contiguous growth dependency',async()=>{
  const g=await import(pathToFileURL(path.resolve(__dirname,'../vendor/gifenc/gifenc.mjs')));
  const enc=g.GIFEncoder();
  const palette=[[0,0,0],[255,255,255]];
  const pixels=new Uint8Array(32*32);
  for(let i=0;i<pixels.length;i++)pixels[i]=i&1;
  for(let i=0;i<12000;i++)enc.writeFrame(pixels,32,32,{palette,delay:40,repeat:0});
  enc.finish();
  const parts=enc.parts();
  assert.ok(parts.length>1,'expected segmented output');
  assert.ok(enc.byteLength()>1024*1024,'expected >1MiB output');
  const bytes=enc.bytes();
  assert.equal(Buffer.from(bytes.subarray(0,6)).toString('ascii'),'GIF89a');
  assert.equal(bytes.at(-1),0x3b);
});
