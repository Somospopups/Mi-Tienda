# Changelog — Mi-Tienda

## v0.2.0 · 2026-09-07
- **Puerta POPUPS (suspensión por falta de pago)**: cada tienda vendida se abre con su link `?tienda=<dueño>`. Si POPUPS la bloquea (impago o baja) desde la Consola POPUPS, la página entera muestra el cartel de suspendida y no vende ni edita. Al regularizar, vuelve sola.
- El estado de cada tienda lo administra POPUPS desde la Consola (altas, pagos +30 días, bloqueos, bajas).

## v0.1.1 · 2026-09-07
- Ficha de estándar POPUPS (`popups.app.json`) para detección automática de versiones en la Consola.
