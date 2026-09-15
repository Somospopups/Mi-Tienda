-- ============================================================================
-- EXPORTAR EL SQL REAL DEL PROYECTO (correr en el SQL Editor del dashboard)
-- ============================================================================
-- 1. Abrir: https://supabase.com/dashboard/project/zfnlcfnutnuatrhgbbci/sql/new
-- 2. Pegar cada consulta, RUN, y descargar/copiar el resultado.
-- 3. Guardar los resultados en este repo como schema-real.sql (o pegármelos en
--    el chat y los versiono yo).

-- ── Consulta 1 · Definición completa de TODAS las funciones ─────────────────
select p.proname                                   as nombre,
       pg_get_function_identity_arguments(p.oid)   as argumentos,
       pg_get_functiondef(p.oid)                   as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname not like '\_%'          -- incluir helpers si querés: quitar esta línea
order by p.proname;

-- (para incluir también los helpers privados _mt*/_api*:)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like '\_%'
order by p.proname;

-- ── Consulta 2 · Tablas, columnas y tipos ────────────────────────────────────
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- ── Consulta 3 · Políticas RLS y permisos ────────────────────────────────────
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public';

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
order by table_name, grantee;

-- ── Consulta 4 · Triggers y extensiones ──────────────────────────────────────
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where trigger_schema in ('public','net');

select extname, extversion from pg_extension order by extname;

-- ── Consulta 5 · Datos NO sensibles de referencia (tiendas y planes) ────────
-- ⚠ NO exportar access_key ni mp_token a un repo público.
select slug, biz, owner, status, plan_id, paid_until, (mp_token <> '') as mp_conectado
from stores order by slug;

select * from plans order by id;
