begin;
do $test$
declare n integer; invoice_id uuid;
begin
 select min(siparis_no) into n from public.gazi_siparisler;
 insert into public.gazi_faturalar(siparis_no,aciklama) values(n,'Schema validation - rollback') returning id into invoice_id;
 begin
  insert into public.gazi_faturalar(siparis_no) values(n);
  raise exception 'Duplicate protection failed';
 exception when unique_violation then null;end;
 begin
  update public.gazi_faturalar set genel_toplam=-1 where id=invoice_id;
  raise exception 'Negative amount protection failed';
 exception when check_violation then null;end;
 update public.gazi_faturalar set durum='hata',son_hata='Test',deneme_sayisi=1 where id=invoice_id;
 if (select updated_at<=created_at from public.gazi_faturalar where id=invoice_id) then raise exception 'Timestamp trigger failed';end if;
 if has_table_privilege('authenticated','public.gazi_faturalar','INSERT') or has_table_privilege('anon','public.gazi_faturalar','SELECT') then raise exception 'Unsafe grants';end if;
end $test$;
set local role authenticated;
select set_config('request.jwt.claims','{"app_metadata":{"firma":"gazi","role":"seller"}}',true);
do $test$ begin if exists(select 1 from public.gazi_faturalar) then raise exception 'Seller read leak';end if;end $test$;
select set_config('request.jwt.claims','{"app_metadata":{"firma":"gazi","role":"admin"}}',true);
do $test$ begin if (select count(*) from public.gazi_faturalar)<>1 then raise exception 'Admin read failed';end if;end $test$;
reset role;
rollback;
select (select count(*) from public.gazi_faturalar) persisted_rows,c.relrowsecurity rls_enabled,
(select count(*) from information_schema.columns where table_schema='public' and table_name='gazi_faturalar') column_count
from pg_class c where c.oid='public.gazi_faturalar'::regclass;