-- Same receipt predicate for list filtering and counter totals. Existing RLS stays in force.
create or replace view public.gazi_order_list with (security_invoker=true) as
select v.*, (coalesce(v.kargo_durumu,'') not in ('Silindi','İptal') and (
  (concat_ws(' ',v.odeme_sekli,v.notlar) ~* '\m(eft|iban|havale|fast)\M'
   and not exists(select 1 from public.order_receipts r where r.order_id=v.siparis_no))
  or exists(select 1 from public.order_receipts r where r.order_id=v.siparis_no and r.status in ('pending','rejected'))
 )) as dekont_bekliyor
from (
 SELECT o.siparis_no,
    o.siparis_tel,
    o.ad_soyad,
    o.musteri_tel,
    o.adres,
    o.urun_bilgisi,
    o.sehir,
    o.toplam_tutar,
    o.odeme_sekli,
    o.notlar,
    o.tarih,
    o.musteri_no,
    o.firma,
    o.siparis_alan,
    o.ilce,
    o.kargo_durumu,
    o.orderinvoiceid,
    o.orderinvoicedetailid,
    o.shipperbranchcode,
    o.kargo_adet,
    o.sehir_kodu,
    o.ilce_kodu,
    o.kargo_siparis_no,
    o.kargo_takip_kodu,
    o.kargo_qr_kod,
    o.invoiceid,
    o.kargo_kg,
    "left"(o.zpl_base64, 5) AS zpl_base64,
    o.print,
    o.iptal_nedeni,
    o.iptal_tarihi,
    o."shipmentStatus",
    o.kargo_takip_url,
    o.kargo_gunc_saat,
    o.teslimat_aciklama,
    o.gonder_hata_bilgisi,
    o."shipmentStatusCode",
    o.secilen_urunler,
    o."isDelivered",
        CASE
            WHEN o.kargo_api_yanit IS JSON OBJECT THEN jsonb_build_object('environment', o.kargo_api_yanit::jsonb -> 'environment'::text, 'tracking', o.kargo_api_yanit::jsonb -> 'tracking'::text)::text
            ELSE o.kargo_api_yanit
        END AS kargo_api_yanit,
        CASE
            WHEN o.kargo_zpl IS NULL OR btrim(o.kargo_zpl) = ''::text THEN o.kargo_zpl
            ELSE '[stored]'::text
        END AS kargo_zpl,
    o.iade_kodu,
    o.iade_etiket_url,
    o.iade_durumu,
    o.iade_tarihi,
    o.subeden_teslim,
    o.teslim_subesi,
    o.teslim_sekli_kontrol,
    o.etiket_yazdirma_sayisi,
    o.etiket_son_yazdirma,
    o.etiket_olusturma_tarihi,
    o.sube_etiket_durumu,
    o.sube_etiket_tarihi,
    o.bolunme_grubu,
    o.bolunme_ana_siparis_no,
    o.bolunme_sira,
    COALESCE(o.bolunme_ana_siparis_no, o.siparis_no) AS liste_sira_no,
    groups.group_label_created AS liste_etiket_tarihi,
    o.iade_takip_kodu,
    o.iade_teslim_tarihi,
    o.iade_teslim_tarihi IS NOT NULL AS iade_tamamlandi
   FROM gazi_siparisler o
     LEFT JOIN ( SELECT COALESCE(gazi_siparisler.bolunme_ana_siparis_no, gazi_siparisler.siparis_no) AS group_order_id,
            max(gazi_siparisler.etiket_olusturma_tarihi) AS group_label_created
           FROM gazi_siparisler
          GROUP BY (COALESCE(gazi_siparisler.bolunme_ana_siparis_no, gazi_siparisler.siparis_no))) groups ON groups.group_order_id = COALESCE(o.bolunme_ana_siparis_no, o.siparis_no)
) v;

CREATE OR REPLACE FUNCTION public.gazi_operation_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH flags AS (
 SELECT siparis_no,coalesce(bolunme_ana_siparis_no,siparis_no) as split_sort,
  ((teslim_sekli_kontrol is true or subeden_teslim is null or lower(btrim(coalesce(teslim_subesi,''))) ~ '^(teslim( şekli)? seç(in|iniz)?|seç(in|iniz)?)$') or nullif(btrim(sehir),'') is null or nullif(btrim(ilce),'') is null or (subeden_teslim is true and (nullif(btrim(teslim_subesi),'') is null or lower(regexp_replace(btrim(coalesce(teslim_subesi,'')),'[[:space:]]+',' ','g')) ~ '^(dhl( kargo)?( şubesi)?|kargo( şubesi)?|şube( seç(in|iniz)?)?|teslim alınacak (dhl )?şube(si)?|seç(in|iniz)?)$')) or (subeden_teslim is not true and nullif(btrim(adres),'') is null)) as has_missing_delivery,
  case when trim(kargo_adet) ~ '^[0-9]{1,9}$' then trim(kargo_adet)::bigint else 0 end as parcels,
 kargo_durumu='Bekliyor' as prepare,
 kargo_durumu='Kargolandı' AND "isDelivered" IS NOT TRUE
 AND ("shipmentStatusCode" IS NULL OR "shipmentStatusCode"=1)
 AND coalesce("shipmentStatus",'') IN ('','Gönderi_Hazırlandı','Gönderi Hazırlandı','DHL sipariş kaydı oluşturuldu; barkod bekleniyor') as created,
 (coalesce(kargo_zpl,'')<>'' OR coalesce(zpl_base64 LIKE 'JVBER%',false)) as saved,
 etiket_yazdirma_sayisi,
 ("shipmentStatusCode" IN (6,8) OR ("shipmentStatusCode" IS NULL AND "shipmentStatus" IN ('Teslim_Edilemedi','Teslim Edilemedi','Destek_Gerekiyor','Destek Gerekiyor'))) as attention
 FROM public.gazi_siparisler WHERE (select public.seller_is_gazi_admin()) AND coalesce(kargo_durumu,'')<>'Silindi'
), queues AS (
 SELECT siparis_no,split_sort,has_missing_delivery,parcels,prepare,created AND (NOT saved OR etiket_yazdirma_sayisi IS NULL OR etiket_yazdirma_sayisi=0) as label,created AND saved as handover,attention FROM flags
)
SELECT jsonb_build_object(
 'missing_pending_ids',coalesce(jsonb_agg(siparis_no order by split_sort desc,siparis_no asc) filter(where prepare and has_missing_delivery),'[]'::jsonb),
 'prepare',count(*) filter(where prepare),'prepare_parcels',coalesce(sum(parcels) filter(where prepare),0),
 'label',count(*) filter(where label),'label_parcels',coalesce(sum(parcels) filter(where label),0),
 'handover',count(*) filter(where handover),'handover_parcels',coalesce(sum(parcels) filter(where handover),0),
 'attention',count(*) filter(where attention),'attention_parcels',coalesce(sum(parcels) filter(where attention),0)
) || (select jsonb_build_object(
 'receipt',count(*),
 'receipt_parcels',coalesce(sum(case when trim(kargo_adet) ~ '^[0-9]{1,9}$' then trim(kargo_adet)::bigint else 0 end),0)
 ) from public.gazi_order_list where dekont_bekliyor and (select public.seller_is_gazi_admin())) FROM queues;
$function$
;
notify pgrst,'reload schema';

