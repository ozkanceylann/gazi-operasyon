/* The database is authoritative; this module only displays the current control state. */
const ShippingApproval=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function load(db,orders){
  for(const o of orders){delete o.shippingControl;o.shippingControlError=false;}
  try{
   for(let i=0;i<orders.length;i+=100){const batch=orders.slice(i,i+100);const {data,error}=await db.rpc('gazi_shipping_status',{p_ids:batch.map(o=>Number(o.siparis_no))});if(error)throw error;
    for(const o of batch){o.shippingControl=data?.find(s=>s.order_id===Number(o.siparis_no));if(!o.shippingControl)throw Error('Onay durumu alınamadı.');}
   }
  }catch{for(const o of orders)o.shippingControlError=true;}
 }
 function badge(o){
  const s=o.shippingControl;if(o.shippingControlError)return '<span class="shipping-control-badge shipping-control-badge--blocked">⚠️ Kargo onayı kontrol edilemedi</span>';
  if(!s)return '';
  const labels=[];if(s.mobile)labels.push('📱 Mobil sipariş');if(s.free)labels.push('🎁 Ücretsiz sipariş');
  if(!s.can_ship)return `<span class="shipping-control-badge shipping-control-badge--blocked" title="${esc(s.reasons.join(' '))}">🔒 ${esc(labels.length?labels.join(' · ')+' · ':'')}Onay / dekont bekliyor</span>`;
  return s.approval_required||s.eft?'<span class="shipping-control-badge">✅ Kargo kontrolü tamam</span>':'';
 }
 function markup(o){return `<section class="shipping-control" data-shipping-control="${Number(o.siparis_no)}" aria-live="polite"><p>⏳ Kargo onayı kontrol ediliyor…</p></section>`;}
 async function mount(db,o,root,onChange=()=>{}){
  const panel=root.querySelector(`[data-shipping-control="${Number(o.siparis_no)}"]`);if(!panel)return;
  async function refresh(){await load(db,[o]);if(!panel.isConnected)return;
   const s=o.shippingControl;
   panel.innerHTML=`<h3>🔐 Kargoya gönderim kontrolü</h3>${badge(o)}${s&&!s.can_ship?`<ul>${s.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:''}${s?.approval_required&&!s.approved?'<button type="button" class="btn-brand" data-shipping-approve>✅ İnceledim · Operasyon onayı ver</button><p class="shipping-control-hint">Müşteri, adres, ürün, paket ve ödeme bilgilerini kontrol ederek onaylayın.</p>':''}${s?.approved?'<p>✅ Gazi Operasyon onayı verildi.</p>':''}<p data-shipping-message role="status"></p>`;
   const cargo=document.getElementById('btnCargo');if(cargo){cargo.disabled=!s?.can_ship;cargo.title=s?.can_ship?'':s?.reasons?.join(' ')||'Onay durumu alınamadı.';}
   const button=panel.querySelector('[data-shipping-approve]');if(button)button.onclick=async()=>{
    if(!confirm('Müşteri, adres, ürün, paket ve ödeme bilgilerini kontrol ettiniz mi? Bu siparişe Gazi Operasyon onayı verilsin mi?'))return;
    button.disabled=true;const message=panel.querySelector('[data-shipping-message]');
    try{const {error}=await db.rpc('gazi_shipping_approve',{p_id:Number(o.siparis_no),p_fingerprint:s.fingerprint});if(error)throw error;await refresh();await onChange();}catch(error){message.textContent=error.message;button.disabled=false;}
   };
  }
  await refresh();
 }
 async function assert(db,id){const {data,error}=await db.rpc('gazi_shipping_authorize',{p_id:Number(id)});if(error)throw error;if(Number(data?.siparis_no)!==Number(id))throw Error('Kargo onayı doğrulanamadı.');return data;}
 return {load,badge,markup,mount,assert};
})();
