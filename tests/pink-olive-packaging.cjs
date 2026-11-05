const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
for(const id of ['uohtTb9dA2r6DR3y','iKtxgMltjlt18zUW']){
const code=fs.readFileSync('n8n/system-notes/'+id+'-validator.js','utf8');
function run(products,weights,extra=''){
const source=products.join('\n')+'\n7490 tl\n'+extra;
const data={Siparis:'Evet',firma:'Gazi',musteri_ad_soyad:'Örnek Müşteri',musteri_telefon:'5550000001',adres:'Örnek mahallesi 1 sokak no 2',Sehir:'Manisa',ilce:'Akhisar',urunler:products,toplam:'7490',odeme_yontemi:'Kapıda Ödeme',kargo_adet:String(weights.split('+').length),kargo_kg:weights,notlar:'',sistem_notu:''};
return vm.runInNewContext('(function(){'+code+'})()',{$input:{all:()=>[{json:{output:JSON.stringify(data)}}]},$:()=>({item:{json:{_message_text:source,_sender_phone:'905550000002'}}})})[0].json;}
for(const [products,before,expected,extra] of [
[['20 kg pembe çizik'],'5+5+5+5','10+10',''],
[['20 kg iri uslu pembe çizik','10 kg domat kırma','10 kg siyah iri boy teneke'],'5+5+5+5+10+10','10+10+10+10','🛑toptancı siyah zeytin teneke'],
[['30 kg pembe çizik zeytin'],'5+5+5+5+5+5','10+10+10',''],
[['20 kg pembe çizik'],'5+5+5+5','5+5+5+5',"4 adet 5 kg'lık olsun"],
[['20 kg pembe çizik','10 kg siyah üzüm'],'5+5+5+5+5+5','5+5+5+5+5+5',''],
[['10 kg siyah zeytin'],'10','10','']
]){const r=run(products,before,extra);assert.equal(r.kargo_kg,expected);assert.equal(r.kargo_adet,String(expected.split('+').length));assert.equal(r.teknik_hata,false);}
console.log(id+': 6 packaging regression cases passed');
}
