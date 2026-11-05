-- Only future 12-hour WhatsApp dedup matches reopen cancelled Gazi orders.
ALTER TABLE public.tum_siparisler ADD COLUMN IF NOT EXISTS yeniden_acilma_gecmisi jsonb;
CREATE OR REPLACE FUNCTION public.whatsapp_siparis_giris_3h()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_phone text; v_id integer; v_row public.tum_siparisler%ROWTYPE;
v_old public.tum_siparisler%ROWTYPE; v_gazi public.gazi_siparisler%ROWTYPE;
v_reopen boolean:=false; v_reference text;
BEGIN
v_phone:=right(regexp_replace(coalesce(NEW.musteri_tel,''),'[^0-9]','','g'),10);
IF v_phone ~ '^5[0-9]{9}$' THEN
PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp-order-3h:'||v_phone,0));
SELECT t.siparis_no INTO v_id FROM public.tum_siparisler t
WHERE right(regexp_replace(coalesce(t.musteri_tel,''),'[^0-9]','','g'),10)=v_phone
AND t.tarih >= (now() AT TIME ZONE 'GMT+3')-interval '12 hours'
AND t.tarih < (now() AT TIME ZONE 'GMT+3') + interval '1 second'
ORDER BY t.tarih DESC,t.siparis_no DESC LIMIT 1 FOR UPDATE;
END IF;
IF v_id IS NULL THEN
INSERT INTO public.tum_siparisler ("siparis_alan","musteri_tel","ad_soyad","adres","sehir","ilce","urun_bilgisi","toplam_tutar","odeme_sekli","notlar",sistem_notu,"firma","siparis_tel","kargo_adet","kargo_durumu","kargo_kg","whatsapp_jid","whatsapp_message_id","whatsapp_participant","whatsapp_participant_alt","whatsapp_addressing_mode","whatsapp_push_name","whatsapp_message_text","isleme_alinma_tarihi",subeden_teslim,teslim_subesi,teslim_sekli_kontrol)
VALUES (NEW."siparis_alan",NEW."musteri_tel",NEW."ad_soyad",NEW."adres",NEW."sehir",NEW."ilce",NEW."urun_bilgisi",NEW."toplam_tutar",NEW."odeme_sekli",NEW."notlar",NEW.sistem_notu,NEW."firma",NEW."siparis_tel",NEW."kargo_adet",NEW."kargo_durumu",NEW."kargo_kg",NEW."whatsapp_jid",NEW."whatsapp_message_id",NEW."whatsapp_participant",NEW."whatsapp_participant_alt",NEW."whatsapp_addressing_mode",NEW."whatsapp_push_name",NEW."whatsapp_message_text",NEW."isleme_alinma_tarihi",coalesce(NEW.subeden_teslim,false),NEW.teslim_subesi,coalesce(NEW.teslim_sekli_kontrol,false)) RETURNING * INTO v_row;
ELSE
SELECT * INTO v_old FROM public.tum_siparisler WHERE siparis_no=v_id;
SELECT * INTO v_gazi FROM public.gazi_siparisler WHERE siparis_no=v_id FOR UPDATE;
v_reopen := lower(btrim(coalesce(NEW.firma,'')))='gazi'
 AND lower(btrim(coalesce(v_old.firma,'')))='gazi'
 AND coalesce(v_gazi.kargo_durumu,v_old.kargo_durumu)='İptal';
IF v_reopen THEN
 v_reference:=coalesce(nullif(v_gazi.kargo_siparis_no,''),nullif(v_old.kargo_siparis_no,''),'AKH45200'||v_id);
 v_reference:=regexp_replace(v_reference,'-R[0-9]+$','')||'-R'||
   (coalesce(substring(v_reference from '-R([0-9]+)$')::integer,0)+1)::text;
END IF;
UPDATE public.tum_siparisler SET
yeniden_acilma_gecmisi=CASE WHEN v_reopen THEN coalesce(yeniden_acilma_gecmisi,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
 'reopened_at',clock_timestamp(),'source','whatsapp_12h','previous_master',to_jsonb(v_old)-'yeniden_acilma_gecmisi','previous_operation',to_jsonb(v_gazi)))
 ELSE yeniden_acilma_gecmisi END,
"kargo_durumu"=CASE WHEN v_reopen THEN 'Bekliyor' ELSE "kargo_durumu" END,
"iptal_nedeni"=CASE WHEN v_reopen THEN NULL ELSE "iptal_nedeni" END,
"iptal_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "iptal_tarihi" END,
"kargo_siparis_no"=CASE WHEN v_reopen THEN v_reference ELSE "kargo_siparis_no" END,
"orderInvoiceId"=CASE WHEN v_reopen THEN NULL ELSE "orderInvoiceId" END,
"orderInvoiceDetailId"=CASE WHEN v_reopen THEN NULL ELSE "orderInvoiceDetailId" END,
"shipperBranchCode"=CASE WHEN v_reopen THEN NULL ELSE "shipperBranchCode" END,
"kargo_takip_kodu"=CASE WHEN v_reopen THEN NULL ELSE "kargo_takip_kodu" END,
"kargo_qr_kod"=CASE WHEN v_reopen THEN NULL ELSE "kargo_qr_kod" END,
"invoiceId"=CASE WHEN v_reopen THEN NULL ELSE "invoiceId" END,
"referenceId"=CASE WHEN v_reopen THEN NULL ELSE "referenceId" END,
"zpl_base64"=CASE WHEN v_reopen THEN NULL ELSE "zpl_base64" END,
"print"=CASE WHEN v_reopen THEN false ELSE "print" END,
subeden_teslim=coalesce(NEW.subeden_teslim,false),teslim_subesi=NEW.teslim_subesi,teslim_sekli_kontrol=coalesce(NEW.teslim_sekli_kontrol,false),"siparis_alan"=NEW."siparis_alan",
"musteri_tel"=NEW."musteri_tel",
"ad_soyad"=NEW."ad_soyad",
"adres"=NEW."adres",
"sehir"=NEW."sehir",
"ilce"=NEW."ilce",
"urun_bilgisi"=NEW."urun_bilgisi",
"toplam_tutar"=NEW."toplam_tutar",
"odeme_sekli"=NEW."odeme_sekli",
"notlar"=NEW."notlar",
sistem_notu=NEW.sistem_notu,
"firma"=NEW."firma",
"siparis_tel"=NEW."siparis_tel",
"kargo_adet"=NEW."kargo_adet",
"kargo_kg"=NEW."kargo_kg",
"whatsapp_jid"=NEW."whatsapp_jid",
"whatsapp_message_id"=NEW."whatsapp_message_id",
"whatsapp_participant"=NEW."whatsapp_participant",
"whatsapp_participant_alt"=NEW."whatsapp_participant_alt",
"whatsapp_addressing_mode"=NEW."whatsapp_addressing_mode",
"whatsapp_push_name"=NEW."whatsapp_push_name",
"whatsapp_message_text"=NEW."whatsapp_message_text",
"isleme_alinma_tarihi"=NEW."isleme_alinma_tarihi" WHERE siparis_no=v_id RETURNING * INTO v_row;
UPDATE public.gazi_siparisler SET
"kargo_durumu"=CASE WHEN v_reopen THEN 'Bekliyor' ELSE "kargo_durumu" END,
"iptal_nedeni"=CASE WHEN v_reopen THEN NULL ELSE "iptal_nedeni" END,
"iptal_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "iptal_tarihi" END,
"kargo_siparis_no"=CASE WHEN v_reopen THEN v_reference ELSE "kargo_siparis_no" END,
"orderinvoiceid"=CASE WHEN v_reopen THEN NULL ELSE "orderinvoiceid" END,
"orderinvoicedetailid"=CASE WHEN v_reopen THEN NULL ELSE "orderinvoicedetailid" END,
"shipperbranchcode"=CASE WHEN v_reopen THEN NULL ELSE "shipperbranchcode" END,
"kargo_takip_kodu"=CASE WHEN v_reopen THEN NULL ELSE "kargo_takip_kodu" END,
"kargo_qr_kod"=CASE WHEN v_reopen THEN NULL ELSE "kargo_qr_kod" END,
"invoiceid"=CASE WHEN v_reopen THEN NULL ELSE "invoiceid" END,
"kargo_zpl"=CASE WHEN v_reopen THEN NULL ELSE "kargo_zpl" END,
"zpl_base64"=CASE WHEN v_reopen THEN NULL ELSE "zpl_base64" END,
"shipmentStatus"=CASE WHEN v_reopen THEN NULL ELSE "shipmentStatus" END,
"shipmentStatusCode"=CASE WHEN v_reopen THEN NULL ELSE "shipmentStatusCode" END,
"isDelivered"=CASE WHEN v_reopen THEN false ELSE "isDelivered" END,
"kargo_takip_url"=CASE WHEN v_reopen THEN NULL ELSE "kargo_takip_url" END,
"kargo_gunc_saat"=CASE WHEN v_reopen THEN NULL ELSE "kargo_gunc_saat" END,
"teslimat_aciklama"=CASE WHEN v_reopen THEN NULL ELSE "teslimat_aciklama" END,
"print"=CASE WHEN v_reopen THEN false ELSE "print" END,
"etiket_yazdirma_sayisi"=CASE WHEN v_reopen THEN 0 ELSE "etiket_yazdirma_sayisi" END,
"etiket_son_yazdirma"=CASE WHEN v_reopen THEN NULL ELSE "etiket_son_yazdirma" END,
"etiket_olusturma_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "etiket_olusturma_tarihi" END,
"gonder_hata_bilgisi"=CASE WHEN v_reopen THEN NULL ELSE "gonder_hata_bilgisi" END,
"kargo_api_yanit"=CASE WHEN v_reopen THEN NULL ELSE "kargo_api_yanit" END,
"sube_etiket_durumu"=CASE WHEN v_reopen THEN NULL ELSE "sube_etiket_durumu" END,
"sube_etiket_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "sube_etiket_tarihi" END,
"iade_kodu"=CASE WHEN v_reopen THEN NULL ELSE "iade_kodu" END,
"iade_etiket_url"=CASE WHEN v_reopen THEN NULL ELSE "iade_etiket_url" END,
"iade_durumu"=CASE WHEN v_reopen THEN NULL ELSE "iade_durumu" END,
"iade_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "iade_tarihi" END,
"iade_takip_kodu"=CASE WHEN v_reopen THEN NULL ELSE "iade_takip_kodu" END,
"iade_teslim_tarihi"=CASE WHEN v_reopen THEN NULL ELSE "iade_teslim_tarihi" END,
"iade_son_kontrol"=CASE WHEN v_reopen THEN NULL ELSE "iade_son_kontrol" END,
"iade_hareketleri"=CASE WHEN v_reopen THEN NULL ELSE "iade_hareketleri" END,
"iade_takip_hatasi"=CASE WHEN v_reopen THEN NULL ELSE "iade_takip_hatasi" END,
sistem_notu=v_row.sistem_notu,subeden_teslim=v_row.subeden_teslim,teslim_subesi=v_row.teslim_subesi,teslim_sekli_kontrol=v_row.teslim_sekli_kontrol,"siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
UPDATE public.queen_siparisler SET "siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
UPDATE public.isimsiz_siparisler SET "siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
SELECT * INTO v_row FROM public.tum_siparisler WHERE siparis_no=v_id;
END IF;
NEW:=jsonb_populate_record(NEW,to_jsonb(v_row));
NEW.kayit_islemi:=CASE WHEN v_id IS NULL THEN 'Yeni' ELSE 'Güncellendi' END;
RETURN NEW;
END; $function$
