# Mi-Tienda · POPUPS

Tienda online + panel de administración para comercios. Producto vendido por **POPUPS**:
cada local tiene su link propio (`?tienda=<slug>`), sus datos en la nube (Supabase)
y su cuenta de Mercado Pago. Todo el frontend vive en **un único `index.html`**
que además funciona como demo offline de un solo dispositivo.

## ▶️ Versión online

**[https://somospopups.github.io/Mi-Tienda/](https://somospopups.github.io/Mi-Tienda/)** — GitHub Pages (rama `main`).

- Sin parámetros → **demo LUMA** (datos en el navegador de quien la abre; no opera ventas reales).
- `?tienda=<slug>` → **tienda vendida real** (catálogo, pedidos y cobros en la nube).
- `?tienda=<slug>#admin` → **panel del dueño** (login con Clave de acceso).
- Demos cloud sembradas: `?tienda=juan` (clave `juan-demo`) y `?tienda=mariela` (clave `mariela-demo`).

## Los 3 modos

| Modo | Datos | Auth | Uso |
|---|---|---|---|
| Demo offline | `localStorage` (`luma_offline_store_v1`) vía mock API embebido que intercepta `fetch('/api/*')` | PIN (defecto `1234`) | Mostrar el producto, doble clic y funciona sin internet |
| Vitrina cloud | Supabase RPC `api_public` (caché cliente 20 s) | pública | Tiendas vendidas |
| Panel dueño cloud | Supabase RPC `api_panel` + espejo local con sync por sección | Clave de acceso (`ck:` en sessionStorage) | Gestión desde cualquier dispositivo |

**Puerta POPUPS:** si la tienda está `suspendida` o `baja` (impago gestionado desde la
Consola POPUPS), un script previo al render bloquea la página completa en cualquier
dispositivo. Al regularizar, vuelve sola.

## Qué incluye

- **Tienda:** hero editorial, catálogo con búsqueda/filtros/orden, detalle de producto, carrito con barra de envío gratis, checkout (domicilio o retiro en Córdoba Capital; Mercado Pago **demo**, Mercado Pago **live** por dueño con Checkout Pro, o pedido por WhatsApp), newsletter con consentimiento, legales editables.
- **Admin (7 secciones):** dashboard con métricas · alertas de stock · productos (foto por cámara/archivo con optimización automática 1400px/WebP, códigos de barras, PDF de lista de precios, reposición escaneando) · clientes con historial · pedidos con timeline y avisos por WhatsApp · finanzas con export CSV/PDF · configuración (marca, contenidos, apariencia con paletas y contraste, legales, **cobros MP**, seguridad con cambio de clave propio).
- **Extras POPUPS:** barra de plan con aviso al 80% y vencimiento · Guía de bienvenida en PDF con los datos del dueño · numeración de pedidos · reserva de stock y reembolsos automáticos al cancelar.

## Arquitectura del archivo (5.308 líneas · 1,64 MB)

| Líneas | Bloque | Peso |
|---|---|---|
| 1–10 | `<head>` + metadatos + favicon silencioso | 0,5 KB |
| 11–1200 | CSS (tienda + admin, responsive) | 116 KB |
| 1201–1268 | Script puerta POPUPS (gate de suspensión) | 3 KB |
| 1269–1596 | Markup: sprite SVG, tienda, modales, panel + imágenes base64 | 296 KB |
| 1597–1997 | jsPDF 2.5.2 embebido | 357 KB |
| 1998–2000 | html5-qrcode embebido | 367 KB |
| 2001–2849 | "Servidor": mock API offline + datos semilla + **capa cloud Supabase** (11 RPC, sync del panel, flujo MP async) | 276 KB |
| 2850–5105 | App principal (tienda + admin) | 176 KB |
| 5106–5305 | Puente v0.7 (`window.mtCloudGlue`): barra de plan + Guía PDF | 11 KB |

El backend (funciones SQL en Supabase) está documentado en [`supabase/`](supabase/README.md):
contratos verificados en vivo, esquema reconstruido y procedimiento de exportación del SQL real.

## Cómo usarla (demo offline)

1. Descargá `index.html` (o cloná el repo).
2. Doble clic (abre en cualquier navegador moderno, sin internet).
3. Tienda: explorá, agregá al carrito, probá el checkout (MP en modo demo o WhatsApp).
4. Panel: botón "Panel" (o `#admin`) → PIN `1234` (cambialo en Configuración → Seguridad).

Para volver a la demo de fábrica: borrá los datos del sitio (`luma_offline_store_v1`, `luma_cart`).

## Desarrollo y testing

```bash
# servir local
python3 -m http.server 8080
# smoke tests (Playwright)
npm install && npx playwright install chromium
npm test
```

Los tests cubren: carga de vitrina, agregar al carrito, checkout demo, login al panel
y navegación de secciones del admin. CI en `.github/workflows/ci.yml`.

## Estado / límites conocidos

- **Demo offline = un solo dispositivo** (cada navegador tiene sus datos). Las tiendas vendidas con `?tienda=` sí son multi-dispositivo (datos en la nube).
- **El SQL real de Supabase aún no está versionado** (`supabase/schema-real.sql` pendiente de exportar — ver `supabase/export.sql`). El esquema reconstruido documenta los contratos pero no se debe correr en producción.
- La Clave de acceso no expira y vive en `sessionStorage`; el modelo asume que las RPC validan `p_key` en cada escritura (auditable cuando se versione el SQL real).
- El catálogo demo incluye productos LUMA; los textos legales provienen de la plantilla original ("Green Soul") y deben adaptarse con asesoramiento legal antes de vender.
- PIN inicial de la demo `1234` — cambiar antes de compartir.
- `EventSource` está anulado a propósito (el "live pill" del panel es decorativo hasta conectar SSE/Realtime real).

## Licencia / contacto

POPUPS · somospopups@gmail.com
