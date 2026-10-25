BEGIN;
CREATE TEMP TABLE queue_check_cases(kind text,claims jsonb,before_data jsonb) ON COMMIT DROP;
GRANT ALL ON queue_check_cases TO authenticated;
DO $test$ DECLARE u record; result jsonb; kind text; BEGIN
 FOR u IN select id,raw_app_meta_data as metadata from auth.users where raw_app_meta_data->>'role'='seller' or (raw_app_meta_data->>'firma'='gazi' and coalesce(raw_app_meta_data->>'role','')<>'seller') order by (raw_app_meta_data->>'role'='seller') asc limit 4 LOOP
  kind:=case when u.metadata->>'role'='seller' then 'seller' else 'admin' end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','app_metadata',u.metadata)::text,true);
  perform set_config('request.jwt.claim.sub',u.id::text,true);
  SET LOCAL ROLE authenticated;
  if kind='seller' then result:=public.gazi_operation_counts(); else result:=public.gazi_operation_counts(); end if;
  insert into queue_check_cases values(kind,auth.jwt(),result);
  RESET ROLE;
 END LOOP;
END $test$;
-- Include the queue in the existing admin-only counter query.
DO $patch$
DECLARE definition text; revised text;
BEGIN
 definition:=pg_get_functiondef('public.gazi_operation_counts()'::regprocedure);
 IF position('missing_pending_ids' in definition)>0 THEN RETURN; END IF;
 revised:=replace(definition,'SELECT case when trim(kargo_adet)',
  $new$SELECT siparis_no,coalesce(bolunme_ana_siparis_no,siparis_no) as split_sort,
  (teslim_sekli_kontrol is true or nullif(btrim(sehir),'') is null or nullif(btrim(ilce),'') is null or (subeden_teslim is true and nullif(btrim(teslim_subesi),'') is null) or (subeden_teslim is not true and nullif(btrim(adres),'') is null)) as has_missing_delivery,
  case when trim(kargo_adet)$new$);
 revised:=replace(revised,'SELECT parcels,prepare,created','SELECT siparis_no,split_sort,has_missing_delivery,parcels,prepare,created');
 revised:=replace(revised,$old$'prepare',count(*)$old$,
  $new$'missing_pending_ids',coalesce(jsonb_agg(siparis_no order by split_sort desc,siparis_no asc) filter(where prepare and has_missing_delivery),'[]'::jsonb),
 'prepare',count(*)$new$);
 IF revised=definition OR position('as has_missing_delivery' in revised)=0 OR position('''missing_pending_ids'',' in revised)=0 THEN RAISE EXCEPTION 'Unexpected counter function structure'; END IF;
 EXECUTE revised;
END;
$patch$;

DO $test$ DECLARE c record; actual jsonb; filtered jsonb; expected jsonb; BEGIN
 FOR c IN select * from queue_check_cases LOOP
  perform set_config('request.jwt.claims',c.claims::text,true);
  perform set_config('request.jwt.claim.sub',c.claims->>'sub',true);
  SET LOCAL ROLE authenticated;
  if c.kind='seller' then actual:=public.gazi_operation_counts();filtered:=public.gazi_operation_counts(); else actual:=public.gazi_operation_counts();filtered:=public.gazi_operation_counts(); end if;
  IF (actual-'missing_pending_ids') IS DISTINCT FROM (c.before_data-'missing_pending_ids') THEN raise exception 'Existing response changed'; END IF;
  select coalesce(jsonb_agg(o.siparis_no order by coalesce(o.bolunme_ana_siparis_no,o.siparis_no) desc,o.siparis_no asc),'[]'::jsonb) into expected from public.gazi_siparisler o where coalesce(o.kargo_durumu,'')<>'Silindi' and o.kargo_durumu='Bekliyor' and c.kind='admin' and (o.teslim_sekli_kontrol is true or nullif(btrim(o.sehir),'') is null or nullif(btrim(o.ilce),'') is null or (o.subeden_teslim is true and nullif(btrim(o.teslim_subesi),'') is null) or (o.subeden_teslim is not true and nullif(btrim(o.adres),'') is null));
  IF actual->'missing_pending_ids' IS DISTINCT FROM expected THEN raise exception 'Queue ownership or completeness mismatch'; END IF;
  IF filtered->'missing_pending_ids' IS DISTINCT FROM expected THEN raise exception 'Queue depends on filter/search/page'; END IF;
  RESET ROLE;
 END LOOP;
END $test$;
SELECT count(*) AS accounts_verified FROM queue_check_cases;
ROLLBACK;
