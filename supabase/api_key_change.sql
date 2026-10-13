-- Mi-Tienda · api_key_change: el dueño actualiza la clave de su tienda.
-- Revisar grants, RLS y el esquema real antes de aplicar en Supabase.
--
-- La clave actual se valida con bcrypt contra stores.key_hash. La nueva clave
-- nunca se devuelve; solo se guarda el hash y la fecha de cambio.

create or replace function public.api_key_change(p_store text, p_key text, p_new_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  s public.stores;
  nk text := trim(coalesce(p_new_key, ''));
  ts text;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;

  if s.key_hash is null or s.key_hash = ''
     or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;

  if length(nk) < 12 then return jsonb_build_object('ok', false, 'error', 'clave_corta'); end if;
  if length(nk) > 64 or nk ~ '[\r\n\t]' then
    return jsonb_build_object('ok', false, 'error', 'clave_invalida');
  end if;
  if nk = coalesce(p_key, '') then return jsonb_build_object('ok', false, 'error', 'key_equal'); end if;

  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  update public.stores
     set key_hash = crypt(nk, gen_salt('bf')),
         cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{security,changedAt}', to_jsonb(ts), true)
   where id = p_store;
  return jsonb_build_object('ok', true, 'changedAt', ts);
end
$function$;

revoke all on function public.api_key_change(text, text, text) from public;
grant execute on function public.api_key_change(text, text, text) to anon, authenticated;

-- Manual verification (use a dedicated test tenant and temporary values).
-- Valid current key: {"ok": true, "changedAt": "..."}
-- Invalid current key: {"ok": false, "error": "bad_key"}
