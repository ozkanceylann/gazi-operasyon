const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const id of ['uohtTb9dA2r6DR3y','iKtxgMltjlt18zUW']){
 const code=fs.readFileSync('n8n/system-notes/'+id+'-validator.js','utf8');
 function run(notlar,source,sistem_notu=''){
 const data={Siparis:'Evet',firma:'Gazi',musteri_ad_soyad:'Örnek Müşteri',musteri_telefon:'5550000001',adres:'Örnek mahallesi 1 sokak no 2',Sehir:'Manisa',ilce:'Akhisar',urunler:['5 kg zeytin'],toplam:'500',odeme_yontemi:'EFT',kargo_adet:'1',kargo_kg:'5',notlar,sistem_notu};
 return vm.runInNewContext('(function(){'+code+'})()',{$input:{all:()=>[{json:{output:JSON.stringify(data)}}]},$:()=>({item:{json:{_message_text:source,_sender_phone:'905550000002',_sender_name:'Satıcı'}}})})[0].json;
 }
 let r=run('az tuzlu olsun\nAdres doğrulandı','5 kg zeytin 500 TL EFT\naz tuzlu olsun');
 assert.equal(r.notlar,'az tuzlu olsun');assert.ok(r.sistem_notu.includes('Adres doğrulandı'));
 r=run('Ücretsiz Değişim.','5 kg zeytin\nÜcretsiz Değişim.');
 assert.equal(r.notlar,'Ücretsiz Değişim.');
 r=run('Müşteri kaydı kontrol edildi','5 kg zeytin 500 TL EFT');
 assert.equal(r.notlar,'');assert.ok(r.sistem_notu.includes('Müşteri kaydı kontrol edildi'));
 r=run('','5 kg zeytin 500 TL EFT','AI açıklaması');
 assert.equal(r.notlar,'');assert.ok(r.sistem_notu.includes('AI açıklaması'));
 console.log(id+': source notes and AI explanations remain separate');
}
