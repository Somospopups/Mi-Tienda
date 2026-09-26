-- ============================================================================
-- Mi-Tienda · Uber Direct (modo demo, MVP: cotización en vivo)
-- ============================================================================
-- ✅ Ejecutar completo en el SQL Editor (2 funciones: CREATE OR REPLACE).
-- Versionado en el repo: NO borra ni modifica datos; solo reemplaza funciones.
--
-- MVP decidido:
--  · Alcance: SOLO cotización de envío en tiempo real en el checkout.
--    (despachar el courier y seguimiento se agregan en una etapa posterior).
--  · Hoy corre en MODO DEMO: devuelve un costo e intervalo de tiempo de
--    referencia configurados por tienda (settings.uber). No llama a Uber.
--  · Cuando el dueño tenga la cuenta de Uber Direct aprobada y sus
--    credenciales (client_id + client_secret), se reemplaza el cuerpo de
--    api_uber_quote para llamar a la API real (OAuth2 + quote), igual que se
--    hizo con Mercado Pago (pg_net + poll).
--
-- Config por tienda (jsonb en stores.cfg → settings.uber):
--   enabled   boolean  → muestra la opción "Envío con Uber" en el checkout
--   demoCost  int      → costo de referencia (modo demo), en pesos
--   etaMin/etaMax int  → intervalo de minutos de entrega estimada
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Cotización de envío con Uber Direct (demo)
-- ----------------------------------------------------------------------------
create or replace function public.api_uber_quote(p_store text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
  u jsonb;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_' || public.h_state(s), 'status', public.h_state(s)); end if;
  u := s.cfg #> '{settings,uber}';
  if u is null or coalesce((u -> 'enabled')::boolean, false) <> true then
    return jsonb_build_object('ok', false, 'error', 'uber_disabled'); end if;
  return jsonb_build_object('ok', true, 'demo', true, 'provider', 'uber', 'currency', 'ARS',
    'cost', coalesce((nullif(u ->> 'demoCost', ''))::int, 0),
    'etaMin', coalesce((nullif(u ->> 'etaMin', ''))::int, 45),
    'etaMax', coalesce((nullif(u ->> 'etaMax', ''))::int, 60),
    'note', 'Costo de referencia (modo demo). El precio real lo devuelve Uber Direct cuando la tienda conecte su cuenta.');
end $function$;

-- ----------------------------------------------------------------------------
-- api_order_create: maneja deliveryType 'uber' (idéntico al actual + 5 cambios)
--  1) del := ... 'uber' → 'uber'
--  2) la dirección es obligatoria también para envío Uber
--  3) el envío Uber se cobra con el costo de referencia (demo), calculado
--     server-side (el cliente nunca manda montos)
--  4) el pedido guarda tipo 'uber', dirección y ETA estimada
--  5) la dirección queda registrada en el cliente
-- ----------------------------------------------------------------------------
create or replace function public.api_order_create(p_store text, p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
  live_mp boolean;
  c jsonb;
  pr public.products;
  it jsonb;
  nm text; phone text; custkey text; del text; addr text; notes text; pay text;
  qty int; subtotal int := 0; items_cost int := 0; ship int := 0;
  arr jsonb := '[]'::jsonb;
  order_id text; seq int; o_number text; ts text; o jsonb; pch jsonb; mv jsonb;
  v_idx int := -1; cust jsonb; i int;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'Esta tienda está suspendida. Volvé a intentar más tarde.'); end if;
  if p -> 'items' is null or jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    return jsonb_build_object('ok', false, 'error', 'Tu carrito está vacío.'); end if;

  nm := trim(coalesce(p #>> '{customer,name}', ''));
  if length(nm) < 2 then return jsonb_build_object('ok', false, 'error', 'Ingresá tu nombre completo.'); end if;
  phone := coalesce(p #>> '{customer,phone}', '');
  if length(regexp_replace(phone, '\D', '', 'g')) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Ingresá un teléfono válido.'); end if;
  del := case when p ->> 'deliveryType' = 'pickup' then 'pickup' when p ->> 'deliveryType' = 'uber' then 'uber' else 'shipping' end;
  addr := trim(coalesce(p ->> 'address', ''));
  notes := left(trim(coalesce(p ->> 'notes', '')), 500);
  if del in ('shipping', 'uber') and length(addr) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Completá la dirección de entrega.'); end if;
  pay := case when p ->> 'paymentMethod' = 'whatsapp' then 'whatsapp' else 'mercadopago' end;
  if pay = 'mercadopago' and coalesce((s.cfg #>> '{settings,mercadoPagoEnabled}')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no está disponible en este momento.'); end if;
  live_mp := (pay = 'mercadopago' and s.mp_token <> '');

  for it in select * from jsonb_array_elements(p -> 'items') loop
    qty := coalesce(nullif(it ->> 'quantity', '')::int, 0);
    if qty < 1 then return jsonb_build_object('ok', false, 'error', 'Cantidad inválida.'); end if;

    update public.products
       set stock = stock - qty, updated_at = now()
     where id = it ->> 'productId' and store_id = p_store and active = true and stock >= qty
     returning * into pr;
    if not found then
      if exists (select 1 from public.products where id = it ->> 'productId' and store_id = p_store and active) then
        select * into pr from public.products where id = it ->> 'productId' and store_id = p_store;
        return jsonb_build_object('ok', false, 'error', 'Solo quedan ' || coalesce(pr.stock, 0) || ' unidades de ' || pr.name || '.');
      end if;
      return jsonb_build_object('ok', false, 'error', 'Uno de los productos ya no está disponible.');
    end if;

    subtotal := subtotal + pr.price * qty;
    items_cost := items_cost + coalesce(pr.cost, 0) * qty;
    arr := arr || jsonb_build_object('productId', pr.id, 'name', pr.name, 'image', coalesce(pr.image, ''),
      'quantity', qty, 'unitPrice', pr.price, 'unitCost', coalesce(pr.cost, 0), 'lineTotal', pr.price * qty);
  end loop;

  c := coalesce(s.cfg, '{}'::jsonb);
  seq := coalesce((nullif(c ->> 'nextOrderNumber', ''))::int, 1001);
  if del = 'uber' then
    ship := coalesce((nullif(c #>> '{settings,uber,demoCost}', ''))::int, 0);
  elsif del <> 'pickup' then
    if subtotal < coalesce((nullif(c #>> '{settings,freeShippingThreshold}', ''))::int, 0) then
      ship := coalesce((nullif(c #>> '{settings,shippingFlat}', ''))::int, 0);
    end if;
  end if;

  order_id := gen_random_uuid()::text;
  o_number := 'P-' || seq;
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  o := jsonb_build_object('id', order_id, 'number', o_number, 'createdAt', ts, 'updatedAt', ts,
    'status', case
        when pay = 'whatsapp' then 'pending_confirmation'
        when live_mp then 'pending_payment'
        else 'confirmed' end,
    'customer', jsonb_build_object('name', nm, 'phone', phone, 'email', left(trim(coalesce(p #>> '{customer,email}', '')), 150)),
    'delivery', jsonb_build_object('type', del, 'address', case when del = 'pickup' then '' else addr end, 'notes', notes)
      || case when del = 'uber' then jsonb_build_object('etaMin', coalesce((nullif(c #>> '{settings,uber,etaMin}', ''))::int, 45), 'etaMax', coalesce((nullif(c #>> '{settings,uber,etaMax}', ''))::int, 60)) else '{}'::jsonb end,
    'payment', jsonb_build_object('method', pay,
      'status', case when pay = 'whatsapp' then 'pending' when live_mp then 'pending' else 'approved_demo' end,
      'mode', case when pay = 'whatsapp' then 'manual' when live_mp then 'live' else 'demo' end),
    'items', arr, 'subtotal', subtotal, 'shipping', ship, 'total', subtotal + ship,
    'inventoryReserved', true, 'inventoryReleased', false,
    'timeline', jsonb_build_array(jsonb_build_object('at', ts, 'status', 'created', 'note', case when live_mp then 'Pedido creado. Esperando pago en Mercado Pago.' else 'Pedido creado en línea.' end)));
  c := jsonb_set(c, '{orders}', jsonb_build_array(o) || coalesce(c -> 'orders', '[]'::jsonb));
  c := jsonb_set(c, '{nextOrderNumber}', to_jsonb(seq + 1));

  custkey := regexp_replace(phone, '\D', '', 'g');
  if jsonb_typeof(c -> 'customers') = 'array' then
    for i in 0 .. jsonb_array_length(c -> 'customers') - 1 loop
      if regexp_replace(coalesce(c #>> array['customers', i::text, 'phone'], ''), '\D', '', 'g') = custkey then
        v_idx := i; exit;
      end if;
    end loop;
  end if;
  pch := jsonb_build_object('id', gen_random_uuid()::text, 'date', left(ts, 10),
    'description', left('Pedido ' || o_number || ': ' || (select string_agg(x ->> 'quantity' || '× ' || (x ->> 'name'), ', ') from jsonb_array_elements(arr) x), 300),
    'amount', subtotal + ship, 'source', 'online', 'orderId', order_id,
    'status', o ->> 'status', 'createdAt', ts);
  if v_idx = -1 then
    cust := jsonb_build_object('id', gen_random_uuid()::text, 'fullName', nm, 'business', '',
      'address', case when del = 'shipping' then addr when del = 'uber' then addr else '' end, 'phone', phone,
      'purchaseHistory', jsonb_build_array(pch), 'createdAt', ts, 'updatedAt', ts, 'origin', 'online');
    c := jsonb_set(c, '{customers}', jsonb_build_array(cust) || coalesce(c -> 'customers', '[]'::jsonb));
  else
    cust := c -> 'customers' -> v_idx;
    if (cust ->> 'address') is null or cust ->> 'address' = '' then
      if del in ('shipping', 'uber') then cust := jsonb_set(cust, '{address}', to_jsonb(addr)); end if;
    end if;
    cust := jsonb_set(cust, '{updatedAt}', to_jsonb(ts));
    cust := jsonb_set(cust, '{purchaseHistory}', jsonb_build_array(pch) || coalesce(cust -> 'purchaseHistory', '[]'::jsonb));
    c := jsonb_set(c, array['customers', v_idx::text], cust);
  end if;

  if pay = 'mercadopago' and not live_mp then
    mv := jsonb_build_object('id', gen_random_uuid()::text, 'type', 'income', 'date', left(ts, 10),
      'description', 'Venta ' || o_number, 'category', 'Ventas online', 'amount', subtotal + ship,
      'costAmount', items_cost, 'feeAmount', 0, 'accountId', 'mercadopago', 'toAccountId', '',
      'customerId', '', 'customerName', nm, 'source', 'order', 'orderId', order_id,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('productId', x ->> 'productId', 'name', x ->> 'name',
                  'quantity', (x ->> 'quantity')::int, 'revenue', (x ->> 'lineTotal')::int, 'cost', (x ->> 'unitCost')::int)), '[]'::jsonb)
               from jsonb_array_elements(arr) x),
      'receipt', '', 'notes', '', 'status', 'completed', 'createdAt', ts, 'updatedAt', ts);
    if c -> 'finance' is null or jsonb_typeof(c -> 'finance') <> 'object' then
      c := jsonb_set(c, '{finance}', jsonb_build_object('accounts', jsonb_build_array(
        jsonb_build_object('id', 'cash', 'name', 'Efectivo', 'type', 'cash', 'openingBalance', 0, 'active', true),
        jsonb_build_object('id', 'mercadopago', 'name', 'Mercado Pago', 'type', 'digital', 'openingBalance', 0, 'active', true),
        jsonb_build_object('id', 'bank', 'name', 'Banco / Transferencias', 'type', 'bank', 'openingBalance', 0, 'active', true)),
        'movements', jsonb_build_array(mv)));
    else
      c := jsonb_set(c, '{finance,movements}', jsonb_build_array(mv) || coalesce(c #> '{finance,movements}', '[]'::jsonb));
    end if;
  end if;

  update public.stores set cfg = c where id = p_store;
  return jsonb_build_object('ok', true, 'order', o,
    'paymentMode', case when pay = 'whatsapp' then 'manual' when live_mp then 'live' else 'demo' end,
    'checkoutUrl', '', 'whatsappUrl', '');
end $function$;