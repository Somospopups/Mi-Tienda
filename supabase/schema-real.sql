-- ============================================================================
-- Mi-Tienda · SQL REAL del proyecto Supabase zfnlcfnutnuatrhgbbci
-- ============================================================================
-- Volcado obtenido el 2026-09-15 desde el SQL Editor del dashboard
-- (consulta "TODO EN UNO" de export.sql). Fuente de verdad del backend.
--
-- Contenido:
--   · 19 funciones (15 RPC del cliente + api_admin/api_usage de la Consola
--     POPUPS + api_ping_mp/api_ping_poll de diagnóstico)
--   · Metadatos de tablas / RLS / grants / triggers / extensiones (comentarios)
--   · DDL de tablas reconstruido desde information_schema (verificar PK/FK)
--
-- Seguridad del volcado: NO incluye valores de config (hash de PIN de consola,
-- planes), ni key_hash, ni mp_token. Es estructural: se puede commitear.
-- ============================================================================

-- FUNCTION api_admin(p_pin text, p_action text, p jsonb)
CREATE OR REPLACE FUNCTION public.api_admin(p_pin text, p_action text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  pin_hash text;
  s public.stores;
  r jsonb;
begin
  select value #>> '{}' into pin_hash from public.config where key = 'admin_pin';
  if pin_hash is null or crypt(coalesce(p_pin, ''), pin_hash) <> pin_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;

  case p_action
    when 'list' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id, 'biz', st.biz, 'owner', st.owner, 'contact', st.contact, 'note', st.note,
        'plan_id', st.plan_id, 'status', public.h_state(st), 'paid_until', to_char(st.paid_until, 'YYYY-MM-DD'),
        'created_at', st.created_at, 'baja_at', st.baja_at,
        'products', (select count(*) from public.products pp where pp.store_id = st.id)) order by st.created_at desc), '[]'::jsonb)
        into r from public.stores st;
      return jsonb_build_object('ok', true, 'stores', r);

    when 'create_store' then
      if p ->> 'id' is null or p ->> 'key' is null then
        return jsonb_build_object('ok', false, 'error', 'faltan_datos');
      end if;
      if exists (select 1 from public.stores where id = p ->> 'id') then
        return jsonb_build_object('ok', false, 'error', 'ya_existe');
      end if;
      insert into public.stores
        (id, biz, owner, contact, note, plan_id, status, paid_until, key_hash, cfg)
      values
        (lower(trim(p ->> 'id')),
         coalesce(p ->> 'biz', ''), coalesce(p ->> 'owner', ''), coalesce(p ->> 'contact', ''),
         coalesce(p ->> 'note', ''), coalesce(p ->> 'plan_id', 'p25'), 'activa',
         coalesce((nullif(p ->> 'paid_until', ''))::date, current_date + 30),
         crypt(p ->> 'key', gen_salt('bf')),
         coalesce(p -> 'cfg', '{}'::jsonb));
      return jsonb_build_object('ok', true);

    when 'set' then
      select * into s from public.stores where id = p ->> 'id';
      if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      update public.stores set
        biz = coalesce(p ->> 'biz', biz),
        owner = coalesce(p ->> 'owner', owner),
        contact = coalesce(p ->> 'contact', contact),
        note = coalesce(p ->> 'note', note),
        status = case when p ? 'status' then p ->> 'status' else status end,
        paid_until = case when p ? 'paid_until' then (nullif(p ->> 'paid_until', ''))::date else paid_until end,
        baja_at = case
                    when p ->> 'status' = 'baja' then coalesce(baja_at, now())
                    when p ? 'status' and p ->> 'status' <> 'baja' then null
                    else baja_at end
      where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'set_plan' then
      if p ->> 'plan_id' is null then return jsonb_build_object('ok', false, 'error', 'faltan_datos'); end if;
      if not exists (select 1 from public.config where key = 'plans' and value ? (p ->> 'plan_id')) then
        return jsonb_build_object('ok', false, 'error', 'plan_desconocido');
      end if;
      update public.stores set plan_id = p ->> 'plan_id' where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'reactivate' then
      update public.stores set status = 'activa', baja_at = null where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'rotate_key' then
      if p ->> 'key' is null then return jsonb_build_object('ok', false, 'error', 'faltan_datos'); end if;
      update public.stores set key_hash = crypt(p ->> 'key', gen_salt('bf'))
        where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'set_cfg' then
      select * into s from public.stores where id = p ->> 'id';
      if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      update public.stores set cfg = coalesce(s.cfg, '{}'::jsonb) || coalesce(p -> 'cfg', '{}'::jsonb)
        where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'import_products' then
      if not exists (select 1 from public.stores where id = p ->> 'id') then
        return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      insert into public.products
        (store_id, id, name, price, compare, wholesale, cost, stock, low_stock,
         category, badge, description, image, barcode, active, featured, sort)
      select p ->> 'id',
             coalesce(nullif(el ->> 'id', ''), gen_random_uuid()::text),
             coalesce(el ->> 'name', ''),
             coalesce(nullif(el ->> 'price', '')::int, 0),
             nullif(el ->> 'compareAtPrice', '')::int,
             nullif(el ->> 'wholesalePrice', '')::int,
             nullif(el ->> 'costPrice', '')::int,
             coalesce(nullif(el ->> 'stock', '')::int, 0),
             nullif(el ->> 'lowStockAt', '')::int,
             coalesce(el ->> 'category', ''), coalesce(el ->> 'badge', ''),
             coalesce(el ->> 'description', ''), coalesce(el ->> 'image', ''),
             coalesce(el ->> 'barcode', ''), coalesce((el ->> 'active')::boolean, true),
             coalesce((el ->> 'featured')::boolean, false), coalesce(nullif(el ->> 'sort', '')::int, 0)
      from jsonb_array_elements(coalesce(p -> 'products', '[]'::jsonb)) as el
      on conflict (id) do nothing;
      return jsonb_build_object('ok', true);

    else
      return jsonb_build_object('ok', false, 'error', 'accion_desconocida');
  end case;
end $function$


-- FUNCTION api_delete_product(p_store text, p_key text, p_id text)
CREATE OR REPLACE FUNCTION public.api_delete_product(p_store text, p_key text, p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  delete from public.products where id = p_id and store_id = p_store;
  return jsonb_build_object('ok', true);
end $function$


-- FUNCTION api_mp_launch(p_store text, p_key text, p_kind text, p_json jsonb)
CREATE OR REPLACE FUNCTION public.api_mp_launch(p_store text, p_key text, p_kind text, p_json jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    -- si el pedido ya figura aprobado, no hace falta llamar a MP
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
end $function$


-- FUNCTION api_mp_poll(p_store text, p_key text, p_kind text, p_rid bigint)
CREATE OR REPLACE FUNCTION public.api_mp_poll(p_store text, p_key text, p_kind text, p_rid bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
  r_status int; r_content text; r_err text; r_to boolean;
  body jsonb;
  nick text;
  token text;
  ord jsonb; c jsonb; arr jsonb; mv jsonb;
  paid boolean; ts text; o_number text; p_order_id text; p_payment_id text;
  items_cost bigint := 0;
  x jsonb;
  i int; j int;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if p_kind = 'set' then
    if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
      return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  end if;

  select status_code, content, error_msg, timed_out
    into r_status, r_content, r_err, r_to
    from net._http_response where id = p_rid;
  if not found or r_status is null then
    return jsonb_build_object('ok', true, 'pending', true);
  end if;
  begin
    body := nullif(r_content, '')::jsonb;
  exception when others then
    body := '{}'::jsonb;
  end;

  if p_kind = 'set' then
    if r_status = 200 then
      nick := coalesce(nullif(body ->> 'nickname', ''), nullif(body ->> 'first_name', ''), 'cuenta de MP');
      update public.stores set mp_token = s.mp_pending, mp_nick = nick, mp_pending = '' where id = p_store;
      return jsonb_build_object('ok', true, 'connected', true, 'nick', nick);
    end if;
    update public.stores set mp_pending = '' where id = p_store;
    return jsonb_build_object('ok', false, 'error',
      'Mercado Pago rechazó el token (HTTP ' || r_status || '). Revisá que sea el Access Token de producción (APP_USR-).');
  end if;

  if p_kind = 'pref' then
    if r_status = 201 then
      return jsonb_build_object('ok', true, 'init_point', body ->> 'init_point', 'preference_id', body ->> 'id');
    end if;
    return jsonb_build_object('ok', false, 'error',
      'Mercado Pago no aceptó el cobro (HTTP ' || r_status || '). ' || left(r_content, 200));
  end if;

  -- ===== confirm =====
  if r_status <> 200 then
    return jsonb_build_object('ok', false, 'error', 'No pudimos consultar el pago (HTTP ' || r_status || ').');
  end if;
  p_order_id := body ->> 'external_reference';
  p_payment_id := body ->> 'id';
  if p_order_id is null or p_order_id = '' then
    return jsonb_build_object('ok', false, 'error', 'El pago no tiene referencia de pedido.'); end if;

  c := coalesce(s.cfg, '{}'::jsonb);
  select x into ord from jsonb_array_elements(coalesce(c -> 'orders', '[]'::jsonb)) x
    where x ->> 'id' = p_order_id limit 1;
  if ord is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado.'); end if;
  if coalesce(ord #>> '{payment,status}', '') = 'approved' then
    return jsonb_build_object('ok', true, 'status', 'approved'); end if;

  paid := (body ->> 'status') = 'approved';
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD""T""HH24:MI:SS.MS""Z""');
  o_number := coalesce(ord ->> 'number', '');

  ord := ord || jsonb_build_object('updatedAt', ts,
    'payment', jsonb_build_object('method', 'mercadopago',
      'status', case when paid then 'approved' else 'pending' end,
      'mode', 'live',
      'mpPaymentId', p_payment_id,
      'mpStatus', body ->> 'status',
      'mpDetail', body ->> 'status_detail'),
    'timeline', coalesce(ord -> 'timeline', '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object('at', ts, 'status', case when paid then 'confirmed' else 'pending_payment' end,
        'note', case when paid then 'Pago aprobado en Mercado Pago (ID ' || p_payment_id || ').'
                      else 'Pago ' || coalesce(body ->> 'status', '?') || ' en Mercado Pago (ID ' || p_payment_id || ').' end)));

  if paid then
    ord := ord || jsonb_build_object('status', 'confirmed');
    items_cost := 0;
    for x in select * from jsonb_array_elements(coalesce(ord -> 'items', '[]'::jsonb)) loop
      items_cost := items_cost + coalesce((x ->> 'unitCost')::int, 0) * coalesce((x ->> 'quantity')::int, 0);
    end loop;
    mv := jsonb_build_object('id', gen_random_uuid()::text, 'type', 'income', 'date', left(ts, 10),
      'description', 'Venta ' || o_number, 'category', 'Ventas online',
      'amount', coalesce((ord ->> 'total')::int, 0), 'costAmount', items_cost, 'feeAmount', 0,
      'accountId', 'mercadopago', 'toAccountId', '', 'customerId', '',
      'customerName', coalesce(ord #>> '{customer,name}', ''), 'source', 'order',
      'orderId', p_order_id, 'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'productId', y ->> 'productId', 'name', y ->> 'name', 'quantity', (y ->> 'quantity')::int,
        'revenue', (y ->> 'lineTotal')::int, 'cost', (y ->> 'unitCost')::int)), '[]'::jsonb)
        from jsonb_array_elements(coalesce(ord -> 'items', '[]'::jsonb)) y),
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
  else
    ord := ord || jsonb_build_object('status', 'pending_payment');
  end if;

  if jsonb_typeof(c -> 'customers') = 'array' then
    for i in 0 .. jsonb_array_length(c -> 'customers') - 1 loop
      arr := c #> array['customers', i::text, 'purchaseHistory'];
      if jsonb_typeof(arr) = 'array' then
        for j in 0 .. jsonb_array_length(arr) - 1 loop
          if arr #>> array[j::text, 'orderId'] = p_order_id then
            arr := jsonb_set(arr, array[j::text, 'status'], to_jsonb(case when paid then 'confirmed' else 'pending_payment' end));
            c := jsonb_set(c, array['customers', i::text, 'purchaseHistory'], arr);
            exit;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  select coalesce(jsonb_agg(case when z ->> 'id' = p_order_id then ord else z end), '[]'::jsonb)
    into arr from jsonb_array_elements(c -> 'orders') z;
  c := jsonb_set(c, '{orders}', arr);
  update public.stores set cfg = c where id = p_store;
  return jsonb_build_object('ok', true, 'status', case when paid then 'approved' else 'pending' end,
    'payment_id', p_payment_id, 'order', ord);
end $function$


-- FUNCTION api_mp_set(p_store text, p_key text, p_token text, p_action text)
CREATE OR REPLACE FUNCTION public.api_mp_set(p_store text, p_key text, p_token text, p_action text DEFAULT 'save'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  if p_action = 'clear' then
    update public.stores set mp_token = '', mp_nick = '', mp_pending = '' where id = p_store;
    return jsonb_build_object('ok', true, 'connected', false);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Para guardar el token usá el flujo nuevo (api_mp_launch + api_mp_poll).');
end $function$


-- FUNCTION api_mp_status(p_store text, p_key text)
CREATE OR REPLACE FUNCTION public.api_mp_status(p_store text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  return jsonb_build_object('ok', true, 'connected', (s.mp_token <> ''), 'nick', s.mp_nick,
    'token_tail', case when s.mp_token <> '' then right(s.mp_token, 4) else '' end);
end $function$


-- FUNCTION api_order_create(p_store text, p jsonb)
CREATE OR REPLACE FUNCTION public.api_order_create(p_store text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    select * into pr from public.products
      where id = it ->> 'productId' and store_id = p_store and active = true;
    if not found then return jsonb_build_object('ok', false, 'error', 'Uno de los productos ya no está disponible.'); end if;
    if qty > pr.stock then
      return jsonb_build_object('ok', false, 'error', 'Solo quedan ' || pr.stock || ' unidades de ' || pr.name || '.'); end if;
    subtotal := subtotal + pr.price * qty;
    items_cost := items_cost + coalesce(pr.cost, 0) * qty;
    arr := arr || jsonb_build_object('productId', pr.id, 'name', pr.name, 'image', coalesce(pr.image, ''),
      'quantity', qty, 'unitPrice', pr.price, 'unitCost', coalesce(pr.cost, 0), 'lineTotal', pr.price * qty);
    update public.products set stock = stock - qty, updated_at = now() where id = pr.id;
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
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD""T""HH24:MI:SS.MS""Z""');
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

  -- cliente (coincide por teléfono, como la app)
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

  -- movimiento financiero de la venta online: solo demo (MP real se confirma aparte)
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
end $function$


-- FUNCTION api_panel(p_store text, p_key text)
CREATE OR REPLACE FUNCTION public.api_panel(p_store text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
  prods jsonb;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or s.key_hash is null
     or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  select coalesce(jsonb_agg(public.h_prod(pr) order by pr.sort, pr.created_at), '[]'::jsonb)
    into prods from public.products pr where pr.store_id = p_store;
  return jsonb_build_object('ok', true, 'status', public.h_state(s), 'paid_until',
    to_char(s.paid_until, 'YYYY-MM-DD'), 'plan', public.h_plan(s.plan_id), 'plan_id', s.plan_id,
    'biz', s.biz, 'owner', s.owner, 'contact', s.contact, 'note', s.note,
    'mp_ok', (s.mp_token <> ''), 'mp_nick', s.mp_nick,
    'cfg', s.cfg, 'products', prods);
end $function$


-- FUNCTION api_ping_mp()
CREATE OR REPLACE FUNCTION public.api_ping_mp()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object('ok', true, 'rid',
    net.http_get(url := 'https://api.mercadopago.com/',
      headers := jsonb_build_object('Accept', 'application/json')))
$function$


-- FUNCTION api_ping_poll(p_rid bigint)
CREATE OR REPLACE FUNCTION public.api_ping_poll(p_rid bigint)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object('ok', true,
    'done', (select status_code is not null from net._http_response where id = p_rid),
    'code', (select status_code from net._http_response where id = p_rid),
    'err', (select error_msg from net._http_response where id = p_rid))
$function$


-- FUNCTION api_public(p_store text)
CREATE OR REPLACE FUNCTION public.api_public(p_store text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
  st text;
  prods jsonb;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  st := public.h_state(s);
  if st <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_' || st, 'status', st);
  end if;
  select coalesce(jsonb_agg(public.h_prod_pub(pr) order by pr.sort, pr.created_at), '[]'::jsonb)
    into prods from public.products pr where pr.store_id = p_store and pr.active = true;
  return jsonb_build_object('ok', true, 'status', 'activa', 'biz', s.biz, 'contact', s.contact,
    'mp_ok', (s.mp_token <> ''),
    'cfg', jsonb_build_object('content', s.cfg -> 'content', 'settings', s.cfg -> 'settings', 'legal', s.cfg -> 'legal'),
    'products', prods);
end $function$


-- FUNCTION api_save_cfg(p_store text, p_key text, p_cfg jsonb)
CREATE OR REPLACE FUNCTION public.api_save_cfg(p_store text, p_key text, p_cfg jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  update public.stores set cfg = coalesce(s.cfg, '{}'::jsonb) || coalesce(p_cfg, '{}'::jsonb)
    where id = p_store;
  return jsonb_build_object('ok', true);
end $function$


-- FUNCTION api_subscribe(p_store text, p_email text, p_consent boolean)
CREATE OR REPLACE FUNCTION public.api_subscribe(p_store text, p_email text, p_consent boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD""T""HH24:MI:SS.MS""Z""');
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
end $function$


-- FUNCTION api_upsert_product(p_store text, p_key text, p jsonb)
CREATE OR REPLACE FUNCTION public.api_upsert_product(p_store text, p_key text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  s public.stores;
  oldid text;
  cnt int;
  mx int;
  rp public.products;
begin
  select * into s from public.stores where id = p_store;
  if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.key_hash = '' or crypt(coalesce(p_key, ''), s.key_hash) <> s.key_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  if public.h_state(s) <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_suspendida',
      'msg', 'La tienda está suspendida por falta de pago. Regularizala para seguir cargando productos.');
  end if;

  oldid := nullif(p ->> 'id', '');
  if oldid is not null then
    select id into oldid from public.products where id = oldid and store_id = p_store;
    if oldid is null then return jsonb_build_object('ok', false, 'error', 'product_not_found'); end if;
  end if;

  if oldid is null then
    mx := (public.h_plan(s.plan_id) ->> 'max')::int;
    if mx is not null then
      select count(*) into cnt from public.products where store_id = p_store;
      if cnt >= mx then
        return jsonb_build_object('ok', false, 'error', 'plan_limit',
          'msg', 'Tu plan permite hasta ' || mx || ' productos. Desactivá o borrá alguno, o avisá a POPUPS para subir de plan.');
      end if;
    end if;
    insert into public.products
      (store_id, name, price, compare, wholesale, cost, stock, low_stock,
       category, badge, description, image, barcode, active, featured, sort)
    values
      (p_store,
       coalesce(nullif(p ->> 'name', ''), ''),
       coalesce(nullif(p ->> 'price', '')::int, 0),
       nullif(p ->> 'compareAtPrice', '')::int,
       nullif(p ->> 'wholesalePrice', '')::int,
       nullif(p ->> 'costPrice', '')::int,
       coalesce(nullif(p ->> 'stock', '')::int, 0),
       nullif(p ->> 'lowStockAt', '')::int,
       coalesce(nullif(p ->> 'category', ''), ''),
       coalesce(nullif(p ->> 'badge', ''), ''),
       coalesce(nullif(p ->> 'description', ''), ''),
       coalesce(nullif(p ->> 'image', ''), ''),
       coalesce(nullif(p ->> 'barcode', ''), ''),
       coalesce(nullif(p ->> 'active', '')::boolean, true),
       coalesce(nullif(p ->> 'featured', '')::boolean, false),
       coalesce(nullif(p ->> 'sort', '')::int, 0))
    returning * into rp;
    return jsonb_build_object('ok', true, 'created', true, 'product', public.h_prod(rp));
  end if;

  update public.products set
    name = coalesce(nullif(p ->> 'name', ''), name),
    price = coalesce(nullif(p ->> 'price', '')::int, price),
    compare = nullif(p ->> 'compareAtPrice', '')::int,
    wholesale = nullif(p ->> 'wholesalePrice', '')::int,
    cost = nullif(p ->> 'costPrice', '')::int,
    stock = coalesce(nullif(p ->> 'stock', '')::int, stock),
    low_stock = nullif(p ->> 'lowStockAt', '')::int,
    category = coalesce(nullif(p ->> 'category', ''), category),
    badge = coalesce(nullif(p ->> 'badge', ''), badge),
    description = coalesce(nullif(p ->> 'description', ''), description),
    image = coalesce(nullif(p ->> 'image', ''), image),
    barcode = coalesce(nullif(p ->> 'barcode', ''), barcode),
    active = coalesce(nullif(p ->> 'active', '')::boolean, active),
    featured = coalesce(nullif(p ->> 'featured', '')::boolean, featured),
    sort = coalesce(nullif(p ->> 'sort', '')::int, sort),
    updated_at = now()
  where id = oldid and store_id = p_store
  returning * into rp;
  return jsonb_build_object('ok', true, 'created', false, 'product', public.h_prod(rp));
end $function$


-- FUNCTION api_usage(p_pin text)
CREATE OR REPLACE FUNCTION public.api_usage(p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  pin_hash text;
begin
  select value #>> '{}' into pin_hash from public.config where key = 'admin_pin';
  if pin_hash is null or crypt(coalesce(p_pin, ''), pin_hash) <> pin_hash then
    return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
  return jsonb_build_object('ok', true,
    'db_bytes', pg_database_size(current_database()),
    'db_limit_bytes', 524288000,
    'stores', (select count(*) from public.stores),
    'products', (select count(*) from public.products));
end $function$


-- FUNCTION h_plan(pid text)
CREATE OR REPLACE FUNCTION public.h_plan(pid text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select value -> pid from public.config where key = 'plans'), '{}'::jsonb);
$function$


-- FUNCTION h_prod(p products)
CREATE OR REPLACE FUNCTION public.h_prod(p products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'price', p.price,
    'compareAtPrice', p.compare, 'wholesalePrice', p.wholesale, 'costPrice', p.cost,
    'stock', p.stock, 'lowStockAt', p.low_stock,
    'category', p.category, 'badge', p.badge, 'description', p.description,
    'image', p.image, 'barcode', p.barcode,
    'active', p.active, 'featured', p.featured, 'sort', p.sort,
    'createdAt', to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD""T""HH24:MI:SS.MS""Z""'),
    'updatedAt', to_char(p.updated_at at time zone 'utc', 'YYYY-MM-DD""T""HH24:MI:SS.MS""Z""')
  );
$function$


-- FUNCTION h_prod_pub(p products)
CREATE OR REPLACE FUNCTION public.h_prod_pub(p products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.h_prod(p) - 'wholesalePrice' - 'costPrice' - 'barcode';
$function$


-- FUNCTION h_state(s stores)
CREATE OR REPLACE FUNCTION public.h_state(s stores)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when s.status = 'baja' then 'baja'
    when s.status <> 'activa' then 'suspendida'
    when s.paid_until is not null and s.paid_until < current_date then 'suspendida'
    else 'activa'
  end;
$function$



-- ============================================================================
-- DDL de tablas (reconstruido desde information_schema — VERIFICAR PK/FK/índices
-- con \d tabla en psql antes de usar para recrear el proyecto)
-- ============================================================================

create table if not exists public.config (
  key   text primary key,
  value jsonb not null
);  -- claves conocidas por las funciones: 'admin_pin' (hash bcrypt), 'plans' (jsonb por plan_id)

create table if not exists public.stores (
  id         text primary key,              -- = slug (?tienda=<id>)
  biz        text not null default '',
  owner      text not null default '',
  contact    text not null default '',
  note       text not null default '',
  plan_id    text not null default 'p25',
  status     text not null default 'activa',
  paid_until date,
  key_hash   text not null default '',      -- bcrypt de la Clave de acceso
  cfg        jsonb not null default '{}',   -- settings/content/legal/customers/orders/finance/subscribers/nextOrderNumber
  created_at timestamptz not null default now(),
  baja_at    timestamptz,
  mp_token   text not null default '',      -- ⚠ plaintext: ver auditoría F3
  mp_nick    text not null default '',
  mp_pending text not null default ''       -- token en validación (flujo api_mp_launch 'set')
);

create table if not exists public.products (
  id          text primary key,             -- uuid del cliente (PK global, no compuesta)
  store_id    text not null references public.stores(id) on delete cascade,
  name        text not null default '',
  price       integer not null default 0,
  compare     integer,
  wholesale   integer,
  cost        integer,
  stock       integer not null default 0,
  low_stock   integer,
  category    text not null default '',
  badge       text not null default '',
  description text not null default '',
  image       text not null default '',
  barcode     text not null default '',
  active      boolean not null default true,
  featured    boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_store_idx on public.products (store_id);

-- RLS: las 3 tablas con RLS activado y CERO políticas → ningún acceso directo
-- desde anon/authenticated; todo pasa por las funciones SECURITY DEFINER.
alter table public.config   enable row level security;
alter table public.stores   enable row level security;
alter table public.products enable row level security;

-- ============================================================================
-- METADATOS DEL VOLCADO (tablas / RLS / grants / triggers / extensiones)
-- ============================================================================
/*
===== TABLAS (columnas) =====
config · key : text NOT NULL
config · value : jsonb NOT NULL
products · id : text NOT NULL DEFAULT (gen_random_uuid())::text
products · store_id : text NOT NULL
products · name : text NOT NULL DEFAULT ''::text
products · price : integer NOT NULL DEFAULT 0
products · compare : integer
products · wholesale : integer
products · cost : integer
products · stock : integer NOT NULL DEFAULT 0
products · low_stock : integer
products · category : text NOT NULL DEFAULT ''::text
products · badge : text NOT NULL DEFAULT ''::text
products · description : text NOT NULL DEFAULT ''::text
products · image : text NOT NULL DEFAULT ''::text
products · barcode : text NOT NULL DEFAULT ''::text
products · active : boolean NOT NULL DEFAULT true
products · featured : boolean NOT NULL DEFAULT false
products · sort : integer NOT NULL DEFAULT 0
products · created_at : timestamp with time zone NOT NULL DEFAULT now()
products · updated_at : timestamp with time zone NOT NULL DEFAULT now()
stores · id : text NOT NULL
stores · biz : text NOT NULL DEFAULT ''::text
stores · owner : text NOT NULL DEFAULT ''::text
stores · contact : text NOT NULL DEFAULT ''::text
stores · note : text NOT NULL DEFAULT ''::text
stores · plan_id : text NOT NULL DEFAULT 'p25'::text
stores · status : text NOT NULL DEFAULT 'activa'::text
stores · paid_until : date
stores · key_hash : text NOT NULL DEFAULT ''::text
stores · cfg : jsonb NOT NULL DEFAULT '{}'::jsonb
stores · created_at : timestamp with time zone NOT NULL DEFAULT now()
stores · baja_at : timestamp with time zone
stores · mp_token : text NOT NULL DEFAULT ''::text
stores · mp_nick : text NOT NULL DEFAULT ''::text
stores · mp_pending : text NOT NULL DEFAULT ''::text

===== RLS =====
config · rls=true
products · rls=true
stores · rls=true

===== POLÍTICAS =====
(sin políticas)

===== GRANTS =====
postgres · config · INSERT
postgres · config · TRIGGER
postgres · config · REFERENCES
postgres · config · TRUNCATE
postgres · config · DELETE
postgres · config · UPDATE
postgres · config · SELECT
service_role · config · TRIGGER
service_role · config · REFERENCES
service_role · config · TRUNCATE
service_role · config · DELETE
service_role · config · UPDATE
service_role · config · SELECT
service_role · config · INSERT
postgres · products · INSERT
postgres · products · SELECT
postgres · products · UPDATE
postgres · products · DELETE
postgres · products · TRUNCATE
postgres · products · REFERENCES
postgres · products · TRIGGER
service_role · products · REFERENCES
service_role · products · INSERT
service_role · products · SELECT
service_role · products · UPDATE
service_role · products · DELETE
service_role · products · TRUNCATE
service_role · products · TRIGGER
postgres · stores · INSERT
postgres · stores · TRIGGER
postgres · stores · REFERENCES
postgres · stores · TRUNCATE
postgres · stores · DELETE
postgres · stores · UPDATE
postgres · stores · SELECT
service_role · stores · INSERT
service_role · stores · TRIGGER
service_role · stores · REFERENCES
service_role · stores · TRUNCATE
service_role · stores · DELETE
service_role · stores · UPDATE
service_role · stores · SELECT

===== TRIGGERS =====
realtime.subscription · tr_check_filters · BEFORE INSERT · EXECUTE FUNCTION realtime.subscription_check_filters()
realtime.subscription · tr_check_filters · BEFORE UPDATE · EXECUTE FUNCTION realtime.subscription_check_filters()
storage.objects · update_objects_updated_at · BEFORE UPDATE · EXECUTE FUNCTION storage.update_updated_at_column()
storage.buckets · enforce_bucket_name_length_trigger · BEFORE INSERT · EXECUTE FUNCTION storage.enforce_bucket_name_length()
storage.buckets · enforce_bucket_name_length_trigger · BEFORE UPDATE · EXECUTE FUNCTION storage.enforce_bucket_name_length()
storage.buckets · protect_buckets_delete · BEFORE DELETE · EXECUTE FUNCTION storage.protect_delete()
storage.objects · protect_objects_delete · BEFORE DELETE · EXECUTE FUNCTION storage.protect_delete()

===== EXTENSIONES =====
pg_net 0.20.4
pg_stat_statements 1.11
pgcrypto 1.3
plpgsql 1.0
supabase_vault 0.3.1
uuid-ossp 1.1
*/
