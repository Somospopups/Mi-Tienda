# Mi-Tienda · POPUPS

Tienda online y panel autogestionable para comercios. La aplicación pública está en `index.html`; las tiendas cloud comparten el mismo frontend y separan sus datos por slug en Supabase.

## Modos de uso

- Sin `?tienda=`: demo local de un solo navegador. Sus datos quedan en ese dispositivo y no representan una tienda vendida.
- `?tienda=<slug>`: tienda cloud. Catálogo, estado del servicio y administración se validan contra Supabase.
- `?tienda=<slug>#admin`: login del dueño mediante la clave asignada a esa tienda.

Si una RPC cloud falla, el catálogo no se sustituye por datos de la demo. La página explica el problema y permite reintentar. Los frentes disponibles son `luma`, `ofertas`, `gamer`, `libre`, `tech` y `actitud`; la configuración guardada en Supabase es la fuente de verdad.

## Funcionalidades

- Catálogo, filtros, búsqueda, carrito, checkout, newsletter, políticas y pagos.
- Panel del dueño para productos, pedidos, clientes, finanzas, configuración y edición visual.
- Varias vidrieras; el frente Actitud admite búsqueda, categorías, carrito aislado por tienda e ilustraciones SVG locales en `assets/img/`.
- Integración de Mercado Pago y Uber Direct según la configuración cloud.
- Consola POPUPS con lista de tiendas, estado, vencimiento, selección de vidriera y rotación de claves.

## Seguridad y operación

- El login de cada dueño se valida por RPC de Supabase; no hay clave maestra de cliente ni relay público de datos.
- Las claves cloud se mantienen en memoria durante la sesión y se vuelven a pedir al recargar. No se guardan en Web Storage ni se imprimen en la guía PDF.
- Las claves nuevas de dueño se entregan una sola vez al crear o rotar una tienda. Si se pierden, se rotan; no se recuperan desde el panel.
- La consola POPUPS valida su clave central mediante `api_admin`; la credencial local de la demo no es válida para ninguna tienda cloud y no debe reutilizarse en producción.
- La migración `supabase/super-admin-secure.sql` restaura las RPC de autenticación del dueño sin bypass global, limita intentos de acceso central y añade el campo de vidriera en la respuesta del listado. Revisarla con el esquema real antes de aplicarla.
- `supabase/rotate-admin-pin.template.sql` es una guía sin valores reales. La rotación requiere operar en Supabase; no se ejecutó desde este entorno.

## Desarrollo y validación

Requiere Node.js y las dependencias del proyecto:

```bash
npm install
npx playwright install chromium
npm run check:syntax
npm run test:release -- --reporter=line
```

La suite de release cubre autenticación cloud, cambio seguro de clave, cierre y reingreso al panel, render de TECH/Actitud, carrito, checkout demo y acceso local. `npm test -- --reporter=line` ejecuta además specs históricos que todavía esperan flujos retirados; usalos para migrar pruebas, no como señal de publicación hasta actualizarlos. Las pruebas cloud deben interceptar las RPC y no depender de un proyecto real.

Para servir localmente:

```bash
python3 -m http.server 8080
```

## Publicación

`PUBLICAR.bat` está pensado para Windows. Ejecuta validaciones, hace `fetch` y `rebase` de `origin/main`, muestra los cambios y solicita confirmación antes de stage/commit/push. No fuerza el push y no ejecuta SQL. Revisá siempre el diff antes de confirmar.

El despliegue de la web y la aplicación de migraciones de Supabase son operaciones distintas. La migración cloud debe revisarse y aplicarse explícitamente por una persona autorizada.
