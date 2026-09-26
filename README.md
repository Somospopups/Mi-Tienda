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

- **Frentes de tienda (v0.9):** la vidriera pública tiene 3 variantes (`settings.storefront`) — **Boutique** (editorial, el clásico; la usa toda tienda activa), **Ofertas** (descuentos y cuotas) y **Gamer** (oscuro). Mismo catálogo, carrito, checkout y panel; cambia solo la vidriera. Desde **v0.13.0** el frente se fija por tienda y ya no se cambia desde el panel.
- **Tienda:** hero editorial, catálogo con búsqueda/filtros/orden, detalle de producto, carrito con barra de envío gratis, checkout (domicilio, retiro en Córdoba Capital o **Envío con Uber Direct** en modo demo/real; Mercado Pago **demo**, Mercado Pago **live** por dueño con Checkout Pro, o pedido por WhatsApp), newsletter con consentimiento, legales editables.
- **Modo edición visual (v0.8):** con la sesión del dueño activa, el botón lateral **"Ver tienda / Editar"** sale del panel y entra **directo** al modo edición (o toca el botón flotante **"Editar página"** sin pasar por el panel). Clic sobre cualquier texto, imagen o tarjeta de producto para editarla al instante; la barra superior permite cambiar los **Colores** y la **paleta**; la marca/logo se edita tocando el encabezado. Los textos ya no tienen tab "Contenido" en el panel.
- **Constructor de página (v0.14):** en el modo edición, el botón **"Bloques"** de la barra abre un panel lateral (estilo Google Sites) para armar el home por secciones: complementos **Portada, Oferta destacada, Testimonios, Video/Reel, Productos destacados y Banner con botón**, más **Texto, Imagen, Galería, Reel de Instagram y Separador**. Cada bloque se edita tocándolo (subir, bajar, duplicar, eliminar). **La página armada reemplaza todo el home** —hogar clásico y catálogo automático— y el catálogo sigue disponible desde el menú y desde los botones que llevan a `#coleccion`.
- **Admin (7 secciones):** dashboard con métricas · alertas de stock · productos (foto por cámara/archivo con optimización automática 1400px/WebP, códigos de barras, PDF de lista de precios, reposición escaneando) · clientes con historial · pedidos con timeline y avisos por WhatsApp · finanzas con export CSV/PDF · configuración en 3 secciones (**General** con identidad, envíos y **paleta de colores** con presets/contraste/Random, **Cobros** con Mercado Pago y **Legal y redes**) y seguridad con cambio de clave propio.
- **Extras POPUPS:** barra de plan con aviso al 80% y vencimiento · Guía de bienvenida en PDF con los datos del dueño · numeración de pedidos · reserva de stock y reembolsos automáticos al cancelar.

## Arquitectura del archivo (6.827 líneas · 1,68 MB)

| Líneas | Bloque | Peso |
|---|---|---|
| 1–14 | `<head>` + metadatos + favicon silencioso | 0,5 KB |
| 15–1600 | CSS (tienda + admin, responsive) + modo edición visual (v0.8) + **frentes de tienda (v0.9)** + **constructor de página (v0.14)** | ~140 KB |
| 1601–1652 | Script puerta POPUPS (gate de suspensión) | 3 KB |
| 1653–2450 | Markup: sprite SVG, modales, panel + jsPDF embebido | ~400 KB |
| 2451–3460 | "Servidor": mock API offline + datos semilla + **capa cloud Supabase** (11 RPC, sync del panel con guardado atómico v0.8.1, flujo MP async) | ~280 KB |
| 3461–6550 | App principal (tienda + admin + **motor de frentes v0.9**) + puente v0.7 (`window.mtCloudGlue`) | ~200 KB |
| 6551–6827 | **v0.8 · Motor del modo edición visual** (clic-para-editar: textos, imágenes, marcas, colores, productos) + **v0.14 · constructor de página** (panel de bloques, editor por bloque, complementos) | ~30 KB |

El backend (funciones SQL en Supabase) está documentado en [`supabase/`](supabase/README.md):
contratos verificados en vivo, esquema reconstruido y procedimiento de exportación del SQL real.

## Cómo usarla (demo offline)

1. Descargá `index.html` (o cloná el repo).
2. Doble clic (abre en cualquier navegador moderno, sin internet).
3. Tienda: explorá, agregá al carrito, probá el checkout (MP en modo demo o WhatsApp).
4. Panel: botón "Panel" (o `#admin`) → PIN `1234` (cambialo en Configuración → Seguridad).
5. **Modo edición visual:** logueate en el panel y tocá **"Ver tienda / Editar"** (entra directo al modo edición); o volvé a la tienda y usé el botón flotante **"Editar página"**. Clic sobre un texto, imagen o producto para editarlo; los colores se cambian desde el botón **Colores** de la barra y la paleta completa desde Configuración → General.
6. **Armar el home (v0.14):** en el modo edición, tocá **Bloques** en la barra y agregá complementos (Portada, Oferta, Testimonios, Video, Productos, Banner). Tocá un bloque para editarlo, **Listo** para guardar y **Terminar** para salir. Con bloques guardados tu página es el home de la tienda; el catálogo se abre desde el menú o desde cualquier botón de la página.

Para volver a la demo de fábrica: borrá los datos del sitio (`luma_offline_store_v1`, `luma_cart`).

## Desarrollo y testing

```bash
# servir local
python3 -m http.server 8080
# smoke tests (Playwright)
npm install && npx playwright install chromium
npm test
```

Los tests cubren: carga de vitrina, agregar al carrito, checkout demo, login al panel,
navegación de secciones del admin, seguridad del cambio de clave y el **modo edición visual**
(visibilidad del botón según sesión y entrada directa con "Ver tienda / Editar", edición con
persistencia, editor de producto y paleta de colores,
además del guardado en la nube con las RPC stubeadas). Desde v0.8.1 también se verifica la
**integridad del guardado cloud**: un fallo de `api_save_cfg` se muestra como error real (sin falso
"Guardado"), una tienda inexistente avisa en vez de caer a la demo, y los cambios locales sin
sincronizar se preservan y reintentan al recargar. Desde v0.14.0 se cubre el **constructor de
página** ([`tests/page-builder.spec.js`](tests/page-builder.spec.js)): panel de bloques y
complementos, home armado que reemplaza al clásico, catálogo a demanda, edición de propiedades,
reordenar/duplicar/eliminar, compra desde la página y geometría de los cajones, más la
sincronización del bloque con `api_save_cfg`.
CI en `.github/workflows/ci.yml`.

## Estado / límites conocidos

- **Demo offline = un solo dispositivo** (cada navegador tiene sus datos). Las tiendas vendidas con `?tienda=` sí son multi-dispositivo (datos en la nube).
- **El SQL real de Supabase aún no está versionado** (`supabase/schema-real.sql` pendiente de exportar — ver `supabase/export.sql`). El esquema reconstruido documenta los contratos pero no se debe correr en producción.
- La Clave de acceso no expira y vive en `sessionStorage`; el modelo asume que las RPC validan `p_key` en cada escritura (auditable cuando se versione el SQL real).
- El catálogo demo incluye productos LUMA; los textos legales provienen de la plantilla original ("Green Soul") y deben adaptarse con asesoramiento legal antes de vender.
- PIN inicial de la demo `1234` — cambiar antes de compartir.
- `EventSource` está anulado a propósito (el "live pill" del panel es decorativo hasta conectar SSE/Realtime real).
- **v0.14 · Página personalizada**: cuando el dueño arma bloques, su home reemplaza al clásico y al catálogo; el menú "Novedades" y "Manifiesto" siguen apuntando a secciones del hogar clásico, que quedan ocultas (el catálogo se abre bien desde el menú y desde los botones `#coleccion`). Borrar todos los bloques devuelve el home clásico. Pendiente para una versión siguiente: ofrecer esas dos secciones como complementos.

## Licencia / contacto

POPUPS · somospopups@gmail.com
