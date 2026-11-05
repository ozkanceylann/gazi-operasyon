'use strict';
const MODEL='http://schemas.datacontract.org/2004/07/EInvoice.Service.Model';
function escaped(v){const s=String(v);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw Error('XML için geçersiz karakter');return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function decimal(v,places,label){const s=String(v??'');if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(s))throw Error(label+' geçersiz');const [a,b='']=s.split('.');return BigInt(a+b.padEnd(places,'0'));}
function money(n){return (n/100n)+'.'+String(n%100n).padStart(2,'0');}
function round(n,d){return (n+d/2n)/d;}
function field(name,value){
 if(Array.isArray(value))return '<ein:'+name+'>'+value.map(item=>field(item.name,item.value)).join('')+'</ein:'+name+'>';
 if(value&&typeof value==='object')return '<ein:'+name+'>'+Object.keys(value).sort().map(k=>field(k,value[k])).join('')+'</ein:'+name+'>';
 return '<ein:'+name+'>'+escaped(value)+'</ein:'+name+'>';
}
function envelope(operation,request){return '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/" xmlns:ein="'+MODEL+'"><soapenv:Header/><soapenv:Body><tem:'+operation+'><tem:request>'+Object.keys(request).sort().map(k=>field(k,request[k])).join('')+'</tem:request></tem:'+operation+'></soapenv:Body></soapenv:Envelope>';}
function taxCode(value){const s=String(value??'');if(!/^(?:\d{10}|\d{11})$/.test(s))throw Error('Alıcı ve firma VKN/TCKN bilgisi gerekli');return s;}
function required(v,label){if(typeof v!=='string'||!v.trim())throw Error(label+' gerekli');return v.trim();}
function buildInvoice(input){
 if(input.ortam!=='test')throw Error('Bu adaptör yalnızca test ortamı içindir');
 const archive=input.belge_turu==='e_arsiv';if(!archive&&input.belge_turu!=='e_fatura')throw Error('Fatura türü gerekli');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.istek_anahtari||''))throw Error('Sabit işlem anahtarı gerekli');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.tarih||'')||Number.isNaN(Date.parse(input.tarih+'T00:00:00Z'))||new Date(input.tarih+'T00:00:00Z').toISOString().slice(0,10)!==input.tarih)throw Error('Fatura tarihi geçersiz');
 if(!Array.isArray(input.kalemler)||input.kalemler.length<1||input.kalemler.length>100)throw Error('1–100 ürün satırı gerekli');
 let net=0n,vat=0n;
 const details=input.kalemler.map(line=>{
  const quantity=decimal(line.miktar,3,'Miktar'),price=decimal(line.birim_fiyat,6,'Birim fiyat'),rate=decimal(line.kdv_orani,2,'KDV oranı');
  if(quantity<=0n||price<0n||rate>10000n)throw Error('Miktar/fiyat/KDV geçersiz');
  const amount=round(quantity*price,10000000n),tax=round(amount*rate,10000n);net+=amount;vat+=tax;
  const product={ExternalProductCode:required(line.urun_kodu,'Ürün kodu'),MeasureUnit:required(line.birim,'Ölçü birimi'),ProductName:required(line.urun_adi,'Ürün adı'),UnitPrice:String(line.birim_fiyat)};
  const detail={CurrencyCode:'TRY',DiscountAmount:'0.00',DiscountRate:'0',LineExtensionAmount:money(amount),Product:product,Quantity:String(line.miktar),VATAmount:money(tax),VATRate:String(line.kdv_orani)};
  if(rate===0n){detail.TaxExemptionReason=required(line.istisna_aciklamasi,'Sıfır KDV açıklaması');detail.TaxExemptionReasonCode=required(line.istisna_kodu,'Sıfır KDV kodu');}
  return {name:archive?'ArchiveInvoiceDetail':'InvoiceDetail',value:detail};
 });
 if(input.kdv_dahil_toplam!==undefined&&decimal(input.kdv_dahil_toplam,2,'Sipariş toplamı')!==net+vat)throw Error('Satır toplamları sipariş tutarıyla uyuşmuyor');
 const buyer=input.alici||{},address={BoulevardAveneuStreetName:required(buyer.adres,'Adres'),CityName:required(buyer.sehir,'İl'),TownName:required(buyer.ilce,'İlçe')};
 const invoice={CurrencyCode:'TRY',InvoiceDate:input.tarih,InvoiceDetails:details,InvoiceType:'SATIS',Receiver:{Address:address,ReceiverName:required(buyer.ad_soyad,'Alıcı adı'),ReceiverTaxCode:taxCode(buyer.vkn_tckn)},TotalDiscountAmount:'0.00',TotalLineExtensionAmount:money(net),TotalPayableAmount:money(net+vat),TotalTaxInclusiveAmount:money(net+vat),TotalVATAmount:money(vat)};
 invoice[archive?'ExternalArchiveInvoiceCode':'ExternalInvoiceCode']=input.istek_anahtari;
 if(!archive){invoice.ScenarioType='TEMELFATURA';invoice.ReceiverInboxTag=required(input.alici_pk_etiketi,'Mükellef sorgusundan gelen alıcı posta kutusu');}
 const request={CompanyTaxCode:taxCode(input.firma_vkn)};request[archive?'ArchiveInvoices':'Invoices']=[{name:archive?'ArchiveInvoice':'Invoice',value:invoice}];
 return {operation:archive?'SendArchiveInvoice':'SendInvoice',xml:envelope(archive?'SendArchiveInvoice':'SendInvoice',request),totals:{ara_toplam:money(net),kdv_toplami:money(vat),genel_toplam:money(net+vat)},external_code:input.istek_anahtari};
}
function getTaxPayer(vkn){return {operation:'GetTaxPayer',xml:envelope('GetTaxPayer',{TaxPayerTaxCode:taxCode(vkn)})};}
module.exports={buildInvoice,getTaxPayer};
