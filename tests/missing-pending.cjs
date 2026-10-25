const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('app.js','utf8');
const block=src.slice(src.indexOf('let missingOperationIds='),src.indexOf('let operationCountsLoading'));
const rows=new Map([[9,{siparis_no:9,kargo_durumu:'Bekliyor',sehir:''}],[8,{siparis_no:8,kargo_durumu:'Bekliyor',sehir:''}],[7,{siparis_no:7,kargo_durumu:'Hazırlandı',sehir:''}]]);
const slot={innerHTML:''},opened=[],messages=[];let closed=0;
const ctx={window:{},selectedOrder:null,document:{getElementById:id=>id==='missingOperationSlot'?slot:null},missingDeliveryFields:o=>o.sehir?[]:['İl eksik'],renderDetails(){},toast:m=>messages.push(m),closeModal:()=>closed++};
ctx.openOrder=async(id,options)=>{assert(options.missingQueue);opened.push(id);ctx.selectedOrder=rows.get(id);return ctx.selectedOrder;};
vm.createContext(ctx);vm.runInContext(block,ctx);
const run=s=>vm.runInContext(s,ctx);
(async()=>{
 run('missingOperationIds=[9,8,7];renderMissingOperationNotice();');assert(slot.innerHTML.includes('3 bekleyen sipariş'));
 await run('openNextMissingOperation()');assert.equal(ctx.selectedOrder.siparis_no,9);
 await run('openNextMissingOperation()');assert.equal(ctx.selectedOrder.siparis_no,8);
 await run('openNextMissingOperation()');assert.equal(ctx.selectedOrder.siparis_no,9);assert(slot.innerHTML.includes('2 bekleyen sipariş'),'stale prepared order removed');
 rows.get(9).sehir='İSTANBUL';run('missingOperationIds=[8];');await run('openNextMissingOperation()');assert.equal(ctx.selectedOrder.siparis_no,8);
 rows.get(8).sehir='İSTANBUL';run('missingOperationIds=[];renderMissingOperationNotice();');await run('openNextMissingOperation()');assert.equal(slot.innerHTML,'');assert.equal(closed,1);assert(messages.at(-1).includes('kalmadı'));
 let release;ctx.openOrder=()=>new Promise(r=>release=r);run('missingOperationIds=[9];');const pending=run('openNextMissingOperation()');await run('openNextMissingOperation()');release({...rows.get(9),sehir:''});await pending;
 console.log('PASS: operation warning, sequential queue, stale prepared exclusion, completed removal, zero warning and duplicate-click lock.');
})().catch(e=>{console.error(e);process.exitCode=1});
