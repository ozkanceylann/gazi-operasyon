const r=$input.first().json,b=Array.isArray(r.body)?r.body:[r.body];
if(Number(r.statusCode)!==200||!b[0]?.shipmentId){
 const body=b[0],error=body?.error||r.error;
 const code=error?.Code||error?.code||r.statusCode||'yanıt yok';
 const detail=error?.Description||error?.description||error?.Message||error?.message||
   body?.message||body?.title||(typeof error==='string'?error:'')||
   (typeof body==='string'?body.trim():'');
 const fallback=Number(r.statusCode)>=500?'DHL etiket servisi sunucu hatası verdi; hata açıklaması göndermedi. Etiket kaydedilmedi.':
   'DHL geçerli gönderi etiketi döndürmedi. Etiket kaydedilmedi.';
 throw new Error('DHL '+String(code)+': '+String(detail||fallback).slice(0,700));
}
const sourceOrder=$('Barkod Etiket · Etiket Siparişini Oku').first().json;if(b.some(x=>String(x.referenceId||'')!==String(sourceOrder.kargo_siparis_no||''))||new Set(b.map(x=>String(x.shipmentId))).size!==1)throw Error('DHL etiketi güncel gönderi referansıyla eşleşmiyor; eski etiket kaydedilmedi.');const labels=b.flatMap(x=>x.barcodes||[]).sort((a,b)=>a.pieceNumber-b.pieceNumber),count=$('Barkod Etiket · Etiket Kontrol').first().json.count;if(labels.length!==count||new Set(labels.map(x=>x.barcode)).size!==count||labels.some(x=>!(x.value?.startsWith('^XA') && (x.value.match(/\^XA/g)||[]).length===1)))throw new Error('Paket etiketi sayısı veya barkodları geçersiz; eksik etiket çoğaltılmadı.');return [{json:{zpl:labels.map(x=>x.value).join('\n'),labels,result:b}}];