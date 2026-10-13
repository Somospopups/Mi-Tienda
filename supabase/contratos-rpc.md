# Contratos RPC · Mi-Tienda

Contratos documentados desde los SQL del repositorio. No incluyen claves, cuentas de prueba ni identificadores de proyecto. Antes de depender de un contrato, compararlo con la definición desplegada en Supabase.

> Una respuesta cloud inválida o una RPC caída no activa la demo. La demo local existe únicamente sin `?tienda=`.

---
---

## `api_public(p_store text)`

Vitrina pública + puerta de suspensión. La llama el script de gate ANTES de renderizar
y `mtPublicDoc()` (caché cliente de 20 s).

```jsonc
// tienda activa
{
  "ok": true,
  "biz": "Panadería La Espiga",       // nombre del negocio (fallback de brandName)
  "status": "activa",
  "contact": "351 555-0101",
  "owner": …,                          // (no siempre presente en public)
  "mp_ok": false,                      // true si el dueño conectó Mercado Pago
  "cfg": {
    "settings": { "accentColor": "#D9633C", … },  // puede venir parcial
    "content":  null,
    "legal":    null
  },
  "products": [                        // SOLO activos; SIN wholesalePrice/costPrice/barcode
    {
      "id": "uuid", "name": "…", "description": "…", "category": "…",
      "price": 2400, "compareAtPrice": null,
      "stock": 17, "lowStockAt": null,
      "badge": "…", "image": "data:image/…", "active": true, "featured": false,
      "sort": 0, "createdAt": "ISO", "updatedAt": "ISO"
    }
  ]
}

// tienda inexistente → error visible; no se sirve la demo local
{ "ok": false, "error": "store_not_found" }

// suspendida / dada de baja → el cliente muestra la puerta
{ "ok": false, "error": "store_suspendida" }
{ "ok": false, "error": "store_baja" }
```

## `api_panel(p_store text, p_key text)`

Login del dueño + snapshot completo. Errores observados: `bad_key`
(el cliente también maneja `store_suspendida` y `store_baja` aquí).

```jsonc
{
  "ok": true,
  "biz": "Panadería La Espiga",
  "owner": "Juan Pérez",
  "status": "activa",
  "contact": "351 555-0101",
  "note": "",
  "plan_id": "p50",
  "plan": { "max": 50, "price": 50000 },
  "paid_until": "2026-10-07",          // fecha (yyyy-mm-dd) de pago vigente
  "mp_ok": false,
  "mp_nick": "",
  "nextOrderNumber": …,                // viene DENTRO de cfg (ver abajo)
  "cfg": {
    "settings": { … },
    "content":  { … } | ausente,
    "legal":    { … } | ausente,
    "customers": [ { "id","fullName","business","address","phone","origin","purchaseHistory","createdAt","updatedAt" } ],
    "orders":    [ { "id","number","status","customer","delivery","items","subtotal","shipping","total","payment","timeline","inventoryReserved","inventoryReleased","createdAt","updatedAt" } ],
    "finance":   { "accounts": […], "movements": […] } | ausente,
    "subscribers": […],
    "nextOrderNumber": 1003
  },
  "products": [ /* como api_public PERO incluye wholesalePrice, costPrice, barcode */ ]
}
```

## `api_save_cfg(p_store, p_key, p_cfg jsonb)` → `{ "ok": true }`

`p_cfg` trae UNA sección por llamada (el cliente hace diff y manda solo lo que cambió):
`{"settings":{…}}`, `{"content":{…}}`, `{"legal":{…}}`, `{"customers":[…]}`,
`{"orders":[…]}`, `{"finance":{…}}`, `{"subscribers":[…]}`, `{"nextOrderNumber":1234}`.

## `api_upsert_product(p_store, p_key, p jsonb)` → `{ "ok": true }`

`p` = `{id,name,price,compareAtPrice,wholesalePrice,costPrice,stock,lowStockAt,category,badge,description,image,barcode,active,featured}`.
Error de cupo (el cliente lo muestra literal): `{ "ok": false, "error": "plan_limit", "msg": "…" }`.
Otros errores manejados: `bad_key`, `product_not_found`, `store_suspendida`, `store_baja`.

## `api_delete_product(p_store, p_key, p_id text)` → `{ "ok": true }`

## `api_subscribe(p_store, p_email, p_consent bool)` → `{ "ok": true, "message": "…" }`

Sin clave (pública). Dedupe por email; reactiva suscriptores dados de baja.

## `api_order_create(p_store, p jsonb)`

Sin clave (pública). `p` = `{customer:{name,phone,email}, deliveryType:'shipping'|'pickup', address, notes, paymentMethod:'mercadopago'|'whatsapp', items:[{productId,quantity}]}`.
Valida stock y precios **en la base** (el cliente no manda precios). Reserva stock y numera `LU-1001…`.

```jsonc
{
  "ok": true,
  "order": { /* igual que cfg.orders[i]; items incluyen name/price/lineTotal; SIN unitCost (lo saca el cliente) */ },
  "paymentMode": "live" | "demo",       // live si mp_ok y paymentMethod=mercadopago
  "checkoutUrl": ""                      // en live el cliente luego llama api_mp_launch('pref')
}
// error → { "ok": false, "error": "…" }  (el cliente muestra el string como 409)
```

## `api_mp_set(p_store, p_key, p_token text, p_action text)` → `{ "ok": true, "connected": bool, "nick": "…" }`

`p_action`: `'clear'` (desconecta, token vacío) o set (guarda el Access Token `APP_USR-…` cifrado).

## `api_mp_status(p_store, p_key)` → `{ "ok": true, "connected": bool, "nick": "…", "token_tail": "…" }`

## `api_mp_launch(p_store, p_key, p_kind, p_json)` → `{ "ok": true, "rid": "…" }` o `{ "ok": true, "skip": true, "status": … }`

Dispara async (pg_net / job) la llamada a Mercado Pago con el token guardado.
`p_kind`: `'pref'` (crear preferencia de Checkout Pro), `'confirm'` (verificar payment_id), `'set'` (validar token).

## `api_mp_poll(p_store, p_key, p_kind, p_rid)` → estado del job

El cliente hace polling 30 × 600 ms. Respuesta esperada al completar:
- `pref` → `{ ok:true, init_point:"https://…" }`
- `confirm` → `{ ok:true, status:'approved'|'pending'|…, order:{number,…} }`
- `set` → `{ ok:true, connected:true, nick:"…" }`
Mientras corre: cualquier respuesta sin `ok:true` definitivo mantiene el polling.

## `api_key_change(p_store, p_key, p_new_key)` *(nueva, v0.7.3)*

El dueño cambia **su** Clave de acceso desde Ajustes → Seguridad.

```jsonc
// éxito — sólo se devuelve la fecha, nunca la clave
{ "ok": true, "changedAt": "2026-09-15T12:00:00.000Z" }

// rechazos (el frontend traduce cada código a un mensaje en español)
{ "ok": false, "error": "store_not_found" }  // slug inexistente
{ "ok": false, "error": "bad_key" }           // la clave actual no coincide con stores.key_hash
{ "ok": false, "error": "clave_corta" }       // nueva clave < 12 caracteres
{ "ok": false, "error": "key_equal" }         // la nueva es igual a la actual
{ "ok": false, "error": "clave_invalida" }    // tiene \r, \n o \t
```

`p_key` es la clave actual y se verifica con `crypt(p_key, key_hash) = key_hash`, la misma
comparación bcrypt que usan las otras RPC privadas. La nueva se guarda con
`crypt(gen_salt('bf'))` y la longitud mínima vigente es de 12 caracteres. **no existe ninguna RPC que devuelva una clave en texto**.
Escribe además `cfg.security.changedAt`, que `api_panel` trae en el snapshot y el panel
muestra como "Último cambio".

**No bloquea por estado de la tienda** (cambiar la llave es una acción de
autoprotección del dueño; la vitrina y los cobros siguen cortados por la puerta POPUPS).

⚠️ Función **opcional**: mientras no esté desplegada, PostgREST responde `PGRST202` y el
frontend degrada a la tarjeta *"Tu clave la cambia POPUPS"* con mail de pedido. Ver
[`api_key_change.sql`](api_key_change.sql) para el DDL y la prueba manual.

---

| Juan Pérez · Panadería La Espiga | `juan` | `juan-demo` | p50 |
| Mariela | `mariela` | `mariela-demo` | — |

---

## Correcciones tras el volcado real del SQL (15-sep-2026)

Ver `schema-real.sql` (fuente de verdad) y `AUDITORIA.md`. Diferencias detectadas
entre lo que el cliente consume y lo que el backend realmente hace:

1. **Son 19 funciones, no 11**: se suman `api_admin(p_pin, p_action, p)` y `api_usage(p_pin)`
   (Consola POPUPS, autenticadas por hash bcrypt del PIN en `config.admin_pin`) y
   `api_ping_mp()` / `api_ping_poll(rid)` (diagnóstico pg_net).
2. **`api_mp_poll.p_rid` es `bigint`** (id de `net._http_response`), no uuid. No existe
   tabla de jobs ni trigger: el modelo es *launch + poll* puro.
3. **`api_mp_set` ya no guarda tokens**: solo `clear`. Guardar = `api_mp_launch('set')`
   (deja el token en `stores.mp_pending`) + `api_mp_poll('set')` (lo promueve a `mp_token`
   si MP responde 200 en `/users/me`).
4. **`api_upsert_product` responde `{ok, created, product}`** (el producto completo ya
   normalizado por `h_prod`), no solo `{ok}`.
5. **`api_order_create` responde también `whatsappUrl: ''`** (el cliente arma la URL local).
6. **El cfg vive inline en `stores.cfg`** (merge shallow `cfg || p_cfg`), no en tabla aparte;
   los planes viven en `config.plans` y el estado efectivo lo calcula `h_state`
   (`paid_until < current_date` → `suspendida` automática).
7. **`api_panel` no rechaza tiendas suspendidas/baja** (el chequeo de estado está en las
   RPC de escritura y en `api_public`) → ver hallazgo F2 de la auditoría.

## `api_admin(p_pin, p_action, p)` · consola POPUPS

La clave central se valida únicamente contra el hash guardado en `config.admin_pin`. La función no devuelve la clave ni el hash y aplica una ventana de rate limit a intentos fallidos.

Acciones cubiertas por `supabase/super-admin-secure.sql`:

- `list`: tiendas, estado, vencimiento, conteo de productos y frente actual.
- `create_store`: alta con una clave del dueño de 12–64 caracteres; el backend guarda únicamente su hash.
- `rotate_key`: invalida la clave anterior y reemplaza su hash. La nueva clave solo se conoce en el cliente que la generó.
- `set`, `set_plan`, `reactivate`, `set_cfg`, `import_products` y `set_storefront`.

Errores relevantes: `bad_pin`, `rate_limited`, `store_not_found`, `ya_existe`, `clave_invalida`, `storefront_invalida` y `accion_desconocida`. La consola muestra los secretos nuevos una sola vez y nunca vuelve a solicitarlos desde la API.

La migración está pendiente de revisión y aplicación por una persona autorizada; esta documentación no afirma que el proyecto de producción ya la tenga instalada.
