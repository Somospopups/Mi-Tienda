-- ============================================================================
-- Mi-Tienda · Fixes propuestos tras la auditoría (15-sep-2026)
-- ============================================================================
-- ✅ REVISADO contra schema-real.sql (funciones verificadas una a una).
-- Aplicar completo en el SQL Editor en este orden: F1 → F2 → F6.
-- F5 y F4 quedan como comentarios: son opcionales y dependen de decisiones
-- de negocio. Cada bloque es idempotente y reversible (F6 usa DROP + CREATE
-- porque CREATE OR REPLACE no cambia los DEFAULT de parámetros).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F1 · MEDIO · Overselling por carrera en api_order_create
-- Reemplaza el select+update del loop de items por un decremento atómico con
-- guarda de stock. Si dos compras concurrentes compiten por el último
-- ejemplar, la segunda recibe el error de stock en vez de vender de más.
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
  del := case when p ->> 'deliveryType' = 'pickup' then 'pickup' else 'shipping' end;
  addr := trim(coalesce(p ->> 'address', ''));
  notes := left(trim(coalesce(p ->> 'notes', '')), 500);
  if del = 'shipping' and length(addr) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Completá la dirección de entrega.'); end if;
  pay := case when p ->> 'paymentMethod' = 'whatsapp' then 'whatsapp' else 'mercadopago' end;
  if pay = 'mercadopago' and coalesce((s.cfg #>> '{settings,mercadoPagoEnabled}')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no está disponible en este momento.'); end if;
  live_mp := (pay = 'mercadopago' and s.mp_token <> '');

  for it in select * from jsonb_array_elements(p -> 'items') loop
    qty := coalesce(nullif(it ->> 'quantity', '')::int, 0);
    if qty < 1 then return jsonb_build_object('ok', false, 'error', 'Cantidad inválida.'); end if;

    -- ▼▼ CAMBIO F1: decremento atómico con guarda (antes: select + update sueltos)
    update public.products
       set stock = stock - qty, updated_at = now()
     where id = it ->> 'productId' and store_id = p_store and active = true and stock >= qty
     returning * into pr;
    if not found then
      -- distinguimos "no existe / inactivo" de "sin stock suficiente"
      if exists (select 1 from public.products where id = it ->> 'productId' and store_id = p_store and active) then
        select * into pr from public.products where id = it ->> 'productId' and store_id = p_store;
        return jsonb_build_object('ok', false, 'error', 'Solo quedan ' || coalesce(pr.stock, 0) || ' unidades de ' || pr.name || '.');
      end if;
      return jsonb_build_object('ok', false, 'error', 'Uno de los productos ya no está disponible.');
    end if;
    -- ▲▲ FIN CAMBIO F1

    subtotal := subtotal + pr.price * qty;
    items_cost := items_cost + coalesce(pr.cost, 0) * qty;
    arr := arr || jsonb_build_object('productId', pr.id, 'name', pr.name, 'image', coalesce(pr.image, ''),
      'quantity', qty, 'unitPrice', pr.price, 'unitCost', coalesce(pr.cost, 0), 'lineTotal', pr.price * qty);
  end loop;

  c := coalesce(s.cfg, '{}'::jsonb);
  seq := coalesce((nullif(c ->> 'nextOrderNumber', ''))::int, 1001);
  if del <> 'pickup' then
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
    'delivery', jsonb_build_object('type', del, 'address', case when del = 'shipping' then addr else '' end, 'notes', notes),
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
      'address', case when del = 'shipping' then addr else '' end, 'phone', phone,
      'purchaseHistory', jsonb_build_array(pch), 'createdAt', ts, 'updatedAt', ts, 'origin', 'online');
    c := jsonb_set(c, '{customers}', jsonb_build_array(cust) || coalesce(c -> 'customers', '[]'::jsonb));
  else
    cust := c -> 'customers' -> v_idx;
    if (cust ->> 'address') is null or cust ->> 'address' = '' then
      if del = 'shipping' then cust := jsonb_set(cust, '{address}', to_jsonb(addr)); end if;
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

-- ----------------------------------------------------------------------------
-- F2 · MEDIO · Tiendas suspendidas/baja no deben poder EDITAR por RPC
-- (la puerta actual es solo del frontend; con curl y la clave se salteaba)
-- ----------------------------------------------------------------------------

-- api_save_cfg: agregar chequeo de estado justo después del chequeo de clave
create or replace function public.api_save_cfg(p_store text, p_key text, p_cfg jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  -- ▼ CAMBIO F2
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_' || public.h_state(s),
      'msg', 'Tu tienda está suspendida. Regularizá el pago con POPUPS para seguir editando.');
  end if;
  -- ▲ CAMBIO F2
  update public.stores set cfg = coalesce(s.cfg, '{}'::jsonb) || coalesce(p_cfg, '{}'::jsonb)
    where id = p_store;
  return jsonb_build_object('ok', true);
end $function$;

-- api_delete_product: mismo chequeo
create or replace function public.api_delete_product(p_store text, p_key text, p_id text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  -- ▼ CAMBIO F2
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_' || public.h_state(s));
  end if;
  -- ▲ CAMBIO F2
  delete from public.products where id = p_id and store_id = p_store;
  return jsonb_build_object('ok', true);
end $function$;

-- api_mp_set: mismo chequeo (evita conectar/desconectar MP estando suspendida)
create or replace function public.api_mp_set(p_store text, p_key text, p_token text, p_action text default 'save')
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  -- ▼ CAMBIO F2
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_' || public.h_state(s));
  end if;
  -- ▲ CAMBIO F2
  if p_action = 'clear' then
    update public.stores set mp_token = '', mp_nick = '', mp_pending = '' where id = p_store;
    return jsonb_build_object('ok', true, 'connected', false);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Para guardar el token usá el flujo nuevo (api_mp_launch + api_mp_poll).');
end $function$;

-- api_mp_launch: en la rama 'set', agregar el chequeo de estado junto al de clave
create or replace function public.api_mp_launch(p_store text, p_key text, p_kind text, p_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
  token text;
  uri text;
  method text;
  body jsonb := null;
  rid bigint;
  ord jsonb;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;

  if p_kind = 'set' then
    if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
      return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
    -- ▼ CAMBIO F2
    if public.h_state(s) <> 'activa' then
      return jsonb_build_object('ok', false, 'error', 'store_' || public.h_state(s),
        'msg', 'Tu tienda está suspendida. Regularizá el pago con POPUPS para conectar Mercado Pago.'); end if;
    -- ▲ CAMBIO F2
    token := trim(coalesce(p_json ->> 'token', ''));
    if token = '' then
      return jsonb_build_object('ok', false, 'error', 'Token vacío. Pegá tu Access Token de Mercado Pago.'); end if;
    update public.stores set mp_pending = token where id = p_store;
    method := 'GET'; uri := 'https://api.mercadopago.com/users/me';

  elsif p_kind = 'pref' then
    if public.h_state(s) <> 'activa' then
      return jsonb_build_object('ok', false, 'error', 'Tienda no disponible.'); end if;
    if s.mp_token = '' then
      return jsonb_build_object('ok', false, 'error', 'Esta tienda todavía no conectó Mercado Pago.'); end if;
    select x into ord from jsonb_array_elements(coalesce(s.cfg -> 'orders', '[]'::jsonb)) x
      where x ->> 'id' = p_json ->> 'order_id' limit 1;
    if ord is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado.'); end if;
    if coalesce(ord #>> '{payment,mode}', '') <> 'live' or coalesce(ord #>> '{payment,status}', '') = 'approved' then
      return jsonb_build_object('ok', false, 'error', 'Este pedido no espera un cobro nuevo.'); end if;
    method := 'POST'; uri := 'https://api.mercadopago.com/checkout/preferences';
    body := jsonb_build_object(
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', it ->> 'productId',
        'title', coalesce(nullif(it ->> 'name', ''), 'Producto'),
        'quantity', coalesce(nullif(it ->> 'quantity', '')::int, 1),
        'unit_price', coalesce(nullif(it ->> 'unitPrice', '')::int, 0),
        'currency_id', 'ARS')), '[]'::jsonb)
        from jsonb_array_elements(coalesce(ord -> 'items', '[]'::jsonb)) it),
      'external_reference', p_json ->> 'order_id',
      'auto_return', 'approved',
      'back_urls', jsonb_build_object('success', coalesce(p_json ->> 'back', ''), 'pending', coalesce(p_json ->> 'back', ''), 'failure', coalesce(p_json ->> 'back', '')));
    token := s.mp_token;

  elsif p_kind = 'confirm' then
    if public.h_state(s) <> 'activa' then
      return jsonb_build_object('ok', false, 'error', 'Tienda no disponible.'); end if;
    if s.mp_token = '' then
      return jsonb_build_object('ok', false, 'error', 'mp_not_configured'); end if;
    select x into ord from jsonb_array_elements(coalesce(s.cfg -> 'orders', '[]'::jsonb)) x
      where x ->> 'id' = p_json ->> 'order_id' limit 1;
    if ord is not null and coalesce(ord #>> '{payment,status}', '') = 'approved' then
      return jsonb_build_object('ok', true, 'skip', true, 'status', 'approved'); end if;
    method := 'GET'; uri := 'https://api.mercadopago.com/v1/payments/' || coalesce(nullif(p_json ->> 'payment_id', ''), '0');
    token := s.mp_token;

  else
    return jsonb_build_object('ok', false, 'error', 'kind desconocido');
  end if;

  if method = 'POST' then
    select net.http_post(url := uri,
      headers := jsonb_build_object('Authorization', 'Bearer ' || token, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      body := coalesce(body, '{}'::jsonb)) into rid;
  else
    select net.http_get(url := uri,
      headers := jsonb_build_object('Authorization', 'Bearer ' || token, 'Accept', 'application/json')) into rid;
  end if;
  if rid is null then
    if p_kind = 'set' then update public.stores set mp_pending = '' where id = p_store; end if;
    return jsonb_build_object('ok', false, 'error', 'mp_request_failed');
  end if;
  return jsonb_build_object('ok', true, 'rid', rid);
end $function$;

-- ----------------------------------------------------------------------------
-- F6 · BAJO · Default seguro de consentimiento en api_subscribe
-- ----------------------------------------------------------------------------
-- En Postgres, CREATE OR REPLACE no puede cambiar el DEFAULT de un parámetro
-- (hoy es true), así que para que el default seguro quede en FALSE hace falta
-- DROP + CREATE. La ventana sin función es instantánea dentro de este mismo run.
drop function if exists public.api_subscribe(text, text, boolean);
create or replace function public.api_subscribe(p_store text, p_email text, p_consent boolean default false)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $function$
declare
  s public.stores;
  c jsonb;
  email text; ts text; i int; v_idx int := -1; sub jsonb;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'Esta tienda está suspendida.'); end if;
  email := lower(trim(coalesce(p_email, '')));
  if not email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Ingresá un email válido.'); end if;
  if p_consent is not true then
    return jsonb_build_object('ok', false, 'error', 'Necesitamos tu consentimiento para suscribirte.'); end if;
  c := coalesce(s.cfg, '{}'::jsonb);
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if jsonb_typeof(c -> 'subscribers') = 'array' then
    for i in 0 .. jsonb_array_length(c -> 'subscribers') - 1 loop
      if c #>> array['subscribers', i::text, 'email'] = email then v_idx := i; exit; end if;
    end loop;
  end if;
  if v_idx = -1 then
    sub := jsonb_build_object('id', gen_random_uuid()::text, 'email', email, 'status', 'active',
      'source', 'website', 'consentAt', ts, 'createdAt', ts, 'updatedAt', ts);
    c := jsonb_set(c, '{subscribers}', jsonb_build_array(sub) || coalesce(c -> 'subscribers', '[]'::jsonb));
  else
    sub := c -> 'subscribers' -> v_idx;
    sub := jsonb_set(sub, '{status}', to_jsonb('active'::text));
    sub := jsonb_set(sub, '{consentAt}', to_jsonb(ts));
    sub := jsonb_set(sub, '{updatedAt}', to_jsonb(ts));
    c := jsonb_set(c, array['subscribers', v_idx::text], sub);
  end if;
  update public.stores set cfg = c where id = p_store;
  return jsonb_build_object('ok', true, 'message', '¡Gracias! Ya sos parte de ' || nullif(s.biz, '') || '.');
end $function$;

-- ----------------------------------------------------------------------------
-- F5 · BAJO · Que el cupo del plan cuente solo productos ACTIVOS
-- (opción B: si POPUPS prefiere que pausar NO libere cupo, NO aplicar este patch)
-- ----------------------------------------------------------------------------
-- En api_upsert_product, reemplazar:
--   select count(*) into cnt from public.products where store_id = p_store;
-- por:
--   select count(*) into cnt from public.products where store_id = p_store and active;

-- ----------------------------------------------------------------------------
-- F4 · BAJO · Hardening opcional de rids pg_net (tabla mp_jobs + validación)
-- ----------------------------------------------------------------------------
-- create table if not exists public.mp_jobs (
--   rid bigint primary key, store_id text not null, kind text not null, created_at timestamptz default now());
-- -- en api_mp_launch, tras obtener rid:  insert into mp_jobs values (rid, p_store, p_kind) on conflict do nothing;
-- -- en api_mp_poll, al inicio:            if not exists (select 1 from mp_jobs where rid = p_rid and store_id = p_store) then return jsonb_build_object('ok', false, 'error', 'job_ajeno'); end if;
