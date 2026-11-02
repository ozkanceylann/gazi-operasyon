-- DHL may append a dated Shipment Created row after a physical transfer scan.
-- Keep the raw carrier response and derive the visible stage from matching evidence.
create or replace function public.gazi_handover_evidence(p_shipment text,p_reference text,p_payload text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare payload jsonb; movement jsonb; code integer;
begin
 if coalesce(p_shipment,'') !~ '^[0-9]{12}$' then return null;end if;
 begin payload:=coalesce(nullif(p_payload,'')::jsonb,'{}');exception when others then return null;end;
 select x.value into movement
 from jsonb_array_elements(
  (case when jsonb_typeof(payload#>'{tracking,movements}')='array' then payload#>'{tracking,movements}' else '[]'::jsonb end)||
  (case when jsonb_typeof(payload#>'{bulk_tracking,status,movements}')='array' then payload#>'{bulk_tracking,status,movements}' else '[]'::jsonb end)
 ) with ordinality x(value,position)
 where x.value->>'shipmentId'=p_shipment
 and (nullif(x.value->>'referenceId','') is null or x.value->>'referenceId'=p_reference)
 and x.value->>'eventSequence' in ('2','3','4','5','6','7','8')
 order by case
  when x.value->>'eventDateTime2' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' then x.value->>'eventDateTime2'
  when x.value->>'eventDateTime' ~ '^[0-9]{2}[.-][0-9]{2}[.-][0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2}$' then substring(x.value->>'eventDateTime',7,4)||'-'||substring(x.value->>'eventDateTime',4,2)||'-'||substring(x.value->>'eventDateTime',1,2)||substring(x.value->>'eventDateTime',11)
  end desc nulls last,x.position desc limit 1;
 if movement is null then return null;end if;
 code:=(movement->>'eventSequence')::integer;
 return jsonb_build_object('code',code,'movement',movement,'shipmentId',p_shipment,
  'status',case code when 2 then 'Transfer_Aşamasında' when 3 then 'Teslimat_Birimine_Ulaştı' when 4 then 'Alıcı_Adresine_Yönlendirildi' when 5 then 'Teslim_Edildi' when 6 then 'Teslim_Edilemedi' when 7 then 'Geri_Geliyor' when 8 then 'Destek_Gerekiyor' end);
end $$;
revoke all on function public.gazi_handover_evidence(text,text,text) from public,anon;
grant execute on function public.gazi_handover_evidence(text,text,text) to authenticated,service_role;

create or replace function public.gazi_keep_handover_stage()
returns trigger language plpgsql security invoker set search_path='' as $$
declare evidence jsonb;payload jsonb;reported integer;visible integer;
begin
 if new.kargo_durumu is distinct from 'Kargolandı' or coalesce(new."shipmentStatusCode",0)>1 or coalesce(new."isDelivered",false)
 or coalesce(new.kargo_takip_kodu,'') !~ '^[0-9]{12}$' then return new;end if;
 reported:=new."shipmentStatusCode";
 evidence:=public.gazi_handover_evidence(new.kargo_takip_kodu,new.kargo_siparis_no,new.kargo_api_yanit);
 if evidence is null and tg_op='UPDATE' then
  if old.kargo_takip_kodu=new.kargo_takip_kodu and old.kargo_siparis_no is not distinct from new.kargo_siparis_no
  and old.kargo_durumu='Kargolandı' and old."shipmentStatusCode" between 2 and 8 then
   evidence:=jsonb_build_object('code',old."shipmentStatusCode",'status',old."shipmentStatus",'shipmentId',new.kargo_takip_kodu,'source','previous_confirmed_stage');
  end if;
 end if;
 if evidence is null then return new;end if;
 visible:=(evidence->>'code')::integer;
 new."shipmentStatusCode":=visible;new."shipmentStatus":=evidence->>'status';new."isDelivered":=visible=5;
 if evidence?'movement' then
  new.teslimat_aciklama:=concat_ws(' · ',nullif(evidence#>>'{movement,location}',''),nullif(evidence#>>'{movement,eventStatus}',''),nullif(evidence#>>'{movement,description}',''));
 elsif tg_op='UPDATE' then new.teslimat_aciklama:=old.teslimat_aciklama;
 end if;
 begin payload:=coalesce(nullif(new.kargo_api_yanit,'')::jsonb,'{}');exception when others then payload:=jsonb_build_object('previous_raw',new.kargo_api_yanit);end;
 if jsonb_typeof(payload) is distinct from 'object' then payload:=jsonb_build_object('previous_raw',payload);end if;
 new.kargo_api_yanit:=(payload||jsonb_build_object('effective_tracking',evidence||jsonb_build_object('reportedCode',reported,'reason','physical_handover_confirmed')))::text;
 return new;
end $$;
revoke all on function public.gazi_keep_handover_stage() from public,anon;
drop trigger if exists gazi_keep_handover_stage on public.gazi_siparisler;
create trigger gazi_keep_handover_stage before insert or update of kargo_api_yanit,"shipmentStatusCode","shipmentStatus",kargo_takip_kodu,kargo_siparis_no,kargo_durumu
on public.gazi_siparisler for each row execute function public.gazi_keep_handover_stage();
