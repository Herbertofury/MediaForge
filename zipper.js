'use strict';

const statusEl=document.getElementById('status');
const fill=document.getElementById('fill');
const step=document.getElementById('step');
const detail=document.getElementById('detail');
const jobId=decodeURIComponent(location.hash.slice(1));

function setProgress(p,msg){p=Math.max(0,Math.min(100,Number(p)||0));fill.style.width=`${p}%`;step.textContent=`${Math.round(p)}%`;if(msg)detail.textContent=msg;try{chrome.runtime.sendMessage({type:'mfgx:zipProgress',jobId,progress:p,detail:msg});}catch{}}
function closeSelf(){chrome.tabs.getCurrent((tab)=>{if(tab?.id)chrome.tabs.remove(tab.id).catch(()=>{});});}
function fail(error){const msg=String(error?.message||error||'ZIP failed');statusEl.textContent=msg;statusEl.classList.add('error');detail.textContent='Archive stopped';chrome.runtime.sendMessage({type:'mfgx:zipDone',jobId,ok:false,error:msg});chrome.runtime.sendMessage({type:'mfgx:zipComplete',jobId});setTimeout(closeSelf,5500);}
async function loadJob(){const key=`zipJob:${jobId}`;let area=chrome.storage.session||chrome.storage.local;let data=await area.get(key);if(!data[key]&&area!==chrome.storage.local){area=chrome.storage.local;data=await area.get(key);}return data[key];}
function uniqueName(name,seen){const clean=MediaForgeZipCore.sanitizePath(name,'media.bin');if(!seen.has(clean)){seen.add(clean);return clean;}const dot=clean.lastIndexOf('.');const stem=dot>0?clean.slice(0,dot):clean;const ext=dot>0?clean.slice(dot):'';let i=2,candidate;do{candidate=`${stem} (${i++})${ext}`;}while(seen.has(candidate));seen.add(candidate);return candidate;}
async function fetchRecord(rec){const response=await fetch(rec.url,{credentials:'include',cache:'no-store',redirect:'follow'});if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);return new Uint8Array(await response.arrayBuffer());}

async function run(){
  if(!jobId)throw new Error('Missing ZIP job.');
  const job=await loadJob();if(!job)throw new Error('ZIP job expired.');
  const records=Array.isArray(job.records)?job.records:[];if(!records.length)throw new Error('ZIP has no media records.');
  statusEl.textContent=`Fetching ${records.length.toLocaleString()} selected file${records.length===1?'':'s'}…`;
  const files=new Array(records.length);const errors=[];const seen=new Set();let cursor=0,done=0;
  async function worker(){
    while(cursor<records.length){
      const index=cursor++;const rec=records[index];
      try{const data=await fetchRecord(rec);files[index]={name:uniqueName(rec.zipName||rec.filename||`media-${index+1}.bin`,seen),data};}
      catch(error){errors.push({url:rec.url,error:String(error?.message||error)});}
      done++;setProgress(5+70*(done/records.length),`Fetched ${done}/${records.length}${errors.length?` · ${errors.length} failed`:''}`);
    }
  }
  await Promise.all(Array.from({length:Math.min(4,records.length)},worker));
  const okFiles=files.filter(Boolean);if(!okFiles.length)throw new Error(`Every selected file failed to fetch${errors[0]?`: ${errors[0].error}`:''}.`);
  statusEl.textContent='Building ZIP locally…';setProgress(82,`${okFiles.length} file${okFiles.length===1?'':'s'} ready`);
  await new Promise(requestAnimationFrame);
  const blob=MediaForgeZipCore.buildStoredZip(okFiles);
  const url=URL.createObjectURL(blob);setProgress(96,'Starting ZIP download');
  const downloadId=await chrome.downloads.download({url,filename:job.filename,saveAs:Boolean(job.saveAs),conflictAction:'uniquify'});
  setProgress(100,`${(blob.size/1048576).toFixed(blob.size>=10*1048576?1:2)} MB · ${okFiles.length} files${errors.length?` · ${errors.length} skipped`:''}`);
  statusEl.textContent='ZIP saved. Nothing was uploaded.';
  chrome.runtime.sendMessage({type:'mfgx:zipDone',jobId,ok:true,downloadId,size:blob.size,count:okFiles.length,failed:errors.length,errors});
  chrome.runtime.sendMessage({type:'mfgx:zipComplete',jobId});
  setTimeout(()=>{URL.revokeObjectURL(url);closeSelf();},5000);
}

run().catch(fail);
