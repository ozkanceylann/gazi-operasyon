-- One approval applies only to the reviewed order contents. No historical auto-approval.
create schema if not exists gazi_shipping;
revoke all on schema gazi_shipping from public, anon;
grant usage on schema gazi_shipping to authenticated, service_role;
create table gazi_shipping.approvals (
 order_id integer primary key references public.gazi_siparisler(siparis_no) on delete cascade,
 fingerprint text not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now()
);
alter table gazi_shipping.approvals enable row level security;
revoke all on gazi_shipping.approvals from public, anon, authenticated, service_role;

create function gazi_shipping.fingerprint(o public.gazi_siparisler) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(o.ad_soyad,o.musteri_tel,o.adres,o.sehir,o.ilce,o.urun_bilgisi,o.toplam_tutar,o.odeme_sekli,o.notlar,o.kargo_adet,o.kargo_kg,o.subeden_teslim,o.teslim_subesi,o.teslim_sekli_kontrol,o.bolunme_ana_siparis_no)::text);
$$;
create function gazi_shipping.state(o public.gazi_siparisler) returns jsonb
language plpgsql stable set search_path='' as $$
declare mobile boolean; eft boolean; free_order boolean; approved boolean; receipts integer; receipt_ok boolean; reasons text[]:='{}'; stamp timestamptz;
begin
 mobile:=exists(select 1 from public.tum_siparisler t where t.siparis_no in (o.siparis_no,o.bolunme_ana_siparis_no) and lower(coalesce(t.siparis_sekli,''))='mobil')
  or exists(select 1 from mobile_intake.requests r where r.order_no in (o.siparis_no,o.bolunme_ana_siparis_no) and not r.is_test and r.status='completed');
 eft:=coalesce(o.odeme_sekli,'') ~* '\m(eft|iban|havale|fast)\M';
 free_order:=not eft and (coalesce(o.odeme_sekli,'') ~* '\m(bedelsiz|ücretsiz|ucretsiz)\M' or coalesce(o.toplam_tutar,'') ~* '^[[:space:]]*0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$');
 select a.approved_at into stamp from gazi_shipping.approvals a where a.order_id=o.siparis_no and a.fingerprint=gazi_shipping.fingerprint(o);
 approved:=stamp is not null;
 select count(*),coalesce(bool_or(r.status='approved'),false) into receipts,receipt_ok from public.order_receipts r where r.order_id in (o.siparis_no,o.bolunme_ana_siparis_no) and nullif(btrim(r.object_path),'') is not null;
 if (mobile or free_order) and not approved then reasons:=array_append(reasons,case when mobile then 'Mobil sipariş için Gazi Operasyon onayı gerekli.' else 'Ücretsiz sipariş için Gazi Operasyon onayı gerekli.' end);end if;
 if eft and receipts=0 then reasons:=array_append(reasons,'EFT siparişine dekont eklenmeden kargoya gönderilemez.');
 elsif eft and not receipt_ok then reasons:=array_append(reasons,'EFT dekontu Gazi Operasyon tarafından onaylanmalı.');end if;
 return jsonb_build_object('order_id',o.siparis_no,'mobile',mobile,'free',free_order,'eft',eft,'approval_required',mobile or free_order,'approved',approved,'approved_at',stamp,'receipt_count',receipts,'receipt_approved',receipt_ok,'can_ship',cardinality(reasons)=0,'reasons',to_jsonb(reasons),'fingerprint',gazi_shipping.fingerprint(o));
end $$;

-- Only this authenticated entry point is callable by the API roles.
create function gazi_shipping.api(p_mode text,p_id integer default null,p_ids integer[] default null,p_fingerprint text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.gazi_siparisler; result jsonb; svc boolean:=coalesce(auth.jwt()->>'role','')='service_role';
begin
 if not svc and (auth.uid() is null or not public.seller_is_gazi_admin()) then raise exception 'Gazi Operasyon yetkisi gerekli.' using errcode='42501';end if;
 if p_mode='status' then
  if coalesce(cardinality(p_ids),0)>100 then raise exception 'En fazla 100 sipariş sorgulanabilir.';end if;
  select coalesce(jsonb_agg(gazi_shipping.state(s)),'[]'::jsonb) into result from public.gazi_siparisler s where s.siparis_no=any(p_ids);return result;
 end if;
 select * into o from public.gazi_siparisler where siparis_no=p_id for update;
 if not found then raise exception 'Sipariş bulunamadı.';end if;
 if p_mode='approve' then
  if svc or auth.uid() is null then raise exception 'Onay için Gazi Operasyon kullanıcı oturumu gerekli.' using errcode='42501';end if;
  if p_fingerprint is distinct from gazi_shipping.fingerprint(o) then raise exception 'Sipariş değişti. Yeniden açıp kontrol ederek onaylayın.';end if;
  if o.kargo_durumu not in ('Bekliyor','Hazırlandı') then raise exception 'Yalnız kargolanmamış sipariş onaylanabilir.';end if;
  insert into gazi_shipping.approvals(order_id,fingerprint,approved_by) values(o.siparis_no,gazi_shipping.fingerprint(o),auth.uid())
   on conflict(order_id) do update set fingerprint=excluded.fingerprint,approved_by=excluded.approved_by,approved_at=now();
  return gazi_shipping.state(o);
 elsif p_mode='authorize' then
  result:=gazi_shipping.state(o);
  if not (result->>'can_ship')::boolean then raise exception '%', (select string_agg(v,' ') from jsonb_array_elements_text(result->'reasons') v);end if;
  return to_jsonb(o);
 end if;
 raise exception 'Geçersiz işlem.';
end $$;
revoke all on all functions in schema gazi_shipping from public, anon, authenticated, service_role;
grant execute on function gazi_shipping.api(text,integer,integer[],text) to authenticated,service_role;

create function public.gazi_shipping_status(p_ids integer[]) returns jsonb language sql set search_path='' as $$ select gazi_shipping.api('status',null,p_ids); $$;
create function public.gazi_shipping_approve(p_id integer,p_fingerprint text) returns jsonb language sql set search_path='' as $$ select gazi_shipping.api('approve',p_id,null,p_fingerprint); $$;
create function public.gazi_shipping_authorize(p_id integer) returns jsonb language sql set search_path='' as $$ select gazi_shipping.api('authorize',p_id); $$;
revoke all on function public.gazi_shipping_status(integer[]),public.gazi_shipping_approve(integer,text),public.gazi_shipping_authorize(integer) from public,anon;
grant execute on function public.gazi_shipping_status(integer[]),public.gazi_shipping_approve(integer,text),public.gazi_shipping_authorize(integer) to authenticated;
grant execute on function public.gazi_shipping_authorize(integer) to service_role;

-- Protect direct writes too; n8n also authorizes BEFORE calling DHL.
create function gazi_shipping.guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 if nullif(old.orderinvoiceid,'') is null and nullif(old.kargo_takip_kodu,'') is null
 and (nullif(new.orderinvoiceid,'') is not null or nullif(new.kargo_takip_kodu,'') is not null or (new.kargo_durumu='Kargolandı' and old.kargo_durumu is distinct from 'Kargolandı')) then
  s:=gazi_shipping.state(new);
  if not (s->>'can_ship')::boolean then raise exception '%',(select string_agg(v,' ') from jsonb_array_elements_text(s->'reasons') v);end if;
 end if;
 return new;
end $$;
revoke all on function gazi_shipping.guard() from public,anon,authenticated,service_role;
create trigger gazi_shipping_approval_guard before update on public.gazi_siparisler for each row execute function gazi_shipping.guard();
notify pgrst,'reload schema';
