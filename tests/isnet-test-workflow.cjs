const vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs');
const w=JSON.parse(fs.readFileSync(__dirname+'/../n8n/isnet-test-workflow.json','utf8'));
function code(name){return w.nodes.find(n=>n.name===name).parameters.jsCode;}
function run(name,input,refs={}){return vm.runInNewContext('(function(){'+code(name)+'})()',{$input:{first:()=>({json:input})},$:key=>({first:()=>({json:refs[key]})})})[0].json;}
const request={body:{siparis_no:'100',ortam:'test'}};
const refs={'Fatura · Panel isteği':request};
assert.throws(()=>run('Fatura · Yönetici ve girdi',{statusCode:401},refs));
assert.throws(()=>run('Fatura · Yönetici ve girdi',{statusCode:200,body:{id:'u',app_metadata:{firma:'gazi',role:'seller'}}},refs));
assert.equal(run('Fatura · Yönetici ve girdi',{statusCode:200,body:{id:'u',app_metadata:{firma:'gazi',role:'admin'}}},refs).p_siparis_no,100);
request.body.ortam='canli';assert.throws(()=>run('Fatura · Yönetici ve girdi',{statusCode:200,body:{id:'u',app_metadata:{firma:'gazi',role:'admin'}}},refs));
const outrefs={'Fatura · Test taslağını kaydet':{fatura_id:'draft'}};
let r=run('Fatura · Test sonucunu hazırla',{statusCode:200,body:'<wsdl:definitions></wsdl:definitions>'},outrefs);assert.equal(r.p_sonuc.baglanti_basarili,true);assert.equal(r.p_sonuc.belge_gonderildi,false);
r=run('Fatura · Test sonucunu hazırla',{statusCode:200,body:'<html>InvoiceService</html>'},outrefs);assert.equal(r.p_sonuc.baglanti_basarili,false);
r=run('Fatura · Test sonucunu hazırla',{error:{message:'timeout'}},outrefs);assert.equal(r.p_sonuc.baglanti_basarili,false);assert.match(r.p_sonuc.hata,/timeout/);
assert.throws(()=>run('Fatura · Test ortamı kontrolü',{ortam:'canli',aktif:true,invoice_service_url:'https://example.com'}));
console.log('PASS: invalid JWT/seller/live reject, admin input, real WSDL vs HTML, timeout outcome, fixed test endpoint');