# Backend Supabase · Mi-Tienda

El frontend (único `index.html`) consume **12 funciones RPC** del proyecto
`zfnlcfnutnuatrhgbbci.supabase.co` con la clave *publishable* (pública por diseño).
Toda la seguridad (claves de acceso, stock, planes, tokens de Mercado Pago)
vive en estas funciones SQL.

## Estado de la documentación del backend

| Archivo | Qué es | Estado |
|---|---|---|
| `contratos-rpc.md` | Contratos de las 11 RPC (request/response), **verificados en vivo** el 15-sep-2026 contra el proyecto productivo | ✅ Confiable |
| `esquema-reconstruido.sql` | Reconstrucción ejecutable del schema + funciones a partir de los contratos | ⚠️ Aproximación — sirve para staging/DR, **no correr en producción** |
| `export.sql` | Consultas para extraer el SQL **real** desde el dashboard | ✅ Listo para usar |
| `schema-real.sql` | El SQL real desplegado | ✅ Volcado del 15-sep-2026 (19 funciones) |
| `api_key_change.sql` | DDL de la RPC nueva (v0.7.3) para que el dueño cambie su clave | ⏳ **Listo, falta ejecutarlo** — ver abajo |
| `alta-cliente.sql` | Plantilla reutilizable para **vender/crear una tienda** (api_admin + catálogo opcional + rotación de clave) | ✅ Listo para usar — copiar y ajustar por cliente |

## Evitar la pausa automática (plan Free)

El plan Free pausa el proyecto tras **7 días sin actividad** real (sin consultas a la
base; los endpoints de salud no cuentan). El workflow
[`.github/workflows/keepalive-supabase.yml`](../.github/workflows/keepalive-supabase.yml)
corre **3 veces por día** y hace pings que llegan a Postgres (SELECT con RLS + una
lectura real de `api_public`), así el proyecto nunca llega a los 7 días de inactividad.
Si un ping falla (ej. proyecto pausado), GitHub notifica al equipo.

## Monitoreo diario y respaldo

[`.github/workflows/monitoreo-diario.yml`](../.github/workflows/monitoreo-diario.yml)
corre **1 vez por día** y además del keep-alive:
- chequea la **salud de cada tienda** (`api_public`) y falla si alguna activa no responde;
- si alguna tienda **vence en ≤7 días** abre/actualiza un issue automático;
- sube un **respaldo JSON completo** (catálogo + config + productos de todas las tiendas)
  como artefacto privado del run (retención 90 días). Si se configuran los secretos
  `BACKUP_PAT` + `BACKUP_REPO`, el respaldo se pushea además a un repo privado.
- script local: `.github/scripts/monitoreo-supabase.py` (probado en vivo, 7 tiendas OK).

## Cobrar online con Mercado Pago (operación)

Cada tienda conecta **su** cuenta de MP. El token viaja por `mp_pending` y se guarda en
`mp_token`; la API nunca lo devuelve completo (solo los últimos 4 dígitos para mostrar
estado). Sin token, el checkout usa el modo **demo** (aprueba en línea sin cobrar).

Paso a paso con el dueño:
1. Tener la cuenta de Mercado Pago de la tienda (mercadopago.com.ar).
2. En **developers.mercadopago.com.ar** con esa cuenta → *Credenciales* → sección
   **Producción** → copiar el **Access Token** (empieza con `APP_USR-`). No compartirlo.
3. En la tienda → panel (ingresás con tu Clave de acceso) → **Ajustes → Cobros** →
   pegar el token → **Guardar**. Queda "conectado" y permite *Desconectar*.
4. Verificar: en el checkout aparece el pago **live** con MP, el pedido queda
   `pending_payment` y se confirma solo cuando MP avisa (`api_mp_launch('confirm')`).

Notas:
- Hoy todas las tiendas arrancan en demo (`mp_token=''`); el modo live pide tienda
  activa y con MP conectado.
- El pedido no puede cobrarse en línea si la tienda está suspendida o sin MP.
- El respaldo diario incluye cada `cfg` (con sus órdenes); el token se respalda como
  texto en `mp_token` — si se filtra, rotarlo desde el panel.

## Por qué falta `schema-real.sql` (y cómo resolverlo en 5 minutos)

El changelog v0.6.1 menciona `mp_async.sql`, pero ningún SQL se commiteó jamás.
Sin el SQL real versionado:

- no se puede auditar la seguridad (¿todas las RPC validan `p_key`?),
- no se puede recrear el sistema si el proyecto Supabase se pierde,
- los cambios manuales en el SQL Editor no tienen historia ni rollback.

**Para exportarlo:** abrir el [SQL Editor del proyecto](https://supabase.com/dashboard/project/zfnlcfnutnuatrhgbbci/sql/new),
correr las consultas de `export.sql` y guardar los resultados acá como `schema-real.sql`.

> 🔒 La consulta 5 de `export.sql` excluye a propósito `access_key` y `mp_token`:
> nunca commitear secretos al repo.

## Cómo se conecta el frontend

```
index.html (script 1 · puerta)  ──► api_public ──► ¿activa? : cartel de suspensión
mtPublicDoc() (caché 20 s)      ──► api_public ──► vitrina (settings/content/legal/productos)
checkout                        ──► api_order_create ──► reserva stock + numera P-100x
  └ MP live                     ──► api_mp_launch('pref') + api_mp_poll ──► init_point
retorno de MP (?collection_status) ─► api_mp_launch('confirm') + poll ──► pedido confirmado
login dueño (#admin)            ──► api_panel(p_key) ──► snapshot completo + plan
edición del panel               ──► api_save_cfg / api_upsert_product / api_delete_product
cobros (Ajustes→Cobros)         ──► api_mp_set / api_mp_status / api_mp_launch('set')
seguridad (Ajustes→Seguridad)   ──► api_key_change ──► rota stores.key_hash (bcrypt) + cfg.security.changedAt
```

## Despliegue de `api_key_change` (v0.7.3)

El panel del dueño le permite cambiar su propia Clave de acceso. Esa capacidad vive en
[`api_key_change.sql`](api_key_change.sql): ejecutarlo **una vez** en el SQL Editor del proyecto
la habilita. Es opcional y no rompe nada — mientras no esté, el frontend detecta el
`PGRST202` y muestra la tarjeta "Tu clave la cambia POPUPS" con el mail de pedido listo
(hoy, de hecho, la clave se rota con `api_admin → 'rotate_key'` desde la Consola).

## Reglas que NO se pueden romper

1. **Ninguna RPC de escritura acepta llamadas sin `p_key` correcta** (salvo las públicas: `api_subscribe`, `api_order_create`, `api_mp_launch/poll` de `pref`/`confirm`).
2. **`api_public` nunca devuelve `wholesalePrice`, `costPrice` ni `barcode`.**
3. **El stock y los precios se validan y descuentan en la base**, nunca se confía en el cliente.
4. **El límite de plan se aplica server-side** (`plan_limit` en `api_upsert_product`).
5. Tienda `suspendida`/`baja` → todas las RPC responden el error correspondiente (la puerta del frontend hace el resto).
6. **La Clave de acceso sólo existe hasheada** (`stores.key_hash`, bcrypt): se verifica con `crypt(p_key, key_hash) = key_hash` y ninguna RPC la devuelve en texto. Quien la escribe es `api_key_change` (el dueño) o `api_admin → 'rotate_key'` (Consola POPUPS).
