create or replace function public.gazi_fatura_test_hazirla(p_siparis_no integer,p_actor uuid) returns jsonb
language plpgsql set search_path='' as $fn$
declare o public.gazi_siparisler; f public.gazi_faturalar;
begin
 -- Only service_role may call this RPC; n8n verifies the user with /auth/v1/user before passing p_actor.
 if p_actor is null then raise exception 'İşlemi başlatan kullanıcı gerekli';end if;
 perform pg_advisory_xact_lock(72645,p_siparis_no);
 select * into o from public.gazi_siparisler where siparis_no=p_siparis_no for share;
 if not found or coalesce(o.kargo_durumu,'') in ('İptal','Silindi','İade') or not (o.kargo_durumu='Tamamlandı' or coalesce(o."isDelivered",false) or coalesce(o."shipmentStatusCode",0)=5) then raise exception 'Yalnızca tamamlanan siparişler faturalanabilir';end if;
 select * into f from public.gazi_faturalar where siparis_no=p_siparis_no and ortam='test' and durum<>'iptal' for update;
 if found and f.durum not in ('taslak','hata') then raise exception 'Bu siparişin fatura işlemi zaten başlatılmış';end if;
 if f.id is null then
 insert into public.gazi_faturalar(siparis_no,ortam,olusturan,alici_bilgileri,siparis_ozeti)
 values(p_siparis_no,'test',p_actor,jsonb_build_object('ad_soyad',o.ad_soyad,'telefon',o.musteri_tel,'adres',o.adres,'sehir',o.sehir,'ilce',o.ilce),
 jsonb_build_object('siparis_no',o.siparis_no,'urun_bilgisi',o.urun_bilgisi,'toplam_tutar',o.toplam_tutar,'odeme_sekli',o.odeme_sekli,'notlar',o.notlar,'kargo_adet',o.kargo_adet,'kargo_kg',o.kargo_kg)) returning * into f;
 end if;
 return jsonb_build_object('fatura_id',f.id,'siparis_no',f.siparis_no,'ortam','test','durum',f.durum);
end $fn$;
revoke all on function public.gazi_fatura_test_hazirla(integer,uuid) from public,anon,authenticated;
grant execute on function public.gazi_fatura_test_hazirla(integer,uuid) to service_role;

create or replace function public.gazi_fatura_test_sonuc(p_fatura_id uuid,p_sonuc jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare ok boolean:=coalesce((p_sonuc->>'baglanti_basarili')::boolean,false); f public.gazi_faturalar; msg text;
begin
 msg:=case when ok then 'İşNet test servisine erişildi. Taslak kaydedildi. Fatura gönderimi için servis dokümanı ve ürün/KDV bilgileri tamamlanmalı.' else 'İşNet test servisi bağlantısı doğrulanamadı. Fatura kesilmedi.' end;
 update public.gazi_faturalar set durum='taslak',son_sorgu_at=now(),deneme_sayisi=deneme_sayisi+1,
 yanit_verisi=p_sonuc,son_hata=case when ok then null else 'Test servisi bağlantısı doğrulanamadı' end,
 islem_gecmisi=islem_gecmisi||jsonb_build_array(jsonb_build_object('zaman',now(),'islem','test_baglanti','sonuc',p_sonuc))
 where id=p_fatura_id and ortam='test' and durum in ('taslak','hata') returning * into f;
 if not found then raise exception 'Test taslağı bulunamadı';end if;
 return jsonb_build_object('success',true,'issued',false,'baglanti_basarili',ok,'fatura_id',f.id,'siparis_no',f.siparis_no,'durum',f.durum,'ortam','test','message',msg);
end $fn$;
revoke all on function public.gazi_fatura_test_sonuc(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gazi_fatura_test_sonuc(uuid,jsonb) to service_role;