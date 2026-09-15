# Auditoría de seguridad · Backend Supabase (SQL real)

**Fecha:** 15-sep-2026 · **Fuente:** volcado real (`schema-real.sql`, 19 funciones) + sondeo en vivo de RPC
**Veredicto general:** el backend está **bien construido para su modelo**. Lo crítico está bien:
claves y PIN hasheados con bcrypt, tablas cerradas con RLS sin políticas, precios de costo/mayorista
y códigos de barra fuera de la vitrina pública, stock y totales calculados server-side.
Hay **2 hallazgos medios** y varios bajos que conviene cerrar.

---

## ✅ Lo que está bien (verificado en el SQL real)

| Control | Dónde |
|---|---|
| Clave de acceso del dueño = **hash bcrypt** (`key_hash`, `crypt/gen_salt('bf')`), nunca plaintext | `stores.key_hash`, chequeo en las 7 RPC de escritura/lectura privada |
| PIN de la Consola POPUPS = **hash bcrypt** en `config.admin_pin` | `api_admin`, `api_usage` |
| Tablas `config/stores/products` con **RLS activado y 0 políticas** → anon/authenticated sin acceso directo; grants solo a `postgres` y `service_role` | sección RLS/GRANTS del volcado |
| Todas las RPC `SECURITY DEFINER` con `SET search_path` explícito (sin hijacking de search_path) | las 19 funciones |
| `api_public` → `h_prod_pub` = `h_prod − wholesalePrice − costPrice − barcode`; solo productos activos | `api_public` |
| Precios, subtotal, envío y total **calculados en la base** (el cliente no manda montos) | `api_order_create` |
| Límite de plan server-side (`plan_limit`) al crear producto | `api_upsert_product` |
| Suspensión automática por vencimiento: `h_state` → `suspendida` si `paid_until < current_date`; al pagar, vuelve sola | `h_state` + `api_public` |
| Token de MP: nunca vuelve al cliente salvo últimos 4 dígitos (`token_tail`); el token nuevo viaja por `mp_pending` y solo se promuove a `mp_token` si MP lo valida (HTTP 200) | `api_mp_launch/poll/status` |
| Idempotencia de confirmación: si el pedido ya está `approved`, `confirm` responde `skip` sin recobrar | `api_mp_launch('confirm')`, `api_mp_poll` |
| Rotación de clave desde la Consola (`rotate_key`) sin tocar el resto de la tienda | `api_admin` |

## 🔴 Hallazgos

### F1 · MEDIO — Overselling por carrera en `api_order_create`
El loop de items hace `SELECT` del producto, compara `qty > pr.stock` y después
`UPDATE stock = stock - qty` **sin `FOR UPDATE` ni decremento atómico**. Dos checkouts
concurrentes sobre el último ejemplar pasan ambos el chequeo y el stock queda negativo.
En un comercio chico es poco probable, pero es exactamente el caso que el changelog v0.4.0
prometía cerrado ("si alguien compra desde dos dispositivos a la vez, la base descuenta
una sola vez"). **Fix:** ver `fixes-propuestos.sql` (decremento con guarda `stock >= qty`
y `RETURNING`).

### F2 · MEDIO — Tiendas suspendidas/baja pueden seguir EDITANDO por RPC
La puerta "no vende ni edita" es **solo del frontend** (script de gate). En el servidor:
`api_save_cfg`, `api_delete_product`, `api_mp_set` y `api_mp_launch('set')` **no chequean
`h_state`** (sí lo hacen `api_upsert_product`, `api_order_create`, `api_subscribe`).
Con la clave y curl, una tienda suspendida edita su cfg, borra productos o conecta MP.
**Fix:** una línea por función (ver `fixes-propuestos.sql`).

### F3 · BAJO-MEDIO — Tokens de Mercado Pago en plaintext en `stores`
`mp_token` y `mp_pending` son columnas `text` sin cifrar. La extensión `supabase_vault`
está instalada pero no se usa. El riesgo real es acotado (solo staff con acceso al
dashboard/pg_service), pero el changelog v0.6.0 dice "se guarda cifrado en la nube" —
hoy no es literal. **Fix opcional:** `vault.create_secret` + `vault.decrypted_secret`
en las dos columnas, o como mínimo corregir el texto del changelog/README.

### F4 · BAJO — `api_mp_poll`/`api_ping_poll` aceptan `rid` de cualquier request pg_net
El `rid` (id de `net._http_response`) es un bigint secuencial y enumerable. Probé los
cruces: no hay fuga de contenido (poll nunca devuelve el body crudo; `api_ping_poll`
tampoco) ni escritura cruzada entre tiendas (el confirm busca el pedido en el cfg de
LA tienda llamadora). Queda como hardening barato: guardar una tabla `mp_jobs(rid,
store_id, kind)` y validar pertenencia en poll.

### F5 · BAJO — El cupo del plan cuenta productos INACTIVOS
`api_upsert_product` cuenta `count(*)` de todos los productos de la tienda (activos y
pausados) contra el `max` del plan. Pausar un producto no libera cupo. Decidir política:
si el cupo es "publicados", cambiar a `where active`.

### F6 · BAJO — `api_subscribe` con `p_consent DEFAULT true`
Si alguien llama la RPC sin mandar `consent`, queda suscripto igual. El cliente siempre
lo manda, pero el default seguro debería ser `false`.

### F7 · INFO — Detalles de diseño a documentar (no vulnerabilidades)
- No hay trigger sobre `net._http_response`: el modelo es **poll** (`api_mp_poll`), coherente con v0.6.1.
- `products` tiene PK global `(id)`, no compuesta `(store_id, id)`; los ids son uuid del cliente, funciona, pero `import_products` con `on conflict (id) do nothing` podría chocar entre tiendas en teoría.
- `api_mp_launch('pref'/'confirm')` y `api_ping_mp` son públicas sin rate-limit: abuso posible = generar preferencias MP a nombre de una tienda activa (consume su cuota de API, no su dinero).
- `api_admin` permite a la Consola escribir cfg y productos de cualquier tienda (`set_cfg`, `import_products`): correcto para operación POPUPS, conviene dejarlo asentado como decisión de negocio.

## 🔁 Diferencias contra mi reconstrucción (ya corregidas en contratos)

| Yo reconstruí | La realidad |
|---|---|
| Tabla `store_cfg` por sección | `stores.cfg` jsonb inline (merge shallow `cfg \|\| p_cfg`) |
| Tabla `plans` | `config` → clave `'plans'` (jsonb por plan_id) + `h_plan()` |
| `mp_jobs` + trigger pg_net | poll directo sobre `net._http_response` por `rid bigint` |
| `api_mp_set` guarda token | `api_mp_set` solo desconecta; guardar = `api_mp_launch('set')` + poll |
| `api_upsert_product` → `{ok}` | → `{ok, created, product}` |
| 11 RPC | **19 funciones**: + `api_admin`, `api_usage` (Consola), `api_ping_mp`, `api_ping_poll` |
| `stores.id` uuid | `stores.id` = slug text (PK) |
