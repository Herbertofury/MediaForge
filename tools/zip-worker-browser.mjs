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
for(const p of ['zipper.js','src/zip-core.js','manifest.chromium.json','converter.js'])sourceIdentity[p]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex');
// Locally generated 16x16 red WebM fixture (ffmpeg lavfi color, 5fps, 0.2s).
const gifSource=Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIAEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggHq7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAaQAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIT3AqSJPVH2ycgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QL68IA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIT3AqSJPVH2xnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjIwMDAwMDAwMAAfQ7Z1wueBAKO9gQAAgPACAJ0BKhAAEAAARwiFhYiFhIgCAgJ1qgP4A/oCDU0YAP79bvP/45k3MMT/jm3/8WE8DijI//FRABxTu2uRu4+zgQC3iveBAfGCAaPwgQM=','base64');
let unavailable=true;const bodies={'/one':Buffer.from('complete original one'),'\/two':Buffer.from('complete original two')};
const server=http.createServer((req,res)=>{if(req.url==='/two'&&unavailable){res.writeHead(403);res.end('fixture access expired');return;}const body=req.url==='/gif-source'?gifSource:bodies[req.url];if(!body){res.writeHead(404);res.end();return;}const send=()=>{res.writeHead(200,{'Content-Type':req.url==='/gif-source'?'video/webm':'application/octet-stream'});res.end(body);};if(req.url==='/one')setTimeout(send,100);else send();});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let context;const evidence={sourceIdentity,checks:{},errors:[]};
try{
 context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,acceptDownloads:true,downloadsPath:path.join(temp,'downloads'),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;evidence.extensionId=id;evidence.loadedExtensionPath=extension;
 await worker.evaluate(()=>{globalThis.zipReceipts=[];chrome.runtime.onMessage.addListener(message=>{if(['mfgx:zipDone','mfgx:gifDone'].includes(message.type))globalThis.zipReceipts.push(message);});});
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
 const gifJob='gif-complete';
 await worker.evaluate(async({gifJob,origin})=>chrome.storage.session.set({[`gifJob:${gifJob}`]:{sourceUrl:origin+'/gif-source',filename:'verified.gif',fps:5,saveAs:false}}),{gifJob,origin});
 const gifPage=await context.newPage();gifPage.on('pageerror',e=>evidence.errors.push(String(e)));
 await gifPage.goto(`chrome-extension://${id}/converter.html#${gifJob}`);
 await gifPage.waitForFunction(()=>document.querySelector('#status').textContent.includes('GIF saved'),{},{timeout:30000});
 const gifReceipt=await receiptFor(gifJob);assert.equal(gifReceipt.ok,true);
 const [gifDownload]=await worker.evaluate(id=>chrome.downloads.search({id}),gifReceipt.downloadId);
 assert.equal(gifDownload.state,'complete');const gifBytes=await fs.readFile(gifDownload.filename);
 assert.equal(gifBytes.subarray(0,6).toString(),'GIF89a');assert.equal(gifBytes.at(-1),0x3b);
 await fs.writeFile(path.join(out,'verified.gif'),gifBytes);await gifPage.screenshot({path:path.join(out,'gif-complete.png')});
 evidence.checks.gifSuccessRequiresCompletedBrowserDownload=true;
 evidence.gifSha256=crypto.createHash('sha256').update(gifBytes).digest('hex');
 evidence.archiveSha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.failure=String(error.stack||error);throw error;}
finally{await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));await context?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify(evidence));
