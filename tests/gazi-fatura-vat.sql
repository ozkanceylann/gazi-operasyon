begin;
select set_config('invoice_test.actor',(select id::text from auth.users where raw_app_meta_data->>'firma'='gazi' and coalesce(raw_app_meta_data->>'role','')<>'seller' limit 1),true);
set local role service_role;
do $test$ declare n integer;r jsonb;f public.gazi_faturalar;
begin
 select siparis_no into n from public.gazi_siparisler where kargo_durumu='Tamamlandı' and toplam_tutar='1300' limit 1;
 if n is null then raise exception 'Test order missing';end if;
 r:=public.gazi_fatura_test_hazirla(n,current_setting('invoice_test.actor')::uuid);
 select * into strict f from public.gazi_faturalar where id=(r->>'fatura_id')::uuid;
 if f.genel_toplam is distinct from 1300::numeric or f.ara_toplam is distinct from 1287.13::numeric or f.kdv_toplami is distinct from 12.87::numeric or f.odeme_bilgileri->>'kdv_orani' is distinct from '1' or f.ara_toplam+f.kdv_toplami is distinct from f.genel_toplam then raise exception 'VAT calculation failed';end if;
r:=public.gazi_fatura_test_sonuc(f.id,'{"baglanti_basarili":false}'::jsonb);
 if r->>'genel_toplam' is distinct from '1300.00' or r->>'kdv_toplami' is distinct from '12.87' then raise exception 'Result totals missing';end if;
end $test$;
reset role;
rollback;
select 'VAT inclusive test passed; no invoice persisted' result;