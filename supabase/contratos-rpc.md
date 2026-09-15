# Contratos RPC verificados en vivo (15-sep-2026)

Formas de respuesta **reales**, obtenidas sondendo el proyecto `zfnlcfnutnuatrhgbbci`
con la clave publishable del cliente (mismas llamadas que hace la web publicada).

> Estos contratos son la fuente de verdad de lo que el frontend espera.
> Cualquier cambio en las funciones SQL de Supabase DEBE respetarlos o romperá la tienda.

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

// tienda inexistente → el cliente cae al modo demo/offline
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

---

## Claves de acceso demo (públicas, sembradas por POPUPS)

| Tienda | slug | clave | plan |
|---|---|---|---|
| Juan Pérez · Panadería La Espiga | `juan` | `juan-demo` | p50 |
| Mariela | `mariela` | `mariela-demo` | — |
