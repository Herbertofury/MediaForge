const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function worker(state='complete'){
 const {GIFEncoder}=await import('../vendor/gifenc/gifenc.mjs');
 const quantize=await import('../src/quantize.mjs'),utils=await import('../src/gif-utils.mjs');
 const messages=[],revoked=[],listeners=new Set(),events=new Map();
 const elements=Object.fromEntries(['status','fill','step','detail'].map(id=>[id,{textContent:'',style:{},classList:{add(){}}}]));
 const video={duration:.1,readyState:2,currentTime:0,videoWidth:1,videoHeight:1,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n),set src(value){queueMicrotask(()=>events.get('loadedmetadata')?.());}};
 elements.video=video;elements.canvas={getContext:()=>({drawImage(){},getImageData:()=>({data:Uint8Array.of(255,0,0,255)})})};
 let finish;const done=new Promise(resolve=>finish=resolve);let count=0;
 const context={...quantize,...utils,GIFEncoder,document:{getElementById:id=>elements[id]},location:{hash:'#gif-fixture'},Blob,performance,Uint8Array,
 fetch:async()=>({ok:true,blob:async()=>new Blob(['source fixture'])}),
 URL:{createObjectURL:()=>`blob:${++count}`,revokeObjectURL:u=>revoked.push(u)},requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout(){},scheduler:{yield:async()=>{}},
 chrome:{storage:{session:{get:async()=>({'gifJob:gif-fixture':{sourceUrl:'https://fixture.test/video',filename:'fixture.gif',fps:5}})}},tabs:{},runtime:{sendMessage:m=>{messages.push(m);if(m.type==='mfgx:gifComplete')finish();}},downloads:{download:async()=>17,onChanged:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},search:async()=>typeof state==='function'?state({messages,revoked,listeners,elements}):[{id:17,state,error:'USER_CANCELED'}]}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../converter.js'),'utf8').replace(/^import .*;\n/gm,''),context);
 await done;return {messages,revoked,listeners,elements};
}
test('GIF waits for disk completion before success and releases blobs afterward',async()=>{
 let checked=false;
 const result=await worker(({messages,revoked,listeners,elements})=>{
  checked=true;assert.equal(messages.some(m=>m.type==='mfgx:gifDone'),false);
  assert.equal(revoked.length,0);assert.match(elements.status.textContent,/Saving GIF/);
  queueMicrotask(()=>{for(const listener of listeners)listener({id:17,state:{current:'complete'}});});
  return [{id:17,state:'in_progress'}];
 });
 assert.equal(checked,true);assert.equal(result.messages.find(m=>m.type==='mfgx:gifDone').ok,true);
 assert.deepEqual(result.revoked,['blob:2','blob:1']);assert.equal(result.listeners.size,0);
});
test('interrupted GIF never reports saved and releases resources',async()=>{
 const result=await worker('interrupted');
 assert.equal(result.messages.find(m=>m.type==='mfgx:gifDone').ok,false);
 assert.match(result.elements.status.textContent,/GIF download interrupted/);
 assert.deepEqual(result.revoked,['blob:2','blob:1']);assert.equal(result.listeners.size,0);
});
test('already completed GIF download is recognized by snapshot',async()=>{
 const result=await worker();assert.equal(result.messages.find(m=>m.type==='mfgx:gifDone').ok,true);
 assert.equal(result.listeners.size,0);
});
