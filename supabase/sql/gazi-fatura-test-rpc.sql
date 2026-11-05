CREATE OR REPLACE FUNCTION public.gazi_fatura_test_hazirla(p_siparis_no integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.gazi_siparisler; f public.gazi_faturalar; gross numeric(18,2); net numeric(18,2);
begin
 -- Only service_role may call this RPC; n8n verifies the user with /auth/v1/user before passing p_actor.
 if p_actor is null then raise exception 'İşlemi başlatan kullanıcı gerekli';end if;
 perform pg_advisory_xact_lock(72645,p_siparis_no);
 select * into o from public.gazi_siparisler where siparis_no=p_siparis_no for share;
 if not found or coalesce(o.kargo_durumu,'') in ('İptal','Silindi','İade') or not (o.kargo_durumu='Tamamlandı' or coalesce(o."isDelivered",false) or coalesce(o."shipmentStatusCode",0)=5) then raise exception 'Yalnızca tamamlanan siparişler faturalanabilir';end if;
 select * into f from public.gazi_faturalar where siparis_no=p_siparis_no and ortam='test' and durum<>'iptal' for update;
 if found and f.durum not in ('taslak','hata') then raise exception 'Bu siparişin fatura işlemi zaten başlatılmış';end if;
 if f.id is null then
 if coalesce(btrim(o.toplam_tutar),'') !~ '^[0-9]+([.,][0-9]{1,2})?$' then raise exception 'Fatura tutarı sayısal olmalı; sipariş tutarını kontrol edin';end if;
 gross:=replace(btrim(o.toplam_tutar),',','.')::numeric;
 net:=round(gross/1.01,2);
 insert into public.gazi_faturalar(siparis_no,ortam,olusturan,alici_bilgileri,siparis_ozeti,ara_toplam,kdv_toplami,genel_toplam,odenecek_tutar,iskonto_toplami,odeme_bilgileri)
 values(p_siparis_no,'test',p_actor,jsonb_build_object('ad_soyad',o.ad_soyad,'telefon',o.musteri_tel,'adres',o.adres,'sehir',o.sehir,'ilce',o.ilce),
 jsonb_build_object('siparis_no',o.siparis_no,'urun_bilgisi',o.urun_bilgisi,'toplam_tutar',o.toplam_tutar,'odeme_sekli',o.odeme_sekli,'notlar',o.notlar,'kargo_adet',o.kargo_adet,'kargo_kg',o.kargo_kg),net,gross-net,gross,gross,0,jsonb_build_object('kdv_orani',1,'kdv_dahil',true,'kaynak','kullanici_onayi_2026_11_05')) returning * into f;
 end if;
 return jsonb_build_object('fatura_id',f.id,'siparis_no',f.siparis_no,'ortam','test','durum',f.durum);
end $function$
;
CREATE OR REPLACE FUNCTION public.gazi_fatura_test_sonuc(p_fatura_id uuid, p_sonuc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ok boolean:=coalesce((p_sonuc->>'baglanti_basarili')::boolean,false); f public.gazi_faturalar; msg text;
begin
 msg:=case when ok then 'İşNet test servisine erişildi. %1 KDV dahil taslak kaydedildi. Fatura gönderimi henüz etkin değil.' else 'İşNet test servisi bağlantısı doğrulanamadı. Fatura kesilmedi.' end;
 update public.gazi_faturalar set durum='taslak',son_sorgu_at=now(),deneme_sayisi=deneme_sayisi+1,
 yanit_verisi=p_sonuc,son_hata=case when ok then null else 'Test servisi bağlantısı doğrulanamadı' end,
 islem_gecmisi=islem_gecmisi||jsonb_build_array(jsonb_build_object('zaman',now(),'islem','test_baglanti','sonuc',p_sonuc))
 where id=p_fatura_id and ortam='test' and durum in ('taslak','hata') returning * into f;
 if not found then raise exception 'Test taslağı bulunamadı';end if;
 return jsonb_build_object('success',true,'issued',false,'baglanti_basarili',ok,'fatura_id',f.id,'siparis_no',f.siparis_no,'durum',f.durum,'ortam','test','ara_toplam',f.ara_toplam,'kdv_toplami',f.kdv_toplami,'genel_toplam',f.genel_toplam,'message',msg);
end $function$
;
