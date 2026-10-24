-- Return shipment state is independent of the outbound shipment.
alter table public.gazi_siparisler
 add column if not exists iade_takip_kodu text,
 add column if not exists iade_teslim_tarihi timestamptz,
 add column if not exists iade_son_kontrol timestamptz,
 add column if not exists iade_hareketleri jsonb not null default '[]',
 add column if not exists iade_takip_hatasi text;

create index if not exists gazi_open_returns_check on public.gazi_siparisler(iade_son_kontrol nulls first,siparis_no)
 where iade_kodu is not null and iade_teslim_tarihi is null;

create or replace function public.gazi_iade_tracking_save(p_id integer,p_reference text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.gazi_siparisler; events jsonb; delivery timestamptz; stage text;
begin
 if current_user not in ('postgres','service_role') then raise exception 'Sunucu yetkisi gerekli'; end if;
 select * into o from public.gazi_siparisler where siparis_no=p_id for update;
 if not found or o.iade_kodu is distinct from p_reference or nullif(p_reference,'') is null then raise exception 'İade referansı eşleşmedi'; end if;
 if o.iade_teslim_tarihi is not null then return jsonb_build_object('ok',true,'completed',true); end if;
 if p_data->>'error' is not null then
  update public.gazi_siparisler set iade_son_kontrol=now(),iade_takip_hatasi=left(p_data->>'error',300) where siparis_no=p_id;
  return jsonb_build_object('ok',true,'retry',true);
 end if;
 stage:=p_data->>'stage';
 if stage not in ('İade teslim bekliyor','İade kargoya verildi','İade yolda','İade dağıtımda','İade teslim edildi','İade teslim edilemedi','İade sorun') or stage is null then raise exception 'Geçersiz iade aşaması'; end if;
 if nullif(p_data->>'shipmentId','') is null or p_data->>'shipmentId'=o.kargo_takip_kodu or (o.iade_takip_kodu is not null and o.iade_takip_kodu<>p_data->>'shipmentId') then raise exception 'İade gönderisi eşleşmedi'; end if;
 if stage='İade teslim edildi' then
  delivery:=coalesce(nullif(p_data->>'deliveredAt','')::timestamptz,now());
 end if;
 select coalesce(jsonb_agg(e order by e->>'eventDateTime',e->>'eventSequence'),'[]') into events
 from (select distinct value as e from jsonb_array_elements(coalesce(o.iade_hareketleri,'[]') || coalesce(p_data->'events','[]'))) merged;
 update public.gazi_siparisler set iade_takip_kodu=p_data->>'shipmentId',iade_durumu=stage,
  iade_teslim_tarihi=delivery,iade_son_kontrol=now(),iade_takip_hatasi=null,iade_hareketleri=events where siparis_no=p_id;
 return jsonb_build_object('ok',true,'completed',delivery is not null);
end $$;
revoke all on function public.gazi_iade_tracking_save(integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.gazi_iade_tracking_save(integer,text,jsonb) to service_role;

update public.gazi_siparisler set iade_durumu='İade teslim bekliyor',
 iade_hareketleri=jsonb_build_array(jsonb_build_object('eventStatus','İade teslim bekliyor','eventDateTime',iade_tarihi,'description','İade fişi oluşturuldu. DHL teslim alımı bekleniyor.'))
 where nullif(trim(iade_kodu),'') is not null and coalesce(iade_durumu,'') in ('','Etiket Oluşturuldu') and iade_teslim_tarihi is null;

-- Preserve the current view's columns and RLS behavior; append only light list fields.
do $$ declare v text; begin
 v:=pg_get_viewdef('public.gazi_order_list'::regclass,true);
 v:=replace(v,'groups.group_label_created AS liste_etiket_tarihi','groups.group_label_created AS liste_etiket_tarihi, o.iade_takip_kodu, o.iade_teslim_tarihi, (o.iade_teslim_tarihi is not null) as iade_tamamlandi');
 execute 'create or replace view public.gazi_order_list with (security_invoker=true) as '||v;
end $$;

-- Extend the existing safe mobile projection without changing ownership checks.
do $$ declare v text; begin
 v:=pg_get_functiondef('public.seller_order_safe(public.gazi_siparisler)'::regprocedure);
 v:=replace(v,'''iade_tarihi'',o.iade_tarihi,','''iade_tarihi'',o.iade_tarihi,''iade_takip_kodu'',o.iade_takip_kodu,''iade_teslim_tarihi'',o.iade_teslim_tarihi,''iade_hareketleri'',o.iade_hareketleri,''iade_takip_hatasi'',o.iade_takip_hatasi,');
 execute v;
end $$;
