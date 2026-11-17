-- The selected return quantity is an internal request count. It does not
-- change the DHL return-label payload or its piece list.
alter table public.gazi_siparisler
  add column if not exists iade_parca_adet integer;

alter table public.gazi_iade_islemleri
  add column if not exists iade_parca_adet integer;

create or replace function public.gazi_iade_internal(p_operation text,p_id integer,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  o public.gazi_siparisler;
  r public.gazi_iade_islemleri;
  ref text;
  link text;
  config jsonb;
  return_count integer;
  sent_count integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Sunucu yetkisi gerekli'; end if;
  select * into o from public.gazi_siparisler where siparis_no=p_id for update;
  if not found or o.kargo_durumu in ('İptal','Silindi') then raise exception 'Sipariş bulunamadı'; end if;
  select * into r from public.gazi_iade_islemleri where siparis_no=p_id for update;
  if p_operation='begin' then
    if nullif(o.iade_etiket_url,'') is not null then
      return jsonb_build_object('existing',true,'reference',o.iade_kodu,'url',o.iade_etiket_url,'iade_parca_adet',o.iade_parca_adet);
    end if;
    if r.status in ('creating','uncertain') then raise exception 'İade isteğinin sonucu bekleniyor. Tekrar kayıt açılmadı; DHL kaydı kontrol edilmeli.'; end if;
    if not coalesce(o."isDelivered",false) and coalesce(o."shipmentStatusCode",0)<>5 then raise exception 'İade etiketi yalnızca teslim edilmiş siparişe oluşturulur'; end if;
    if nullif(trim(o.ad_soyad),'') is null or nullif(trim(o.adres),'') is null
      or nullif(trim(o.sehir),'') is null or nullif(trim(o.ilce),'') is null
      or nullif(trim(o.musteri_tel),'') is null or nullif(trim(o.sehir_kodu),'') is null
      or nullif(trim(o.ilce_kodu),'') is null then raise exception 'İade için müşteri, telefon, adres ve şehir/ilçe kodları eksiksiz olmalı'; end if;
    if coalesce(trim(o.kargo_adet),'') !~ '^[0-9]+$' then raise exception 'Gönderilen paket adedi geçersiz'; end if;
    if trim(o.kargo_adet) !~ '^[0-9]{1,3}$' then raise exception 'Gönderilen paket adedi geçersiz'; end if;
    sent_count:=trim(o.kargo_adet)::integer;
    if sent_count<1 or sent_count>100 then raise exception 'Gönderilen paket adedi geçersiz'; end if;
    if nullif(p_data->>'iade_parca_adet','') is null then
      -- Backward-compatible default for clients that have not refreshed yet.
      return_count:=sent_count;
    else
      if (p_data->>'iade_parca_adet') !~ '^[0-9]{1,3}$' then raise exception 'İade paket adedi geçersiz'; end if;
      return_count:=(p_data->>'iade_parca_adet')::integer;
    end if;
    if return_count<1 or return_count>sent_count or return_count>100 then raise exception 'İade paket adedi gönderilen paket sayısı içinde olmalı'; end if;
    select jsonb_build_object('url','https://n8n.ozkanceylan.uk/webhook/gazi_iade_olustur','key',server_key)
      into config from gazi_carrier_private.return_connection where id=1;
    if nullif(config->>'url','') is null or nullif(config->>'key','') is null then raise exception 'DHL iade bağlantısı ayarlanmamış'; end if;
    ref:=coalesce(r.reference_id,'GZI-'||p_id||'-R1');
    insert into public.gazi_iade_islemleri(siparis_no,reference_id,status,iade_parca_adet)
      values(p_id,ref,'creating',return_count)
      on conflict(siparis_no) do update set status='creating',iade_parca_adet=excluded.iade_parca_adet,error=null,updated_at=now();
    return jsonb_build_object('existing',false,'order',to_jsonb(o),'reference',ref,'gateway',config,'iade_parca_adet',return_count);
  elsif p_operation='finish' then
    if r.reference_id is null or p_data->>'reference' is distinct from r.reference_id then raise exception 'İade referansı eşleşmedi'; end if;
    link:=p_data->>'url';
    if link !~ '^https://mn[.]tc[/]?[?]rtnid=[A-Za-z0-9]+$' then raise exception 'DHL iade fişi bağlantısı geçersiz'; end if;
    update public.gazi_iade_islemleri set status='ready',label_url=link,response=p_data->'response',error=null,updated_at=now() where siparis_no=p_id;
    update public.gazi_siparisler set iade_kodu=r.reference_id,iade_etiket_url=link,iade_durumu='Etiket Oluşturuldu',iade_tarihi=now(),iade_parca_adet=r.iade_parca_adet where siparis_no=p_id;
    return jsonb_build_object('reference',r.reference_id,'url',link,'iade_parca_adet',r.iade_parca_adet);
  elsif p_operation in ('failed','uncertain') then
    update public.gazi_iade_islemleri set status=p_operation,error=left(p_data->>'error',500),updated_at=now() where siparis_no=p_id and status<>'ready';
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Geçersiz iade işlemi';
end $$;
revoke all on function public.gazi_iade_internal(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.gazi_iade_internal(text,integer,jsonb) to service_role;

-- Add the light quantity to the existing list view without exposing label payloads.
do $$ declare v text; p integer; begin
  v:=pg_get_viewdef('public.gazi_order_list'::regclass,true);
  p:=position(' FROM gazi_siparisler o' in v);
  if p=0 then p:=position(' FROM public.gazi_siparisler o' in v); end if;
  if p=0 then raise exception 'Gazi order list view shape is unexpected'; end if;
  execute 'create or replace view public.gazi_order_list with (security_invoker=true) as '||left(v,p-1)||', o.iade_parca_adet'||substr(v,p);
end $$;

-- Keep the same seller ownership projection while exposing only the count.
do $$ declare v text; before_text text; after_text text; begin
  v:=pg_get_functiondef('public.seller_order_safe(public.gazi_siparisler)'::regprocedure);
  before_text:='''iade_tarihi'',o.iade_tarihi,';
  after_text:='''iade_tarihi'',o.iade_tarihi,''iade_parca_adet'',o.iade_parca_adet,';
  if position(before_text in v)=0 then raise exception 'Safe seller order projection shape is unexpected'; end if;
  execute replace(v,before_text,after_text);
end $$;

notify pgrst,'reload schema';
