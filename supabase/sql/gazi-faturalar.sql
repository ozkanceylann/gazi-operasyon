-- Invoice persistence only. No call to IsNet and no automatic invoicing.
create table public.gazi_faturalar (
 id uuid primary key default gen_random_uuid(),
 siparis_no integer not null references public.gazi_siparisler(siparis_no) on delete restrict,
 ortam text not null default 'test' check (ortam in ('test','canli')),
 saglayici text not null default 'isnet' check (saglayici='isnet'),
 durum text not null default 'taslak' check (durum in ('taslak','hazirlaniyor','gonderiliyor','sonuc_bekleniyor','kesildi','hata','reddedildi','iptal')),
 istek_anahtari uuid not null default gen_random_uuid() unique,
 fatura_uuid uuid,
 fatura_no text check (fatura_no is null or btrim(fatura_no)<>''),
 fatura_tarihi date,
 belge_turu text check (belge_turu in ('e_fatura','e_arsiv')),
 senaryo text,
 fatura_tipi text,
 satici_vkn_tckn text check (satici_vkn_tckn is null or satici_vkn_tckn ~ '^([0-9]{10}|[0-9]{11})$'),
 alici_vkn_tckn text check (alici_vkn_tckn is null or alici_vkn_tckn ~ '^([0-9]{10}|[0-9]{11})$'),
 alici_bilgileri jsonb not null default '{}' check (jsonb_typeof(alici_bilgileri)='object'),
 satici_bilgileri jsonb not null default '{}' check (jsonb_typeof(satici_bilgileri)='object'),
 siparis_ozeti jsonb not null default '{}' check (jsonb_typeof(siparis_ozeti)='object'),
 kalemler jsonb not null default '[]' check (jsonb_typeof(kalemler)='array'),
 para_birimi text not null default 'TRY' check (para_birimi ~ '^[A-Z]{3}$'),
 ara_toplam numeric(18,2) check (ara_toplam>=0),
 iskonto_toplami numeric(18,2) check (iskonto_toplami>=0),
 kdv_toplami numeric(18,2) check (kdv_toplami>=0),
 genel_toplam numeric(18,2) check (genel_toplam>=0),
 odenecek_tutar numeric(18,2) check (odenecek_tutar>=0),
 odeme_bilgileri jsonb not null default '{}' check (jsonb_typeof(odeme_bilgileri)='object'),
 aciklama text,
 isnet_belge_id text,
 isnet_durum_kodu text,
 isnet_durum_aciklamasi text,
 istek_verisi jsonb,
 yanit_verisi jsonb,
 xml_icerik text,
 pdf_dosya_yolu text,
 xml_dosya_yolu text,
 islem_gecmisi jsonb not null default '[]' check (jsonb_typeof(islem_gecmisi)='array'),
 deneme_sayisi integer not null default 0 check (deneme_sayisi>=0),
 son_hata text,
 gonderim_basladi_at timestamptz,
 kesildi_at timestamptz,
 son_sorgu_at timestamptz,
 iptal_at timestamptz,
 iptal_nedeni text,
 olusturan uuid references auth.users(id) on delete set null,
 onaylayan uuid references auth.users(id) on delete set null,
 onaylandi_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
-- Retrying errors/timeouts must reuse the existing row and request key.
create unique index gazi_faturalar_aktif_siparis_uq on public.gazi_faturalar(siparis_no,ortam) where durum<>'iptal';
create unique index gazi_faturalar_uuid_uq on public.gazi_faturalar(ortam,fatura_uuid) where fatura_uuid is not null;
create unique index gazi_faturalar_no_uq on public.gazi_faturalar(ortam,coalesce(satici_vkn_tckn,''),fatura_no) where fatura_no is not null;
create index gazi_faturalar_durum_tarih_idx on public.gazi_faturalar(ortam,durum,created_at desc);
create index gazi_faturalar_siparis_idx on public.gazi_faturalar(siparis_no);

comment on table public.gazi_faturalar is 'Gazi siparis faturalarinin merkezi kaydi. IsNet SOAP entegrasyonu; test ve canli ayridir. API sifrelari burada tutulmaz.';
comment on column public.gazi_faturalar.alici_bilgileri is 'Fatura anindaki ad/unvan, adres, il, ilce, vergi dairesi, eposta ve telefon anlik goruntusu.';
comment on column public.gazi_faturalar.kalemler is 'Urun adi, miktar, birim, birim fiyat, iskonto, KDV orani ve tutarlarin fatura anindaki goruntusu.';
comment on column public.gazi_faturalar.siparis_ozeti is 'Faturalama anindaki siparis bilgileri; sonraki siparis duzenlemelerinden bagimsizdir.';
comment on column public.gazi_faturalar.islem_gecmisi is 'Servis tarafindan eklenen zaman, islem, durum, istek/yanit ozeti. Kimlik dogrulama bilgisi kaydedilmez.';
comment on column public.gazi_faturalar.pdf_dosya_yolu is 'Ozel Supabase Storage PDF nesnesi yolu; gecici imzali URL saklanmaz.';
comment on column public.gazi_faturalar.istek_anahtari is 'Ayni fatura isteginin tekrarlarinda degismeyen yerel islem anahtari; saglayici tarafinda mutabakat ayrica uygulanmalidir.';

create function public.gazi_faturalar_set_updated_at() returns trigger language plpgsql set search_path='' as $fn$
begin new.updated_at:=clock_timestamp();return new;end;
$fn$;
revoke all on function public.gazi_faturalar_set_updated_at() from public,anon,authenticated;
create trigger gazi_faturalar_updated_at before update on public.gazi_faturalar for each row execute function public.gazi_faturalar_set_updated_at();

alter table public.gazi_faturalar enable row level security;
revoke all on public.gazi_faturalar from public,anon,authenticated;
grant select on public.gazi_faturalar to authenticated;
grant select,insert,update on public.gazi_faturalar to service_role;
create policy gazi_faturalar_operasyon_read on public.gazi_faturalar for select to authenticated using ((select public.seller_is_gazi_admin()));
