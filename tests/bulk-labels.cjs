const assert=require('node:assert/strict'),fs=require('fs');
const PDFLib=require('../assets/pdf-lib.min.js');
(async()=>{
 const code=fs.readFileSync(require('node:path').join(__dirname,'../bulk-labels.js'),'utf8');const {prepareBulkLabels,confirmBulkLabels}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 async function source(n){const d=await PDFLib.PDFDocument.create();for(let i=0;i<n;i++)d.addPage([295,345]);return Buffer.from(await d.save()).toString('base64');}
 const one=await source(1),two=await source(2);let active=0,max=0;const visited=[],progress=[];
 const result=await prepareBulkLabels([1,2,3,4,1],{PDFLib,fetchLabel:async id=>{active++;max=Math.max(max,active);visited.push(id);await new Promise(r=>setTimeout(r,2));active--;if(id===3)throw Error('network');return {order:{siparis_no:id,kargo_adet:id===2?2:1},base64:id===1?one:two};},decorate:async b=>b,onProgress:(n,total)=>progress.push([n,total])});
 assert.equal(max,1);assert.deepEqual(visited,[1,2,3,4]);assert.deepEqual(result.orders.map(o=>o.siparis_no),[1,2]);assert.deepEqual(result.failed.map(e=>e.id),[3,4]);assert.equal((await PDFLib.PDFDocument.load(result.bytes)).getPageCount(),3);assert.deepEqual(progress.at(-1),[4,4]);
 let cancelled=false;await assert.rejects(()=>prepareBulkLabels([1,2],{PDFLib,fetchLabel:async()=>{cancelled=true;return {order:{kargo_adet:1},base64:one}},decorate:async b=>b,isCancelled:()=>cancelled}),/kapatıldı/);
 let updates=[];const first=await confirmBulkLabels(result.orders,async o=>{if(o.siparis_no===2)throw Error('save failed');updates.push(o.siparis_no)});assert.deepEqual(updates,[1]);assert.deepEqual(first.remaining.map(o=>o.siparis_no),[2]);await confirmBulkLabels(first.remaining,async o=>updates.push(o.siparis_no));assert.deepEqual(updates,[1,2]);
 const empty=await prepareBulkLabels([],{PDFLib,fetchLabel:async()=>{throw Error('unexpected')},decorate:async b=>b});assert.equal(empty.bytes,null);
 console.log('PASS: sequential processing, deduplication, multi-page merge, partial errors, page-count validation, cancellation, confirmation retry without duplicate updates, empty queue');
})().catch(e=>{console.error(e);process.exit(1)});
