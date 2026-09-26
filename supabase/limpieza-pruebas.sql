-- ============================================================================
-- LIMPIEZA · Eliminar tiendas de prueba (tempsec, cloudtest, prueba)
-- Ejecutar completo (todo el archivo) en el SQL Editor.
-- El FK productos → stores tiene ON DELETE CASCADE: al borrar la tienda se van
-- sus productos; pedidos y suscriptores viven en stores.cfg (se van con ella).
-- Resultado esperado: la 1a consulta lista 3 filas 'baja'; la última, solo las
-- 4 tiendas activas (juan, elixxir-fragancias, mariela, eze-pece).
-- ============================================================================

-- 1) Verificación previa: deben aparecer SOLO las 3 de prueba, todas 'baja'.
select id, biz, status from public.stores
where id in ('tempsec', 'cloudtest', 'prueba');

-- 2) Borrado en transacción (seguro: si algo falla, no deja mitad de trabajo).
begin;
delete from public.stores where id in ('tempsec', 'cloudtest', 'prueba');
commit;

-- 3) Verificación posterior: deben quedar solo las tiendas activas.
select id, biz, status from public.stores order by id;