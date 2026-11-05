(function(root){
  const pending=new Set();
  function amounts(row){if(row?.genel_toplam==null||row?.ara_toplam==null||row?.kdv_toplami==null)return '';const f=new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});return 'Matrah: '+f.format(row.ara_toplam)+' TL · KDV (%1): '+f.format(row.kdv_toplami)+' TL · Toplam: '+f.format(row.genel_toplam)+' TL';}
  const endpoint='https://n8n.ozkanceylan.uk/webhook/gazi-isnet-fatura-test';
  function eligible(order,options){
    return options?.isAdmin===true&&options.table==='gazi_siparisler'&&
      !['İptal','Silindi','İade'].includes(order?.kargo_durumu)&&
      (order?.kargo_durumu==='Tamamlandı'||order?.isDelivered===true||Number(order?.shipmentStatusCode)===5);
  }
  function markup(order,options){
    if(!eligible(order,options))return '';
    return '<section class="detail-group order-invoice" data-order-invoice><div class="detail-title">Fatura <small>İşNet · Test ortamı</small></div><button type="button" class="btn-primary" data-invoice-open>Fatura kes</button><div data-invoice-panel hidden><p>Kayıtlı satış tutarı KDV dahildir; %1 KDV tutarın içinden ayrılır. Bu aşamada test taslağı kaydedilir ve İşNet bağlantısı kontrol edilir. Fatura gönderimi henüz etkin değil.</p><button type="button" class="btn-secondary" data-invoice-test>Test taslağını hazırla ve bağlantıyı kontrol et</button><p data-invoice-status role="status" aria-live="polite"></p></div></section>';
  }
  function mount(db,order,container,options){
    const section=container.querySelector('[data-order-invoice]');if(!section||!eligible(order,options))return;
    const open=section.querySelector('[data-invoice-open]'),panel=section.querySelector('[data-invoice-panel]');
    const run=section.querySelector('[data-invoice-test]'),status=section.querySelector('[data-invoice-status]');
    let opened=false;run.disabled=pending.has(order.siparis_no);
    open.onclick=async()=>{
      panel.hidden=!panel.hidden;if(panel.hidden||opened)return;opened=true;
      status.textContent='Fatura kaydı kontrol ediliyor…';
      try{
        const {data,error}=await db.from('gazi_faturalar').select('id,durum,fatura_no,son_hata,son_sorgu_at,ara_toplam,kdv_toplami,genel_toplam').eq('siparis_no',order.siparis_no).eq('ortam','test').neq('durum','iptal').maybeSingle();
        if(error)throw error;
        status.textContent=data?'Kayıt durumu: '+data.durum+(data.fatura_no?' · '+data.fatura_no:'')+(data.son_hata?' · '+data.son_hata:''):'Henüz test taslağı oluşturulmadı.';
        if(data&&amounts(data))status.textContent+=' · '+amounts(data);
        if(data&&!['taslak','hata'].includes(data.durum))run.disabled=true;
      }catch(error){status.textContent=error.message||'Fatura kaydı okunamadı.';opened=false;}
    };
    run.onclick=async()=>{
      if(run.disabled||pending.has(order.siparis_no))return;
      pending.add(order.siparis_no);run.disabled=true;status.textContent='Test taslağı hazırlanıyor, İşNet bağlantısı kontrol ediliyor…';
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
      try{
        const {data,error}=await db.auth.getSession();if(error)throw error;
        const accessToken=data?.session?.access_token;if(!accessToken)throw Error('Oturum gerekli. Yeniden giriş yapın.');
        const response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({siparis_no:String(order.siparis_no),ortam:'test',accessToken,publicKey:options.publicKey}),signal:controller.signal});
        let result;try{result=JSON.parse(await response.text());}catch{throw Error('Fatura servisi geçerli yanıt döndürmedi. n8n bağlantısını kontrol edin.');}
        if(!response.ok||result.success!==true||result.ortam!=='test')throw Error(result.message||'Test işlemi tamamlanamadı. n8n bağlantısını ve oturumunuzu kontrol edin.');
        status.textContent=result.message+(amounts(result)?' · '+amounts(result):'');
      }catch(error){status.textContent=error.name==='AbortError'?'İstek zaman aşımına uğradı. Tekrar denemeden önce kayıt durumunu kontrol edin.':error.message||'Fatura test bağlantısına ulaşılamadı.';}
      finally{clearTimeout(timer);pending.delete(order.siparis_no);run.disabled=false;}
    };
  }
  root.OrderInvoices={eligible,markup,mount};
})(window);
