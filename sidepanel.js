'use strict';

const $ = (sel) => document.querySelector(sel);
const list = $('#mediaList');
const empty = $('#emptyState');
const titleEl = $('#pageTitle');
const metaEl = $('#pageMeta');
const countEl = $('#mediaCount');
const pill = $('#statusPill');
const metadataProgress = $('#metadataProgress');
const metadataFill = $('#metadataFill');
const metadataLabel = $('#metadataLabel');
const metadataNumbers = $('#metadataNumbers');
const Classifier = globalThis.MediaForgeClassifier || null;

let activeTabId = null;
let pageState = null;
let records = [];
let recordById = new Map();
let visibleRecords = [];
let selected = new Set();
let settings = {};
let refreshTimer = 0;
let loadGeneration = 0;
let probeGeneration = 0;
let currentPageKey = '';
let layout = 'list';
let renderGeneration = 0;
let renderQueued = false;
let renderCursor = 0;
let renderSentinel = null;
const RENDER_BATCH = 72;
const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let tabReloadTimer = 0;
let quickMode = 'smart';

function cooperativeYield() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 40 });
    else setTimeout(resolve, 0);
  });
}

function postTask(task, priority = 'background', delay = 0) {
  if (globalThis.scheduler?.postTask) return globalThis.scheduler.postTask(task, { priority, delay });
  return new Promise((resolve, reject) => {
    const run = () => Promise.resolve().then(task).then(resolve, reject);
    if (priority === 'background' && typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: Math.max(90, delay) });
    else setTimeout(run, delay);
  });
}

const thumbObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    const src = img.dataset.src;
    if (src && !img.src) img.src = src;
    thumbObserver.unobserve(img);
  }
}, { root: null, rootMargin: '600px 0px' }) : null;

let loadMoreObserver = null;

function sendRuntime(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (r) => resolve(chrome.runtime.lastError ? { ok:false,error:chrome.runtime.lastError.message } : (r || {ok:false}))));
}
function sendTab(tabId, message, frameId) {
  return new Promise((resolve) => {
    const cb = (r) => resolve(chrome.runtime.lastError ? { ok:false,error:chrome.runtime.lastError.message } : (r || {ok:false}));
    if (Number.isInteger(frameId)) chrome.tabs.sendMessage(tabId, message, { frameId }, cb);
    else chrome.tabs.sendMessage(tabId, message, cb);
  });
}
function fnv1a(value) {
  let h = 0x811c9dc5;
  const s = String(value || '');
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function recordId(rec) { return rec._id || `${rec.frameId ?? 0}:${rec.type || 'media'}:${fnv1a(rec.url)}`; }
function escText(s) { return String(s ?? ''); }
function prettyType(type) {
  const map = { photo:'IMG', gif:'GIF', video:'VIDEO', audio:'AUDIO', svg:'SVG' };
  return map[type] || String(type || 'MEDIA').toUpperCase();
}
function isImage(rec) { return ['photo','gif','svg'].includes(rec?.type); }
function isGifConvertible(rec) { return ['gif','video'].includes(rec?.type) && /\.mp4(?:[?#]|$)/i.test(rec?.url || ''); }
function quality(rec) {
  if (rec.width && rec.height) return `${rec.width}×${rec.height}`;
  if (rec.type === 'photo') return rec.original ? 'Original' : 'Image';
  if (rec.bitrate) return `${Math.round(rec.bitrate / 1000)} kbps`;
  return '—';
}
function formatBytes(value) {
  const n = Number(value) || 0;
  if (!n) return 'Size ?';
  const units = ['B','KB','MB','GB','TB'];
  let v=n,i=0; while(v>=1024 && i<units.length-1){v/=1024;i++;}
  return `${v >= 100 || i===0 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}
function megapixels(rec) {
  const px=(Number(rec.width)||0)*(Number(rec.height)||0);
  return px ? `${(px/1e6).toFixed(px>=10?1:2)} MP` : '';
}
function filename(rec) {
  if (rec.filename) return rec.filename;
  try { return decodeURIComponent(new URL(rec.url).pathname.split('/').filter(Boolean).pop() || 'media'); }
  catch (_) { return rec.type || 'media'; }
}
function displayUrl(raw) {
  if (/^data:/i.test(raw || '')) return `${String(raw).slice(0,48)}…`;
  if (/^blob:/i.test(raw || '')) return 'blob: local page media';
  try { const u = new URL(raw); return `${u.hostname}${u.pathname}${u.search}`; } catch { return raw || ''; }
}
function thumbUrl(rec) {
  if (rec.thumb && /^(https?:|data:|blob:)/i.test(rec.thumb)) return rec.thumb;
  if (isImage(rec) && /^(https?:|data:|blob:)/i.test(rec.url || '')) return rec.url;
  return '';
}
function hostOf(raw) { try { return new URL(raw).hostname; } catch (_) { return ''; } }
function button(text, action, cls='') {
  const b=document.createElement('button'); b.type='button'; b.textContent=text; b.dataset.action=action; if(cls)b.className=cls; return b;
}
function num(id) { return Math.max(0, Number($(id)?.value) || 0); }

function searchMatcher(raw) {
  const q=String(raw||'').trim();
  if (!q) return () => true;
  const m=q.match(/^\/(.*)\/([gimsuy]*)$/);
  if (m) {
    try { const re=new RegExp(m[1],m[2]); return (rec)=>re.test(recordHaystack(rec)); }
    catch (_) {}
  }
  const tokens=q.toLowerCase().split(/\s+/).filter(Boolean);
  return (rec)=>{ const hay=rec._searchLower || recordHaystack(rec).toLowerCase(); return tokens.every(t=>hay.includes(t)); };
}
function recordHaystack(rec) {
  if (rec?._search) return rec._search;
  return [filename(rec),rec.url,rec.title,rec.alt,rec.handle,rec.hostname,rec.type,rec.ext,rec.mime,rec.source,rec.provider,rec._class?.bucket,...(rec._class?.reasons||[]),...(rec.sources||[])].filter(Boolean).join(' ');
}

function prepareRecord(rec) {
  rec._file = filename(rec);
  rec._host = hostOf(rec.url);
  rec._pixels = (Number(rec.width)||0) * (Number(rec.height)||0);
  rec.provider = rec.provider || Classifier?.providerForHost?.(rec._host || rec.hostname || pageState?.page?.hostname || '') || 'web';
  rec._class = Classifier?.classifyMediaRecord?.(rec, pageState?.page || {}) || {bucket:'content',score:0,likelyContent:true,provider:rec.provider,reasons:[]};
  rec._search = [rec._file,rec.url,rec.title,rec.alt,rec.handle,rec.hostname,rec.type,rec.ext,rec.mime,rec.source,rec.provider,rec._class.bucket,...(rec._class.reasons||[]),...(rec.sources||[])].filter(Boolean).join(' ');
  rec._searchLower = rec._search.toLowerCase();
  return rec;
}

function readFilterState() {
  return {
    quick: quickMode,
    type: $('#typeFilter').value,
    sizeMode: $('#sizeFilter').value,
    dimensionMode: $('#dimensionFilter').value,
    minW: num('#minWidth'), maxW: num('#maxWidth'), minH: num('#minHeight'), maxH: num('#maxHeight'),
    minB: num('#minMB')*1048576, maxB: num('#maxMB')*1048576,
    sameHostOnly: $('#sameHostOnly').checked, hideUnknown: $('#hideUnknown').checked,
    pageHost: pageState?.page?.hostname || ''
  };
}

function passesFilters(rec, filters) {
  if (Classifier?.quickFilterPass && !Classifier.quickFilterPass(rec, filters.quick)) return false;
  const type=filters.type;
  if (type !== 'all') {
    if (type === 'images' ? !isImage(rec) : rec.type !== type) return false;
  }
  const size=Number(rec.sizeBytes)||0;
  switch(filters.sizeMode) {
    case 'tiny': if(!(size>0 && size<100*1024)) return false; break;
    case 'small': if(!(size>=100*1024 && size<1024*1024)) return false; break;
    case 'medium': if(!(size>=1024*1024 && size<5*1024*1024)) return false; break;
    case 'large': if(!(size>=5*1024*1024 && size<20*1024*1024)) return false; break;
    case 'huge': if(!(size>=20*1024*1024)) return false; break;
    case 'unknown': if(size>0) return false; break;
  }
  const w=Number(rec.width)||0,h=Number(rec.height)||0,px=w*h;
  switch(filters.dimensionMode) {
    case '512': if(Math.max(w,h)<512) return false; break;
    case '1024': if(Math.max(w,h)<1024) return false; break;
    case '2048': if(Math.max(w,h)<2048) return false; break;
    case '4mp': if(px<4_000_000) return false; break;
    case 'portrait': if(!(h>w && w>0)) return false; break;
    case 'landscape': if(!(w>h && h>0)) return false; break;
    case 'square': if(!(w>0&&h>0&&Math.abs(w-h)/Math.max(w,h)<=0.08)) return false; break;
    case 'unknown': if(w>0&&h>0) return false; break;
  }
  const {minW,maxW,minH,maxH,minB,maxB}=filters;
  if(minW && w<minW) return false; if(maxW && (!w || w>maxW)) return false;
  if(minH && h<minH) return false; if(maxH && (!h || h>maxH)) return false;
  if(minB && size<minB) return false; if(maxB && (!size || size>maxB)) return false;
  if(filters.sameHostOnly && filters.pageHost && rec._host !== filters.pageHost) return false;
  if(filters.hideUnknown && (!size || (isImage(rec)&&(!w||!h)))) return false;
  return true;
}

function sortRecords(items) {
  const mode=$('#sortSelect').value;
  const withIndex=items.map((r,i)=>({r,i}));
  const unknownLast=(a,b,va,vb,desc=false)=>{
    if(!va&&!vb)return a.i-b.i; if(!va)return 1; if(!vb)return -1;
    return desc ? vb-va : va-vb;
  };
  withIndex.sort((a,b)=>{
    const A=a.r,B=b.r;
    if(mode==='content-desc') return (Number(B._class?.score)||0)-(Number(A._class?.score)||0) || a.i-b.i;
    if(mode==='size-desc') return unknownLast(a,b,Number(A.sizeBytes)||0,Number(B.sizeBytes)||0,true);
    if(mode==='size-asc') return unknownLast(a,b,Number(A.sizeBytes)||0,Number(B.sizeBytes)||0,false);
    if(mode==='pixels-desc') return unknownLast(a,b,A._pixels||0,B._pixels||0,true);
    if(mode==='width-desc') return unknownLast(a,b,Number(A.width)||0,Number(B.width)||0,true);
    if(mode==='height-desc') return unknownLast(a,b,Number(A.height)||0,Number(B.height)||0,true);
    if(mode==='type') return String(A.type||'').localeCompare(String(B.type||'')) || a.i-b.i;
    if(mode==='name') return NAME_COLLATOR.compare(A._file||'',B._file||'') || a.i-b.i;
    if(mode==='url') return String(A.url||'').localeCompare(String(B.url||'')) || a.i-b.i;
    if(quickMode==='smart') {
      const ap=Number(A.contentPriority)||0,bp=Number(B.contentPriority)||0;
      if(ap!==bp)return bp-ap;
      const ad=Number(A.viewportDistance)||0,bd=Number(B.viewportDistance)||0;
      if(ad!==bd)return ad-bd;
    }
    return (Number(A.globalPosition ?? A.position)||0)-(Number(B.globalPosition ?? B.position)||0) || a.i-b.i;
  });
  return withIndex.map(x=>x.r);
}

function currentSelection() { const out=[]; for(const id of selected){const rec=recordById.get(id);if(rec)out.push(rec);} return out; }
function visibleSelectionCount() { let n=0; for(const r of visibleRecords) if(selected.has(recordId(r))) n++; return n; }
function updateQuickCounts() {
  const all=records.length;
  const smart=Classifier?.quickFilterPass ? records.reduce((n,r)=>n+(Classifier.quickFilterPass(r,'smart')?1:0),0) : all;
  const a=$('#quickAllCount'), b=$('#quickSmartCount'); if(a)a.textContent=String(all); if(b)b.textContent=String(smart);
  for(const btn of document.querySelectorAll('[data-quick]')) btn.classList.toggle('active',btn.dataset.quick===quickMode);
}
function setPill(text, kind='') { pill.textContent=text; pill.className=`pill${kind?` ${kind}`:''}`; }

function syncSelectionUi() {
  const chosen=currentSelection();
  const visibleChosen=visibleSelectionCount();
  const master=$('#masterSelect');
  master.checked=visibleRecords.length>0 && visibleChosen===visibleRecords.length;
  master.indeterminate=visibleChosen>0 && visibleChosen<visibleRecords.length;
  const known=chosen.reduce((sum,r)=>sum+(Number(r.sizeBytes)||0),0);
  const unknown=chosen.filter(r=>!Number(r.sizeBytes)).length;
  $('#selectionStats').textContent=`${chosen.length} selected · ${visibleRecords.length} shown${known?` · ${formatBytes(known)}${unknown?' + ?':''}`:''}`;
  for(const id of ['downloadSelected','zipSelected','copySelected','exportManifest']) $("#"+id).disabled=!chosen.length;
}

function createMediaCard(rec) {
  const id=recordId(rec);
  const card=document.createElement('article'); card.className=`media-card${selected.has(id)?' selected':''}`; card.dataset.id=id;
  const check=document.createElement('label'); check.className='card-check'; const input=document.createElement('input'); input.type='checkbox'; input.checked=selected.has(id); input.dataset.select=id; const fake=document.createElement('span'); check.append(input,fake);
  const thumb=document.createElement('div'); thumb.className='thumb'; thumb.dataset.action=rec.streamingPage?'open':'view';
  const tu=thumbUrl(rec);
  if(tu){
    const img=document.createElement('img');img.dataset.src=tu;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>thumb.classList.add('noimg');thumb.appendChild(img);
    if(thumbObserver)thumbObserver.observe(img);else img.src=tu;
  }else thumb.classList.add('noimg');
  const chip=document.createElement('span');chip.className='type-chip';chip.textContent=prettyType(rec.type);thumb.appendChild(chip);
  if((rec.frameId||0)>0){const fc=document.createElement('span');fc.className='frame-chip';fc.textContent=`FRAME ${rec.frameId}`;thumb.appendChild(fc);}

  const info=document.createElement('div');info.className='media-info';
  const top=document.createElement('div');top.className='media-top';
  const mt=document.createElement('div');mt.className='media-title';mt.textContent=rec._file||rec.title||rec.type||'Media';mt.title=rec.title||rec._file;
  const q=document.createElement('div');q.className='quality';q.textContent=quality(rec);top.append(mt,q);
  const chips=document.createElement('div');chips.className='meta-line';
  const addChip=(text,cls='')=>{if(!text)return;const x=document.createElement('span');x.className=`meta-chip${cls?` ${cls}`:''}`;x.textContent=text;x.title=text;chips.appendChild(x);};
  addChip(formatBytes(rec.sizeBytes),'size'); addChip(megapixels(rec)); addChip((rec.ext||rec.mime||'').toUpperCase()); addChip((rec.source||rec.sources?.[0]||'page').replace(/^network:/,''),'source'); if(rec.original)addChip('ORIGINAL');
  if(rec.provider&&rec.provider!=='web'&&rec.provider!=='local')addChip(rec.provider.toUpperCase(),'provider');
  if(rec._class?.bucket&&rec._class.bucket!=='content')addChip(Classifier?.bucketLabel?.(rec._class.bucket)||rec._class.bucket.toUpperCase(),`class-${rec._class.bucket}`);
  else if(rec._class?.likelyContent)addChip('CONTENT','class-content');
  if(rec.streamingPage)addChip('STREAM PAGE','stream');
  const url=document.createElement('div');url.className='media-url';url.textContent=displayUrl(rec.url);url.title=rec.url;
  const actions=document.createElement('div');actions.className='card-actions';
  const dl=button(rec.nonDownloadable?'Stream':'Download','download','download');
  const save=button('Save as…','save');
  if(rec.nonDownloadable){dl.disabled=true;dl.title='This provider exposes a streamed/protected player, not a direct downloadable file.';save.disabled=true;save.title=dl.title;}
  actions.append(dl,save);
  if(!rec.streamingPage)actions.append(button('View','view'));
  actions.append(button('Copy','copy'),button(rec.streamingPage?'Open page':'Open','open'));
  if(isGifConvertible(rec)&&!rec.nonDownloadable)actions.append(button('GIF','gif','gif'));
  if(isImage(rec)&&/^https?:/i.test(rec.url||''))actions.append(button('Lens','lens'));
  info.append(top,chips,url,actions);card.append(check,thumb,info);
  return card;
}

function appendRenderBatch(gen) {
  if(gen!==renderGeneration)return;
  if(renderSentinel){loadMoreObserver?.unobserve(renderSentinel);renderSentinel.remove();renderSentinel=null;}
  const end=Math.min(visibleRecords.length,renderCursor+RENDER_BATCH);
  const frag=document.createDocumentFragment();
  for(;renderCursor<end;renderCursor++)frag.appendChild(createMediaCard(visibleRecords[renderCursor]));
  list.appendChild(frag);
  if(renderCursor<visibleRecords.length){
    renderSentinel=document.createElement('div');renderSentinel.className='render-sentinel';renderSentinel.setAttribute('aria-hidden','true');list.appendChild(renderSentinel);
    loadMoreObserver?.observe(renderSentinel);
  }
}

function render() {
  const gen=++renderGeneration;
  const match=searchMatcher($('#searchInput').value);
  const filters=readFilterState();
  visibleRecords=sortRecords(records.filter((rec)=>match(rec)&&passesFilters(rec,filters)));
  list.classList.toggle('compact',layout==='compact');
  if(thumbObserver)for(const img of list.querySelectorAll('img[data-src]'))thumbObserver.unobserve(img);
  if(renderSentinel)loadMoreObserver?.unobserve(renderSentinel);
  list.replaceChildren();renderCursor=0;renderSentinel=null;
  appendRenderBatch(gen);
  countEl.textContent=String(records.length);
  updateQuickCounts();
  empty.classList.toggle('visible',!visibleRecords.length);
  setPill(records.length?`${visibleRecords.length}/${records.length}`:'WAITING');
  syncSelectionUi();
}

function requestRender() {
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;render();});
}

if(typeof IntersectionObserver==='function'){
  loadMoreObserver=new IntersectionObserver((entries)=>{
    if(entries.some((entry)=>entry.isIntersecting))appendRenderBatch(renderGeneration);
  },{root:null,rootMargin:'900px 0px'});
}

async function downloadOne(rec, saveAs=false) {
  if(rec?.nonDownloadable) return {ok:false,error:'This item is a streamed/provider page record, not a direct downloadable media file.'};
  if(/^blob:/i.test(rec.url||'')) return sendTab(activeTabId,{type:'mfgx:downloadLocal',record:rec,saveAs},rec.frameId);
  return sendRuntime({type:'mfgx:download',record:rec,saveAs});
}

list.addEventListener('change',(event)=>{
  const input=event.target.closest('input[data-select]'); if(!input)return;
  if(input.checked)selected.add(input.dataset.select);else selected.delete(input.dataset.select);
  input.closest('.media-card')?.classList.toggle('selected',input.checked);syncSelectionUi();
});
list.addEventListener('click',async(event)=>{
  if(event.target.closest('input[data-select],.card-check'))return;
  const card=event.target.closest('.media-card'); if(!card)return;
  const rec=recordById.get(card.dataset.id); if(!rec)return;
  let action=event.target.closest('[data-action]')?.dataset.action;
  if(!action&&event.target.closest('.thumb'))action='view'; if(!action)return;
  const btn=event.target.closest('button');btn?.classList.add('busy');
  let r={ok:false};
  if(action==='download')r=await downloadOne(rec,false);
  if(action==='save')r=await downloadOne(rec,true);
  if(action==='gif')r=await sendRuntime({type:'mfgx:convertGif',record:rec,options:{fps:settings.gifFps,maxWidth:settings.gifMaxWidth,quality:settings.gifQuality,sourceTabId:activeTabId}});
  if(action==='view')r=await sendTab(activeTabId,{type:'mfgx:viewRecord',record:rec},rec.frameId);
  if(action==='copy'){try{await navigator.clipboard.writeText(rec.url);r={ok:true};}catch(e){r={ok:false,error:String(e)}}}
  if(action==='open'){try{await chrome.tabs.create({url:rec.url,active:true});r={ok:true};}catch(e){r={ok:false,error:String(e)}}}
  if(action==='lens'){try{await chrome.tabs.create({url:`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(rec.url)}`,active:true});r={ok:true};}catch(e){r={ok:false,error:String(e)}}}
  btn?.classList.remove('busy');btn?.classList.add(r?.ok?'success':'error');setTimeout(()=>btn?.classList.remove('success','error'),1200);
  if(!r?.ok&&r?.error)setPill('ACTION ERROR','error');
});

$('#masterSelect').addEventListener('change',(e)=>{for(const rec of visibleRecords){const id=recordId(rec);if(e.target.checked)selected.add(id);else selected.delete(id);}requestRender();});
$('#selectVisible').addEventListener('click',()=>{for(const r of visibleRecords)selected.add(recordId(r));requestRender();});
$('#clearSelection').addEventListener('click',()=>{selected.clear();requestRender();});
$('#invertVisible').addEventListener('click',()=>{for(const r of visibleRecords){const id=recordId(r);selected.has(id)?selected.delete(id):selected.add(id);}requestRender();});

$('#downloadSelected').addEventListener('click',async()=>{
  const chosen=currentSelection(); if(!chosen.length)return;
  const btn=$('#downloadSelected');btn.classList.add('busy');setPill('DOWNLOADING');
  const regular=chosen.filter(r=>!r.nonDownloadable&&!/^blob:/i.test(r.url||''));
  const blobs=chosen.filter(r=>!r.nonDownloadable&&/^blob:/i.test(r.url||''));
  let started=0,failed=0;
  if(regular.length){const rr=await sendRuntime({type:'mfgx:downloadBatch',records:regular,saveAs:false});started+=rr?.started||0;failed+=rr?.failed||0;}
  for(const rec of blobs){const rr=await sendTab(activeTabId,{type:'mfgx:downloadLocal',record:rec,saveAs:false},rec.frameId);if(rr?.ok)started++;else failed++;}
  btn.classList.remove('busy');setPill(started?`${started} STARTED${failed?` · ${failed} FAILED`:''}`:'DOWNLOAD ERROR',started?'success':'error');setTimeout(requestRender,1600);
});

$('#zipSelected').addEventListener('click',async()=>{
  const chosen=currentSelection();if(!chosen.length)return;
  const eligible=chosen.filter(r=>!r.nonDownloadable&&!/^blob:/i.test(r.url||''));
  if(!eligible.length){setPill('ZIP NEEDS DIRECT URLs','error');return;}
  const b=$('#zipSelected');b.classList.add('busy');
  const r=await sendRuntime({type:'mfgx:queueZip',records:eligible,options:{pageTitle:pageState?.page?.title||'page-media'}});
  b.classList.remove('busy');setPill(r?.ok?`ZIP ${eligible.length} QUEUED`:'ZIP ERROR',r?.ok?'success':'error');
});
$('#copySelected').addEventListener('click',async()=>{const urls=currentSelection().map(r=>r.url);if(!urls.length)return;try{await navigator.clipboard.writeText(urls.join('\n'));setPill(`${urls.length} URLS COPIED`,'success');}catch(_){setPill('COPY ERROR','error');}});
$('#exportManifest').addEventListener('click',async()=>{
  const chosen=currentSelection();if(!chosen.length)return;
  const payload={exportedAt:new Date().toISOString(),page:pageState?.page||null,count:chosen.length,records:chosen.map(({_id,...r})=>r)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
  const host=(pageState?.page?.hostname||'page').replace(/[^a-z0-9._-]+/gi,'_');
  try{await chrome.downloads.download({url,filename:`MediaForge GX/${host}-media-manifest.json`,saveAs:false,conflictAction:'uniquify'});setPill('JSON EXPORTED','success');}catch(_){setPill('EXPORT ERROR','error');}
  setTimeout(()=>URL.revokeObjectURL(url),5000);
});

function updateProgress(done,total,label='Reading file sizes…') {
  metadataProgress.hidden=!total||done>=total;
  metadataLabel.textContent=label;metadataNumbers.textContent=`${done} / ${total}`;metadataFill.style.width=`${total?Math.min(100,done/total*100):0}%`;
}
function loadImageDimensions(rec,timeout=7000) {
  if(!isImage(rec)||(rec.width&&rec.height)||!/^https?:|^data:/i.test(rec.url||''))return Promise.resolve(null);
  return new Promise((resolve)=>{
    const img=new Image();let done=false;const finish=(v)=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(v);};
    const timer=setTimeout(()=>finish(null),timeout);img.onload=()=>finish({width:img.naturalWidth||0,height:img.naturalHeight||0});img.onerror=()=>finish(null);img.referrerPolicy='no-referrer';img.decoding='async';img.src=rec.url;
  });
}

async function mapLimit(items,limit,fn) {
  const out=new Array(items.length);let cursor=0;
  async function worker(){while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i],i);if(i%4===3)await cooperativeYield();}}
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length||1))},worker));
  return out;
}

async function probeAllMetadata(source,gen) {
  const candidates=source.filter(r=>r.url&&!/^blob:/i.test(r.url)&&(!Number(r.sizeBytes)||(isImage(r)&&(!Number(r.width)||!Number(r.height)))));
  // Preserve complete probing, but put likely user-content first so meaningful
  // media reaches accurate size/resolution state before page chrome and junk.
  candidates.sort((a,b)=>(Number(Boolean(b._class?.likelyContent))-Number(Boolean(a._class?.likelyContent))) || ((Number(b._class?.score)||0)-(Number(a._class?.score)||0)));
  if(!candidates.length){metadataProgress.hidden=true;setPill(`${records.length} READY`,'success');return;}
  let done=0;updateProgress(done,candidates.length,'Reading sizes + dimensions…');
  const networkConcurrency=Math.max(4,Math.min(8,Math.floor((navigator.hardwareConcurrency||8)/2)));
  const dimensionConcurrency=Math.max(2,Math.min(5,Math.floor((navigator.hardwareConcurrency||8)/3)));
  for(let i=0;i<candidates.length;i+=32){
    if(gen!==probeGeneration)return;
    const chunk=candidates.slice(i,i+32);
    const dimCandidates=chunk.map((rec,index)=>({rec,index})).filter(x=>isImage(x.rec)&&(!x.rec.width||!x.rec.height));
    const [sizeResult,dimPairs]=await Promise.all([
      sendRuntime({type:'mfgx:probeMediaBatch',records:chunk,concurrency:networkConcurrency}),
      mapLimit(dimCandidates,dimensionConcurrency,async(x)=>({index:x.index,value:await loadImageDimensions(x.rec)}))
    ]);
    if(gen!==probeGeneration)return;
    const metaByUrl=new Map((sizeResult?.items||[]).map(x=>[x.url,x]));
    const dimByIndex=new Map(dimPairs.filter(x=>x?.value).map(x=>[x.index,x.value]));
    chunk.forEach((rec,index)=>{const m=metaByUrl.get(rec.url);if(m){if(m.sizeBytes)rec.sizeBytes=m.sizeBytes;if(m.mime)rec.mime=m.mime;}const d=dimByIndex.get(index);if(d){rec.width=rec.width||d.width;rec.height=rec.height||d.height;}prepareRecord(rec);});
    done+=chunk.length;updateProgress(done,candidates.length,'Reading sizes + dimensions…');requestRender();
    await cooperativeYield();
  }
  metadataProgress.hidden=true;setPill(`${records.length} READY`,'success');setTimeout(()=>setPill(`${visibleRecords.length}/${records.length}`),1000);
}

function mergeStateIntoPanel(state, tab, phase = 'deep') {
  const oldByKey = new Map(records.map((r) => [`${r.type}|${r.url}`, r]));
  pageState = state;
  const newKey = state.page?.url || tab?.url || String(activeTabId);
  const pageChanged = currentPageKey !== newKey;
  currentPageKey = newKey;

  const merged = new Map(phase === 'deep' ? oldByKey : []);
  for (const raw of state.records || []) {
    const key = `${raw.type}|${raw.url}`;
    const old = oldByKey.get(key) || {};
    const rec = {
      ...old,
      ...raw,
      sizeBytes: raw.sizeBytes || old.sizeBytes || 0,
      mime: raw.mime || old.mime || '',
      width: raw.width || old.width || 0,
      height: raw.height || old.height || 0,
      xPostMedia: Boolean(raw.xPostMedia || old.xPostMedia),
      xAvatar: Boolean(raw.xAvatar || old.xAvatar),
      xSiteChrome: Boolean(raw.xSiteChrome || old.xSiteChrome),
      promoted: Boolean(raw.promoted || old.promoted),
      visible: Boolean(raw.visible || old.visible),
      contentPriority: Math.max(Number(raw.contentPriority) || 0, Number(old.contentPriority) || 0),
      viewportDistance: Math.min(
        Number.isFinite(Number(raw.viewportDistance)) ? Number(raw.viewportDistance) : Number.MAX_SAFE_INTEGER,
        Number.isFinite(Number(old.viewportDistance)) ? Number(old.viewportDistance) : Number.MAX_SAFE_INTEGER
      )
    };
    rec._id = recordId(rec);
    merged.set(key, prepareRecord(rec));
  }
  records = [...merged.values()];
  recordById = new Map(records.map((r) => [recordId(r), r]));

  if (pageChanged) {
    selected = new Set(records.filter((r) => (!Classifier?.quickFilterPass || Classifier.quickFilterPass(r, 'smart')) && !r.nonDownloadable).map(recordId));
  } else {
    const valid = new Set(records.map(recordId));
    selected = new Set([...selected].filter((id) => valid.has(id)));
    for (const r of records) {
      const key = `${r.type}|${r.url}`;
      if (!oldByKey.has(key) && (!Classifier?.quickFilterPass || Classifier.quickFilterPass(r, 'smart')) && !r.nonDownloadable) selected.add(recordId(r));
    }
  }

  titleEl.textContent = state.page?.title || tab?.title || 'Untitled page';
  const frames = state.frameCount > 1 ? ` · ${state.frameCount} frames` : '';
  metaEl.textContent = phase === 'priority'
    ? `${state.page?.hostname || ''} · instant content${frames} · deep scan finishing…`
    : `${state.page?.hostname || ''}${frames} · deep scan complete`;
  requestRender();
}

async function loadPage() {
  const gen = ++loadGeneration;
  probeGeneration++;
  setPill('FINDING CONTENT');
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  activeTabId = tab?.id ?? null;
  if (!activeTabId) {
    titleEl.textContent = 'No active tab'; metaEl.textContent = ''; records = []; recordById = new Map(); selected.clear(); render(); setPill('IDLE'); return;
  }

  // Instant lane: ask only the top-frame content script for semantic/visible
  // media. No all-frame injection, stylesheet walk, network cache sweep, or
  // metadata probing can delay the first useful cards.
  const fast = await sendTab(activeTabId, { type: 'mfgx:getFastPageState' }, 0);
  if (gen !== loadGeneration) return;
  if (fast?.ok) {
    mergeStateIntoPanel({ ...fast, tab: { id: activeTabId, title: tab.title || '', url: tab.url || '' }, frameCount: 1 }, tab, 'priority');
    setPill(fast.records?.length ? 'CONTENT READY' : 'DEEP SCAN');
    // Guarantee the instant lane gets a paint before deep discovery begins.
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  const state = await sendRuntime({ type: 'mfgx:scanTab', tabId: activeTabId });
  if (gen !== loadGeneration) return;
  if (!state?.ok) {
    if (fast?.ok) { setPill('INSTANT ONLY', 'error'); return; }
    titleEl.textContent = tab.title || 'Unsupported page'; metaEl.textContent = tab.url || ''; records = []; recordById = new Map(); selected.clear(); render(); setPill('NO ACCESS', 'error'); return;
  }

  mergeStateIntoPanel(state, tab, 'deep');
  setPill(`${visibleRecords.length}/${records.length}`, 'success');
  if (settings.autoProbeSizes !== false) {
    const pg = ++probeGeneration;
    const priority = /size|pixels|width|height/.test($('#sortSelect').value) ? 'user-visible' : 'background';
    postTask(() => probeAllMetadata(records, pg), priority, priority === 'background' ? 120 : 0).catch(() => {});
  }
}

function schedulePageLoad(delay=100){
  clearTimeout(tabReloadTimer);
  tabReloadTimer=setTimeout(()=>loadPage().catch(()=>{}),delay);
}


$('#refresh').addEventListener('click',async()=>{if(activeTabId)await sendTab(activeTabId,{type:'mfgx:rescan'});await loadPage();});
$('#clearSearch').addEventListener('click',()=>{$('#searchInput').value='';requestRender();$('#searchInput').focus();});
$('#quickFilters')?.addEventListener('click',(event)=>{const btn=event.target.closest('[data-quick]');if(!btn)return;quickMode=btn.dataset.quick||'all';requestRender();});
let searchTimer=0;
$('#searchInput')?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(requestRender,55);});
for(const id of ['typeFilter','sizeFilter','dimensionFilter','minWidth','maxWidth','minHeight','maxHeight','minMB','maxMB','sameHostOnly','hideUnknown']) $("#"+id)?.addEventListener('input',requestRender);
$('#sortSelect').addEventListener('change',async()=>{requestRender();await savePreferencePatch({defaultSort:$('#sortSelect').value});if((/size/.test($('#sortSelect').value))&&settings.autoProbeSizes===false){const pg=++probeGeneration;probeAllMetadata(records,pg).catch(()=>{});}});
$('#layoutToggle').addEventListener('click',async()=>{layout=layout==='compact'?'list':'compact';$('#layoutToggle').textContent=layout==='compact'?'☷':'▦';requestRender();await savePreferencePatch({defaultLayout:layout});});

const settingIds=['hoverTools','xButtons','integratePicviewer','preferPicviewerBar','autoProbeSizes','saveAs','folder','gifFps','gifMaxWidth','gifQuality'];
async function loadSettings(){const r=await sendRuntime({type:'mfgx:getSettings'});if(!r?.ok)return;settings=r.settings||{};for(const id of settingIds){const el=$(`#${id}`);if(!el)continue;if(el.type==='checkbox')el.checked=Boolean(settings[id]);else el.value=String(settings[id]??'');}$('#sortSelect').value=settings.defaultSort||'position';layout=settings.defaultLayout==='compact'?'compact':'list';$('#layoutToggle').textContent=layout==='compact'?'☷':'▦';}
async function savePreferencePatch(patch){const r=await sendRuntime({type:'mfgx:setSettings',settings:patch});if(r?.ok)settings=r.settings||settings;return r;}
async function saveSettings(){const patch={};for(const id of settingIds){const el=$(`#${id}`);if(!el)continue;let value=el.type==='checkbox'?el.checked:el.value;if(id==='gifFps'||id==='gifMaxWidth')value=Number(value)||0;patch[id]=value;}const wasAuto=settings.autoProbeSizes;const r=await savePreferencePatch(patch);if(r?.ok&&activeTabId)sendTab(activeTabId,{type:'mfgx:rescan'});if(!wasAuto&&settings.autoProbeSizes){const pg=++probeGeneration;probeAllMetadata(records,pg).catch(()=>{});}}
for(const id of settingIds){const el=$(`#${id}`);el?.addEventListener(id==='folder'?'change':'input',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(saveSettings,140);});}

chrome.tabs.onActivated?.addListener(()=>schedulePageLoad(0));
chrome.tabs.onUpdated?.addListener((tabId,info)=>{if(tabId===activeTabId&&(info.status==='complete'||info.url))schedulePageLoad(info.status==='complete'?40:120);});
chrome.runtime.onMessage.addListener((message)=>{
  if(message?.type==='mfgx:gifProgress'){setPill(`GIF ${Math.round(message.progress||0)}%`);}
  if(message?.type==='mfgx:gifDone'){setPill(message.ok?'GIF SAVED':'GIF ERROR',message.ok?'success':'error');setTimeout(()=>setPill(`${visibleRecords.length}/${records.length}`),1800);}
  if(message?.type==='mfgx:zipProgress'){setPill(`ZIP ${Math.round(message.progress||0)}%`);}
  if(message?.type==='mfgx:zipDone'){setPill(message.ok?'ZIP SAVED':'ZIP ERROR',message.ok?'success':'error');setTimeout(()=>setPill(`${visibleRecords.length}/${records.length}`),1800);}
});

(async()=>{await loadSettings();await loadPage();})();
