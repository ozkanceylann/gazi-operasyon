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
