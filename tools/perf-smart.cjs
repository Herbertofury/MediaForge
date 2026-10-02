'use strict';
const {performance}=require('node:perf_hooks');
const C=require('../src/media-classifier.js');
const COUNT=30000,PASSES=Math.max(2,Number(process.env.PERF_PASSES)||8);
const records=Array.from({length:COUNT},(_,i)=>({
  type:i%19===0?'video':'photo',
  url:i%13===0?`https://ads.example.com/campaign/banner-${i}.png`:i%17===0?`https://cdn.example.com/assets/icon-${i}.png`:`https://cdn.example.com/gallery/original-${i}.jpg`,
  filename:i%17===0?`icon-${i}.png`:`original-${i}.jpg`,
  width:i%17===0?32:1280+(i%4)*320,height:i%13===0?90:720+(i%5)*120,sizeBytes:i%17===0?4096:250000+(i%11)*100000,source:i%7?'img':'network',hostname:'cdn.example.com'
}));
function legacyPass(items){return items.filter(r=>C.classifyMediaRecord(r,{hostname:'example.com'}).likelyContent).length;}
const prepared=records.map(r=>({...r,_class:C.classifyMediaRecord(r,{hostname:'example.com'})}));
function cachedPass(items){let n=0;for(const r of items)if(r._class.likelyContent)n++;return n;}
function median(a){return [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];}
function bench(fn,items){for(let i=0;i<2;i++)fn(items);const samples=[];let result;for(let i=0;i<PASSES;i++){const t=performance.now();result=fn(items);samples.push(performance.now()-t);}return{ms:median(samples),result};}
const a=bench(legacyPass,records),b=bench(cachedPass,prepared);if(a.result!==b.result)throw new Error('smart filter parity failed');
console.log(JSON.stringify({model:'MediaForge GX 0.4 smart-filter cached classification',records:COUNT,passes:PASSES,resultCount:b.result,recomputeMedianMs:+a.ms.toFixed(3),cachedMedianMs:+b.ms.toFixed(3),speedup:+(a.ms/b.ms).toFixed(2),reductionPercent:+((1-b.ms/a.ms)*100).toFixed(2)},null,2));
