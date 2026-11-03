const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
function extract(name){let start=source.indexOf('async function '+name+'(');assert(start>=0);const end=Math.min(...[source.indexOf('\nfunction ',start+10),source.indexOf('\nasync function ',start+10)].filter(x=>x>0));return source.slice(start,end);}
async function scenario(options={}){
 const calls={confirm:0,shipping:0,updates:0,reactions:[],tabs:[],reloads:0,messages:[]};
 const order={siparis_no:9691,kargo_durumu:options.stage||'Bekliyor',kargo_adet:'1',kargo_kg:'5',teslim_sekli_kontrol:!!options.review};
 const ctx={ShippingApproval:{assert:async()=>{if(options.approvalBlocked)throw Error('Operasyon onayı / dekont gerekli.');}},console,TABLE:'orders',WH_KARGOLA:'existing-cargo-webhook',batchPreparing:false,selectedOrder:null,preparingOrders:new Set(),busy:{kargola:new Set()},cargoEnvironment:()=>options.test?'test':'production',CargoWeights:{parse:()=>{if(options.badKg)throw Error('Invalid KG');return [5]}},confirmModal:async()=>{calls.confirm++;return !options.cancel},toast:m=>calls.messages.push(m),closeModal:()=>{},setTab:t=>calls.tabs.push(t),loadOrders:async()=>{calls.reloads++},refreshOperationCounts:async()=>{},cargoRequest:async(url,body)=>{calls.shipping++;assert.equal(url,'existing-cargo-webhook');assert.equal(body.operation,'kargola');assert.equal(body.siparis_no,'9691');if(options.fail)throw Error('DHL unavailable');order.kargo_durumu='Kargolandı';return{success:true}},db:{from:()=>{let update=false;const q={select:()=>update?Promise.resolve({data:options.raced?[]:[{siparis_no:9691}]}):q,eq:()=>q,single:async()=>({data:{...order}}),update:values=>{assert.equal(values.kargo_durumu,'Hazırlandı');calls.updates++;if(!options.raced)order.kargo_durumu='Hazırlandı';update=true;return q}};return q},functions:{invoke:async(_,arg)=>{calls.reactions.push(arg.body.emoji);if(options.reactionFail)throw Error('Reaction unavailable');return{error:null}}}}};
 vm.createContext(ctx);vm.runInContext(extract('directShipFromList')+'\n'+extract('sendToCargo'),ctx);
 const prepareButton={disabled:false};
 const button={disabled:false,textContent:'Direkt Kargola',style:{},parentElement:{querySelector:()=>prepareButton}};
 if(options.busy)ctx.busy.kargola.add(9691);
 if(options.detail){
   await ctx.sendToCargo(9691);
   return {calls,order};
 }
 const shipping=ctx.directShipFromList(9691,button);
 if(!options.busy){
   assert.equal(button.disabled,true);
   assert.equal(button.textContent,'Kontrol ediliyor…');
   await ctx.directShipFromList(9691,button);
 }
 await shipping;
 const shipped=calls.shipping===1&&!options.fail;
 assert.equal(button.disabled,shipped);
 assert.equal(button.textContent,shipped?'Kargolandı':'Direkt Kargola');
 assert.equal(prepareButton.disabled,shipped);
 assert.equal(ctx.preparingOrders.size,0);
 assert.deepEqual(calls.tabs,[]);
 assert.equal(calls.reloads,0);
 return {calls,order};
}
(async()=>{
 let r=await scenario();assert.equal(r.calls.updates,1);assert.equal(r.calls.shipping,1);assert.deepEqual(r.calls.reactions,['🚚']);assert.equal(r.calls.confirm,1);
 r=await scenario({stage:'Hazırlandı'});assert.equal(r.calls.updates,0);assert.equal(r.calls.shipping,1);
 for(const options of [{cancel:true},{approvalBlocked:true},{busy:true},{stage:'İptal'},{stage:'Kargolandı'},{stage:'Tamamlandı'},{test:true},{review:true},{badKg:true},{raced:true}]){r=await scenario(options);assert.equal(r.calls.shipping,0,JSON.stringify(options));}
 r=await scenario({fail:true});assert.equal(r.order.kargo_durumu,'Hazırlandı');assert.equal(r.calls.shipping,1);assert.deepEqual(r.calls.reactions,[]);assert(r.calls.messages.some(m=>m.includes('kargolama tamamlanamadı')));
 r=await scenario({reactionFail:true});assert.equal(r.calls.shipping,1);assert.equal(r.order.kargo_durumu,'Kargolandı');
 r=await scenario({detail:true});assert.deepEqual(r.calls.tabs,['kargolandi']);
 r=await scenario({detail:true,fail:true});assert.equal(r.calls.reloads,1);
 console.log('PASS: direct prepare+existing cargo, prepared retry, cancellation/busy/stage/quantity/review/test guards, concurrent update, DHL failure leaves prepared, reaction failure does not block cargo.');
})().catch(e=>{console.error(e);process.exitCode=1});
