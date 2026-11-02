begin;
do $$
declare o public.gazi_siparisler; original public.gazi_siparisler; actor uuid; s jsonb; receipt uuid:=gen_random_uuid(); denied boolean;
begin
 select id into actor from auth.users where raw_app_meta_data->>'firma'='gazi' and coalesce(raw_app_meta_data->>'role','')<>'seller' limit 1;
 assert actor is not null,'Admin fixture missing';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','app_metadata',jsonb_build_object('firma','gazi','role','admin'))::text,true);
 select * into o from public.gazi_siparisler fixture where fixture.kargo_durumu='Bekliyor' and nullif(fixture.orderinvoiceid,'') is null and nullif(fixture.kargo_takip_kodu,'') is null and not exists(select 1 from public.order_receipts r where r.order_id in (fixture.siparis_no,fixture.bolunme_ana_siparis_no)) and (gazi_shipping.state(fixture)->>'mobile')::boolean order by siparis_no desc limit 1 for update;
 assert o.siparis_no is not null,'Mobile fixture missing';original:=o;
 s:=gazi_shipping.state(o);assert not (s->>'can_ship')::boolean,'Mobile must be blocked';
 denied:=false;begin perform public.gazi_shipping_authorize(o.siparis_no);exception when others then denied:=position('onayı gerekli' in sqlerrm)>0;end;assert denied,'Authorizer must block mobile';
 denied:=false;begin perform public.gazi_shipping_approve(o.siparis_no,'stale');exception when others then denied:=position('Sipariş değişti' in sqlerrm)>0;end;assert denied,'Stale screen approval must fail';
 perform public.gazi_shipping_approve(o.siparis_no,gazi_shipping.fingerprint(o));
 s:=gazi_shipping.state(o);assert (s->>'can_ship')::boolean,'Reviewed mobile should pass';
 o.adres:=o.adres||' changed';s:=gazi_shipping.state(o);assert not (s->>'can_ship')::boolean,'Changed address must invalidate approval';o:=original;
 -- EFT: no document, pending, rejected and approved documents.
 update public.gazi_siparisler set odeme_sekli='EFT',toplam_tutar='0' where siparis_no=o.siparis_no returning * into o;
 perform public.gazi_shipping_approve(o.siparis_no,gazi_shipping.fingerprint(o));
 s:=gazi_shipping.state(o);assert not (s->>'can_ship')::boolean and (s->>'receipt_count')::int=0,'EFT without receipt must fail';
 insert into public.order_receipts(id,order_id,object_path,file_name,mime_type,file_size,source,status) values(receipt,o.siparis_no,'transaction-test/'||receipt,'transaction-test.pdf','application/pdf',1,'panel','pending');
 s:=gazi_shipping.state(o);assert not (s->>'can_ship')::boolean,'Pending EFT receipt must fail';
 update public.order_receipts set status='rejected' where id=receipt;s:=gazi_shipping.state(o);assert not (s->>'can_ship')::boolean,'Rejected receipt must fail';
 update public.order_receipts set status='approved' where id=receipt;s:=gazi_shipping.state(o);assert (s->>'can_ship')::boolean,'Approved EFT receipt plus operation review should pass';
 perform public.gazi_shipping_authorize(o.siparis_no);
 -- Direct update guard, still without sending anything to DHL.
 delete from public.order_receipts where id=receipt;
 denied:=false;begin update public.gazi_siparisler set orderinvoiceid='transaction-test' where siparis_no=o.siparis_no;exception when others then denied:=position('dekont eklenmeden' in sqlerrm)>0;end;assert denied,'Direct cargo write must fail';
 -- Free order independent from mobile; ordinary COD remains unaffected.
 select * into o from public.gazi_siparisler fixture where kargo_durumu='Bekliyor' and not (gazi_shipping.state(fixture)->>'mobile')::boolean order by siparis_no desc limit 1;
 o.odeme_sekli:='Bedelsiz';o.toplam_tutar:='0';s:=gazi_shipping.state(o);assert (s->>'free')::boolean and not (s->>'can_ship')::boolean,'Free must need approval';
 o.odeme_sekli:='Kapıda Kart';o.toplam_tutar:='1000';s:=gazi_shipping.state(o);assert (s->>'can_ship')::boolean,'Ordinary COD must pass';
 -- Sellers cannot read global controls or grant approvals, even if they know the order ID.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','app_metadata',jsonb_build_object('firma','gazi','role','seller'))::text,true);
 denied:=false;begin perform public.gazi_shipping_status(array[o.siparis_no]);exception when insufficient_privilege then denied:=true;end;assert denied,'Seller must be denied';
 perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 denied:=false;begin perform public.gazi_shipping_approve(o.siparis_no,gazi_shipping.fingerprint(o));exception when insufficient_privilege then denied:=true;end;assert denied,'Service cannot grant operation approval';
end $$;
select 'PASS: mobile/free gates, EFT receipt states, reapproval after edits, stale approval, direct-write guard, COD unchanged, seller/service authorization; all changes rolled back' result;
rollback;
