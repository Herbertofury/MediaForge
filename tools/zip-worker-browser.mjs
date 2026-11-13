import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require=createRequire(import.meta.url),Z=require('../src/zip-core.js');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/zip-worker');
await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mediaforge-zip-browser-')),extension=path.join(temp,'extension');
const excluded=new Set(['.git','.github','node_modules','local-evidence','artifacts']);
await fs.cp(root,extension,{recursive:true,filter:p=>!path.relative(root,p).split(path.sep).some(part=>excluded.has(part))});
await fs.copyFile(path.join(root,'manifest.chromium.json'),path.join(extension,'manifest.json'));
const sourceIdentity={};
for(const p of ['zipper.js','src/zip-core.js','manifest.chromium.json'])sourceIdentity[p]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex');
let unavailable=true;const bodies={'/one':Buffer.from('complete original one'),'\/two':Buffer.from('complete original two')};
const server=http.createServer((req,res)=>{if(req.url==='/two'&&unavailable){res.writeHead(403);res.end('fixture access expired');return;}const body=bodies[req.url];if(!body){res.writeHead(404);res.end();return;}const send=()=>{res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(body);};if(req.url==='/one')setTimeout(send,100);else send();});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let context;const evidence={sourceIdentity,checks:{},errors:[]};
try{
 context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,acceptDownloads:true,downloadsPath:path.join(temp,'downloads'),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;evidence.extensionId=id;evidence.loadedExtensionPath=extension;
 await worker.evaluate(()=>{globalThis.zipReceipts=[];chrome.runtime.onMessage.addListener(message=>{if(message.type==='mfgx:zipDone')globalThis.zipReceipts.push(message);});});
 async function receiptFor(jobId){for(let i=0;i<100;i++){const result=await worker.evaluate(id=>globalThis.zipReceipts.find(m=>m.jobId===id),jobId);if(result)return result;await new Promise(r=>setTimeout(r,50));}throw new Error(`ZIP receipt missing: ${jobId}`);}
 const longName='a'.repeat(236)+'.txt',secondName='a'.repeat(232)+' (2).txt';
 const records=[{url:origin+'/one',filename:longName},{url:origin+'/two',filename:longName}];
 async function openJob(jobId){await worker.evaluate(async({jobId,records})=>chrome.storage.session.set({[`zipJob:${jobId}`]:{id:jobId,records,filename:`${jobId}.zip`,saveAs:false}}),{jobId,records});const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(String(e)));await page.goto(`chrome-extension://${id}/zipper.html#${jobId}`);return page;}
 const failedPage=await openJob('incomplete');
 await failedPage.waitForFunction(()=>document.querySelector('#status').textContent.includes('No archive was downloaded'));
 const failedReceipt=await receiptFor('incomplete');
 assert.equal(failedReceipt.ok,false);assert.match(failedReceipt.error,/1 of 2 selected files failed/);
 assert.equal((await worker.evaluate(()=>chrome.downloads.search({}))).length,0);
 await failedPage.screenshot({path:path.join(out,'incomplete.png')});evidence.checks.incompleteSelectionCreatesNoDownload=true;
 unavailable=false;const successPage=await openJob('complete');
 await successPage.waitForFunction(()=>document.querySelector('#status').textContent.includes('ZIP saved'));
 const receipt=await receiptFor('complete');
 assert.equal(receipt.ok,true);assert.equal(receipt.count,2);assert.equal(receipt.failed,0);
 const [download]=await worker.evaluate(id=>chrome.downloads.search({id}),receipt.downloadId);
 assert.equal(download?.state,'complete');const bytes=await fs.readFile(download.filename);
 const entries={};let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extraLength,data=bytes.subarray(start,start+size);assert.equal(Z.crc32(data),bytes.readUInt32LE(offset+14));entries[name]=data.toString();offset=start+size;}
 assert.deepEqual(entries,{[longName]:bodies['/one'].toString(),[secondName]:bodies['/two'].toString()});
 assert.equal(bytes.readUInt16LE(bytes.length-12),2);await fs.writeFile(path.join(out,'verified-complete.zip'),bytes);
 await successPage.screenshot({path:path.join(out,'complete.png')});
 evidence.checks.restoredAccessDownloadsCompleteSelection=true;evidence.checks.originalBytesAndCRCsMatch=true;evidence.checks.successReceiptRequiresCompletedDownload=true;evidence.checks.longDuplicateNamesRetainSelectionOrder=true;
 evidence.archiveSha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.failure=String(error.stack||error);throw error;}
finally{await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));await context?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify(evidence));
