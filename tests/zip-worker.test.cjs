const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Z = require('../src/zip-core.js');

async function runWorker(records, fetcher) {
  const messages = [], downloads = [], blobs = [];
  const elements = Object.fromEntries(['status','fill','step','detail'].map(id => [id,{textContent:'',style:{},classList:{add(){}}}]));
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  const context = {
    document:{getElementById:id=>elements[id]}, location:{hash:'#fixture'},
    chrome:{storage:{session:{get:async()=>({'zipJob:fixture':{records,filename:'fixture.zip'}})}},runtime:{sendMessage:m=>{messages.push(m);if(m.type==='mfgx:zipComplete')complete();return Promise.resolve();}},downloads:{download:async options=>{downloads.push(options);return 17;}},tabs:{}},
    MediaForgeZipCore:Z, Uint8Array, fetch:fetcher,
    URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:fixture';}},
    requestAnimationFrame:fn=>fn(),setTimeout:()=>0
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../zipper.js'),'utf8'),context);
  await done;
  return {messages,downloads,blobs,elements};
}
const records=[{url:'https://fixture.test/one',filename:'one.txt'},{url:'https://fixture.test/two',filename:'two.txt'}];
for(const failure of ['http','network','body'])test(`ZIP worker refuses partial export after ${failure} failure`,async()=>{
 const result=await runWorker(records,async url=>{
  if(url.endsWith('/one'))return {ok:true,arrayBuffer:async()=>Uint8Array.of(1,2).buffer};
  if(failure==='network')throw new Error('connection lost');
  if(failure==='body')return {ok:true,arrayBuffer:async()=>{throw new Error('body interrupted');}};
  return {ok:false,status:403,statusText:'Forbidden'};
 });
 assert.equal(result.downloads.length,0);assert.equal(result.blobs.length,0);
 const finished=result.messages.filter(m=>m.type==='mfgx:zipDone');assert.equal(finished.length,1);assert.equal(finished[0].ok,false);
 assert.match(finished[0].error,/1 of 2 selected files failed/);
 assert.match(result.elements.status.textContent,/No archive was downloaded/);
});
test('complete ZIP export retains every selected byte and reports success',async()=>{
 const result=await runWorker(records,async url=>({ok:true,arrayBuffer:async()=>Uint8Array.of(url.endsWith('/one')?1:2).buffer}));
 assert.equal(result.downloads.length,1);assert.equal(result.blobs.length,1);
 const zip=new DataView(await result.blobs[0].arrayBuffer());assert.equal(zip.getUint16(zip.byteLength-12,true),2);
 const done=result.messages.find(m=>m.type==='mfgx:zipDone');assert.equal(done.ok,true);assert.equal(done.count,2);assert.equal(done.failed,0);
});
