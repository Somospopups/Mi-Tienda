-- ============================================================================
-- Mi-Tienda · v0.7.3 — api_key_change: el dueño cambia SU Clave de acceso
-- ============================================================================
-- Para qué: hoy la única forma de rotar una clave era la Consola POPUPS
-- (api_admin → 'rotate_key'). Esta función agrega el auto-cambio desde
-- Ajustes → Seguridad del panel del dueño.
--
-- ► Ejecutar UNA sola vez en el SQL Editor del proyecto
--   https://supabase.com/dashboard/project/zfnlcfnutnuatrhgbbci/sql/new
--
-- ► Si NO se ejecuta, nada se rompe: la tienda sigue igual y el panel muestra
--   la tarjeta "Tu clave la cambia POPUPS" con un botón para pedirla
--   (el frontend detecta que la función no existe y degrada ahí nomás).
--
-- Seguridad:
--   · verifica la clave actual contra stores.key_hash con bcrypt — la clave
--     nueva nunca se guarda ni se devuelve en texto plano;
--   · misma validación de acceso que las otras RPC privadas
--     (`s.key_hash = '' or crypt(p_key, s.key_hash) <> s.key_hash` → bad_key);
--   · sólo toca stores.key_hash y stores.cfg.security.changedAt: no toca
--     dinero, tokens de Mercado Pago, catálogo ni pedidos;
--   · SECURITY DEFINER + RLS sin políticas: anon sigue sin acceso directo a
--     las tablas, entra sólo por esta función.
--
-- Nota de producto: se permite cambiar la clave aunque la tienda esté
-- suspendida (es una acción de autoprotección del dueño y es coherente con
-- api_save_cfg, que tampoco bloquea por estado). La vitrina y los cobros
-- siguen bloqueados por la puerta POPUPS.
-- ============================================================================

create or replace function public.api_key_change(p_store text, p_key text, p_new_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  s  public.stores;
  nk text := left(trim(coalesce(p_new_key, '')), 64);
  ts text;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;

  -- 1 · la clave actual tiene que ser la real (se verifica contra el hash)
  if s.key_hash = '' or s.key_hash is null
     or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;

  -- 2 · formato de la nueva clave (regla del panel: 6 a 64 caracteres)
  if length(nk) < 6 then return jsonb_build_object('ok', false, 'error', 'clave_corta'); end if;
  if nk = coalesce(p_key, '') then return jsonb_build_object('ok', false, 'error', 'key_equal'); end if;
  -- 3 · sin saltos de línea ni tabes: rompen el ingreso y no se ven en un campo password
  if nk ~ '[\r\n\t]' then return jsonb_build_object('ok', false, 'error', 'clave_invalida'); end if;

  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  update public.stores
     set key_hash = crypt(nk, gen_salt('bf')),
         cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{security,changedAt}', to_jsonb(ts), true)
   where id = p_store;

  return jsonb_build_object('ok', true, 'changedAt', ts);
end $function$;

-- Las tablas siguen cerradas; la función se ejecuta con la clave publishable,
-- como todas las RPC del cliente.
revoke all on function public.api_key_change(text, text, text) from public;
grant execute on function public.api_key_change(text, text, text) to anon, authenticated;

-- ============================================================================
-- Prueba rápida (dos llamadas: una buena y una mala)
-- ============================================================================
-- select public.api_key_change('juan', 'juan-demo', 'pan-esperanza-2026');
--   → {"ok": true, "changedAt": "…"}
-- select public.api_key_change('juan', 'la-clave-mala', 'otra-clave-123');
--   → {"ok": false, "error": "bad_key"}
--
-- Para devolver la demo a su clave original se usa la Consola POPUPS:
-- select public.api_admin('PIN-DE-CONSOLA', 'rotate_key',
--                         '{"id":"juan","key":"juan-demo"}'::jsonb);
-- ============================================================================
