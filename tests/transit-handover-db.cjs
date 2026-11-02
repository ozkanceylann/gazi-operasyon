const fs=require('fs'),assert=require('assert/strict');const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table public.gazi_siparisler(siparis_no integer primary key,kargo_durumu text,kargo_siparis_no text,kargo_takip_kodu text,"shipmentStatusCode" smallint,"shipmentStatus" text,"isDelivered" boolean,kargo_api_yanit text,teslimat_aciklama text);`);
 await db.exec(fs.readFileSync('supabase/sql/transit-handover-evidence.sql','utf8'));
 const shipment='744425651683',ref='AKH4520010577';
 const event=(code,date='2026-11-02 19:16:11',over={})=>({shipmentId:shipment,referenceId:ref,eventSequence:String(code),eventDateTime2:date,location:'BALIKESİR',eventStatus:'Transfer Aşamasında',...over});
 const seed=async(id,movements,over={})=>{const o={siparis_no:id,kargo_durumu:'Kargolandı',kargo_siparis_no:ref,kargo_takip_kodu:shipment,shipmentStatusCode:1,shipmentStatus:'Gönderi_Hazırlandı',isDelivered:false,kargo_api_yanit:JSON.stringify({tracking:{movements}}),...over};await db.query('insert into gazi_siparisler select * from jsonb_populate_record(null::gazi_siparisler,$1)',[o]);return (await db.query('select * from gazi_siparisler where siparis_no=$1',[id])).rows[0];};
 let row=await seed(10577,[event(1,'2026-11-03 08:00:01'),event(2)]);assert.equal(row.shipmentStatusCode,2);assert.equal(row.shipmentStatus,'Transfer_Aşamasında');assert.equal(JSON.parse(row.kargo_api_yanit).tracking.movements[0].eventSequence,'1','Raw DHL evidence preserved');
 row=await seed(10711,[event(2),event(1,'2026-11-03 08:00:01')]);assert.equal(row.shipmentStatusCode,2,'Later created row must not regress transfer');
 for(const [id,m,override,code] of [
 [3,[event(1)],{},1], [4,[event(2,undefined,{shipmentId:'111111111111'})],{},1],
 [5,[event(2,undefined,{referenceId:'OLD-REF'})],{},1], [6,[event(2)],{kargo_durumu:'Bekliyor'},1],
 [7,[event(6),event(4,'2026-11-02 20:00:00')],{},4], [8,[event(2)],{shipmentStatusCode:7,shipmentStatus:'Geri_Geliyor'},7],
 [9,[event(5)],{},5], [10,[],{kargo_api_yanit:'broken'},1],
 [11,[],{kargo_api_yanit:JSON.stringify({bulk_tracking:{status:{movements:[event(2)]}}})},2]
 ]){const o=await seed(id,m,override);assert.equal(o.shipmentStatusCode,code,'case '+id);}
 await db.query(`update gazi_siparisler set "shipmentStatusCode"=1,"shipmentStatus"='Gönderi_Hazırlandı',kargo_api_yanit='{}' where siparis_no=10577`);
 assert.equal((await db.query('select "shipmentStatusCode" code from gazi_siparisler where siparis_no=10577')).rows[0].code,2,'Same shipment does not regress on a later summary-only update');
 await db.query(`update gazi_siparisler set kargo_durumu='Bekliyor',kargo_takip_kodu=null,"shipmentStatusCode"=null,kargo_api_yanit='{}' where siparis_no=10577`);
 assert.equal((await db.query('select "shipmentStatusCode" code from gazi_siparisler where siparis_no=10577')).rows[0].code,null,'Cancellation remains clear');
 row=await seed(12,[event(2)],{kargo_takip_kodu:'222222222222',kargo_siparis_no:'NEW-REF'});assert.equal(row.shipmentStatusCode,1,'Old shipment movements do not contaminate a recreated shipment');
 console.log('PASS: direct transfer scans, future-created regression, normal awaiting, exact shipment/reference matching, retry delivery chronology, return/delivery, malformed payload, bulk updates, cancellation and recreated shipments');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
