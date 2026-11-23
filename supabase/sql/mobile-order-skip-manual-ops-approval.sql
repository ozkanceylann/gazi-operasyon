-- Mobile orders no longer require a separate manual operations approval.
-- EFT receipt review remains a shipping prerequisite.
create or replace function gazi_shipping.state(o public.gazi_siparisler) returns jsonb
language plpgsql stable set search_path='' as $$
declare mobile boolean; eft boolean; free_order boolean; approved boolean; receipts integer; receipt_ok boolean; reasons text[]:='{}'; stamp timestamptz;
begin
 mobile:=exists(select 1 from public.tum_siparisler t where t.siparis_no in (o.siparis_no,o.bolunme_ana_siparis_no) and lower(coalesce(t.siparis_sekli,''))='mobil')
  or exists(select 1 from mobile_intake.requests r where r.order_no in (o.siparis_no,o.bolunme_ana_siparis_no) and not r.is_test and r.status='completed');
 eft:=coalesce(o.odeme_sekli,'') ~* '\m(eft|iban|havale|fast)\M';
 free_order:=not eft and (coalesce(o.odeme_sekli,'') ~* '\m(bedelsiz|ücretsiz|ucretsiz)\m' or coalesce(o.toplam_tutar,'') ~* '^[[:space:]]*0+([.,]0+)*[[:space:]]*(TL|TRY|₺)?[[:space:]]*$');
 select a.approved_at into stamp from gazi_shipping.approvals a where a.order_id=o.siparis_no and a.fingerprint=gazi_shipping.fingerprint(o);
 approved:=stamp is not null;
 select count(*),coalesce(bool_or(r.status='approved'),false) into receipts,receipt_ok from public.order_receipts r where r.order_id in (o.siparis_no,o.bolunme_ana_siparis_no) and nullif(btrim(r.object_path),'') is not null;
 if free_order and not approved then reasons:=array_append(reasons,'Ücretsiz sipariş için Gazi Operasyon onayı gerekli.');end if;
 if eft and receipts=0 then reasons:=array_append(reasons,'EFT siparişine dekont eklenmeden kargoya gönderilemez.');
 elsif eft and not receipt_ok then reasons:=array_append(reasons,'EFT dekontu Gazi Operasyon tarafından onaylanmalı.');end if;
 return jsonb_build_object('order_id',o.siparis_no,'mobile',mobile,'free',free_order,'eft',eft,'approval_required',free_order,'approved',approved,'approved_at',stamp,'receipt_count',receipts,'receipt_approved',receipt_ok,'can_ship',cardinality(reasons)=0,'reasons',to_jsonb(reasons),'fingerprint',gazi_shipping.fingerprint(o));
end $$;