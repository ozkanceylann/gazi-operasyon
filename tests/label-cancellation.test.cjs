const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('app.js','utf8');
const functions=source.slice(source.indexOf('function canCancelShipment('),source.indexOf('\nlet cancelBusy=false;'));
const base={siparis_no:1,kargo_durumu:'Kargolandı',shipmentStatusCode:1,shipmentStatus:'Gönderi Hazırlandı',kargo_siparis_no:'REF',kargo_takip_kodu:'123456789012',kargo_zpl:'LABEL',etiket_yazdirma_sayisi:1};
async function scenario(answers,override={}){
 const order={...base,...override},calls={prompts:[],requests:[],messages:[]};
 const ctx={isGaziAdmin:true,cancelBusy:false,selectedOrder:null,busy:{kargola:new Set(),barkod:new Set()},TABLE:'orders',CONFIG:{webhooks:{iptal:'cancel'}},hasCargoLabel:o=>!!o.kargo_zpl,isCargoAwaitingHandover:o=>o.shipmentStatusCode===1,cargoEnvironment:()=> 'production',cargoTrackingData:()=>({}),db:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:order})})})})},confirmModal:async prompt=>{calls.prompts.push(prompt);return answers.shift()},cargoRequest:async(url,body)=>{calls.requests.push(body);return {cancelled:true,recordVerified:true,kargo_durumu:'Bekliyor'}},toast:x=>calls.messages.push(x),closeModal:()=>{},setTab:()=>{},loadOrders:async()=>{}};
 vm.createContext(ctx);vm.runInContext(functions,ctx);await ctx.cancelShipmentToWaiting(1);assert.equal(ctx.cancelBusy,false);assert.equal(ctx.busy.barkod.size,0);return calls;
}
(async()=>{
 let c=await scenario([false]);assert.equal(c.prompts.length,1);assert.equal(c.requests.length,0);
 c=await scenario([true,false]);assert.equal(c.prompts.length,2);assert.equal(c.requests.length,0);
 c=await scenario([true,true]);assert.equal(c.prompts.length,2);assert.equal(c.requests.length,1);assert.equal(c.requests[0].labelsDestructionConfirmed,true);assert(c.prompts[0].text.includes('Etiket çıkartılmış'));assert(c.prompts[1].text.includes('Etiketler imha edilecek'));
 c=await scenario([true],{kargo_zpl:null,etiket_yazdirma_sayisi:0});assert.equal(c.prompts.length,1);assert.equal(c.requests.length,1);
 c=await scenario([true,true],{shipmentStatusCode:2});assert.equal(c.requests.length,0);assert.equal(c.prompts.length,0);
 const guard=new Function('$input','$',fs.readFileSync('n8n/cancellation-guard.js','utf8'));
 const run=(body={},order=base)=>guard({first:()=>({json:order})},name=>({first:()=>({json:name==='İptal · Gazi Kargo Canlı'?{body:{reason:'test',...body}}:{operation:'gonderi_iptal'}})}));
 assert.throws(()=>run());assert.throws(()=>run({labelCancellationConfirmed:true}));
 const confirm={labelCancellationConfirmed:true,labelsDestructionConfirmed:true,expectedReference:'REF',expectedShipment:'123456789012'};
 assert.equal(run(confirm)[0].json.hasShipment,true);
 assert.throws(()=>run({...confirm,expectedReference:'OLD'}));assert.throws(()=>run(confirm,{...base,shipmentStatusCode:2}));
 const live=new Function('$input','$',fs.readFileSync('n8n/cancellation-live-check.js','utf8'));
 assert.throws(()=>live({first:()=>({json:{statusCode:200,body:{shipmentStatusCode:2,shipmentId:'123456789012'}}})},()=>({first:()=>({json:{shipmentId:'123456789012'}})})));
 console.log('PASS: two approvals, decline at either step, unlabelled single approval, transfer blocking, reference race, server approval enforcement and live DHL guard');
})().catch(e=>{console.error(e);process.exitCode=1});
