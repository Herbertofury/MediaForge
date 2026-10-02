'use strict';

const { performance } = require('node:perf_hooks');

const COUNT = 20000;
const PASSES = Math.max(1, Number(process.env.PERF_PASSES) || 18);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function makeRecords() {
  return Array.from({ length: COUNT }, (_, i) => ({
    type: i % 17 === 0 ? 'video' : i % 29 === 0 ? 'gif' : 'photo',
    filename: `asset-${String((i * 8191) % COUNT).padStart(5, '0')}.${i % 17 === 0 ? 'mp4' : 'jpg'}`,
    url: `https://${i % 3 ? 'cdn.example.com' : 'example.com'}/media/${i}/asset-${i}.jpg?quality=100`,
    title: `Gallery item ${i} purple archive`,
    alt: `asset ${i}`,
    handle: i % 17 === 0 ? 'videoAuthor' : '',
    hostname: i % 3 ? 'cdn.example.com' : 'example.com',
    ext: i % 17 === 0 ? 'mp4' : 'jpg',
    mime: i % 17 === 0 ? 'video/mp4' : 'image/jpeg',
    source: i % 4 ? 'img' : 'network',
    sources: i % 4 ? ['img'] : ['network', 'stylesheet'],
    sizeBytes: 50000 + ((i * 2654435761) >>> 0) % 24_000_000,
    width: 320 + (i * 37) % 3840,
    height: 240 + (i * 53) % 2160,
    position: i
  }));
}

const controls = {
  type: 'images', sizeMode: 'all', dimensionMode: '1024', minW: 0, maxW: 0,
  minH: 0, maxH: 0, minB: 0, maxB: 0, sameHostOnly: false,
  hideUnknown: false, pageHost: 'example.com', sort: 'name', search: 'purple jpg'
};

function filename(rec) { return rec.filename || 'media'; }
function hostOf(raw) { try { return new URL(raw).hostname; } catch { return ''; } }
function isImage(rec) { return ['photo','gif','svg'].includes(rec?.type); }
function oldHay(rec) { return [filename(rec),rec.url,rec.title,rec.alt,rec.handle,rec.hostname,rec.type,rec.ext,rec.mime,rec.source,...(rec.sources||[])].filter(Boolean).join(' '); }
function oldPass(rec) {
  // Intentionally mirrors the pre-0.3.1 repeated control/property work.
  const type=controls.type;
  if(type!=='all' && (type==='images' ? !isImage(rec) : rec.type!==type)) return false;
  const size=Number(rec.sizeBytes)||0,w=Number(rec.width)||0,h=Number(rec.height)||0,px=w*h;
  if(controls.dimensionMode==='1024' && Math.max(w,h)<1024) return false;
  if(controls.minW && w<controls.minW) return false;
  if(controls.maxW && (!w||w>controls.maxW)) return false;
  if(controls.minH && h<controls.minH) return false;
  if(controls.maxH && (!h||h>controls.maxH)) return false;
  if(controls.minB && size<controls.minB) return false;
  if(controls.maxB && (!size||size>controls.maxB)) return false;
  if(controls.sameHostOnly && controls.pageHost && hostOf(rec.url)!==controls.pageHost) return false;
  if(controls.hideUnknown && (!size||(isImage(rec)&&(!w||!h)))) return false;
  void px;
  return true;
}
function oldRun(records) {
  const tokens=controls.search.toLowerCase().split(/\s+/).filter(Boolean);
  const out=records.filter(rec=>{const hay=oldHay(rec).toLowerCase();return tokens.every(t=>hay.includes(t))&&oldPass(rec);});
  return out.map((r,i)=>({r,i})).sort((a,b)=>filename(a.r).localeCompare(filename(b.r),undefined,{numeric:true,sensitivity:'base'})||a.i-b.i).map(x=>x.r);
}

function prepare(rec) {
  rec._file=filename(rec); rec._host=hostOf(rec.url); rec._pixels=(Number(rec.width)||0)*(Number(rec.height)||0);
  rec._search=[rec._file,rec.url,rec.title,rec.alt,rec.handle,rec.hostname,rec.type,rec.ext,rec.mime,rec.source,...(rec.sources||[])].filter(Boolean).join(' ');
  rec._searchLower=rec._search.toLowerCase(); return rec;
}
function newPass(rec,f) {
  if(f.type!=='all' && (f.type==='images' ? !isImage(rec) : rec.type!==f.type)) return false;
  const size=Number(rec.sizeBytes)||0,w=Number(rec.width)||0,h=Number(rec.height)||0;
  if(f.dimensionMode==='1024' && Math.max(w,h)<1024) return false;
  if(f.minW && w<f.minW) return false; if(f.maxW && (!w||w>f.maxW)) return false;
  if(f.minH && h<f.minH) return false; if(f.maxH && (!h||h>f.maxH)) return false;
  if(f.minB && size<f.minB) return false; if(f.maxB && (!size||size>f.maxB)) return false;
  if(f.sameHostOnly && f.pageHost && rec._host!==f.pageHost) return false;
  if(f.hideUnknown && (!size||(isImage(rec)&&(!w||!h)))) return false;
  return true;
}
function newRun(records) {
  const tokens=controls.search.toLowerCase().split(/\s+/).filter(Boolean);
  const f={...controls};
  const out=records.filter(rec=>tokens.every(t=>rec._searchLower.includes(t))&&newPass(rec,f));
  return out.map((r,i)=>({r,i})).sort((a,b)=>collator.compare(a.r._file,b.r._file)||a.i-b.i).map(x=>x.r);
}
function checksum(items){let h=2166136261>>>0;for(const r of items){for(const c of r.url){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}}return h>>>0;}
function median(values){const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];}
function bench(fn, records){for(let i=0;i<3;i++)fn(records);const samples=[];let result;for(let i=0;i<PASSES;i++){const t=performance.now();result=fn(records);samples.push(performance.now()-t);}return {ms:median(samples),result};}

const raw=makeRecords();
const prepared=raw.map(r=>prepare({...r}));
const old=bench(oldRun,raw); const modern=bench(newRun,prepared);
const oldHash=checksum(old.result), newHash=checksum(modern.result);
if(old.result.length!==modern.result.length||oldHash!==newHash) throw new Error(`parity failure old=${old.result.length}/${oldHash} new=${modern.result.length}/${newHash}`);
const report={model:'MediaForge GX 0.3.1 side-panel CPU microbenchmark',records:COUNT,passes:PASSES,resultCount:modern.result.length,checksum:newHash,baselineMedianMs:Number(old.ms.toFixed(3)),optimizedMedianMs:Number(modern.ms.toFixed(3)),speedup:Number((old.ms/modern.ms).toFixed(2)),reductionPercent:Number(((1-modern.ms/old.ms)*100).toFixed(2))};
console.log(JSON.stringify(report,null,2));
