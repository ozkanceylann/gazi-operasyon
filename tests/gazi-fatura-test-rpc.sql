begin;
select set_config('invoice_test.actor',(select id::text from auth.users where raw_app_meta_data->>'firma'='gazi' and coalesce(raw_app_meta_data->>'role','')<>'seller' limit 1),true);
set local role service_role;
do $test$
declare n integer; r jsonb; r2 jsonb; f uuid;
begin
 select siparis_no into n from public.gazi_siparisler where kargo_durumu='Tamamlandı' limit 1;
 r:=public.gazi_fatura_test_hazirla(n,current_setting('invoice_test.actor')::uuid);f:=(r->>'fatura_id')::uuid;
 r2:=public.gazi_fatura_test_hazirla(n,current_setting('invoice_test.actor')::uuid);
 if r2->>'fatura_id'<>r->>'fatura_id' then raise exception 'Duplicate draft';end if;
 r:=public.gazi_fatura_test_sonuc(f,'{"baglanti_basarili":false,"belge_gonderildi":false}'::jsonb);
 if r->>'issued'<>'false' or r->>'durum'<>'taslak' then raise exception 'Unexpected invoice state';end if;
 if (select count(*) from public.gazi_faturalar where id=f and son_hata is not null and deneme_sayisi=1)<>1 then raise exception 'Result not persisted';end if;
 select siparis_no into n from public.gazi_siparisler where kargo_durumu='Bekliyor' limit 1;
 begin perform public.gazi_fatura_test_hazirla(n,current_setting('invoice_test.actor')::uuid);raise exception 'Pending accepted';
 exception when raise_exception then if sqlerrm='Pending accepted' then raise;end if;end;
 if has_function_privilege('authenticated','public.gazi_fatura_test_hazirla(integer,uuid)','EXECUTE') then raise exception 'Browser can bypass n8n auth';end if;
end $test$;
reset role;
rollback;
select count(*) persisted_rows from public.gazi_faturalar;