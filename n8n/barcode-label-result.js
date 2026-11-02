function gaziReadLabels(raw) {
 if(!raw)return [];
 const value=String(raw).trim();
 let parsed;
 try {
  if(value.startsWith('[')) parsed=JSON.parse(value);
  else {
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4)throw Error('Base64 biçimi geçersiz');
   const bytes=Buffer.from(value,'base64');
   if(bytes.toString('base64')!==value)throw Error('Base64 doğrulanamadı');
   parsed=JSON.parse(bytes.toString('utf8'));
  }
 } catch {throw Error('Kayıtlı paket etiketi okunamadı; yeni DHL barkodu oluşturulmadı.');}
 if(!Array.isArray(parsed))throw Error('Kayıtlı etiket listesi geçersiz.');
 return parsed;
}
function gaziValidateLabels(labels,count) {
 return labels.length===count&&new Set(labels.map(x=>x.barcode)).size===count&&labels.every(x=>typeof x.barcode==='string'&&x.barcode.length>0&&typeof x.value==='string'&&x.value.startsWith('^XA')&&(x.value.match(/\^XA/g)||[]).length===1&&(x.value.match(/\^XZ/g)||[]).length===1);
}

const input=$input.first().json;
if(input.pdf_base64){
 if(typeof input.pdf_base64!=='string'||!input.pdf_base64.startsWith('JVBER'))throw Error('Etiket PDF dönüşümü başarısız; kayıtlı barkodlar korunuyor.');
 const s=$('Barkod Etiket · Etiket Siparişini Oku').first().json;
 return[{json:{success:true,environment:'production',siparis_no:s.siparis_no,kargo_adet:Number(s.kargo_adet),kargo_takip_kodu:s.kargo_takip_kodu,pdf_base64:input.pdf_base64,labelType:'shipment',stage:'labels_ready',message:'Kayıtlı Base64 etiketi PDF olarak açıldı.'}}];
}
const saved=input;const sourceOrder=$('Barkod Etiket · Etiket Siparişini Oku').first().json;if(String(saved.kargo_siparis_no)!==String(sourceOrder.kargo_siparis_no)||String(saved.orderinvoiceid)!==String(sourceOrder.orderinvoiceid))throw Error('Gönderi etiket işlemi sırasında değişti. Güncel kaydı yeniden açın.');
if(!saved.siparis_no||!saved.kargo_takip_kodu||!['Kargolandı','Tamamlandı','İade'].includes(saved.kargo_durumu)||!gaziValidateLabels(gaziReadLabels(saved.kargo_zpl),Number(saved.kargo_adet)))throw Error('Base64 paket etiketi veritabanından doğrulanamadı; mevcut DHL gönderisi korunuyor.');
return[{json:{success:true,environment:'production',siparis_no:saved.siparis_no,kargo_adet:Number(saved.kargo_adet),kargo_takip_kodu:saved.kargo_takip_kodu,label_saved:true,readyToPrint:true,labelFormat:'zpl-base64',stage:'labels_saved',message:'Paket etiketleri kaydedildi. Etiketi Yazdır düğmesini kullanabilirsiniz.'}}];