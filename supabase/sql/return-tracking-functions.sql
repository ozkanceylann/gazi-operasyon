CREATE OR REPLACE FUNCTION public.gazi_iade_internal(p_operation text, p_id integer, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.gazi_siparisler; r public.gazi_iade_islemleri; ref text; link text; config jsonb;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Sunucu yetkisi gerekli'; end if;
  select * into o from public.gazi_siparisler where siparis_no=p_id for update;
  if not found or o.kargo_durumu in ('İptal','Silindi') then raise exception 'Sipariş bulunamadı'; end if;
  select * into r from public.gazi_iade_islemleri where siparis_no=p_id for update;
  if p_operation='begin' then
    if nullif(o.iade_etiket_url,'') is not null then
      return jsonb_build_object('existing',true,'reference',o.iade_kodu,'url',o.iade_etiket_url);
    end if;
    if r.status in ('creating','uncertain') then raise exception 'İade isteğinin sonucu bekleniyor. Tekrar kayıt açılmadı; DHL kaydı kontrol edilmeli.'; end if;
    if not coalesce(o."isDelivered",false) and coalesce(o."shipmentStatusCode",0)<>5 then raise exception 'İade etiketi yalnızca teslim edilmiş siparişe oluşturulur'; end if;
    if nullif(trim(o.ad_soyad),'') is null or nullif(trim(o.adres),'') is null
      or nullif(trim(o.sehir),'') is null or nullif(trim(o.ilce),'') is null
      or nullif(trim(o.musteri_tel),'') is null or nullif(trim(o.sehir_kodu),'') is null
      or nullif(trim(o.ilce_kodu),'') is null then raise exception 'İade için müşteri, telefon, adres ve şehir/ilçe kodları eksiksiz olmalı'; end if;
    select jsonb_build_object('url','https://n8n.ozkanceylan.uk/webhook/gazi_iade_olustur','key',server_key) into config from gazi_carrier_private.return_connection where id=1;
    if nullif(config->>'url','') is null or nullif(config->>'key','') is null then raise exception 'DHL iade bağlantısı ayarlanmamış'; end if;
    ref:=coalesce(r.reference_id,'GZI-'||p_id||'-R1');
    insert into public.gazi_iade_islemleri(siparis_no,reference_id,status)
      values(p_id,ref,'creating') on conflict(siparis_no) do update set status='creating',error=null,updated_at=now();
    return jsonb_build_object('existing',false,'order',to_jsonb(o),'reference',ref,'gateway',config);
  elsif p_operation='finish' then
    if r.reference_id is null or p_data->>'reference' is distinct from r.reference_id then raise exception 'İade referansı eşleşmedi'; end if;
    link:=p_data->>'url';
    if link !~ '^https://mn[.]tc[/]?[?]rtnid=[A-Za-z0-9]+$' then raise exception 'DHL iade fişi bağlantısı geçersiz'; end if;
    update public.gazi_iade_islemleri set status='ready',label_url=link,response=p_data->'response',error=null,updated_at=now() where siparis_no=p_id;
    update public.gazi_siparisler set iade_kodu=r.reference_id,iade_etiket_url=link,iade_durumu='İade teslim bekliyor',iade_tarihi=now(),iade_hareketleri=jsonb_build_array(jsonb_build_object('eventStatus','İade teslim bekliyor','eventDateTime',now(),'description','İade fişi oluşturuldu. DHL teslim alımı bekleniyor.')) where siparis_no=p_id;
    return jsonb_build_object('reference',r.reference_id,'url',link);
  elsif p_operation in ('failed','uncertain') then
    update public.gazi_iade_islemleri set status=p_operation,error=left(p_data->>'error',500),updated_at=now() where siparis_no=p_id and status<>'ready';
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Geçersiz iade işlemi';
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_orders(p_filter text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb; phone text:=null;
begin
 if not public.seller_is_gazi_admin() then raise exception 'Yönetici erişimi gerekli.' using errcode='42501'; end if;
 if p_filter not in ('all','pending','prepared','shipped','in_transit','arrived','distribution','delivered','undelivered','support','returning','problem','cancelled','return_label','handover','cargo_prepared','cargo_transit','cargo_returns') or p_offset<0 then raise exception 'Geçersiz filtre.'; end if;
 with owned as materialized (
 select case when trim(o.kargo_adet) ~ '^[0-9]{1,9}$' then trim(o.kargo_adet)::bigint else 0 end as parcel_count,iade_teslim_tarihi,iade_tarihi,siparis_no,"shipmentStatusCode" as carrier_code,translate(lower(replace(coalesce("shipmentStatus",''),'_',' ')),'ışğüöç','isguoc') as carrier_text,coalesce(bolunme_ana_siparis_no,siparis_no) as split_sort,coalesce(o.kargo_durumu='Kargolandı' AND o."isDelivered" IS NOT TRUE AND (o."shipmentStatusCode" IS NULL OR o."shipmentStatusCode"=1) AND coalesce(o."shipmentStatus",'') IN ('','Gönderi_Hazırlandı','Gönderi Hazırlandı','DHL sipariş kaydı oluşturuldu; barkod bekleniyor') AND (coalesce(o.kargo_zpl,'')<>'' OR o.zpl_base64 LIKE 'JVBER%'),false) as awaiting_handover,nullif(trim(iade_kodu),'') is not null as has_return_label,case when trim(coalesce(p_search,''))='' then null else concat_ws(' ',siparis_no,ad_soyad,musteri_tel,sehir,ilce,kargo_takip_kodu,urun_bilgisi,iade_kodu) end as search_text,public.seller_order_phase(kargo_durumu,"isDelivered","shipmentStatusCode","shipmentStatus",teslimat_aciklama,notlar) as s from public.gazi_siparisler o where coalesce(kargo_durumu,'')<>'Silindi'
 ), filtered as (select * from owned where (p_filter='all' or (p_filter='cargo_returns' and (has_return_label or s='returning')) or (p_filter='cargo_prepared' and (s='prepared' or (s='shipped' and (awaiting_handover or carrier_code=1 or (carrier_code is null and carrier_text in ('','gonderi hazirlandi','dhl siparis kaydi olusturuldu; barkod bekleniyor')))))) or (p_filter='cargo_transit' and s in ('shipped','arrived') and (carrier_code in (2,3) or carrier_text ~ '(transfer|transit|yolda|varis)')) or (p_filter='handover' and awaiting_handover) or (p_filter='return_label' and has_return_label) or s=p_filter or (p_filter='problem' and s in ('undelivered','support')) or (p_filter='in_transit' and s in ('shipped','arrived','distribution'))) and (trim(coalesce(p_search,''))='' or search_text ilike '%'||left(p_search,100)||'%')),
 page as (select o from public.gazi_siparisler o join (select siparis_no from filtered order by case when p_filter in ('return_label','cargo_returns') then (iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce(iade_teslim_tarihi,iade_tarihi) end desc nulls last,split_sort desc,siparis_no asc offset p_offset limit 30) f using(siparis_no) order by case when p_filter in ('return_label','cargo_returns') then (o.iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce(o.iade_teslim_tarihi,o.iade_tarihi) end desc nulls last,coalesce(o.bolunme_ana_siparis_no,o.siparis_no) desc,o.siparis_no asc)
 select jsonb_build_object('phone',phone,'counts',(select jsonb_build_object('all',count(*),'all_parcels',coalesce(sum(parcel_count),0),'handover',count(*) filter(where awaiting_handover),'handover_parcels',coalesce(sum(parcel_count) filter(where awaiting_handover),0),'return_label',count(*) filter(where has_return_label),'return_label_parcels',coalesce(sum(parcel_count) filter(where has_return_label),0),'pending',count(*) filter(where s='pending'),'pending_parcels',coalesce(sum(parcel_count) filter(where s='pending'),0),'prepared',count(*) filter(where s='prepared'),'prepared_parcels',coalesce(sum(parcel_count) filter(where s='prepared'),0),'shipped',count(*) filter(where s='shipped'),'shipped_parcels',coalesce(sum(parcel_count) filter(where s='shipped'),0),'delivered',count(*) filter(where s='delivered'),'delivered_parcels',coalesce(sum(parcel_count) filter(where s='delivered'),0),'problem',count(*) filter(where s in ('undelivered','support')),'problem_parcels',coalesce(sum(parcel_count) filter(where s in ('undelivered','support')),0),'arrived',count(*) filter(where s='arrived'),'arrived_parcels',coalesce(sum(parcel_count) filter(where s='arrived'),0),'distribution',count(*) filter(where s='distribution'),'distribution_parcels',coalesce(sum(parcel_count) filter(where s='distribution'),0),'undelivered',count(*) filter(where s='undelivered'),'undelivered_parcels',coalesce(sum(parcel_count) filter(where s='undelivered'),0),'support',count(*) filter(where s='support'),'support_parcels',coalesce(sum(parcel_count) filter(where s='support'),0),'returning',count(*) filter(where s='returning'),'returning_parcels',coalesce(sum(parcel_count) filter(where s='returning'),0),'cancelled',count(*) filter(where s='cancelled'),'cancelled_parcels',coalesce(sum(parcel_count) filter(where s='cancelled'),0)) from owned),'total',(select count(*) from filtered),'orders',coalesce((select jsonb_agg(public.seller_order_safe(o) || jsonb_build_object('seller_phone',public.seller_owner_phone((o).siparis_alan,(o).siparis_tel)) order by case when p_filter in ('return_label','cargo_returns') then ((o).iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce((o).iade_teslim_tarihi,(o).iade_tarihi) end desc nulls last,coalesce((o).bolunme_ana_siparis_no,(o).siparis_no) desc,(o).siparis_no asc) from page),'[]'::jsonb)) into result;
 return result;
end; $function$
;
CREATE OR REPLACE FUNCTION public.seller_orders(p_filter text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb; phone text:=public.seller_current_phone();
begin
 if phone is null then raise exception 'Satıcı oturumu gerekli.' using errcode='42501'; end if;
 if p_filter not in ('all','pending','prepared','shipped','in_transit','arrived','distribution','delivered','undelivered','support','returning','problem','cancelled','return_label','handover','cargo_prepared','cargo_transit','cargo_returns') or p_offset<0 then raise exception 'Geçersiz filtre.'; end if;
 with owned as materialized (
 select case when trim(o.kargo_adet) ~ '^[0-9]{1,9}$' then trim(o.kargo_adet)::bigint else 0 end as parcel_count,iade_teslim_tarihi,iade_tarihi,siparis_no,"shipmentStatusCode" as carrier_code,translate(lower(replace(coalesce("shipmentStatus",''),'_',' ')),'ışğüöç','isguoc') as carrier_text,coalesce(bolunme_ana_siparis_no,siparis_no) as split_sort,coalesce(o.kargo_durumu='Kargolandı' AND o."isDelivered" IS NOT TRUE AND (o."shipmentStatusCode" IS NULL OR o."shipmentStatusCode"=1) AND coalesce(o."shipmentStatus",'') IN ('','Gönderi_Hazırlandı','Gönderi Hazırlandı','DHL sipariş kaydı oluşturuldu; barkod bekleniyor') AND (coalesce(o.kargo_zpl,'')<>'' OR o.zpl_base64 LIKE 'JVBER%'),false) as awaiting_handover,nullif(trim(iade_kodu),'') is not null as has_return_label,case when trim(coalesce(p_search,''))='' then null else concat_ws(' ',siparis_no,ad_soyad,musteri_tel,sehir,ilce,kargo_takip_kodu,urun_bilgisi,iade_kodu) end as search_text,public.seller_order_phase(kargo_durumu,"isDelivered","shipmentStatusCode","shipmentStatus",teslimat_aciklama,notlar) as s from public.gazi_siparisler o where public.seller_owner_phone(siparis_alan,siparis_tel)=phone and coalesce(kargo_durumu,'')<>'Silindi'
 ), filtered as (select * from owned where (p_filter='all' or (p_filter='cargo_returns' and (has_return_label or s='returning')) or (p_filter='cargo_prepared' and (s='prepared' or (s='shipped' and (awaiting_handover or carrier_code=1 or (carrier_code is null and carrier_text in ('','gonderi hazirlandi','dhl siparis kaydi olusturuldu; barkod bekleniyor')))))) or (p_filter='cargo_transit' and s in ('shipped','arrived') and (carrier_code in (2,3) or carrier_text ~ '(transfer|transit|yolda|varis)')) or (p_filter='handover' and awaiting_handover) or (p_filter='return_label' and has_return_label) or s=p_filter or (p_filter='problem' and s in ('undelivered','support')) or (p_filter='in_transit' and s in ('shipped','arrived','distribution'))) and (trim(coalesce(p_search,''))='' or search_text ilike '%'||left(p_search,100)||'%')),
 page as (select o from public.gazi_siparisler o join (select siparis_no from filtered order by case when p_filter in ('return_label','cargo_returns') then (iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce(iade_teslim_tarihi,iade_tarihi) end desc nulls last,split_sort desc,siparis_no asc offset p_offset limit 30) f using(siparis_no) order by case when p_filter in ('return_label','cargo_returns') then (o.iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce(o.iade_teslim_tarihi,o.iade_tarihi) end desc nulls last,coalesce(o.bolunme_ana_siparis_no,o.siparis_no) desc,o.siparis_no asc)
 select jsonb_build_object('phone',phone,'counts',(select jsonb_build_object('all',count(*),'all_parcels',coalesce(sum(parcel_count),0),'handover',count(*) filter(where awaiting_handover),'handover_parcels',coalesce(sum(parcel_count) filter(where awaiting_handover),0),'return_label',count(*) filter(where has_return_label),'return_label_parcels',coalesce(sum(parcel_count) filter(where has_return_label),0),'pending',count(*) filter(where s='pending'),'pending_parcels',coalesce(sum(parcel_count) filter(where s='pending'),0),'prepared',count(*) filter(where s='prepared'),'prepared_parcels',coalesce(sum(parcel_count) filter(where s='prepared'),0),'shipped',count(*) filter(where s='shipped'),'shipped_parcels',coalesce(sum(parcel_count) filter(where s='shipped'),0),'delivered',count(*) filter(where s='delivered'),'delivered_parcels',coalesce(sum(parcel_count) filter(where s='delivered'),0),'problem',count(*) filter(where s in ('undelivered','support')),'problem_parcels',coalesce(sum(parcel_count) filter(where s in ('undelivered','support')),0),'arrived',count(*) filter(where s='arrived'),'arrived_parcels',coalesce(sum(parcel_count) filter(where s='arrived'),0),'distribution',count(*) filter(where s='distribution'),'distribution_parcels',coalesce(sum(parcel_count) filter(where s='distribution'),0),'undelivered',count(*) filter(where s='undelivered'),'undelivered_parcels',coalesce(sum(parcel_count) filter(where s='undelivered'),0),'support',count(*) filter(where s='support'),'support_parcels',coalesce(sum(parcel_count) filter(where s='support'),0),'returning',count(*) filter(where s='returning'),'returning_parcels',coalesce(sum(parcel_count) filter(where s='returning'),0),'cancelled',count(*) filter(where s='cancelled'),'cancelled_parcels',coalesce(sum(parcel_count) filter(where s='cancelled'),0)) from owned),'total',(select count(*) from filtered),'orders',coalesce((select jsonb_agg(public.seller_order_safe(o) order by case when p_filter in ('return_label','cargo_returns') then ((o).iade_teslim_tarihi is not null)::integer else 0 end asc,case when p_filter in ('return_label','cargo_returns') then coalesce((o).iade_teslim_tarihi,(o).iade_tarihi) end desc nulls last,coalesce((o).bolunme_ana_siparis_no,(o).siparis_no) desc,(o).siparis_no asc) from page),'[]'::jsonb)) into result;
 return result;
end; $function$
;
