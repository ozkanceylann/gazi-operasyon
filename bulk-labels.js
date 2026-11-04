// Sequential preparation: no print counters are changed here.
export async function prepareBulkLabels(ids,{PDFLib,fetchLabel,decorate,onProgress=()=>{},isCancelled=()=>false}){
  const merged=await PDFLib.PDFDocument.create(),orders=[],failed=[];
  const unique=[...new Set(ids.map(Number))];
  for(let i=0;i<unique.length;i++){
    if(isCancelled())throw Error('Toplu etiket penceresi kapatıldı. Sayaçlar değiştirilmedi.');
    const id=unique[i];onProgress(i,unique.length,id);
    try{
      const {order,base64}=await fetchLabel(id);
      if(isCancelled())throw Error('Pencere kapatıldı.');
      if(!base64?.startsWith('JVBER'))throw Error('Geçerli etiket PDF’si alınamadı.');
      const bytes=await decorate(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),order);
      const source=await PDFLib.PDFDocument.load(bytes);
      const count=Number(order.kargo_adet);
      if(!Number.isSafeInteger(count)||count<1||source.getPageCount()!==count)throw Error('PDF sayfa sayısı ile paket adedi uyuşmuyor.');
      const pages=await merged.copyPages(source,source.getPageIndices());
      pages.forEach(page=>merged.addPage(page));orders.push(order);
    }catch(error){failed.push({id,message:error.message||'Etiket hazırlanamadı.'});}
    onProgress(i+1,unique.length,id);
  }
  if(isCancelled())throw Error('Toplu etiket penceresi kapatıldı. Sayaçlar değiştirilmedi.');
  return {orders,failed,pageCount:merged.getPageCount(),bytes:orders.length?await merged.save():null};
}

// Idempotent confirmation; successful rows are removed before a retry.
export async function confirmBulkLabels(pending,save){
  const remaining=[],errors=[];
  for(const order of pending){
    try{await save(order);}catch(error){remaining.push(order);errors.push({id:order.siparis_no,message:error.message||'Sayaç kaydedilemedi.'});}
  }
  return {remaining,errors};
}
