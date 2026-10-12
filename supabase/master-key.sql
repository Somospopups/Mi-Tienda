-- ============================================================================
-- Mi-Tienda · v0.19 — CLAVE MAESTRA POPUPS para las tiendas cloud
-- ============================================================================
-- Qué hace: agrega una CLAVE MAESTRA que abre el panel de CUALQUIER tienda
-- (?tienda=…) sin conocer su Clave de acceso. En la demo offline ya funciona
-- desde el frontend (index.html); en la nube la valida este SQL.
--
-- Cómo aplicarlo (1 minuto):
--   1. Supabase → SQL Editor → New query.
--   2. Pegá TODO este archivo y tocá Run.
--   3. Fijate el último resultado: debe decir "OK 1/2 …".
--   4. Probá el panel de una tienda (?tienda=…#admin) con la clave maestra.
--
-- Qué toca:
--   · Crea 2 funciones nuevas (mt_master_hash / mt_key_ok) — no rompen nada.
--   · Parchea SOLO el chequeo de clave de 8 RPC (api_panel, api_save_cfg,
--     api_upsert_product, api_delete_product, api_mp_launch/poll/set/status),
--     usando pg_get_functiondef + regexp_replace sobre el CÓDIGO REAL de tu
--     base (no asume que coincida con el dump del repo).
--
-- Seguridad: la clave no queda en texto en la base (solo su hash bcrypt).
-- OJO: quien tiene esta clave entra a TODAS las tiendas — es una llave única
-- de POPUPS: guardala como secreto y no la repartas.
--
-- Para desactivarla: re-aplicá supabase/schema-real.sql (restaura las 8 RPC
-- originales) y opcionalmente:
--   drop function if exists public.mt_key_ok(text, text);
--   drop function if exists public.mt_master_hash();
-- ============================================================================

-- 1) Hash bcrypt de la clave maestra (cost 12; el texto no está en ningún lado)
--    · v0.20: rotación de la maestra POPUPS (el hash anterior quedó invalidado).
--    · Para rotarla de nuevo: hashear la nueva clave con bcrypt cost 12
--      (pgcrypto: select crypt('NUEVA', gen_salt('bf', 12))) y reemplazar abajo.
create or replace function public.mt_master_hash()
returns text
language sql
immutable
as $$
  select '$2a$12$5ogs9UoVp9htqZMIXi0fBu9F1W9mobanAU6rp1FQa0E1JpWTiFw/.'::text
$$;

-- 2) ¿La clave es válida? (maestra o clave real de la tienda, igual que siempre)
create or replace function public.mt_key_ok(p_key text, p_hash text)
returns boolean
language plpgsql
stable
set search_path to 'public', 'extensions'
as $$
begin
  -- a) clave maestra (bcrypt contra el hash de arriba)
  begin
    if p_key is not null and p_key <> ''
       and crypt(p_key, public.mt_master_hash()) = public.mt_master_hash() then
      return true;
    end if;
  exception when others then
    null; -- clave con caracteres raros: no es la maestra, seguimos
  end;
  -- b) clave normal de la tienda (igual que el chequeo original de las RPC)
  return p_hash is not null and p_hash <> ''
     and crypt(coalesce(p_key, ''), p_hash) = p_hash;
end $$;

grant execute on function public.mt_master_hash() to anon, authenticated, service_role;
grant execute on function public.mt_key_ok(text, text) to anon, authenticated, service_role;

-- 3) Parche de las 8 RPC: el chequeo de clave pasa por mt_key_ok.
--    (Se aplica sobre el código real de la base; si algo cambió en el dashboard
--     desde el dump, igual matchea — el regex es tolerante a espacios/saltos.)
do $mk$
declare
  rec  record;
  src  text;
  pat  text := 'if\s+s\.key_hash\s*=\s*''''\s+or\s+(s\.key_hash\s+is\s+null\s+or\s+)?crypt\(coalesce\(p_key,\s*''''\),\s*s\.key_hash\)\s*<>\s*s\.key_hash\s+then';
  rep  text := 'if not public.mt_key_ok(p_key, s.key_hash) then';
  n    int := 0;
begin
  for rec in
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('api_delete_product', 'api_mp_launch', 'api_mp_poll',
                        'api_mp_set', 'api_mp_status', 'api_panel',
                        'api_save_cfg', 'api_upsert_product')
  loop
    src := regexp_replace(rec.def, pat, rep, 'g');
    if src <> rec.def then
      execute src;
      n := n + 1;
    end if;
  end loop;
  if n < 8 then
    raise exception 'Parche incompleto: % de 8 funciones. Revisá el formato del chequeo de key en tu base (pg_get_functiondef).', n;
  end if;
  raise notice 'Clave maestra ACTIVA: % funciones parcheadas.', n;
end
$mk$;

-- 4) Verificación (1/2): una clave inválida tiene que seguir fallando.
select case
  when public.mt_key_ok('clave-invalida-de-prueba', '') then
    'ERROR: pasa cualquier clave — revisá el notice anterior.'
  else
    'OK 1/2: las claves inválidas siguen rechazadas. OK 2/2 = entrá al panel de cualquier tienda con tu clave maestra.'
end as verificacion;
