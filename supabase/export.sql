-- ============================================================================
-- EXPORTAR EL SQL REAL DEL PROYECTO (correr en el SQL Editor del dashboard)
-- ============================================================================
-- 1. Abrir: https://supabase.com/dashboard/project/zfnlcfnutnuatrhgbbci/sql/new
-- 2. Pegar cada consulta, RUN, y descargar/copiar el resultado.
-- 3. Guardar los resultados en este repo como schema-real.sql (o pegármelos en
--    el chat y los versiono yo).

-- ── CONSULTA 0 · TODO EN UNO (recomendada) ──────────────────────────────────
-- Un solo RUN → devuelve UNA celda de texto con toda la estructura del backend
-- (funciones, tablas, RLS, políticas, grants, triggers, extensiones).
-- Sin datos sensibles: no toca access_key ni mp_token.
-- Para pasarla al repo: clic en la celda → copiar, o Download → CSV.

with funcs as (
  select string_agg(
           format('-- FUNCTION %s(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
           || E'\n' || pg_get_functiondef(p.oid),
           E'\n\n' order by p.proname) as txt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
cols as (
  select string_agg(
           table_name || ' · ' || column_name || ' : ' || data_type
           || case when is_nullable = 'NO' then ' NOT NULL' else '' end
           || coalesce(' DEFAULT ' || column_default, ''),
           E'\n' order by table_name, ordinal_position) as txt
  from information_schema.columns
  where table_schema = 'public'
),
rls as (
  select string_agg(tablename || ' · rls=' || rowsecurity || ' · forcerls=' || forcerowsecurity,
                    E'\n' order by tablename) as txt
  from pg_tables where schemaname = 'public'
),
pols as (
  select string_agg(
           tablename || ' · ' || policyname || ' · ' || cmd || ' · roles=' || roles::text
           || coalesce(E'\n  USING: ' || qual, '') || coalesce(E'\n  CHECK: ' || with_check, ''),
           E'\n' order by tablename, policyname) as txt
  from pg_policies where schemaname = 'public'
),
grants as (
  select string_agg(grantee || ' · ' || table_name || ' · ' || privilege_type,
                    E'\n' order by table_name, grantee) as txt
  from information_schema.role_table_grants where table_schema = 'public'
),
trigs as (
  select string_agg(event_object_schema || '.' || event_object_table || ' · ' || trigger_name
                    || ' · ' || action_timing || ' ' || event_manipulation
                    || ' · ' || action_statement,
                    E'\n' order by 1) as txt
  from information_schema.triggers
),
exts as (
  select string_agg(extname || ' ' || extversion, E'\n' order by extname) as txt
  from pg_extension
)
select
  '===== FUNCIONES ====='   || E'\n' || coalesce(funcs.txt, '(ninguna)')   ||
  E'\n\n===== TABLAS (columnas) =====\n' || coalesce(cols.txt,  '(ninguna)') ||
  E'\n\n===== RLS =====\n'             || coalesce(rls.txt,   '(ninguna)') ||
  E'\n\n===== POLÍTICAS =====\n'       || coalesce(pols.txt,  '(sin políticas)') ||
  E'\n\n===== GRANTS =====\n'          || coalesce(grants.txt,'(sin grants)') ||
  E'\n\n===== TRIGGERS =====\n'        || coalesce(trigs.txt, '(sin triggers)') ||
  E'\n\n===== EXTENSIONES =====\n'     || coalesce(exts.txt,  '(ninguna)')
  as volcado
from funcs, cols, rls, pols, grants, trigs, exts;

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
