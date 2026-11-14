const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Z = require('../src/zip-core.js');

async function runWorker(records, fetcher, downloadState = 'complete') {
  const messages = [], downloads = [], blobs = [], revoked = [];
  const listeners = new Set();
  const elements = Object.fromEntries(['status','fill','step','detail'].map(id => [id,{textContent:'',style:{},classList:{add(){}}}]));
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  const context = {
    document:{getElementById:id=>elements[id]}, location:{hash:'#fixture'},
    chrome:{storage:{session:{get:async()=>({'zipJob:fixture':{records,filename:'fixture.zip'}})}},runtime:{sendMessage:m=>{messages.push(m);if(m.type==='mfgx:zipComplete')complete();return Promise.resolve();}},downloads:{download:async options=>{downloads.push(options);return 17;},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},search:async()=>{if(typeof downloadState==='function')return downloadState({messages,listeners,elements,revoked});return [{id:17,state:downloadState,error:downloadState==='interrupted'?'USER_CANCELED':undefined}];}} ,tabs:{}},
    MediaForgeZipCore:Z, Uint8Array, fetch:fetcher,
    URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:fixture';},revokeObjectURL:url=>revoked.push(url)},
    requestAnimationFrame:fn=>fn(),setTimeout:()=>0
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../zipper.js'),'utf8'),context);
  await done;
  return {messages,downloads,blobs,elements,revoked,listeners};
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

function archiveEntries(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=[];let at=0;
 while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),n=view.getUint16(at+26,true),x=view.getUint16(at+28,true),start=at+30+n+x;entries.push({name:new TextDecoder().decode(bytes.subarray(at+30,at+30+n)),data:[...bytes.subarray(start,start+size)]});at=start+size;}
 return entries;
}
test('long duplicate names remain unique in the emitted ZIP and follow selection order',async()=>{
 const name='a'.repeat(236)+'.txt';
 const selected=records.map(r=>({...r,filename:name}));
 const result=await runWorker(selected,async url=>{if(url.endsWith('/one'))await new Promise(r=>setTimeout(r,25));return {ok:true,arrayBuffer:async()=>Uint8Array.of(url.endsWith('/one')?1:2).buffer};});
 const entries=archiveEntries(new Uint8Array(await result.blobs[0].arrayBuffer()));
 assert.equal(new Set(entries.map(e=>e.name)).size,2);
 assert.equal(entries[0].name,name);assert.ok(entries[1].name.endsWith(' (2).txt'));
 assert.ok(entries.every(e=>e.name.length<=240));assert.deepEqual(entries.map(e=>e.data),[[1],[2]]);
});
test('duplicate allocation avoids existing suffixes and respects dotted folder names',async()=>{
 const selected=['folder.v1/file','folder.v1/file (2)','folder.v1/file'].map((filename,i)=>({filename,url:`https://fixture.test/${i}`}));
 const result=await runWorker(selected,async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(9).buffer}));
 assert.deepEqual(archiveEntries(new Uint8Array(await result.blobs[0].arrayBuffer())).map(e=>e.name),['folder.v1/file','folder.v1/file (2)','folder.v1/file (3)']);
});

test('interrupted download never reports a saved ZIP and releases its blob',async()=>{
 const result=await runWorker(records,async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer}), 'interrupted');
 const done=result.messages.find(m=>m.type==='mfgx:zipDone');
 assert.equal(done.ok,false);assert.match(done.error,/USER_CANCELED/);
 assert.doesNotMatch(result.elements.status.textContent,/ZIP saved/);
 assert.deepEqual(result.revoked,['blob:fixture']);assert.equal(result.listeners.size,0);
});

for(const state of ['complete','interrupted'])test(`ZIP waits for its own terminal event: ${state}`,async()=>{
 const result=await runWorker(records,async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer}),({messages,listeners,elements,revoked})=>{
  assert.equal(messages.some(m=>m.type==='mfgx:zipDone'),false);
  assert.match(elements.status.textContent,/Saving ZIP/);assert.equal(revoked.length,0);
  for(const fn of listeners)fn({id:99,state:{current:'complete'}});
  assert.equal(listeners.size,1);
  setImmediate(()=>{for(const fn of listeners)fn({id:17,state:{current:state},error:{current:'FILE_FAILED'}});});
  return [{id:17,state:'in_progress'}];
 });
 assert.equal(result.messages.find(m=>m.type==='mfgx:zipDone').ok,state==='complete');
 assert.equal(result.listeners.size,0);assert.deepEqual(result.revoked,['blob:fixture']);
});
test('completion event wins over an older in-progress snapshot',async()=>{
 const result=await runWorker(records,async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer}),({listeners})=>{
  for(const fn of listeners)fn({id:17,state:{current:'complete'}});
  return [{id:17,state:'in_progress'}];
 });
 assert.equal(result.messages.filter(m=>m.type==='mfgx:zipDone').length,1);
 assert.equal(result.messages.find(m=>m.type==='mfgx:zipDone').ok,true);assert.equal(result.listeners.size,0);
});
for(const failure of ['missing','query'])test(`unverified download fails explicitly: ${failure}`,async()=>{
 const result=await runWorker(records,async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer}),()=>{
  if(failure==='query')throw new Error('download lookup unavailable');return [];
 });
 assert.equal(result.messages.find(m=>m.type==='mfgx:zipDone').ok,false);
 assert.equal(result.listeners.size,0);assert.deepEqual(result.revoked,['blob:fixture']);
});

test('length-capped paths remain file entries with every selected byte',async()=>{
 const selected=records.map((r,i)=>({...r,filename:'a'.repeat(239)+`/file-${i}.txt`}));
 const result=await runWorker(selected,async url=>({ok:true,arrayBuffer:async()=>Uint8Array.of(url.endsWith('/one')?1:2).buffer}));
 const entries=archiveEntries(new Uint8Array(await result.blobs[0].arrayBuffer()));
 assert.equal(entries.length,2);assert.equal(new Set(entries.map(e=>e.name)).size,2);
 assert.ok(entries.every(e=>e.name.length<=240&&!e.name.endsWith('/')&&!e.name.split('/').some(p=>p==='.'||p==='..')));
 assert.deepEqual(entries.map(e=>e.data),[[1],[2]]);
});
