const fs=require('node:fs'), assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 const schema=JSON.parse(fs.readFileSync(__dirname+'/fixtures/reopen-cancelled-schema.json'));
 for(const table of ['tum_siparisler','gazi_siparisler']){
  const columns=schema.find(x=>x.kind==='columns').data.filter(x=>x.table===table);
  await db.exec(`create table public.${table} (${columns.map(c=>'"'+c.col+'" '+(c.col==='siparis_no'?'serial primary key':c.type)).join(',')});`);
 }
 await db.exec(`create table queen_siparisler(like gazi_siparisler);create table isimsiz_siparisler(like gazi_siparisler);
 create view whatsapp_siparis_giris as select *,null::text kayit_islemi from tum_siparisler;
 create view gazi_siparisler_giris as select * from gazi_siparisler;`);
 await db.exec(fs.readFileSync(__dirname+'/../supabase/sql/reopen-cancelled-intake.sql','utf8'));
 const sync=schema.find(x=>x.kind==='triggers').data.find(x=>x.fn==='sync_gazi_order_to_master');
 await db.exec(sync.body+';'+sync.def);
 await db.exec(`create trigger intake instead of insert on whatsapp_siparis_giris for each row execute function whatsapp_siparis_giris_3h();`);
 const defs=JSON.parse(fs.readFileSync(__dirname+'/fixtures/reopen-cancelled-defs.json'));
 await db.exec(defs.find(x=>x.proname==='gazi_siparisler_giris_kaydet').def);
 await db.exec(`create trigger route instead of insert on gazi_siparisler_giris for each row execute function gazi_siparisler_giris_kaydet();`);
 async function seed(id,status,hours=1,ref='AKH-TEST',operation=true){
  await db.query(`insert into tum_siparisler(siparis_no,musteri_tel,firma,kargo_durumu,tarih,kargo_siparis_no,iptal_nedeni,iptal_tarihi,notlar) values($1,$2,'Gazi',$3,(now() at time zone 'GMT+3')-($4||' hours')::interval,$5,'Eski iptal',now(),'Eski not')`,[id,'555000'+String(id).padStart(4,'0'),status,String(hours),ref]);
  if(operation)await db.query(`insert into gazi_siparisler(siparis_no,musteri_tel,firma,kargo_durumu,kargo_siparis_no,iptal_nedeni,iptal_tarihi,kargo_zpl,kargo_api_yanit,orderinvoiceid,etiket_yazdirma_sayisi,"shipmentStatusCode") values($1,$2,'Gazi',$3,$4,'Eski iptal',now(),'OLD LABEL','old response','old invoice',3,7)`,[id,'555000'+String(id).padStart(4,'0'),status,ref]);
 }
 async function intake(id){return (await db.query(`insert into whatsapp_siparis_giris(musteri_tel,firma,ad_soyad,notlar,kargo_durumu) values($1,'Gazi','Yeni isim','Yeni müşteri notu','Bekliyor') returning *`,['555000'+String(id).padStart(4,'0')])).rows[0]}
 await seed(100,'İptal',1,'AKH-TEST-R3');let r=await intake(100);
 assert.equal(r.siparis_no,100);assert.equal(r.kargo_durumu,'Bekliyor');assert.equal(r.kargo_siparis_no,'AKH-TEST-R4');assert.equal(r.kayit_islemi,'Güncellendi');
 let m=(await db.query('select * from tum_siparisler where siparis_no=100')).rows[0];
 assert.equal(m.yeniden_acilma_gecmisi.length,1);assert.equal(m.yeniden_acilma_gecmisi[0].previous_operation.kargo_zpl,'OLD LABEL');assert.equal(m.yeniden_acilma_gecmisi[0].previous_master.iptal_nedeni,'Eski iptal');
 await db.exec(`insert into gazi_siparisler_giris(siparis_no,firma)values(100,'Gazi')`);
 let g=(await db.query('select * from gazi_siparisler where siparis_no=100')).rows[0];assert.equal(g.kargo_durumu,'Bekliyor');assert.equal(g.kargo_zpl,null);assert.equal(g.orderinvoiceid,null);assert.equal(g.iptal_nedeni,null);assert.equal(g.etiket_yazdirma_sayisi,0);assert.equal(g.shipmentStatusCode,null);assert.equal(g.notlar,'Yeni müşteri notu');
 await intake(100);m=(await db.query('select * from tum_siparisler where siparis_no=100')).rows[0];assert.equal(m.yeniden_acilma_gecmisi.length,1);assert.equal(m.kargo_siparis_no,'AKH-TEST-R4');
 for(const [i,s] of ['Bekliyor','Hazırlandı','Kargolandı','Tamamlandı','İade','Silindi'].entries()){await seed(200+i,s);r=await intake(200+i);assert.equal(r.kargo_durumu,s);const x=(await db.query('select * from gazi_siparisler where siparis_no=$1',[200+i])).rows[0];assert.equal(x.kargo_zpl,'OLD LABEL');}
 await seed(300,'İptal',13);r=await intake(300);assert.notEqual(r.siparis_no,300);assert.equal((await db.query('select kargo_durumu from tum_siparisler where siparis_no=300')).rows[0].kargo_durumu,'İptal');
 await seed(301,'İptal',11.99);assert.equal((await intake(301)).kargo_durumu,'Bekliyor');
 await seed(400,'İptal',1,'AKH-ONLY',false);r=await intake(400);assert.equal(r.kargo_durumu,'Bekliyor');await db.exec(`insert into gazi_siparisler_giris(siparis_no,firma)values(400,'Gazi')`);assert.equal((await db.query('select kargo_durumu from gazi_siparisler where siparis_no=400')).rows[0].kargo_durumu,'Bekliyor');
 console.log('PASS: cancelled reopen, history, clean labels, route upsert, idempotency, six unchanged statuses, 12-hour boundary, master-only recovery');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
