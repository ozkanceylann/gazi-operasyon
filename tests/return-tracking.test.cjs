const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const normalize=vm.runInNewContext(fs.readFileSync('n8n/return-tracking-normalize.js','utf8')+';normalizeReturn');
const order={siparis_no:1,iade_kodu:'GZI-1-R1',kargo_takip_kodu:'111111111111'};
const response=(code=2,extra={})=>({statusCode:200,body:{referenceId:'GZI-1-R1',shipmentId:'222222222222',shipmentStatusCode:code,...extra}});
const movements={statusCode:200,body:[{eventSequence:1,eventStatus:'Transfer',eventDateTime:'24.10.2026 10:00:00',location:'Test'}]};
assert.equal(normalize(order,response(),movements).p_data.stage,'İade yolda');
assert.ok(normalize(order,response(5,{referenceId:'OUTBOUND'}),movements).p_data.error);
assert.ok(normalize(order,response(5,{shipmentId:order.kargo_takip_kodu}),movements).p_data.error);
assert.ok(normalize(order,{statusCode:404},movements).p_data.error);
assert.ok(normalize(order,response(),{statusCode:500}).p_data.error);
assert.ok(normalize(order,response(),{statusCode:200,body:[{shipmentId:'999999999999'}]}).p_data.error);
assert.equal(normalize(order,response(5,{deliveryDateTime:'24.10.2026 14:20:00'}),movements).p_data.deliveredAt,'2026-10-24T11:20:00.000Z');
(async()=>{
 const db=new PGlite();
 try{
 const fixture=fs.readFileSync('tests/order-split-db.cjs','utf8');
 const table=fixture.slice(fixture.indexOf('create table public.gazi_siparisler('),fixture.indexOf('create table public.tum_siparisler'));
 await db.exec(`create role anon;create role authenticated;create role service_role;${table}
 alter table gazi_siparisler add column bolunme_ana_siparis_no integer,add column bolunme_sira integer;
 create function seller_is_gazi_admin() returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;
 create function seller_current_phone() returns text language sql as $$select nullif(current_setting('test.phone',true),'')$$;
 create function seller_owner_phone(text,text) returns text language sql as $$select $2$$;
 create function seller_order_phase(text,boolean,smallint,text,text,text) returns text language sql as $$select 'delivered'::text$$;
 create function seller_order_safe(o gazi_siparisler) returns jsonb language sql as $$select jsonb_build_object('siparis_no',o.siparis_no,'iade_tarihi',o.iade_tarihi,'iade_kodu',o.iade_kodu)$$;
 create view gazi_order_list as select o.*,groups.group_label_created AS liste_etiket_tarihi from gazi_siparisler o cross join (select null::timestamptz as group_label_created) groups;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261013001000_gazi_return_labels.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/sql/return-tracking.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/sql/return-tracking-functions.sql','utf8'));
 await db.exec(`insert into gazi_siparisler(musteri_no,iade_kodu,iade_tarihi,kargo_takip_kodu,"isDelivered",siparis_tel) select 1,'GZI-'||i||'-R1',now()-i*interval '1 day','111111111111',true,case when i<=60 then 'seller-a' else 'seller-b' end from generate_series(1,65) i;`);
 const save=async data=>(await db.query('select gazi_iade_tracking_save($1,$2,$3::jsonb) as result',[1,'GZI-1-R1',JSON.stringify(data)])).rows[0].result;
 await save(normalize(order,response(),movements).p_data);await save(normalize(order,response(),movements).p_data);
 let row=(await db.query('select * from gazi_siparisler where siparis_no=1')).rows[0];
 assert.equal(row.iade_hareketleri.length,1);assert.equal(row.iade_durumu,'İade yolda');assert.equal(row.kargo_takip_kodu,'111111111111');assert.equal(row.isDelivered,true);
 await save({error:'temporary'});row=(await db.query('select * from gazi_siparisler where siparis_no=1')).rows[0];assert.equal(row.iade_durumu,'İade yolda');
 await assert.rejects(save({shipmentId:'111111111111',stage:'İade teslim edildi',events:[]}));
 await save(normalize(order,response(5,{deliveryDateTime:'24.10.2026 14:20:00'}),movements).p_data);await save(normalize(order,response(2),movements).p_data);
 row=(await db.query('select * from gazi_siparisler where siparis_no=1')).rows[0];assert.equal(row.iade_durumu,'İade teslim edildi');
 await db.exec(`set test.admin='true';`);
 const page=async (role,offset)=>(await db.query(`select ${role}_orders('return_label','',$1) as data`,[offset])).rows[0].data;
 let first=await page('admin',0),last=await page('admin',60);
 assert.equal(first.orders.length,30);assert.equal(last.orders.at(-1).siparis_no,1);assert.ok(last.orders.at(-1).iade_teslim_tarihi);
 await db.exec(`set test.phone='seller-a';`);
 const owned=await page('seller',0);assert.equal(owned.total,60);assert.ok(owned.orders.every(x=>x.siparis_no<=60));
 assert.equal((await db.query(`select has_function_privilege('authenticated','gazi_iade_tracking_save(integer,text,jsonb)','execute') as allowed`)).rows[0].allowed,false);
 console.log('PASS: identity, dates, failure preservation, deduplication, outbound isolation, terminal delivery, pagination and seller ownership');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
