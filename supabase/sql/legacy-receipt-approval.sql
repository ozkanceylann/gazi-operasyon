-- Only EFT/bank-transfer and free orders before 15 October 2026 receive legacy approval.
alter table public.gazi_siparisler add column if not exists dekont_gecmis_onayli boolean generated always as (coalesce(tarih < timestamp '2026-10-15 00:00:00' and (odeme_sekli ~* '\m(eft|iban|havale|fast|bedelsiz|ücretsiz|ucretsiz)\M' or toplam_tutar ~* '^[[:space:]]*[+-]?0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$'),false)) stored;
alter table public.gazi_siparisler alter column dekont_gecmis_onayli set expression as (coalesce(tarih < timestamp '2026-10-15 00:00:00' and (odeme_sekli ~* '\m(eft|iban|havale|fast|bedelsiz|ücretsiz|ucretsiz)\M' or toplam_tutar ~* '^[[:space:]]*[+-]?0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$'),false));
comment on column public.gazi_siparisler.dekont_gecmis_onayli is 'User-approved legacy EFT/bank-transfer and free orders before 2026-10-15 only.';
create or replace view public.gazi_order_list with (security_invoker=true) as
select v.*,
 (not (coalesce(v.tarih < timestamp '2026-10-15 00:00:00' and (v.odeme_sekli ~* '\m(eft|iban|havale|fast|bedelsiz|ücretsiz|ucretsiz)\M' or v.toplam_tutar ~* '^[[:space:]]*[+-]?0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$'),false)) and coalesce(v.kargo_durumu,'') not in ('Silindi','İptal') and (
  (concat_ws(' ',v.odeme_sekli,v.notlar) ~* '\m(eft|iban|havale|fast)\M'
   and not exists(select 1 from public.order_receipts r where r.order_id=v.siparis_no))
  or exists(select 1 from public.order_receipts r where r.order_id=v.siparis_no and r.status in ('pending','rejected'))
 )) as dekont_bekliyor,
 coalesce(v.tarih < timestamp '2026-10-15 00:00:00' and (v.odeme_sekli ~* '\m(eft|iban|havale|fast|bedelsiz|ücretsiz|ucretsiz)\M' or v.toplam_tutar ~* '^[[:space:]]*[+-]?0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$'),false) as dekont_gecmis_onayli
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

CREATE OR REPLACE FUNCTION public.seller_order_safe(o gazi_siparisler)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('dekont_gecmis_onayli',o.dekont_gecmis_onayli,'siparis_no',o.siparis_no,'bolunme_ana_siparis_no',o.bolunme_ana_siparis_no,'bolunme_sira',o.bolunme_sira,'ad_soyad',o.ad_soyad,'musteri_tel',o.musteri_tel,'adres',o.adres,'sehir',o.sehir,'ilce',o.ilce,'sehir_kodu',o.sehir_kodu,'ilce_kodu',o.ilce_kodu,'urun_bilgisi',o.urun_bilgisi,'toplam_tutar',o.toplam_tutar,'odeme_sekli',o.odeme_sekli,'notlar',o.notlar,'kargo_adet',o.kargo_adet,'kargo_kg',o.kargo_kg,'siparis_alan',o.siparis_alan,'subeden_teslim',o.subeden_teslim,'teslim_subesi',o.teslim_subesi,'teslim_sekli_kontrol',o.teslim_sekli_kontrol,'tarih',o.tarih,'kargo_durumu',o.kargo_durumu,'status',public.seller_order_phase(o),'shipmentStatus',o."shipmentStatus",'kargo_takip_kodu',o.kargo_takip_kodu,'kargo_takip_url',o.kargo_takip_url,'kargo_gunc_saat',o.kargo_gunc_saat,'teslimat_aciklama',o.teslimat_aciklama,'iptal_nedeni',o.iptal_nedeni,'iade_kodu',o.iade_kodu,'iade_etiket_url',o.iade_etiket_url,'iade_durumu',o.iade_durumu,'iade_tarihi',o.iade_tarihi,'iade_takip_kodu',o.iade_takip_kodu,'iade_teslim_tarihi',o.iade_teslim_tarihi,'iade_hareketleri',o.iade_hareketleri,'iade_takip_hatasi',o.iade_takip_hatasi,'kargo_hareketleri',public.seller_tracking_events(o.kargo_api_yanit));
$function$
;
notify pgrst,'reload schema';

