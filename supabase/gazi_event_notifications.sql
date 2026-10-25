ALTER TABLE public.gazi_wp_outbox ADD COLUMN IF NOT EXISTS dispatch_request_id bigint, ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
CREATE OR REPLACE FUNCTION public.gazi_wp_claim(p_id uuid)
 RETURNS SETOF gazi_wp_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q public.gazi_wp_outbox;p jsonb;cfg gazi_notify.settings;r text;reason text;
BEGIN
 SELECT * INTO cfg FROM gazi_notify.settings WHERE id=true;
 IF NOT cfg.enabled OR p_id IS NULL THEN RETURN;END IF;
 UPDATE public.gazi_wp_outbox SET status='review',last_error='Gönderim sonucu belirsiz; otomatik tekrar yapılmadı.' WHERE id=p_id AND status='sending' AND claimed_at<now()-interval '10 minutes';
 FOR q IN SELECT x.* FROM public.gazi_wp_outbox x WHERE x.id=p_id AND x.status='pending' AND x.is_test=cfg.test_mode ORDER BY x.created_at,x.stage LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
 p:=NULL;reason:=NULL;
 IF q.is_test THEN SELECT to_jsonb(t) INTO p FROM public.gazi_wp_test_orders t WHERE t.siparis_no=q.order_no;
 ELSE SELECT to_jsonb(t)-'kargo_kg'-'zpl_base64'-'kargo_zpl' INTO p FROM public.gazi_siparisler t WHERE t.siparis_no=q.order_no::int; END IF;
 r:=regexp_replace(coalesce(p->>'musteri_tel',''),'[^0-9]','','g');
 IF r ~ '^05[0-9]{9}$' THEN r:='9'||r;ELSIF r ~ '^5[0-9]{9}$' THEN r:='90'||r;ELSIF r ~ '^00905[0-9]{9}$' THEN r:=substr(r,3);END IF;
 IF p IS NULL THEN reason:='Sipariş artık mevcut değil';
 ELSIF p->>'kargo_takip_kodu' IS DISTINCT FROM q.shipment_id THEN reason:='Gönderi değişmiş';
 ELSIF (p->>'shipmentStatusCode')::int IS DISTINCT FROM q.stage THEN reason:='Aşama değişmiş; eski bildirim gönderilmedi';
 ELSIF p->>'kargo_durumu' IN('İptal','Silindi','İade','Tamamlandı') OR coalesce((p->>'isDelivered')::boolean,false) THEN reason:='Gönderi iptal/iade/teslim edilmiş';
 ELSIF r !~ '^905[0-9]{9}$' OR (q.is_test AND r<>'905079970697') THEN reason:='Alıcı telefonu doğrulanamadı';
 ELSIF nullif(btrim(p->>'ad_soyad'),'') IS NULL THEN reason:='Alıcı adı eksik';
 ELSIF coalesce(p->>'kargo_adet','') !~ '^[0-9]+([[:space:]]*[+][[:space:]]*[0-9]+)*$' THEN reason:='Parça adedi doğrulanamadı';
 END IF;
 IF reason IS NOT NULL THEN UPDATE public.gazi_wp_outbox SET status='review',last_error=reason WHERE id=q.id;CONTINUE;END IF;
 UPDATE public.gazi_wp_outbox SET status='sending',claimed_at=now(),payload=p,recipient=r WHERE id=q.id RETURNING * INTO q;
 RETURN NEXT q;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.gazi_wp_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gazi_wp_claim(uuid) TO service_role;
CREATE OR REPLACE FUNCTION gazi_notify.dispatch_changed_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $fn$
DECLARE req bigint;cfg gazi_notify.settings;
BEGIN
 IF NEW.is_test OR NEW.status<>'pending' THEN RETURN NEW; END IF;
 SELECT * INTO cfg FROM gazi_notify.settings WHERE id=true;
 IF NOT cfg.enabled OR cfg.test_mode THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.payload IS NOT DISTINCT FROM OLD.payload AND NEW.recipient IS NOT DISTINCT FROM OLD.recipient THEN RETURN NEW;END IF;
 END IF;
 req:=net.http_post(url:='https://n8n.ozkanceylan.uk/webhook/gazi-kargo-bildirim',
  body:=jsonb_build_object('outbox_id',NEW.id),
  headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000);
 UPDATE public.gazi_wp_outbox SET dispatch_request_id=req,dispatched_at=now(),last_error=NULL WHERE id=NEW.id;
 RETURN NEW;
EXCEPTION WHEN others THEN
 UPDATE public.gazi_wp_outbox SET last_error='Bildirim olayı tetiklenemedi: '||left(SQLERRM,300) WHERE id=NEW.id;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION gazi_notify.dispatch_changed_notification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER gazi_wp_dispatch_on_change AFTER INSERT OR UPDATE OF payload,recipient ON public.gazi_wp_outbox
 FOR EACH ROW EXECUTE FUNCTION gazi_notify.dispatch_changed_notification();
CREATE OR REPLACE FUNCTION mobile_intake.claim(p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,message text,seller_phone text,claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF p_id IS NULL THEN RETURN;END IF;
 UPDATE mobile_intake.requests SET status='failed',result_message='İşlem zaman aşımına uğradı. Mesajı yeniden gönderebilirsiniz.'
 WHERE mobile_intake.requests.id=p_id AND status='processing' AND claimed_at<now()-interval '5 minutes';
 RETURN QUERY WITH picked AS (
  SELECT r.id FROM mobile_intake.requests r WHERE r.status='pending' AND r.id=p_id FOR UPDATE SKIP LOCKED
 ) UPDATE mobile_intake.requests r SET status='processing',claimed_at=now(),claim_token=gen_random_uuid()
 FROM picked WHERE r.id=picked.id RETURNING r.id,r.message,r.seller_phone,r.claim_token;
END $fn$;
