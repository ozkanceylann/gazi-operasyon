CREATE OR REPLACE FUNCTION public.gazi_iade_cancel(p_id integer, p_reference text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.gazi_siparisler;
  k text;
  next_reference text;
begin
  select * into o from public.gazi_siparisler where siparis_no=p_id for update;
  if not found or o.iade_kodu is distinct from p_reference
    or nullif(o.iade_etiket_url,'') is null
    or o.iade_teslim_tarihi is not null or nullif(o.iade_takip_kodu,'') is not null
    or o.iade_durumu not in ('İade teslim bekliyor','Etiket Oluşturuldu')
    or o.kargo_durumu in ('İptal','Silindi') then
    raise exception 'Yalnızca DHL teslim alımı bekleyen güncel iade fişi iptal edilebilir';
  end if;
  if p_reference !~ ('^(?:(?:GZI|GAZİ)-' || p_id || '(-R[1-9][0-9]*)?|GZ-' || p_id || '(-R[1-9][0-9]*)?|GZ' || p_id || 'R[1-9][0-9]*)$') then
    raise exception 'Geçersiz iade referansı';
  end if;
  if not p_confirmed then
    select server_key into k from gazi_carrier_private.return_connection where id=1;
    if nullif(k,'') is null then raise exception 'DHL iade bağlantısı eksik'; end if;
    return jsonb_build_object('key',k);
  end if;
  next_reference := case
    when p_reference = 'GZ-' || p_id then 'GZ-' || p_id || '-R1'
    when p_reference ~ ('^GZ-' || p_id || '-R[1-9][0-9]*$') then
      'GZ-' || p_id || '-R' || (substring(p_reference from 'R([1-9][0-9]*)$')::numeric + 1)
    when p_reference ~ ('^GZ' || p_id || 'R[1-9][0-9]*$') then
      'GZ-' || p_id || '-R' || (substring(p_reference from 'R([1-9][0-9]*)$')::numeric + 1)
    else 'GZ-' || p_id || '-R1'
  end;
  update public.gazi_iade_islemleri
    set reference_id=next_reference,status='failed',label_url=null,response=null,error=null,updated_at=now()
    where siparis_no=p_id and reference_id=p_reference and status='ready';
  if not found then raise exception 'İade işlem kaydı değişmiş'; end if;
  update public.gazi_siparisler
    set iade_kodu=null,iade_etiket_url=null,iade_takip_kodu=null,iade_tarihi=null,
      iade_teslim_tarihi=null,iade_son_kontrol=null,iade_takip_hatasi=null,
      iade_durumu='İade fişi iptal edildi',
      iade_hareketleri=coalesce(iade_hareketleri,'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('eventStatus','İade fişi iptal edildi','eventDateTime',now(),'description',p_reference))
    where siparis_no=p_id;
  return jsonb_build_object('success',true);
end;
$function$

