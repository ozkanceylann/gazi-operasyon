const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path'),root=path.resolve(__dirname,'..');
async function check(repo,options={}){
 const mobile=repo==='Mobil-siparis',src=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const start=src.indexOf('async function saveEdit('),end=src.indexOf(mobile?'\nfunction renderAdmin(':'\nasync function updateSelectedOrder(',start);
 let writes=0,messages=[],focus=[];
 const el=(value,id)=>({value,disabled:false,focus(){focus.push(id)},selectedOptions:[{textContent:id==='city'?'İSTANBUL':'KADIKÖY',dataset:{code:'3401'}}]});
 const city=el(options.city===undefined?'34':options.city,'city'),district=el(options.district===undefined?'3401':options.district,'district');
 district.disabled=!!options.loading;
 const button={disabled:false},errorBox={textContent:''};
 const elements={city,district,sehir_select:city,ilce_select:district,delivery_select:el(options.delivery||'false','delivery'),delivery_branch:el(options.branch===undefined?'AKHİSAR':options.branch,'branch'),delivery_branch_select:el('b','branchSelect'),'edit-error':errorBox,sehir_kodu:el('OLD_CITY'),ilce_kodu:el('OLD_DISTRICT')};
 const order={siparis_no:10261,...(options.locked?{orderinvoiceid:'existing'}:{})};
 const ctx={missingOperationActive:false,refreshOperationCounts:async()=>{},console,navigator:{onLine:true},document:{getElementById:id=>elements[id]},selectedOrder:order,S:{detail:order,admin:false},branchSelector:{valid:()=>options.valid!==false},toast:m=>messages.push(m),canEdit:()=>true,CargoWeights:{normalize:()=> '5'},OrderReceipts:{load:async()=>{}},CustomerOrderHistory:{load:async()=>{}},orderWriteSnapshot:o=>o,renderDetail(){},closeModal(){},loadOrders:async()=>{},updateSelectedOrder:async data=>{writes++;assert.equal(data.sehir_kodu,'34');assert.equal(data.ilce_kodu,'3401');return true;},db:{rpc:async(_,data)=>{writes++;assert.equal(data.p_changes.sehir_kodu,'34');assert.equal(data.p_changes.ilce_kodu,'3401');return {data:order}}},FormData:class{*[Symbol.iterator](){yield ['kargo_kg','5'];yield ['kargo_adet','1'];}}};
 for(const id of ['ad_soyad','siparis_tel','musteri_tel','adres','kargo_adet','kargo_kg','urun_bilgisi','toplam_tutar','odeme_sekli','notlar'])ctx[id]=el('value',id);
 vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
 await ctx.saveEdit({querySelector:()=>button});
 if(mobile&&errorBox.textContent)messages.push(errorBox.textContent);
 assert.equal(button.disabled,false);
 return {writes,messages,focus};
}
(async()=>{
 for(const repo of ['gazi-operasyon']){
  for(const options of [{city:''},{district:''},{loading:true},{delivery:'true',branch:''},{delivery:'true',valid:false},{delivery:'pending'}]){
   const r=await check(repo,options);assert.equal(r.writes,0,repo+JSON.stringify(options));assert(r.messages.length,repo+' warning missing');
  }
  for(const delivery of ['false','true'])assert.equal((await check(repo,{delivery})).writes,1,repo+' valid save');
 }
 const r=await check('gazi-operasyon',{delivery:'true',branch:'',locked:true});assert.equal(r.writes,0);assert(r.messages[0].includes('DHL'));
 console.log('PASS: delivery selections block incomplete saves; valid address and branch saves succeed.');
})().catch(e=>{console.error(e);process.exitCode=1});
