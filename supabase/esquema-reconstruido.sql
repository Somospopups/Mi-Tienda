-- ============================================================================
-- Mi-Tienda · Esquema Supabase RECONSTRUIDO (15-sep-2026)
-- ============================================================================
-- ⚠️  ATENCIÓN: este archivo fue RECONSTRUIDO a partir de los contratos que el
--     frontend consume (ver contratos-rpc.md, verificados en vivo contra el
--     proyecto productivo). NO es un dump del SQL real desplegado.
--
--     ✔ Sirve para: documentar el backend, recrearlo en un proyecto NUEVO
--       (staging / disaster recovery) y como base de comparación.
--     ✘ NO ejecutar sobre el proyecto productivo zfnlcfnutnuatrhgbbci
--       (chocaría con los objetos existentes).
--
--     Para obtener el SQL REAL: ejecutar export.sql en el SQL Editor del
--     dashboard y commitear el resultado como schema-real.sql (ver README.md).
-- ============================================================================

create extension if not exists pgcrypto;
-- pg_net viene habilitado en Supabase; si no: create extension pg_net;

-- ----------------------------------------------------------------------------
-- TABLAS
-- ----------------------------------------------------------------------------

create table if not exists public.plans (
  id           text primary key,            -- p25 | p50 | p100 | pilim
  max_products integer not null,
  price        integer not null             -- ARS / mes
);
insert into public.plans (id, max_products, price) values
  ('p25',   25, 30000),   -- ⚠ precios p25/p100/pilim estimados; ajustar a los reales
  ('p50',   50, 50000),   -- ✔ verificado en vivo (plan de la demo juan)
  ('p100', 100, 80000),
  ('pilim', 200, 120000)
on conflict (id) do nothing;

create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,         -- ?tienda=<slug>
  biz         text not null default '',     -- nombre del negocio
  owner       text not null default '',
  contact     text not null default '',
  note        text not null default '',
  status      text not null default 'activa'
              check (status in ('activa','suspendida','baja')),
  plan_id     text not null default 'p25' references public.plans(id),
  paid_until  date,
  access_key  text not null,                -- Clave de acceso del dueño
  mp_token    text not null default '',     -- Access Token MP (APP_USR-…) · ver nota de seguridad abajo
  mp_nick     text not null default '',
  created_at  timestamptz not null default now()
);
-- Nota de seguridad: las tablas quedan SIN acceso directo para anon/authenticated
-- (RLS sin políticas + funciones SECURITY DEFINER). Ideal: cifrar mp_token con
-- pgsodium/vault; en esta reconstrucción se protege por aislamiento de tabla.

create table if not exists public.products (
  store_id        uuid not null references public.stores(id) on delete cascade,
  id              text not null,            -- uuid generado por el cliente
  name            text not null default '',
  description     text not null default '',
  category        text not null default '',
  price           integer not null default 0,
  compare_at_price integer,
  wholesale_price integer,
  cost_price      integer,
  stock           integer not null default 0,
  low_stock_at    integer,
  badge           text not null default '',
  image           text not null default '',
  barcode         text not null default '',
  active          boolean not null default true,
  featured        boolean not null default false,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (store_id, id)
);

create table if not exists public.store_cfg (
  store_id uuid not null references public.stores(id) on delete cascade,
  key      text not null,                   -- settings|content|legal|customers|orders|finance|subscribers|nextOrderNumber
  value    jsonb not null default '{}'::jsonb,
  primary key (store_id, key)
);

create table if not exists public.mp_jobs (
  rid        uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  kind       text not null check (kind in ('set','pref','confirm')),
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending' check (status in ('pending','done','error')),
  response   jsonb not null default '{}'::jsonb,
  record_id  bigint,                        -- id del request en net._http_response
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

-- RLS: tablas cerradas; todo el acceso pasa por las funciones SECURITY DEFINER.
alter table public.plans      enable row level security;
alter table public.stores     enable row level security;
alter table public.products   enable row level security;
alter table public.store_cfg  enable row level security;
alter table public.mp_jobs    enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant execute on all functions in schema public to anon;

-- ----------------------------------------------------------------------------
-- HELPERS privados
-- ----------------------------------------------------------------------------

create or replace function public._mt_store(p_store text)
returns public.stores language sql stable security definer set search_path = public as $$
  select * from stores where slug = lower(coalesce(trim(p_store),''));
$$;

create or replace function public._mt_cfg(p_store_id uuid, p_key text, p_def jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from store_cfg where store_id = p_store_id and key = p_key), p_def);
$$;

-- Devuelve el producto JSON con los nombres de campo camelCase que espera el cliente.
create or replace function public._mt_product_json(p public.products, p_public boolean)
returns jsonb language sql immutable security definer set search_path = public as $$
  select to_jsonb(x) - case when p_public then array['wholesalePrice','costPrice','barcode'] else array[]::text[] end
  from (select
    p.id, p.name, p.description, p.category, p.price,
    p.compare_at_price  as "compareAtPrice",
    p.wholesale_price   as "wholesalePrice",
    p.cost_price        as "costPrice",
    p.stock, p.low_stock_at as "lowStockAt",
    p.badge, p.image, p.barcode, p.active, p.featured, p.sort,
    to_char(p.created_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
    to_char(p.updated_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
  ) x;
$$;

-- ----------------------------------------------------------------------------
-- api_public · vitrina + puerta de suspensión
-- ----------------------------------------------------------------------------
create or replace function public.api_public(p_store text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stores; begin
  s := public._mt_store(p_store);
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'store_not_found');
  end if;
  if s.status = 'suspendida' then
    return jsonb_build_object('ok', false, 'error', 'store_suspendida');
  end if;
  if s.status = 'baja' then
    return jsonb_build_object('ok', false, 'error', 'store_baja');
  end if;
  return jsonb_build_object(
    'ok', true,
    'biz', s.biz, 'status', s.status, 'contact', s.contact, 'owner', s.owner,
    'mp_ok', (s.mp_token <> ''),
    'cfg', jsonb_build_object(
      'settings', public._mt_cfg(s.id,'settings'),
      'content',  public._mt_cfg(s.id,'content'),
      'legal',    public._mt_cfg(s.id,'legal')
    ),
    'products', coalesce((
      select jsonb_agg(public._mt_product_json(p, true) order by p.sort, p.created_at)
      from products p where p.store_id = s.id and p.active
    ), '[]'::jsonb)
  );
end $$;

-- ----------------------------------------------------------------------------
-- api_panel · login del dueño + snapshot completo
-- ----------------------------------------------------------------------------
create or replace function public.api_panel(p_store text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stores; pl public.plans; cfg jsonb; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.status = 'suspendida' then return jsonb_build_object('ok', false, 'error', 'store_suspendida'); end if;
  if s.status = 'baja' then return jsonb_build_object('ok', false, 'error', 'store_baja'); end if;
  if p_key is null or p_key = '' or p_key <> s.access_key then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  select * into pl from plans where id = s.plan_id;
  cfg := jsonb_build_object(
    'settings',    public._mt_cfg(s.id,'settings'),
    'content',     public._mt_cfg(s.id,'content'),
    'legal',       public._mt_cfg(s.id,'legal'),
    'customers',   public._mt_cfg(s.id,'customers','[]'::jsonb),
    'orders',      public._mt_cfg(s.id,'orders','[]'::jsonb),
    'finance',     public._mt_cfg(s.id,'finance'),
    'subscribers', public._mt_cfg(s.id,'subscribers','[]'::jsonb),
    'nextOrderNumber', public._mt_cfg(s.id,'nextOrderNumber','1001'::jsonb)
  );
  return jsonb_build_object(
    'ok', true,
    'biz', s.biz, 'owner', s.owner, 'status', s.status, 'contact', s.contact, 'note', s.note,
    'plan_id', s.plan_id,
    'plan', jsonb_build_object('max', pl.max_products, 'price', pl.price),
    'paid_until', to_char(s.paid_until,'YYYY-MM-DD'),
    'mp_ok', (s.mp_token <> ''),
    'mp_nick', s.mp_nick,
    'cfg', cfg,
    'products', coalesce((
      select jsonb_agg(public._mt_product_json(p, false) order by p.sort, p.created_at)
      from products p where p.store_id = s.id
    ), '[]'::jsonb)
  );
end $$;

-- ----------------------------------------------------------------------------
-- api_save_cfg · guarda UNA sección (el cliente hace diff por sección)
-- ----------------------------------------------------------------------------
create or replace function public.api_save_cfg(p_store text, p_key text, p_cfg jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.stores; k text; allowed text[] :=
  array['settings','content','legal','customers','orders','finance','subscribers','nextOrderNumber'];
begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.status <> 'activa' then return jsonb_build_object('ok', false, 'error', 'store_' || s.status); end if;
  if p_key is null or p_key <> s.access_key then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  foreach k in array allowed loop
    if p_cfg ? k then
      insert into store_cfg (store_id, key, value) values (s.id, k, p_cfg->k)
      on conflict (store_id, key) do update set value = excluded.value;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ----------------------------------------------------------------------------
-- api_upsert_product / api_delete_product · con límite de plan server-side
-- ----------------------------------------------------------------------------
create or replace function public.api_upsert_product(p_store text, p_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.stores; pl public.plans; n integer; pid text; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.status <> 'activa' then return jsonb_build_object('ok', false, 'error', 'store_' || s.status); end if;
  if p_key is null or p_key <> s.access_key then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  pid := nullif(trim(coalesce(p->>'id','')), '');
  if pid is null then pid := gen_random_uuid()::text; end if;
  select * into pl from plans where id = s.plan_id;
  select count(*) into n from products where store_id = s.id and id <> pid and active;
  if (p->>'active')::boolean and n >= pl.max_products then
    return jsonb_build_object('ok', false, 'error', 'plan_limit',
      'msg', 'Llegaste al límite de tu plan (' || pl.max_products || ' productos). Desactivá o borrá alguno, o pedí subir de plan a POPUPS.');
  end if;
  insert into products (store_id,id,name,description,category,price,compare_at_price,wholesale_price,cost_price,
                        stock,low_stock_at,badge,image,barcode,active,featured,created_at,updated_at)
  values (s.id, pid,
    coalesce(p->>'name',''), coalesce(p->>'description',''), coalesce(p->>'category',''),
    coalesce((p->>'price')::integer,0),
    nullif(p->>'compareAtPrice','')::integer, nullif(p->>'wholesalePrice','')::integer, nullif(p->>'costPrice','')::integer,
    coalesce((p->>'stock')::integer,0), nullif(p->>'lowStockAt','')::integer,
    coalesce(p->>'badge',''), coalesce(p->>'image',''), coalesce(p->>'barcode',''),
    coalesce((p->>'active')::boolean,true), coalesce((p->>'featured')::boolean,false),
    coalesce(nullif(p->>'createdAt',''),'')::timestamptz, now())
  on conflict (store_id,id) do update set
    name=excluded.name, description=excluded.description, category=excluded.category,
    price=excluded.price, compare_at_price=excluded.compare_at_price,
    wholesale_price=excluded.wholesale_price, cost_price=excluded.cost_price,
    stock=excluded.stock, low_stock_at=excluded.low_stock_at, badge=excluded.badge,
    image=excluded.image, barcode=excluded.barcode, active=excluded.active,
    featured=excluded.featured, updated_at=now();
  return jsonb_build_object('ok', true, 'id', pid);
end $$;

create or replace function public.api_delete_product(p_store text, p_key text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.stores; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.status <> 'activa' then return jsonb_build_object('ok', false, 'error', 'store_' || s.status); end if;
  if p_key is null or p_key <> s.access_key then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  delete from products where store_id = s.id and id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ----------------------------------------------------------------------------
-- api_subscribe · newsletter (pública, sin clave)
-- ----------------------------------------------------------------------------
create or replace function public.api_subscribe(p_store text, p_email text, p_consent boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.stores; subs jsonb; email text; i integer; found boolean := false; begin
  s := public._mt_store(p_store);
  if s.id is null or s.status <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'store_not_found');
  end if;
  if not coalesce(p_consent, false) then
    return jsonb_build_object('ok', false, 'error', 'Necesitamos tu consentimiento para suscribirte.');
  end if;
  email := lower(trim(coalesce(p_email,'')));
  if email !~ '^\S+@\S+\.\S+$' then
    return jsonb_build_object('ok', false, 'error', 'Ingresá un email válido.');
  end if;
  subs := public._mt_cfg(s.id,'subscribers','[]'::jsonb);
  for i in 0 .. (jsonb_array_length(subs)-1) loop
    if lower(coalesce(subs->i->>'email','')) = email then
      subs := jsonb_set(subs, array[i::text,'status'], '"active"');
      subs := jsonb_set(subs, array[i::text,'updatedAt'], to_jsonb(to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
      found := true; exit;
    end if;
  end loop;
  if not found then
    subs := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text, 'email', email, 'status','active','source','website',
      'consentAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'createdAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )) || subs;
  end if;
  insert into store_cfg (store_id,key,value) values (s.id,'subscribers',subs)
  on conflict (store_id,key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'message', '¡Gracias! Ya sos parte.');
end $$;

-- ----------------------------------------------------------------------------
-- api_order_create · checkout con stock y precios validados en la base
-- ----------------------------------------------------------------------------
create or replace function public.api_order_create(p_store text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.stores; sett jsonb; orders jsonb; customers jsonb;
  items jsonb := '[]'::jsonb; it jsonb; prod public.products;
  subtotal integer := 0; shipping integer := 0; total integer := 0;
  threshold integer; flat integer; dtype text; pmethod text;
  num integer; order_id uuid := gen_random_uuid(); order_no text;
  ts text; order jsonb; cust jsonb; i integer; ph text;
  live boolean := false;
begin
  s := public._mt_store(p_store);
  if s.id is null or s.status <> 'activa' then
    return jsonb_build_object('ok', false, 'error', 'Tienda no disponible.');
  end if;
  sett := public._mt_cfg(s.id,'settings');
  threshold := coalesce(nullif(sett->>'freeShippingThreshold','')::integer, 80000);
  flat      := coalesce(nullif(sett->>'shippingFlat','')::integer, 5900);
  dtype   := case when p->>'deliveryType' = 'pickup' then 'pickup' else 'shipping' end;
  pmethod := case when p->>'paymentMethod' = 'whatsapp' then 'whatsapp' else 'mercadopago' end;

  -- items: validar stock/precio contra la tabla (FOR UPDATE evita doble venta)
  for it in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    select * into prod from products
      where store_id = s.id and id = coalesce(it->>'productId', it->>'id') and active
      for update;
    if prod.id is null then
      return jsonb_build_object('ok', false, 'error', 'Uno de los productos ya no está disponible.');
    end if;
    if (coalesce((it->>'quantity')::integer,1)) > prod.stock then
      return jsonb_build_object('ok', false, 'error', 'Solo quedan ' || prod.stock || ' unidades de ' || prod.name || '.');
    end if;
    items := items || jsonb_build_array(jsonb_build_object(
      'productId', prod.id, 'name', prod.name, 'image', prod.image,
      'quantity', (it->>'quantity')::integer, 'unitPrice', prod.price,
      'lineTotal', prod.price * (it->>'quantity')::integer,
      'unitCost', coalesce(prod.cost_price,0)));
    subtotal := subtotal + prod.price * (it->>'quantity')::integer;
    update products set stock = stock - (it->>'quantity')::integer, updated_at = now()
      where store_id = s.id and id = prod.id;
  end loop;
  if jsonb_array_length(items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Tu carrito está vacío.');
  end if;

  shipping := case when dtype = 'pickup' or subtotal >= threshold then 0 else flat end;
  total := subtotal + shipping;

  num := coalesce(nullif(public._mt_cfg(s.id,'nextOrderNumber','1001'::jsonb)#>>'{}','')::integer, 1001);
  order_no := 'P-' || num;
  ts := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  live := (pmethod = 'mercadopago' and s.mp_token <> '');

  order := jsonb_build_object(
    'id', order_id::text, 'number', order_no,
    'status', case when live then 'pending_payment'
                   when pmethod = 'whatsapp' then 'pending_confirmation'
                   else 'confirmed' end,
    'customer', jsonb_build_object(
      'name',  coalesce(p->'customer'->>'name',''),
      'phone', coalesce(p->'customer'->>'phone',''),
      'email', coalesce(p->'customer'->>'email','')),
    'delivery', jsonb_build_object(
      'type', dtype, 'address', coalesce(p->>'address',''), 'notes', coalesce(p->>'notes','')),
    'items', items, 'subtotal', subtotal, 'shipping', shipping, 'total', total,
    'payment', case when live
      then jsonb_build_object('mode','live','method','mercadopago','status','pending')
      when pmethod = 'whatsapp'
      then jsonb_build_object('mode','manual','method','whatsapp','status','pending')
      else jsonb_build_object('mode','demo','method','mercadopago','status','approved_demo') end,
    'timeline', jsonb_build_array(jsonb_build_object('status','created','at',ts,'note','Pedido creado en línea.')),
    'inventoryReserved', true, 'inventoryReleased', false,
    'createdAt', ts, 'updatedAt', ts);

  -- cliente: upsert por teléfono normalizado + purchaseHistory
  customers := public._mt_cfg(s.id,'customers','[]'::jsonb);
  ph := regexp_replace(coalesce(p->'customer'->>'phone',''), '\D', '', 'g');
  ph := case when left(ph,3) = '549' then substring(ph from 4)
             when left(ph,2) = '54'  then regexp_replace(substring(ph from 3),'^9','')
             else right(ph,10) end;
  cust := null;
  for i in 0 .. (jsonb_array_length(customers)-1) loop
    if regexp_replace(coalesce(customers->i->>'phone',''), '\D', '', 'g') like '%' || ph then
      cust := customers->i;
      cust := jsonb_set(cust, '{purchaseHistory}',
        jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text, 'date', left(ts,10), 'source','online',
          'orderId', order_id::text, 'status', order->>'status', 'amount', total,
          'description', left('Pedido ' || order_no || ': ' || (
            select string_agg((x->>'quantity') || '× ' || (x->>'name'), ', ')
            from jsonb_array_elements(items) x), 300),
          'createdAt', ts)) || coalesce(cust->'purchaseHistory','[]'::jsonb));
      cust := jsonb_set(cust, '{updatedAt}', to_jsonb(ts));
      if coalesce(cust->>'address','') = '' and dtype = 'shipping' then
        cust := jsonb_set(cust, '{address}', to_jsonb(coalesce(p->>'address','')));
      end if;
      customers := jsonb_set(customers, array[i::text], cust);
      exit;
    end if;
  end loop;
  if cust is null then
    customers := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text, 'fullName', coalesce(p->'customer'->>'name',''),
      'business','', 'phone', coalesce(p->'customer'->>'phone',''),
      'address', case when dtype='shipping' then coalesce(p->>'address','') else '' end,
      'origin','online', 'createdAt', ts, 'updatedAt', ts,
      'purchaseHistory', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text, 'date', left(ts,10), 'source','online',
        'orderId', order_id::text, 'status', order->>'status', 'amount', total,
        'description', left('Pedido ' || order_no, 300), 'createdAt', ts))
    )) || customers;
  end if;

  -- persistir: pedido adelante, contador, clientes (+ finanzas si quedó aprobado)
  orders := jsonb_build_array(order) || public._mt_cfg(s.id,'orders','[]'::jsonb);
  insert into store_cfg values (s.id,'orders',orders),(s.id,'customers',customers),
                               (s.id,'nextOrderNumber',to_jsonb(num+1))
  on conflict (store_id,key) do update set value = excluded.value;

  if not live and pmethod = 'mercadopago' then
    perform public._mt_record_finance(s.id, order);
  end if;

  return jsonb_build_object('ok', true, 'order', order,
    'paymentMode', case when live then 'live' else 'demo' end,
    'checkoutUrl', '');
end $$;

-- Movimiento de ingreso en cfg.finance (paridad con recordFinanceOrder del mock).
create or replace function public._mt_record_finance(p_store_id uuid, p_order jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare fin jsonb; movs jsonb; cost integer := 0; it jsonb; ts text; begin
  fin := public._mt_cfg(p_store_id,'finance');
  movs := coalesce(fin->'movements','[]'::jsonb);
  for it in select * from jsonb_array_elements(coalesce(p_order->'items','[]'::jsonb)) loop
    cost := cost + coalesce((it->>'unitCost')::integer,0) * (it->>'quantity')::integer;
  end loop;
  ts := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  movs := jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'type','income', 'date', left(ts,10),
    'description','Venta ' || (p_order->>'number'), 'category','Ventas online',
    'amount', coalesce((p_order->>'total')::integer,0), 'costAmount', cost, 'feeAmount', 0,
    'accountId', case when p_order->'payment'->>'method' = 'mercadopago' then 'mercadopago' else 'cash' end,
    'toAccountId','', 'customerId','', 'customerName', p_order->'customer'->>'name',
    'source','order', 'orderId', p_order->>'id', 'items', p_order->'items',
    'receipt','', 'notes','', 'status','completed', 'createdAt', ts, 'updatedAt', ts
  )) || movs;
  fin := jsonb_set(coalesce(fin,'{}'::jsonb), '{movements}', movs);
  insert into store_cfg values (p_store_id,'finance',fin)
  on conflict (store_id,key) do update set value = excluded.value;
end $$;

-- ----------------------------------------------------------------------------
-- Mercado Pago · set / status (síncronos) + launch / poll (async con pg_net)
-- ----------------------------------------------------------------------------

create or replace function public.api_mp_set(p_store text, p_key text, p_token text, p_action text default 'set')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.stores; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if s.status <> 'activa' then return jsonb_build_object('ok', false, 'error', 'store_' || s.status); end if;
  if p_key is null or p_key <> s.access_key then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  if coalesce(p_action,'') = 'clear' then
    update stores set mp_token = '', mp_nick = '' where id = s.id;
    return jsonb_build_object('ok', true, 'connected', false);
  end if;
  -- 'set' real se valida por api_mp_launch('set') contra /users/me; acá se guarda provisoriamente
  if coalesce(trim(p_token),'') !~ '^APP_USR-' then
    return jsonb_build_object('ok', false, 'error', 'El token debe empezar con APP_USR-.');
  end if;
  update stores set mp_token = trim(p_token) where id = s.id;
  return jsonb_build_object('ok', true, 'connected', true, 'nick', s.mp_nick);
end $$;

create or replace function public.api_mp_status(p_store text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stores; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if p_key is null or p_key <> s.access_key then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  return jsonb_build_object('ok', true,
    'connected', (s.mp_token <> ''), 'nick', s.mp_nick,
    'token_tail', case when s.mp_token <> '' then right(s.mp_token, 4) else '' end);
end $$;

create or replace function public.api_mp_launch(p_store text, p_key text, p_kind text, p_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.stores; j public.mp_jobs; rid uuid := gen_random_uuid();
  url text; headers jsonb; body jsonb; net_id bigint;
  order_row jsonb; items_mp jsonb := '[]'::jsonb; it jsonb;
begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  -- 'confirm' y 'pref' son públicas (p_key ''); 'set' exige la clave del dueño
  if p_kind = 'set' and (p_key is null or p_key <> s.access_key) then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;

  if p_kind = 'set' then
    url := 'https://api.mercadopago.com/users/me';
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(nullif(p_json->>'token',''), s.mp_token));
    body := '{}'::jsonb;
  elsif p_kind = 'pref' then
    if s.mp_token = '' then return jsonb_build_object('ok', false, 'error', 'mp_not_connected'); end if;
    select value into order_row from store_cfg c, jsonb_array_elements(c.value)
      where c.store_id = s.id and c.key = 'orders' and value->>'id' = p_json->>'order_id';
    if order_row is null then return jsonb_build_object('ok', false, 'error', 'product_not_found'); end if;
    for it in select * from jsonb_array_elements(order_row->'items') loop
      items_mp := items_mp || jsonb_build_object(
        'title', it->>'name', 'quantity', (it->>'quantity')::int,
        'unit_price', (it->>'unitPrice')::int, 'currency_id', 'ARS');
    end loop;
    url := 'https://api.mercadopago.com/checkout/preferences';
    headers := jsonb_build_object('Authorization','Bearer ' || s.mp_token,'Content-Type','application/json');
    body := jsonb_build_object(
      'items', items_mp,
      'external_reference', order_row->>'id',
      'back_urls', jsonb_build_object(
        'success', coalesce(p_json->>'back','') || '&payment=success',
        'pending', coalesce(p_json->>'back','') || '&payment=pending',
        'failure', coalesce(p_json->>'back','') || '&payment=failure'),
      'auto_return', 'approved',
      'statement_descriptor', left(coalesce(nullif(s.biz,''),'MI TIENDA'), 22));
  elsif p_kind = 'confirm' then
    url := 'https://api.mercadopago.com/v1/payments/' || coalesce(p_json->>'payment_id','');
    headers := jsonb_build_object('Authorization','Bearer ' || s.mp_token);
    body := '{}'::jsonb;
  else
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  insert into mp_jobs (rid, store_id, kind, payload) values (rid, s.id, p_kind, p_json) returning * into j;
  select net.http_post(url := url, headers := headers, body := body, timeout_milliseconds := 8000)
    into net_id;
  update mp_jobs set record_id = net_id where rid = rid;
  return jsonb_build_object('ok', true, 'rid', rid);
exception when undefined_function then
  -- pg_net no disponible: dejar el job en error explícito
  update mp_jobs set status = 'error', response = jsonb_build_object('error','pg_net faltante'), done_at = now()
    where rid = rid;
  return jsonb_build_object('ok', false, 'error', 'pg_net no está habilitado en este proyecto.');
end $$;

create or replace function public.api_mp_poll(p_store text, p_key text, p_kind text, p_rid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stores; j public.mp_jobs; begin
  s := public._mt_store(p_store);
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'store_not_found'); end if;
  if p_kind = 'set' and (p_key is null or p_key <> s.access_key) then
    return jsonb_build_object('ok', false, 'error', 'bad_key');
  end if;
  select * into j from mp_jobs where rid = p_rid and store_id = s.id and kind = p_kind;
  if j.rid is null then return jsonb_build_object('ok', false, 'error', 'job_not_found'); end if;
  if j.status = 'pending' then return jsonb_build_object('ok', true, 'pending', true); end if;
  if j.status = 'error' then return jsonb_build_object('ok', false, 'error', coalesce(j.response->>'error','mp_error')); end if;
  return j.response || jsonb_build_object('ok', true);
end $$;

-- Callback pg_net → cierra el job y aplica efectos por kind.
create or replace function public._mt_mp_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j public.mp_jobs; s public.stores; resp jsonb; content jsonb;
  st text; orders jsonb; i integer; o jsonb; ts text;
begin
  select * into j from mp_jobs where record_id = new.id;
  if j.rid is null then return new; end if;
  select * into s from stores where id = j.store_id;
  content := new.content::jsonb;
  ts := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if new.status_code between 200 and 299 then
    if j.kind = 'set' then
      update stores set mp_nick = coalesce(content->>'nickname','') where id = s.id;
      resp := jsonb_build_object('connected', true, 'nick', coalesce(content->>'nickname',''));
    elsif j.kind = 'pref' then
      resp := jsonb_build_object('init_point', coalesce(content->>'init_point',''),
                                 'preference_id', coalesce(content->>'id',''));
    else -- confirm
      st := coalesce(content->>'status','pending');
      resp := jsonb_build_object('status', st);
      if st = 'approved' then
        orders := public._mt_cfg(s.id,'orders','[]'::jsonb);
        for i in 0 .. (jsonb_array_length(orders)-1) loop
          if orders->i->>'id' = j.payload->>'order_id' then
            o := orders->i;
            o := jsonb_set(o,'{status}','"confirmed"');
            o := jsonb_set(o,'{payment}', (o->'payment') || jsonb_build_object('mode','live','status','approved','paymentId', coalesce(content->>'id','')));
            o := jsonb_set(o,'{timeline}', coalesce(o->'timeline','[]'::jsonb) || jsonb_build_object('status','confirmed','at',ts,'note','Pago aprobado por Mercado Pago.'));
            o := jsonb_set(o,'{updatedAt}', to_jsonb(ts));
            orders := jsonb_set(orders, array[i::text], o);
            perform public._mt_record_finance(s.id, o);
            exit;
          end if;
        end loop;
        insert into store_cfg values (s.id,'orders',orders)
        on conflict (store_id,key) do update set value = excluded.value;
        select value into o from store_cfg c, jsonb_array_elements(c.value)
          where c.store_id = s.id and c.key='orders' and value->>'id' = j.payload->>'order_id';
        resp := resp || jsonb_build_object('order', coalesce(o,'{}'::jsonb));
      end if;
    end if;
    update mp_jobs set status = 'done', response = resp, done_at = now() where rid = j.rid;
  else
    resp := jsonb_build_object('error', coalesce(content->>'message', content->>'error', 'mp_http_' || new.status_code));
    update mp_jobs set status = 'error', response = resp, done_at = now() where rid = j.rid;
    -- si falló la validación del token, no dejar un token inválido conectado
    if j.kind = 'set' then update stores set mp_token = '' where id = s.id and mp_nick = ''; end if;
  end if;
  return new;
end $$;

drop trigger if exists mt_mp_response on net._http_response;
create trigger mt_mp_response after insert on net._http_response
  for each row execute function public._mt_mp_response();

-- ----------------------------------------------------------------------------
-- Seed de demos (coincide con lo documentado en el changelog v0.5.0)
-- ----------------------------------------------------------------------------
insert into public.stores (slug, biz, owner, contact, status, plan_id, paid_until, access_key)
values
  ('juan',    'Panadería La Espiga', 'Juan Pérez', '351 555-0101', 'activa', 'p50', current_date + 30, 'juan-demo'),
  ('mariela', 'Tienda Mariela',      'Mariela',    '',             'activa', 'p25', current_date + 30, 'mariela-demo')
on conflict (slug) do nothing;
