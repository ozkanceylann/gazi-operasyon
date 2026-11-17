-- The Gazi order list wraps its base projection in a derived table. Expose the
-- return count from the outer SELECT so PostgREST sees it as a view column.
do $$
declare
  cols text;
  definition text;
  from_position integer;
begin
  if exists (
    select 1 from pg_attribute
    where attrelid='public.gazi_order_list'::regclass
      and attname='iade_parca_adet' and attnum>0 and not attisdropped
  ) then
    return;
  end if;
  select string_agg(format('%I',attname),', ' order by attnum)
    into cols
    from pg_attribute
    where attrelid='public.gazi_order_list'::regclass
      and attnum>0 and not attisdropped;
  definition:=pg_get_viewdef('public.gazi_order_list'::regclass,true);
  from_position:=position(' FROM (' in definition);
  if from_position=0 then raise exception 'Gazi order list projection shape is unexpected'; end if;
  definition:=left(definition,from_position-1)||', iade_parca_adet'||substr(definition,from_position);
  execute 'create or replace view public.gazi_order_list ('||cols||', iade_parca_adet) with (security_invoker=true) as '||definition;
  notify pgrst,'reload schema';
end $$;
