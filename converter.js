import { GIFEncoder } from './vendor/gifenc/gifenc.mjs';
import { quantizeFrame, applyPalette, applyPaletteDither } from './src/quantize.mjs';
import { delayMillisecondsForFrame, sameFrameBytes, chooseGifQuality } from './src/gif-utils.mjs';

const statusEl=document.getElementById('status'), fill=document.getElementById('fill'), step=document.getElementById('step'), detail=document.getElementById('detail');
const video=document.getElementById('video'), canvas=document.getElementById('canvas'), ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true,desynchronized:true});
const jobId=decodeURIComponent(location.hash.slice(1));
let currentDownloadId=null;
const MAX_SAFE_GIF_BYTES = Math.floor(3.75 * 1024 * 1024 * 1024);

function setProgress(p,msg){p=Math.max(0,Math.min(100,p||0));fill.style.width=`${p}%`;step.textContent=`${Math.round(p)}%`;if(msg)detail.textContent=msg;try{chrome.runtime.sendMessage({type:'mfgx:gifProgress',jobId,progress:p,detail:msg});}catch{}}
function fail(error){const msg=String(error?.message||error||'GIF conversion failed');statusEl.textContent=msg;statusEl.classList.add('error');detail.textContent='Conversion stopped safely — the source was not overwritten.';chrome.runtime.sendMessage({type:'mfgx:gifDone',jobId,ok:false,error:msg});chrome.runtime.sendMessage({type:'mfgx:gifComplete',jobId});setTimeout(closeSelf,7000);}
function once(el,name,timeout=15000){return new Promise((resolve,reject)=>{let timer=0;const ok=()=>{clean();resolve();},bad=()=>{clean();reject(new Error(`Media ${name} failed`));},clean=()=>{clearTimeout(timer);el.removeEventListener(name,ok);el.removeEventListener('error',bad)};el.addEventListener(name,ok,{once:true});el.addEventListener('error',bad,{once:true});timer=setTimeout(()=>{clean();reject(new Error(`Timed out waiting for media ${name}`));},timeout);});}
async function loadJob(){const key=`gifJob:${jobId}`;let area=chrome.storage.session||chrome.storage.local;let data=await area.get(key);if(!data[key]&&area!==chrome.storage.local){area=chrome.storage.local;data=await area.get(key);}return{job:data[key],area,key};}
function closeSelf(){chrome.tabs.getCurrent((tab)=>{if(tab?.id)chrome.tabs.remove(tab.id).catch(()=>{});});}
function yieldBackground(){if(globalThis.scheduler?.postTask)return globalThis.scheduler.postTask(()=>{}, {priority:'background'});if(globalThis.scheduler?.yield)return globalThis.scheduler.yield();return new Promise((resolve)=>setTimeout(resolve,0));}
function waitRaf(){return new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}

async function waitForDecodedFrame(targetTime){
  if(typeof video.requestVideoFrameCallback!=='function'){await waitRaf();return;}
  await new Promise((resolve)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;resolve();}},2500);
    video.requestVideoFrameCallback((_now,meta)=>{
      if(settled)return;
      // A callback after seek means Chromium has delivered a decoded frame to
      // the compositor. We intentionally accept the nearest source frame: GIF
      // sampling wants the decoded frame at/around the requested media time.
      void targetTime; void meta;
      settled=true;clearTimeout(timer);resolve();
    });
  });
}

async function seekDecoded(t){
  const duration=Number(video.duration)||0;
  const target=Math.max(0,Math.min(Math.max(0,duration-0.0005),t));
  if(Math.abs(video.currentTime-target)>0.0004 || video.readyState<2){
    const p=once(video,'seeked',12000);
    video.currentTime=target;
    await p;
  }
  await waitForDecodedFrame(target);
}

function encodePending(encoder, rgba, width, height, delayMs, quality){
  const palette=quantizeFrame(rgba,quality.colors);
  const index=quality.dither>0 ? applyPaletteDither(rgba,palette,width,quality.dither) : applyPalette(rgba,palette);
  encoder.writeFrame(index,width,height,{palette,delay:delayMs,repeat:0,dispose:1});
}

async function run(){
  if(!jobId)throw new Error('Missing conversion job.');
  const {job}=await loadJob();if(!job)throw new Error('Conversion job expired.');
  const quality=chooseGifQuality(job.quality);
  statusEl.textContent='Fetching the original video locally…';setProgress(1,'Fetching source');
  const response=await fetch(job.sourceUrl,{credentials:'include',cache:'no-store'});if(!response.ok)throw new Error(`Source fetch failed (${response.status})`);
  const blob=await response.blob();if(!blob.size)throw new Error('The source video was empty.');
  const src=URL.createObjectURL(blob);video.preload='auto';video.muted=true;video.playsInline=true;video.src=src;await once(video,'loadedmetadata');
  if(video.readyState<2){try{await once(video,'loadeddata',15000);}catch(_){}}
  const duration=video.duration;if(!Number.isFinite(duration)||duration<=0)throw new Error('Could not determine video duration.');
  const fps=Math.max(5,Math.min(30,Number(job.fps)||20));const frameCount=Math.max(1,Math.ceil(duration*fps));
  let width=video.videoWidth,height=video.videoHeight;if(!width||!height)throw new Error('Could not determine video dimensions.');
  const maxWidth=Math.max(0,Number(job.maxWidth)||0);if(maxWidth&&width>maxWidth){height=Math.max(1,Math.round(height*(maxWidth/width)));width=maxWidth;}
  if(width>65535||height>65535)throw new Error('Source dimensions exceed GIF format limits.');
  canvas.width=width;canvas.height=height;
  const encoder=GIFEncoder();
  let pendingRgba=null,pendingDelay=0,uniqueFrames=0,duplicateFrames=0;
  statusEl.textContent=`Maximum-quality GIF · ${frameCount.toLocaleString()} samples · ${width}×${height}`;
  const started=performance.now();

  for(let i=0;i<frameCount;i++){
    const t=Math.min(Math.max(0,duration-0.0005),i/fps);
    await seekDecoded(t);
    ctx.drawImage(video,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data;
    const frameDelay=delayMillisecondsForFrame(i,fps);

    if(pendingRgba && sameFrameBytes(pendingRgba,rgba)){
      pendingDelay+=frameDelay;
      duplicateFrames++;
    }else{
      if(pendingRgba){
        encodePending(encoder,pendingRgba,width,height,pendingDelay,quality);
        uniqueFrames++;
        if(encoder.byteLength()>MAX_SAFE_GIF_BYTES)throw new Error('The GIF grew beyond the browser-safe 3.75 GiB output boundary. Reduce dimensions/FPS or trim the source; no partial/corrupt file was saved.');
      }
      pendingRgba=rgba;
      pendingDelay=frameDelay;
    }

    if(i===0||i===frameCount-1||i%Math.max(1,Math.floor(fps/2))===0){
      const p=4+92*((i+1)/frameCount);
      const elapsed=(performance.now()-started)/1000;
      const rate=(i+1)/Math.max(.1,elapsed);
      const eta=(frameCount-i-1)/Math.max(.1,rate);
      const outMB=encoder.byteLength()/1048576;
      setProgress(p,`Sample ${i+1}/${frameCount} · ${duplicateFrames.toLocaleString()} exact duplicate${duplicateFrames===1?'':'s'} folded · ${outMB.toFixed(outMB>=100?0:1)} MB · ${eta<1?'finishing':`${Math.ceil(eta)}s left`}`);
      await yieldBackground();
    }
  }

  if(pendingRgba){encodePending(encoder,pendingRgba,width,height,pendingDelay,quality);uniqueFrames++;}
  encoder.finish();
  const gifBlob=new Blob(encoder.parts(),{type:'image/gif'});
  if(!gifBlob.size)throw new Error('GIF encoder returned an empty file.');
  const gifUrl=URL.createObjectURL(gifBlob);setProgress(98,'Starting download');
  currentDownloadId=await chrome.downloads.download({url:gifUrl,filename:job.filename,saveAs:Boolean(job.saveAs),conflictAction:'uniquify'});
  setProgress(100,`${(gifBlob.size/1048576).toFixed(1)} MB · ${uniqueFrames.toLocaleString()} encoded frames · ${duplicateFrames.toLocaleString()} duplicates folded`);
  statusEl.textContent='GIF saved — frame-synchronized, long-video-safe, maximum palette quality.';
  chrome.runtime.sendMessage({type:'mfgx:gifDone',jobId,ok:true,downloadId:currentDownloadId,size:gifBlob.size,filename:job.filename,uniqueFrames,duplicateFrames,quality:quality.name});
  chrome.runtime.sendMessage({type:'mfgx:gifComplete',jobId});
  setTimeout(()=>{URL.revokeObjectURL(gifUrl);URL.revokeObjectURL(src);closeSelf();},5000);
}
run().catch(fail);
