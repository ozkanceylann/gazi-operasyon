// Used by the scheduled n8n return tracker. No outbound-shipment fallbacks.
function normalizeReturn(order,response,movementResponse) {
 const fail=error=>({p_id:order.siparis_no,p_reference:order.iade_kodu,p_data:{error}});
 const rows=Array.isArray(response.body)?response.body:[response.body];
 if(response.statusCode!==200)return fail(response.statusCode===404?'DHL iade teslim alımı henüz doğrulanamadı.':'DHL iade sorgusu alınamadı; tekrar denenecek.');
 const status=rows.find(s=>s && String(s.referenceId||'')===order.iade_kodu);
 if(!status)return fail('DHL iade referansı eşleşmedi; durum değiştirilmedi.');
 const shipmentId=String(status.shipmentId||'');
 if(!/^\d{12}$/.test(shipmentId) || shipmentId===String(order.kargo_takip_kodu||'') || (order.iade_takip_kodu&&shipmentId!==order.iade_takip_kodu))return fail('DHL iade gönderisi doğrulanamadı.');
 const code=Number(status.shipmentStatusCode);
 const stages={1:'İade teslim bekliyor',2:'İade yolda',3:'İade yolda',4:'İade dağıtımda',5:'İade teslim edildi',6:'İade teslim edilemedi',7:'İade sorun',8:'İade sorun'};
 if(!stages[code])return fail('DHL iade durum kodu tanınmadı.');
 if(movementResponse.statusCode!==200 || !Array.isArray(movementResponse.body))return fail('DHL iade hareketleri alınamadı; tekrar denenecek.');
 if(movementResponse.body.some(e=>(e.referenceId&&String(e.referenceId)!==order.iade_kodu)||(e.shipmentId&&String(e.shipmentId)!==shipmentId)))return fail('İade hareketleri farklı gönderiye ait; kayıt değiştirilmedi.');
 const events=movementResponse.body.map(e=>Object.fromEntries(['eventStatus','eventDateTime','eventDateTime2','eventSequence','location','description'].filter(k=>e[k]!=null).map(k=>[k,String(e[k]).slice(0,1000)])));
 function deliveryDate(value){
  const s=String(value||'').trim();
  let iso=s;
  const tr=s.match(/^(\d{2})[./](\d{2})[./](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(tr)iso=`${tr[3]}-${tr[2]}-${tr[1]}T${tr[4]||'00'}:${tr[5]||'00'}:${tr[6]||'00'}+03:00`;
  else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)&&!/(Z|[+-]\d{2}:?\d{2})$/.test(s))iso=s.replace(' ','T')+'+03:00';
  else if(!/^\d{4}-\d{2}-\d{2}T/.test(s))return null;
  return Number.isFinite(Date.parse(iso))?new Date(iso).toISOString():null;
 }
 return {p_id:order.siparis_no,p_reference:order.iade_kodu,p_data:{shipmentId,stage:stages[code],events,deliveredAt:code===5?deliveryDate(status.deliveryDateTime):null}};
}
