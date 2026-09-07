# Mi-Tienda · LUMA

## ▶️ Versión online

**https://somospopups.github.io/Mi-Tienda/** — demo publicada en GitHub Pages (rama `main`).

> ⚠️ La versión online guarda los datos de cada visita en el navegador de esa persona (demo de un solo dispositivo). Sirve para mostrar el producto, no para operar ventas reales.

**LUMA — "Objetos que hacen hogar"** es una demo de tienda online + panel de administración **contenida en un único archivo HTML** (`index.html`), que funciona 100 % offline: no requiere servidor, red ni instalación.

## Cómo usarla

1. Descargá `index.html` (o cloná el repo).
2. Hacé doble clic en el archivo (abre en cualquier navegador moderno, incluso sin internet).
3. **Tienda pública:** explorá el catálogo, agregá al carrito y probá el checkout. Mercado Pago corre en **modo demo** (aprobación simulada) y también podés elegir pedido por WhatsApp.
4. **Panel admin:** botón "Panel" (o agregá `#admin` a la URL) → PIN por defecto: **`1234`** (cambialo en Configuración → Seguridad).

Los datos se guardan en el `localStorage` del navegador (clave `luma_offline_store_v1`). Para volver a la demo de fábrica: borrá los datos del sitio en el navegador.

## Qué incluye

- **Tienda:** hero editorial, catálogo con búsqueda/filtros/orden, detalle de producto, carrito con barra de envío gratis, checkout (domicilio o retiro en Córdoba Capital, Mercado Pago demo o WhatsApp), newsletter, políticas legales editables.
- **Admin:** resumen con métricas, alertas de stock, productos (con foto por cámara o archivo, códigos de barras, PDF de lista de precios, reposición escaneando códigos), clientes con historial de compras, pedidos con timeline y avisos por WhatsApp, finanzas con export CSV/PDF, configuración de marca/apariencia (paleta con preview y contraste)/legal/seguridad.
- **Todo offline:** las peticiones `/api/*` las responde un backend simulado embebido sobre `localStorage`, con validaciones y reglas de negocio (reserva de stock, numeración de pedidos `LU-1001…`, reembolsos automáticos al cancelar, etc.).

## Arquitectura del archivo

| Líneas | Contenido |
|---|---|
| 1–9 | `<head>` + metadatos |
| 10–1199 | CSS (tienda + admin, responsive) |
| 1202–1526 | Markup: sprite SVG, tienda, modales y panel admin |
| ~1530–1930 | Librerías embebidas: jsPDF 2.5.2, html5-qrcode |
| ~1932–2405 | "Servidor" offline: mock API `/api/*` + datos iniciales + siembra de imágenes |
| ~2406–4550 | Aplicación principal (lógica de tienda + admin) |

## Optimizaciones aplicadas (septiembre 2026)

- Imágenes base64 **deduplicadas** (12 instancias → 6 únicas; CSS del login usa `var(--login-art)`).
- Fotos **recomprimidas en webp q80** (PSNR ≥ 40 dB, sin pérdida visible).
- `FALLBACK_IMAGE` derivada del DOM (1 sola copia del placeholder).
- Script residual de Cloudflare eliminado; archivo renombrado a `index.html`.
- Resultado: **2.206.267 → 1.594.449 bytes (−27,7 %)**.

## Estado / límites conocidos

- **Demo de un solo dispositivo:** cada navegador tiene sus propios datos; no hay sincronización entre dispositivos hasta conectar el backend real que el código ya espera (`/api/*`, SSE `/api/events`, credenciales de Mercado Pago).
- El catálogo incluye productos demo; los textos legales provienen de la plantilla original ("Green Soul") y deben adaptarse con asesoramiento legal antes de vender.
- PIN inicial `1234` — cambiar antes de compartir.
