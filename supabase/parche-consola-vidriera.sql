-- Parche MINIMO para la consola POPUPS: agrega la accion set_storefront (vidriera),
-- la tabla de intentos y la funcion api_admin completa. No toca datos de tiendas.
-- Como aplicarlo: Supabase > SQL Editor > New query > pegar todo > Run.

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
