-- New orders only: nullable columns; no historical backfill.

begin;

alter table public.tum_siparisler add column if not exists sistem_notu text;

alter table public.gazi_siparisler add column if not exists sistem_notu text;

create or replace view public.gazi_siparisler_giris with (security_invoker=true) as  SELECT siparis_no,
    siparis_tel,
    ad_soyad,
    musteri_tel,
    adres,
    urun_bilgisi,
    sehir,
    toplam_tutar,
    odeme_sekli,
    notlar,
    tarih,
    musteri_no,
    firma,
    siparis_alan,
    ilce,
    kargo_durumu,
    orderinvoiceid,
    orderinvoicedetailid,
    shipperbranchcode,
    kargo_adet,
    sehir_kodu,
    ilce_kodu,
    kargo_siparis_no,
    kargo_takip_kodu,
    kargo_qr_kod,
    invoiceid,
    kargo_kg,
    zpl_base64,
    print,
    iptal_nedeni,
    iptal_tarihi,
    "shipmentStatus",
    kargo_takip_url,
    kargo_gunc_saat,
    teslimat_aciklama,
    gonder_hata_bilgisi,
    "shipmentStatusCode",
    secilen_urunler,
    "isDelivered",
    subeden_teslim,
    teslim_subesi,
    teslim_sekli_kontrol,
    sistem_notu
   FROM gazi_siparisler;

create or replace view public.whatsapp_siparis_giris with (security_invoker=true) as  SELECT siparis_no,
    siparis_tel,
    ad_soyad,
    musteri_tel,
    adres,
    urun_bilgisi,
    sehir,
    toplam_tutar,
    odeme_sekli,
    notlar,
    tarih,
    musteri_no,
    firma,
    siparis_alan,
    ilce,
    kargo_durumu,
    "orderInvoiceId",
    "orderInvoiceDetailId",
    "shipperBranchCode",
    kargo_adet,
    sehir_kodu,
    ilce_kodu,
    kargo_siparis_no,
    kargo_takip_kodu,
    kargo_qr_kod,
    "invoiceId",
    "referenceId",
    kargo_kg,
    zpl_base64,
    print,
    iptal_nedeni,
    iptal_tarihi,
    siparis_sekli,
    secilen_urunler,
    musteri_notu,
    whatsapp_jid,
    whatsapp_message_id,
    whatsapp_participant,
    whatsapp_participant_alt,
    whatsapp_addressing_mode,
    whatsapp_from_me,
    whatsapp_push_name,
    whatsapp_message_text,
    siparis_durumu,
    isleme_alinma_tarihi,
    'Yeni'::text AS kayit_islemi,
    subeden_teslim,
    teslim_subesi,
    teslim_sekli_kontrol,
    sistem_notu
   FROM tum_siparisler t;

CREATE OR REPLACE FUNCTION public.gazi_siparisler_giris_kaydet()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_row public.gazi_siparisler%ROWTYPE; v_master public.tum_siparisler%ROWTYPE;
BEGIN
SELECT * INTO STRICT v_master FROM public.tum_siparisler WHERE siparis_no=NEW.siparis_no FOR UPDATE;
NEW."siparis_no":=v_master."siparis_no";
NEW."siparis_tel":=v_master."siparis_tel";
NEW."ad_soyad":=v_master."ad_soyad";
NEW."musteri_tel":=v_master."musteri_tel";
NEW."adres":=v_master."adres";
NEW."urun_bilgisi":=v_master."urun_bilgisi";
NEW."sehir":=v_master."sehir";
NEW."toplam_tutar":=v_master."toplam_tutar";
NEW."odeme_sekli":=v_master."odeme_sekli";
NEW."notlar":=v_master."notlar";
NEW.sistem_notu:=v_master.sistem_notu;
NEW."tarih":=v_master."tarih";
NEW."musteri_no":=v_master."musteri_no";
NEW."siparis_alan":=v_master."siparis_alan";
NEW."ilce":=v_master."ilce";
NEW."kargo_durumu":=v_master."kargo_durumu";
NEW."kargo_adet":=v_master."kargo_adet";
NEW."sehir_kodu":=v_master."sehir_kodu";
NEW."ilce_kodu":=v_master."ilce_kodu";
NEW."kargo_siparis_no":=v_master."kargo_siparis_no";
NEW."kargo_kg":=v_master."kargo_kg";
NEW.subeden_teslim:=v_master.subeden_teslim;
NEW.teslim_subesi:=v_master.teslim_subesi;
NEW.teslim_sekli_kontrol:=v_master.teslim_sekli_kontrol;
INSERT INTO public.gazi_siparisler ("siparis_no","siparis_tel","ad_soyad","musteri_tel","adres","urun_bilgisi","sehir","toplam_tutar","odeme_sekli","notlar",sistem_notu,"tarih","musteri_no","firma","siparis_alan","ilce","kargo_durumu","kargo_adet","sehir_kodu","ilce_kodu","kargo_siparis_no","kargo_kg",subeden_teslim,teslim_subesi,teslim_sekli_kontrol) VALUES (NEW."siparis_no",NEW."siparis_tel",NEW."ad_soyad",NEW."musteri_tel",NEW."adres",NEW."urun_bilgisi",NEW."sehir",NEW."toplam_tutar",NEW."odeme_sekli",NEW."notlar",NEW.sistem_notu,NEW."tarih",NEW."musteri_no",NEW."firma",NEW."siparis_alan",NEW."ilce",NEW."kargo_durumu",NEW."kargo_adet",NEW."sehir_kodu",NEW."ilce_kodu",NEW."kargo_siparis_no",NEW."kargo_kg",NEW.subeden_teslim,NEW.teslim_subesi,NEW.teslim_sekli_kontrol)
ON CONFLICT (siparis_no) DO UPDATE SET subeden_teslim=EXCLUDED.subeden_teslim,teslim_subesi=EXCLUDED.teslim_subesi,teslim_sekli_kontrol=EXCLUDED.teslim_sekli_kontrol,"siparis_tel"=EXCLUDED."siparis_tel","ad_soyad"=EXCLUDED."ad_soyad","musteri_tel"=EXCLUDED."musteri_tel","adres"=EXCLUDED."adres","urun_bilgisi"=EXCLUDED."urun_bilgisi","sehir"=EXCLUDED."sehir","toplam_tutar"=EXCLUDED."toplam_tutar","odeme_sekli"=EXCLUDED."odeme_sekli","notlar"=EXCLUDED."notlar",sistem_notu=EXCLUDED.sistem_notu,"musteri_no"=EXCLUDED."musteri_no","firma"=EXCLUDED."firma","siparis_alan"=EXCLUDED."siparis_alan","ilce"=EXCLUDED."ilce","kargo_adet"=EXCLUDED."kargo_adet","sehir_kodu"=EXCLUDED."sehir_kodu","ilce_kodu"=EXCLUDED."ilce_kodu","kargo_kg"=EXCLUDED."kargo_kg"
RETURNING * INTO v_row;
NEW:=jsonb_populate_record(NEW,to_jsonb(v_row));
RETURN NEW;
END; $function$;


CREATE OR REPLACE FUNCTION public.whatsapp_siparis_giris_3h()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_phone text; v_id integer; v_row public.tum_siparisler%ROWTYPE;
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
UPDATE public.tum_siparisler SET subeden_teslim=coalesce(NEW.subeden_teslim,false),teslim_subesi=NEW.teslim_subesi,teslim_sekli_kontrol=coalesce(NEW.teslim_sekli_kontrol,false),"siparis_alan"=NEW."siparis_alan",
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
UPDATE public.gazi_siparisler SET sistem_notu=v_row.sistem_notu,subeden_teslim=v_row.subeden_teslim,teslim_subesi=v_row.teslim_subesi,teslim_sekli_kontrol=v_row.teslim_sekli_kontrol,"siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
UPDATE public.queen_siparisler SET "siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
UPDATE public.isimsiz_siparisler SET "siparis_alan"=v_row."siparis_alan","musteri_tel"=v_row."musteri_tel","ad_soyad"=v_row."ad_soyad","adres"=v_row."adres","sehir"=v_row."sehir","ilce"=v_row."ilce","urun_bilgisi"=v_row."urun_bilgisi","toplam_tutar"=v_row."toplam_tutar","odeme_sekli"=v_row."odeme_sekli","notlar"=v_row."notlar","siparis_tel"=v_row."siparis_tel","kargo_adet"=v_row."kargo_adet","kargo_kg"=v_row."kargo_kg",sehir_kodu=v_row.sehir_kodu,ilce_kodu=v_row.ilce_kodu WHERE siparis_no=v_id;
SELECT * INTO v_row FROM public.tum_siparisler WHERE siparis_no=v_id;
END IF;
NEW:=jsonb_populate_record(NEW,to_jsonb(v_row));
NEW.kayit_islemi:=CASE WHEN v_id IS NULL THEN 'Yeni' ELSE 'Güncellendi' END;
RETURN NEW;
END; $function$;


CREATE OR REPLACE FUNCTION mobile_intake.finish(p_id uuid, p_token uuid, p_data jsonb, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r mobile_intake.requests; d jsonb:=p_data; o public.tum_siparisler; reason text; kg text; cnt integer;
begin
 select * into r from mobile_intake.requests where id=p_id for update;
 if not found then raise exception 'Gönderim bulunamadı.'; end if;
 if r.status='completed' then return jsonb_build_object('status',r.status,'order_no',r.order_no); end if;
 if r.status<>'processing' or r.claim_token is distinct from p_token then raise exception 'Geçersiz işlem kilidi.'; end if;
 if p_error is not null then reason:='Sipariş işlenemedi. Mesajı yeniden gönderebilirsiniz.';
 elsif d->>'Siparis' is distinct from 'Evet' or coalesce((d->>'teknik_hata')::boolean,false) then reason:=coalesce(nullif(d->>'sistem_notu',''),nullif(d->>'notlar',''),'Mesajdaki sipariş bilgilerini kontrol edip yeniden gönderin.');
 elsif nullif(btrim(d->>'musteri_ad_soyad'),'') is null or public.seller_normalize_phone(d->>'musteri_telefon') is null or nullif(btrim(d->>'adres'),'') is null or nullif(btrim(d->>'Sehir'),'') is null or nullif(btrim(d->>'ilce'),'') is null or jsonb_typeof(d->'urunler') is distinct from 'array' or jsonb_array_length(d->'urunler')=0 then reason:='Müşteri adı, telefonu, adres/teslim yeri, il, ilçe ve ürün bilgisi gerekli.';
 elsif coalesce(d->>'toplam','') !~ '^\d+(\.\d{1,2})?$' then reason:='Sipariş tutarı eksik veya geçersiz.';
 elsif coalesce(d->>'kargo_adet','') !~ '^([1-9]|[1-9][0-9]|100)$' then reason:='Paket adedi geçersiz.';
 else
  cnt:=(d->>'kargo_adet')::integer; kg:=d->>'kargo_kg';
  if coalesce(kg,'') !~ '^\d+(\.\d+)?(\+\d+(\.\d+)?)*$' or cardinality(string_to_array(kg,'+'))<>cnt or exists(select 1 from unnest(string_to_array(kg,'+')) v where v::numeric<=0) then reason:='Paket kilogramları ve adedi uyuşmuyor.'; end if;
 end if;
 if reason is not null then
  update mobile_intake.requests set status=case when p_error is null then 'rejected' else 'failed' end,result_message=left(reason,2000),parsed=d where id=r.id;
  return jsonb_build_object('status',case when p_error is null then 'rejected' else 'failed' end,'message',left(reason,2000));
 end if;
 if not r.is_test then
  begin
   perform set_config('search_path','public,extensions,pg_catalog',true);
   insert into public.tum_siparisler(siparis_alan,siparis_tel,ad_soyad,musteri_tel,adres,sehir,ilce,urun_bilgisi,toplam_tutar,odeme_sekli,notlar,sistem_notu,firma,kargo_adet,kargo_kg,kargo_durumu,siparis_sekli,whatsapp_message_text,subeden_teslim,teslim_subesi,teslim_sekli_kontrol)
   values(r.seller_phone,r.seller_phone,d->>'musteri_ad_soyad',right(public.seller_normalize_phone(d->>'musteri_telefon'),10),d->>'adres',d->>'Sehir',d->>'ilce',(select string_agg(v,E'\n') from jsonb_array_elements_text(d->'urunler') v),d->>'toplam',d->>'odeme_yontemi',d->>'notlar',d->>'sistem_notu','Gazi',cnt::text,kg,'Bekliyor','Mobil',r.message,coalesce((d->>'subeden_teslim')::boolean,false),nullif(d->>'teslim_subesi',''),coalesce((d->>'teslim_sekli_kontrol')::boolean,false)) returning * into o;
   if o.sehir_kodu is null or o.ilce_kodu is null then raise exception 'İl veya ilçe eşleşmedi. Mesajdaki il ve ilçeyi kontrol edin.'; end if;
   insert into public.gazi_siparisler_giris(siparis_no,firma) values(o.siparis_no,'Gazi');
   if not exists(select 1 from public.gazi_siparisler where siparis_no=o.siparis_no and public.seller_owner_phone(siparis_alan,siparis_tel)=r.seller_phone) then raise exception 'Sipariş kaydı doğrulanamadı.'; end if;
  exception when others then
   update mobile_intake.requests set status='failed',parsed=d,result_message=case when sqlerrm like 'İl veya ilçe%' then sqlerrm else 'Sipariş kaydedilemedi. Mesajı kontrol edip yeniden gönderin.' end where id=r.id;
   return jsonb_build_object('status','failed');
  end;
 end if;
 update mobile_intake.requests set status='completed',order_no=o.siparis_no,parsed=d,result_message=case when r.is_test then 'Test doğrulandı; sipariş oluşturulmadı.' else 'Sipariş sisteme girildi.' end where id=r.id;
 return jsonb_build_object('status','completed','order_no',o.siparis_no,'is_test',r.is_test);
end $function$;


CREATE OR REPLACE FUNCTION public.seller_order_safe(o gazi_siparisler)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('shared_ozkan',coalesce(public.seller_owner_phone(o.siparis_alan,o.siparis_tel)='05079970697',false),'dekont_gecmis_onayli',o.dekont_gecmis_onayli,'siparis_no',o.siparis_no,'bolunme_ana_siparis_no',o.bolunme_ana_siparis_no,'bolunme_sira',o.bolunme_sira,'ad_soyad',o.ad_soyad,'musteri_tel',o.musteri_tel,'adres',o.adres,'sehir',o.sehir,'ilce',o.ilce,'sehir_kodu',o.sehir_kodu,'ilce_kodu',o.ilce_kodu,'urun_bilgisi',o.urun_bilgisi,'toplam_tutar',o.toplam_tutar,'odeme_sekli',o.odeme_sekli,'notlar',o.notlar,'sistem_notu',o.sistem_notu,'kargo_adet',o.kargo_adet,'kargo_kg',o.kargo_kg,'siparis_alan',o.siparis_alan,'subeden_teslim',o.subeden_teslim,'teslim_subesi',o.teslim_subesi,'teslim_sekli_kontrol',o.teslim_sekli_kontrol,'tarih',o.tarih,'kargo_durumu',o.kargo_durumu,'status',public.seller_order_phase(o),'shipmentStatus',o."shipmentStatus",'kargo_takip_kodu',o.kargo_takip_kodu,'kargo_takip_url',o.kargo_takip_url,'kargo_gunc_saat',o.kargo_gunc_saat,'teslimat_aciklama',o.teslimat_aciklama,'iptal_nedeni',o.iptal_nedeni,'iade_kodu',o.iade_kodu,'iade_etiket_url',o.iade_etiket_url,'iade_durumu',o.iade_durumu,'iade_tarihi',o.iade_tarihi,'iade_takip_kodu',o.iade_takip_kodu,'iade_teslim_tarihi',o.iade_teslim_tarihi,'iade_hareketleri',o.iade_hareketleri,'iade_takip_hatasi',o.iade_takip_hatasi,'kargo_hareketleri',public.seller_tracking_events(o.kargo_api_yanit));
$function$;


notify pgrst, 'reload schema';

commit;