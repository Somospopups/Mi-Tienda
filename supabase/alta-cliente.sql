-- ============================================================================
-- Mi-Tienda · ALTA DE CLIENTE — plantilla reutilizable para VENDER una tienda
-- ============================================================================
-- Cómo usarla: cada vez que vendés una tienda, copiá este archivo, ajustá las
-- variables del bloque "1 · DATOS DEL CLIENTE" y ejecutalo completo EN UNA sola
-- corrida en el SQL Editor del proyecto:
--
--   ► https://supabase.com/dashboard/project/zfnlcfnutnuatrhgbbci/sql/new
--
-- Qué hace:
--   · Crea la tienda en la nube (api_admin → 'create_store'): link, clave de
--     acceso del dueño y plan. Si ya existe, lo avisa (ya_existe) y no pisa nada.
--   · (Opcional) Carga el catálogo inicial con 'import_products' si el cliente
--     ya te pasó una planilla de productos.
--   · Al final dejás todo listo para entregarle al dueño:
--       link  → https://somospopups.github.io/Mi-Tienda/?tienda=<id>
--       clave → la que definiste abajo
--
-- La MISMA operación se puede hacer desde la Consola POPUPS (botón
-- "＋ Vender tienda nueva") con PIN del equipo — este archivo es el equivalente
-- por SQL y sirve también como checklist auditable.
--
-- ► Por única vez (si todavía no lo corriste): desplegá el auto-cambio de clave
--   del dueño ejecutando `api_key_change.sql` (mismo SQL Editor). No es obligatorio:
--   sin él, el panel del dueño muestra "Tu clave la cambia POPUPS" y seguís
--   rotándola vos desde la Consola (botón ♻ Blanquear clave de v0.18.0).
--
-- Seguridad: la clave del dueño se guarda SOLO hasheada con bcrypt (key_hash);
-- nadie, ni POPUPS, puede volver a leerla. Si el dueño la olvida, se rota.
-- ============================================================================

-- ═══ 1 · DATOS DEL CLIENTE (ajustar acá) ════════════════════════════════════
-- Elegí un id corto y estable: es el slug del link del dueño. No cambia nunca.
-- La clave va de 6 a 64 caracteres, sin espacios.
do $$
declare
  v_id      text := 'mi-cliente-01';          -- slug del link del dueño
  v_key     text := 'clave-segura-del-cliente-01';
  v_biz     text := 'Nombre del comercio';
  v_owner   text := 'Apellido, Nombre';
  v_contact text := 'wa.me/54911XXXXXXXX — Dueño';
  v_note    text := 'Vendido por POPUPS';     -- nota interna (a criterio)
  v_plan    text := 'p25';                    -- p25 | p50 | p100 | pilim
  v_res     jsonb;
begin
  -- ═══ 2 · CREAR LA TIENDA ══════════════════════════════════════════════════
  v_res := public.api_admin('PIN-DE-CONSOLA'::text, 'create_store',
             jsonb_build_object('id', v_id, 'key', v_key,
                                'biz', v_biz, 'owner', v_owner,
                                'contact', v_contact, 'note', v_note,
                                'plan_id', v_plan));
  raise notice 'create_store → %', v_res;

  if (v_res ->> 'ok') <> 'true' then
    raise exception 'no se creó la tienda: %', v_res ->> 'error';
  end if;

  -- ═══ 3 · (OPCIONAL) CATÁLOGO INICIAL con 'import_products' ═══════════════
  -- Descomentá y completá los productos si el cliente ya te pasó la lista.
  -- Cada el debe tener: id, name, price, [compareAtPrice, wholesalePrice,
  -- cost, stock, lowStock, category, badge, description, image, barcode,
  -- active, featured, sort].
  --
  -- v_res := public.api_admin('PIN-DE-CONSOLA'::text, 'import_products',
  --   jsonb_build_object('id', v_id, 'products', jsonb_build_array(
  --     jsonb_build_object('id', 'p1', 'name', 'Producto ejemplo', 'price', 2500,
  --                        'category', 'General', 'stock', 50, 'active', true)
  --   )));
  -- raise notice 'import_products → %', v_res;
end $$;

-- ═══ 4 · VERIFICACIÓN ══════════════════════════════════════════════════════
select id, biz, owner, plan_id, status, paid_until, created_at
  from public.stores
 where id = 'mi-cliente-01';               -- → debe aparecer la tienda nueva

-- ═══ 5 · ENTREGAR AL DUEÑO ═════════════════════════════════════════════════
--   link  → https://somospopups.github.io/Mi-Tienda/?tienda=mi-cliente-01
--   clave → la de v_key (se la pasás por WhatsApp, solo al dueño)

-- ============================================================================
-- EXTRA · ROTAR LA CLAVE / CAMBIO AUTOSERVICIO
-- ============================================================================
-- · Si el dueño la olvida: Consola POPUPS → botón "♻ Blanquear clave"
--   (api_admin → 'rotate_key'), o bien por SQL:
--     select public.api_admin('PIN-DE-CONSOLA', 'rotate_key',
--       '{"id":"mi-cliente-01","key":"nueva-clave-06-12"}'::jsonb);
--
-- · Si el dueño quiere cambiarla él mismo (requiere api_key_change desplegado):
--     select public.api_key_change('mi-cliente-01',
--       'clave-segura-del-cliente-01', 'otra-clave-nueva-01');
--
-- · Suspendida / de baja (si no paga):
--     select public.api_admin('PIN-DE-CONSOLA', 'set',
--       '{"id":"mi-cliente-01","status":"suspendida"}'::jsonb);
-- ============================================================================