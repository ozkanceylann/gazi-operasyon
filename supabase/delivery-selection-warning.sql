DO $patch$
DECLARE name text; d text; revised text; prefix text; oldbranch text; newbranch text;
BEGIN
 FOREACH name IN ARRAY ARRAY['admin_orders(text,text,integer)','seller_orders(text,text,integer)','gazi_operation_counts()'] LOOP
  d:=pg_get_functiondef(('public.'||name)::regprocedure);
  prefix:=case when name='gazi_operation_counts()' then '' else 'o.' end;
  revised:=replace(d,prefix||'teslim_sekli_kontrol is true or',
   '('||prefix||'teslim_sekli_kontrol is true or '||prefix||'subeden_teslim is null or lower(btrim(coalesce('||prefix||$expr$teslim_subesi,''))) ~ '^(teslim( şekli)? seç(in|iniz)?|seç(in|iniz)?)$') or$expr$);
  oldbranch:='nullif(btrim('||prefix||$expr$teslim_subesi),'') is null$expr$;
  newbranch:='('||oldbranch||' or lower(regexp_replace(btrim(coalesce('||prefix||$expr$teslim_subesi,'')),'[[:space:]]+',' ','g')) ~ '^(dhl( kargo)?( şubesi)?|kargo( şubesi)?|şube( seç(in|iniz)?)?|teslim alınacak (dhl )?şube(si)?|seç(in|iniz)?)$')$expr$;
  revised:=replace(revised,oldbranch,newbranch);
  IF revised=d THEN RAISE EXCEPTION 'Expected delivery predicate missing: %',name; END IF;
  EXECUTE revised;
 END LOOP;
END $patch$;
