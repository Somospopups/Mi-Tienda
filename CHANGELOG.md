# Changelog — Mi-Tienda

## v0.2.0 · 2026-09-07
- **Puerta POPUPS (suspensión por falta de pago)**: cada tienda vendida se abre con su link `?tienda=<dueño>`. Si POPUPS la bloquea (impago o baja) desde la Consola POPUPS, la página entera muestra el cartel de suspendida y no vende ni edita. Al regularizar, vuelve sola.
- El estado de cada tienda lo administra POPUPS desde la Consola (altas, pagos +30 días, bloqueos, bajas).

## v0.1.1 · 2026-09-07
- Ficha de estándar POPUPS (`popups.app.json`) para detección automática de versiones en la Consola.

## v0.3.0 · 2026-09-07
- **Fotos aligeradas solas al subir**: toda foto (productos, comprobantes y logo) pasa por un optimizador que la deja liviana sin pérdida visible — máximo 1400 px por lado, calidad ~82% en WebP (JPEG si el navegador no lo soporta). Una foto de 4 MB del celular queda en ~100 KB, y la tienda carga mucho más rápido.
- Las fotos que ya son chicas se guardan tal cual (no se tocan). El mensaje de éxito muestra cuánto se redujo: "Imagen lista ✓ · 4,2 MB → 98 KB".
- Los PNG con transparencia (logos) conservan su fondo transparente.

## v0.4.0 · 2026-09-07
- **Las tiendas vendidas viven en la nube (Supabase)**: cada tienda vendida (Juan, Mariela, las que vengas) abre su catálogo real desde la nube, separado del resto. Cada una con sus productos, colores, textos y legales propios.
- **Puerta por impago real (multi-dispositivo)**: el bloqueo de una tienda suspendida o dada de baja ahora lo decide la nube — funciona desde cualquier celular o computadora, no solo donde se abrió la consola. Al regularizar el pago, la tienda vuelve sola.
- **Compras y newsletter en la nube**: el checkout valida stock y precios en la base (si alguien compra desde dos dispositivos a la vez, la base descuenta una sola vez el stock real) y registra cliente, pedido y finanzas en la nube.
- Los precios de costo/mayorista no se exponen en la vitrina pública.
- La demo local (sin `?tienda=`) sigue funcionando igual, y las tiendas aún no migradas conservan el comportamiento anterior.
