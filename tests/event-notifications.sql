BEGIN;
DO $qa$
DECLARE o public.gazi_siparisler;q public.gazi_wp_outbox;first_request bigint;n int;res jsonb;
BEGIN
 SELECT * INTO o FROM public.gazi_siparisler WHERE "shipmentStatusCode"=1 AND "isDelivered" IS NOT TRUE AND kargo_durumu NOT IN('İptal','Silindi','İade','Tamamlandı') AND kargo_takip_kodu ~ '^[0-9]{12}$' AND public.seller_normalize_phone(musteri_tel) IS NOT NULL LIMIT 1 FOR UPDATE;
 ASSERT o.siparis_no IS NOT NULL,'Hazırlandı test kaydı bulunamadı';
 SELECT count(*) INTO n FROM public.gazi_wp_outbox WHERE order_no=o.siparis_no::text AND NOT is_test;
 UPDATE public.gazi_siparisler SET kargo_api_yanit=kargo_api_yanit WHERE siparis_no=o.siparis_no;
 ASSERT (SELECT count(*) FROM public.gazi_wp_outbox WHERE order_no=o.siparis_no::text AND NOT is_test)=n,'Değişmeyen hareket yeni bildirim açtı';
 UPDATE public.gazi_siparisler SET "shipmentStatusCode"=2 WHERE siparis_no=o.siparis_no;
 SELECT * INTO q FROM public.gazi_wp_outbox WHERE order_no=o.siparis_no::text AND shipment_id=o.kargo_takip_kodu AND stage=2 AND NOT is_test;
 ASSERT q.id IS NOT NULL AND q.status='pending' AND q.dispatch_request_id IS NOT NULL,'Aşama değişimi olayı oluşturulmadı';
 first_request:=q.dispatch_request_id;
 ASSERT EXISTS(SELECT 1 FROM net.http_request_queue WHERE id=first_request AND url='https://n8n.ozkanceylan.uk/webhook/gazi-kargo-bildirim' AND convert_from(body,'UTF8')::jsonb=jsonb_build_object('outbox_id',q.id)),'Olay doğru webhooka iletilmedi';
 UPDATE public.gazi_siparisler SET "shipmentStatusCode"=2,kargo_api_yanit=kargo_api_yanit WHERE siparis_no=o.siparis_no;
 ASSERT (SELECT dispatch_request_id FROM public.gazi_wp_outbox WHERE id=q.id)=first_request,'Aynı hareket yeniden olay oluşturdu';
 ASSERT (SELECT count(*) FROM public.gazi_wp_claim(q.id))=1,'Tek kaydı kilitleme başarısız';
 ASSERT NOT EXISTS(SELECT 1 FROM public.gazi_wp_claim(q.id)),'Aynı olay ikinci kez kilitlendi';
 PERFORM public.gazi_wp_finish(q.id,'ROLLBACK_QA_ONLY','Test; gönderim yapılmadı',NULL);
 UPDATE public.gazi_siparisler SET "shipmentStatusCode"=2 WHERE siparis_no=o.siparis_no;
 ASSERT (SELECT status FROM public.gazi_wp_outbox WHERE id=q.id)='sent','Tek seferlik kayıt korunmadı';
 ASSERT (SELECT dispatch_request_id FROM public.gazi_wp_outbox WHERE id=q.id)=first_request,'Gönderilmiş aşama tekrar tetiklendi';
 ASSERT NOT EXISTS(SELECT 1 FROM public.mobile_order_claim(NULL)),'Mobil boş kimlikle kuyruk taradı';
 ASSERT NOT EXISTS(SELECT 1 FROM public.gazi_wp_claim(NULL::uuid)),'Kargo boş kimlikle kuyruk taradı';
 ASSERT NOT has_function_privilege('authenticated','public.gazi_wp_claim(uuid)','execute'),'İstemci bildirim kilitleyebiliyor';
END $qa$;
SELECT 'PASS: unchanged update silent, changed stage emits exactly one event, target-only claim, duplicate suppressed, sent stage not replayed, no null-id scanning, service-only claim' result;
ROLLBACK;
