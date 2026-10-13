-- Mi-Tienda: retirar el bypass global de claves y asegurar la consola POPUPS.
-- Revisá este archivo junto con la estructura REAL de Supabase antes de aplicarlo.
-- Las ocho RPC restauradas provienen del snapshot de schema-real.sql; no se aplica
-- automáticamente, no contiene credenciales y no toca datos de tiendas.

begin;

-- Limita intentos contra el secreto central por huella efímera de cliente.
-- No se guardan direcciones IP ni la clave enviada; solo un hash de cabeceras.
create table if not exists public.popups_admin_attempts (
  fingerprint text primary key,
  fail_count integer not null default 0 check (fail_count >= 0),
  window_started timestamptz not null default now()
);
alter table public.popups_admin_attempts enable row level security;
revoke all privileges on table public.popups_admin_attempts from public, anon, authenticated;

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
end $function$;

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
end $function$;

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
end $function$;

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
end $function$;

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
end $function$;

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
end $function$;

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
end $function$;

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
end $function$;

create or replace function public.api_admin(p_pin text, p_action text, p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_pin_hash text;
  v_headers jsonb := '{}'::jsonb;
  v_client text;
  v_fingerprint text;
  v_attempts integer := 0;
  v_window timestamptz;
  v_id text;
  v_front text;
  v_cfg jsonb;
  v_settings jsonb;
  v_rows integer;
  v_existing_hash text;
  s public.stores;
  r jsonb;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_client := coalesce(nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''), 'unknown')
              || '|' || coalesce(v_headers ->> 'user-agent', 'unknown');
  v_fingerprint := encode(digest(v_client, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_fingerprint)::bigint);

  select fail_count, window_started into v_attempts, v_window
    from public.popups_admin_attempts where fingerprint = v_fingerprint;
  if found and v_window > now() - interval '15 minutes' and v_attempts >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', 900);
  end if;

  select value #>> '{}' into v_pin_hash from public.config where key = 'admin_pin';
  if v_pin_hash is null or crypt(coalesce(p_pin, ''), v_pin_hash) <> v_pin_hash then
    insert into public.popups_admin_attempts(fingerprint, fail_count, window_started)
    values (v_fingerprint, 1, now())
    on conflict (fingerprint) do update set
      fail_count = case
        when public.popups_admin_attempts.window_started <= now() - interval '15 minutes' then 1
        else public.popups_admin_attempts.fail_count + 1
      end,
      window_started = case
        when public.popups_admin_attempts.window_started <= now() - interval '15 minutes' then now()
        else public.popups_admin_attempts.window_started
      end;
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;
  delete from public.popups_admin_attempts where fingerprint = v_fingerprint;

  case coalesce(p_action, '')
    when 'list' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id, 'biz', st.biz, 'owner', st.owner, 'contact', st.contact, 'note', st.note,
        'plan_id', st.plan_id, 'status', public.h_state(st),
        'paid_until', to_char(st.paid_until, 'YYYY-MM-DD'),
        'created_at', st.created_at, 'baja_at', st.baja_at,
        'products', (select count(*) from public.products pp where pp.store_id = st.id),
        'storefront', coalesce(st.cfg #>> '{settings,storefront}', 'tech')
      ) order by st.created_at desc), '[]'::jsonb)
      into r from public.stores st;
      return jsonb_build_object('ok', true, 'stores', r);

    when 'create_store' then
      v_id := lower(trim(coalesce(p ->> 'id', '')));
      if v_id !~ '^[a-z0-9_-]{2,50}$'
         or length(coalesce(p ->> 'key', '')) < 12
         or length(coalesce(p ->> 'key', '')) > 64 then
        return jsonb_build_object('ok', false, 'error', 'clave_invalida');
      end if;
      if exists (select 1 from public.stores where id = v_id) then
        select key_hash into v_existing_hash from public.stores where id = v_id;
        if v_existing_hash is not null and crypt(p ->> 'key', v_existing_hash) = v_existing_hash then
          return jsonb_build_object('ok', true, 'created', false);
        end if;
        return jsonb_build_object('ok', false, 'error', 'ya_existe');
      end if;
      v_cfg := coalesce(p -> 'cfg', '{}'::jsonb);
      if jsonb_typeof(v_cfg) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'cfg_invalida');
      end if;
      v_front := lower(trim(coalesce(v_cfg #>> '{settings,storefront}', 'tech')));
      if v_front not in ('luma', 'ofertas', 'gamer', 'libre', 'tech', 'actitud') then
        return jsonb_build_object('ok', false, 'error', 'storefront_invalida');
      end if;
      v_settings := case when jsonb_typeof(v_cfg -> 'settings') = 'object' then v_cfg -> 'settings' else '{}'::jsonb end;
      v_cfg := jsonb_set(v_cfg, '{settings}', v_settings || jsonb_build_object('storefront', v_front), true);
      insert into public.stores
        (id, biz, owner, contact, note, plan_id, status, paid_until, key_hash, cfg)
      values
        (v_id, coalesce(p ->> 'biz', ''), coalesce(p ->> 'owner', ''), coalesce(p ->> 'contact', ''),
         coalesce(p ->> 'note', ''), coalesce(p ->> 'plan_id', 'p25'), 'activa',
         coalesce((nullif(p ->> 'paid_until', ''))::date, current_date + 30),
         crypt(p ->> 'key', gen_salt('bf')), v_cfg);
      return jsonb_build_object('ok', true);

    when 'set' then
      v_id := lower(trim(coalesce(p ->> 'id', '')));
      if p ? 'status' and coalesce(p ->> 'status', '') not in ('activa', 'suspendida', 'baja') then
        return jsonb_build_object('ok', false, 'error', 'estado_invalido');
      end if;
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
          else baja_at
        end
      where id = v_id;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      return jsonb_build_object('ok', true);

    when 'set_storefront' then
      v_id := lower(trim(coalesce(p ->> 'id', '')));
      v_front := lower(trim(coalesce(p ->> 'storefront', '')));
      if v_front not in ('luma', 'ofertas', 'gamer', 'libre', 'tech', 'actitud') then
        return jsonb_build_object('ok', false, 'error', 'storefront_invalida');
      end if;
      update public.stores set cfg = jsonb_set(
        coalesce(cfg, '{}'::jsonb), '{settings}',
        (case when jsonb_typeof(cfg -> 'settings') = 'object' then cfg -> 'settings' else '{}'::jsonb end)
          || jsonb_build_object('storefront', v_front), true)
      where id = v_id;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      return jsonb_build_object('ok', true);

    when 'set_plan' then
      if p ->> 'plan_id' is null then return jsonb_build_object('ok', false, 'error', 'faltan_datos'); end if;
      if not exists (select 1 from public.config where key = 'plans' and value ? (p ->> 'plan_id')) then
        return jsonb_build_object('ok', false, 'error', 'plan_desconocido');
      end if;
      update public.stores set plan_id = p ->> 'plan_id' where id = p ->> 'id';
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      return jsonb_build_object('ok', true);

    when 'reactivate' then
      update public.stores set status = 'activa', baja_at = null where id = p ->> 'id';
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      return jsonb_build_object('ok', true);

    when 'rotate_key' then
      if length(coalesce(p ->> 'key', '')) < 12 or length(coalesce(p ->> 'key', '')) > 64 then
        return jsonb_build_object('ok', false, 'error', 'clave_invalida');
      end if;
      update public.stores set key_hash = crypt(p ->> 'key', gen_salt('bf')) where id = p ->> 'id';
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      return jsonb_build_object('ok', true);

    when 'set_cfg' then
      if jsonb_typeof(coalesce(p -> 'cfg', '{}'::jsonb)) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'cfg_invalida');
      end if;
      select * into s from public.stores where id = p ->> 'id';
      if not found then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
      update public.stores set cfg = coalesce(s.cfg, '{}'::jsonb) || coalesce(p -> 'cfg', '{}'::jsonb)
        where id = p ->> 'id';
      return jsonb_build_object('ok', true);

    when 'import_products' then
      if jsonb_typeof(coalesce(p -> 'products', '[]'::jsonb)) <> 'array' then
        return jsonb_build_object('ok', false, 'error', 'productos_invalidos');
      end if;
      if not exists (select 1 from public.stores where id = p ->> 'id') then
        return jsonb_build_object('ok', false, 'error', 'store_not_found');
      end if;
      insert into public.products
        (store_id, id, name, price, compare, wholesale, cost, stock, low_stock,
         category, badge, description, image, barcode, active, featured, sort)
      select p ->> 'id',
        coalesce(nullif(el ->> 'id', ''), gen_random_uuid()::text),
        coalesce(el ->> 'name', ''), coalesce(nullif(el ->> 'price', '')::int, 0),
        nullif(el ->> 'compareAtPrice', '')::int, nullif(el ->> 'wholesalePrice', '')::int,
        nullif(el ->> 'costPrice', '')::int, coalesce(nullif(el ->> 'stock', '')::int, 0),
        nullif(el ->> 'lowStockAt', '')::int, coalesce(el ->> 'category', ''),
        coalesce(el ->> 'badge', ''), coalesce(el ->> 'description', ''),
        coalesce(el ->> 'image', ''), coalesce(el ->> 'barcode', ''),
        coalesce((el ->> 'active')::boolean, true), coalesce((el ->> 'featured')::boolean, false),
        coalesce(nullif(el ->> 'sort', '')::int, 0)
      from jsonb_array_elements(coalesce(p -> 'products', '[]'::jsonb)) as el
      on conflict (id) do nothing;
      return jsonb_build_object('ok', true);

    else
      return jsonb_build_object('ok', false, 'error', 'accion_desconocida');
  end case;
end
$function$;

-- No routine other than the old helper may retain a dependency on the bypass.
do $check$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not in ('mt_key_ok', 'mt_master_hash')
      and p.prosrc ilike '%mt_key_ok%'
  ) then
    raise exception 'A cloud RPC still references the retired master-key helper; review it before continuing.';
  end if;
end
$check$;

drop function if exists public.mt_key_ok(text, text);
drop function if exists public.mt_master_hash();

revoke all privileges on function public.api_admin(text, text, jsonb) from public;
grant execute on function public.api_admin(text, text, jsonb) to anon, authenticated, service_role;

commit;
