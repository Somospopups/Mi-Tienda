# Changelog — Mi-Tienda

## v0.11.3 · 2026-09-24 · FIX: el botón "Listo" del editor de imágenes no cerraba
- **Causa**: `mtEditImage` (el editor que se abre al tocar una imagen en modo edición) nunca llamaba `mtEditBind()`, la función que conecta los botones del pie. La × y Escape cerraban, pero **"Listo" no hacía nada** — bug presente desde v0.8, recién reportado ahora. Basta con el call faltante; test de regresión agregado (abrir imagen editorial → reemplazar → "Listo" cierra el popover).
- Suite completa: **47/47**.

## v0.11.2 · 2026-09-24 · FIX: la imagen editorial del final no se podía reemplazar
- **Causa**: la imagen grande del final de la página (sección "editorial", la que tiene el pie "Hecho para seguirte el ritmo") tiene un **velo degradado `::after` que cubre toda la foto**. Los clics caían en el contenedor, pero el modo edición buscaba el atributo de edición en el `<img>` (que quedaba debajo) → no abría el editor nunca. Las del hero no sufrían el problema por eso el usuario podía reemplazarlas.
- **Fix**: el atributo de edición ahora va en el **contenedor** de la imagen (hero principal, hero secundaria y editorial) y el render resuelve el `<img>` interior. Un clic en cualquier punto de la foto abre el editor, aunque haya velos encima. El resaltado al pasar el mouse ahora marca toda la imagen (más claro).
- 2 tests nuevos en [`tests/editorial-image.spec.js`](tests/editorial-image.spec.js): clic en el CENTRO de la imagen editorial (zona con velo) abre el editor y el reemplazo persiste tras recargar; imágenes del hero siguen editables. Suite completa: **47/47**.

## v0.11.1 · 2026-09-24 · FIX REAL del error de imágenes: el recorte a 600 caracteres
- **Causa raíz encontrada (verificada contra los datos reales de la tienda `eze-pece`)**: al guardar contenido, las claves nuevas se recortan a 600 caracteres por seguridad, y la excepción para imágenes usaba el patrón "termina en Image" (`.*Image$`). Pero las claves reales son **`heroImageMain`** y **`heroImageSecondary`** (terminan en "Main"/"Secondary") → la imagen se subía, se guardaba **truncada a 600 caracteres** y al mostrarse no era una imagen válida → placeholder. Por eso las fotos de **productos** (190 KB guardados ✓) y el **logo** (16 KB ✓) siempre funcionaron, y solo las imágenes de portada/editorial fallaban. En la nube de la tienda quedaron guardadas las versiones de 600 chars — basta volver a subirlas.
- Corregido el patrón a `image` en cualquier posición de la clave (cloud y offline). Los tests I1/I3 ahora verifican que la imagen guardada siga siendo una imagen real (>50.000 caracteres) — el test anterior solo miraba el tope máximo y no detectaba el recorte.
- Suite completa: **45/45**.

## v0.11.0 · 2026-09-24 · Panel lateral del constructor (estilo Google Sites) + Reel de Instagram
- **El constructor ahora tiene un panel lateral como Google Sites** (pedido con captura): al activarlo se abre un panel derecho con las secciones **"Insertar"** (Cuadro de texto, Imagen, Video de YouTube, **Reel de Instagram**, Galería de fotos, Separador) y **"Bloques de tienda"** (Portada, Banner con botón, Productos destacados), cada uno como tarjeta con ícono. Los botones **Guardar página** y **Salte** viven en la cabecera del panel; la página se corre a la izquierda para que nada la tape.
- **Nuevo bloque: Reel de Instagram.** Se pega el link del reel o post (`instagram.com/reel/…` o `/p/…`) y se muestra incrustado con el formato elegido: **Reel (vertical 9:16)** o **Post (cuadrado)** — vía el embed oficial de Instagram, funciona en la tienda publicada.
- El editor de propiedades de cada bloque ahora se despliega a la izquierda del panel (en pantallas angostas lo cubre y al cerrar vuelve a esconderse del todo).
- La barra inferior del constructor fue reemplazada por el panel; los datos guardados no cambian (mismo `builderBlocks`, mismas claves y tamaños).
- 1 test nuevo (B5: panel con 2 secciones y 9 tarjetas, inserción de reel, cambio de formato y persistencia). Suite completa: **45/45**.

## v0.10.1 · 2026-09-24 · Pista de credenciales en el login
- **Aclaración de acceso al panel** (confusión reportada: "no puedo entrar"): en la **demo** (`/#admin` sin `?tienda=`) el panel entra con el **PIN 1234**; en una **tienda real** (`…?tienda=tu-tienda#admin`) entra con la **Clave de acceso que te dio POPUPS** — el PIN no funciona ahí. El login ahora lo muestra siempre: la demo indica "el PIN es 1234" y la tienda recuerda la Clave con el contacto para recuperarla. (El panel nunca dejó de funcionar: el servidor respondía "Clave incorrecta" correctamente.)
- 2 tests nuevos en [`tests/login-hint.spec.js`](tests/login-hint.spec.js). Suite completa: **44/44**.

## v0.10.0 · 2026-09-24 · Constructor de página + presupuesto de imágenes cloud
- **Nuevo: frente "Libre · Constructor" — armá tu portada como en Google Sites.** En Configuración → Apariencia aparece una cuarta tarjeta con el botón **"Abrir constructor visual"**. El modo constructor muestra una barra con 8 tipos de bloque: **Hero** (con imagen de fondo, altura baja/media/alta, velo de opacidad y tono del texto), **Texto**, **Imagen**, **Video de YouTube**, **Galería de fotos** (hasta 6), **Productos destacados** (del catálogo real), **Banner CTA** y **Separador**.
  - **Arrastrar**: cada bloque se reordena arrastrando ⠿ (con marca de posición) o con ▲▼; también duplicar ⧉ y eliminar ✕.
  - **Agrandar/achicar**: cada bloque elige su ancho (todo el ancho / 85% / 65% / 45%), la galería elige columnas (2/3/4) y el hero elige altura — con previsualización en vivo.
  - **Fotos, videos y fondos**: las imágenes se comprimen solas al subirlas; el video se pega como link de YouTube; los fondos aceptan color e imagen.
  - **El panel del administrador no cambia** (requisito explícito): el constructor vive en el frente público, se guarda con los mismos endpoints de siempre (`PUT content.builderBlocks` + `settings.storefront: 'libre'`) y el catálogo/carrito/checkout siguen funcionando debajo.
- **Mitigación del error de guardado en tiendas cloud**: `api_save_cfg` hace merge por sección (cada guardado reenvía todo el contenido, imágenes incluidas) y el JSON total podía superar el límite del gateway. Ahora, antes de cada guardado cloud, `mtShrinkContentForCloud` verifica un presupuesto de 900 KB y, si el contenido acumulado lo excede, re-comprime automáticamente las imágenes viajeras (claves `*Image*` y las fotos dentro de `builderBlocks`) en pasadas de 450 → 200 → 90 KB por imagen hasta entrar en presupuesto. Caps de subida por tipo: hero/logo 600 KB, producto 500 KB, comprobante 350 KB, bloques del constructor 3 MB.
- 5 tests nuevos: presupuesto de payload (2 imágenes de ~7 MB se reducen a <950 KB antes del RPC) y 4 del constructor (texto, hero/video/imagen, arrastre persistente, tamaños). Suite completa: **42/42**.

## v0.9.2 · 2026-09-24 · Fix: subida de imágenes en tiendas cloud
- **Bug real (tienda `eze-pece`)**: al cambiar la imagen del hero desde el modo edición, la subida fallaba. Tres causas raíz corregidas:
  1. **`mtRpc` cortaba a los 9 s con un solo intento**: una subida de ~100-400 KB de JSON a Supabase desde conexiones residenciales argentinas puede tardar más, y el abort mostraba "sin conexión" aunque el servidor muchas veces sí recibió el dato. Ahora el timeout de escritura (`api_save_cfg`) es de **45 s** (lecturas 12 s) y ante **fallo de red, timeout o error 5xx se reintenta una vez automáticamente** (`api_save_cfg` es idempotente: guarda estado completo). Los 4xx (RPC inexistente, clave inválida, plan) siguen siendo definitivos y no se reintentan.
  2. **El espejo local podía tumbar un guardado ya aceptado por la nube**: si `localStorage` se quedaba sin cupo (tiendas con muchas fotos), `origWriteStore` lanzaba QuotaExceeded después del OK de la RPC y el dueño veía "almacenamiento lleno" para siempre. Ahora la escritura del espejo es best-effort (`mtMirrorSafe`): si no hay cupo se marca un flag y el guardado cloud queda hecho (el panel refresca desde la nube).
  3. **Las imágenes ahora viajan con tope estricto**: `compressImage` acepta `maxChars` y usa una escalera de compresión (1400→1150→920→740→600 px, calidad decreciente) hasta cumplir el límite (850 KB de dataURL en portada, logo, fotos de producto y comprobantes). Payloads chicos = menos timeouts y espejo sano.
- Mensaje de error de `sin_conexion` más accionable ("pasa con conexiones lentas o imágenes pesadas…").
- 2 tests nuevos en [`tests/image-save.spec.js`](tests/image-save.spec.js): subida de imagen de hero en tienda cloud con tope de compresión verificado en el payload de `api_save_cfg`, y reintento automático ante fallo de red real (route.abort). Suite completa: 37/37.

## v0.9.0 · 2026-09-24 · Frentes de tienda
- **Nuevo: el dueño elige la vidriera pública, el panel no cambia.** En Configuración → Apariencia hay un selector **"Frente de tienda"** con tres estilos, persistido en `settings.storefront` (mismos endpoints de siempre: `PUT /api/admin/settings` online + espejo local; retrocompatible — sin clave → `luma`):
  - **Boutique · Editorial** (`luma`): el frente clásico de siempre, intacto.
  - **Ofertas · Consumo** (`ofertas`): estilo tienda tech masiva (tipo smarts.com.ar): hero de campaña, benefits strip (envío / 18 cuotas / compra protegida), **"Ofertas de la semana"** calculadas automáticamente de los productos con `compareAtPrice` (cinta de % off, precio rojo, precio anterior tachado) y acceso rápido por categorías.
  - **Gamer · Hardware** (`gamer`): oscuro con acento neón (tipo armytech.com.ar): hero "ARMÁ TU SETUP", **mosaico de categorías generado del catálogo real** con íconos por tipo de producto, y strip de servicios. Todo el shop (header, catálogo, carrito, modales y footer) se adapta vía re-declaración de variables CSS con scope en `body[data-front="gamer"]` — el admin conserva su paleta.
- El frente comparte **el mismo catálogo, carrito, checkout y editores**: buscar/filtrar/ordenar, producto con modal, carrito con envío gratis, Mercado Pago demo/live y WhatsApp funcionan idéntico en los tres frentes.
- Nuevas acciones delegadas (`data-front-add/open/jump/scroll`) reutilizan `addToCart`, `openProduct` y el salto de categoría existentes; los textos de los frentes nuevos (`ofr*` / `gmr*`) son campos de contenido → editables con el **modo edición visual** v0.8 y persistibles en la nube (el PUT de contenido acepta claves nuevas presentes en `INITIAL_STORE.content`).
- La barra "Editar página" y la previsualización en vivo del selector (cambia la vidriera al marcar una opción, se confirma al guardar) funcionan en todos los frentes.
- 5 tests nuevos en [`tests/fronts.spec.js`](tests/fronts.spec.js): frente por defecto, cambio desde el panel con persistencia tras recargar, ofertas calculadas, mosaico gamer y carrito funcionando en frente oscuro.

## v0.8.1 · 2026-09-24
- **Fix: los cambios del dueño ya no se "pierden" en la nube.** Antes, guardar contenido o ajustes en una tienda cloud encolaba la sincronización (`mtAdmWrite`) y el PUT respondía `ok` aunque la RPC fallara después: la UI festejaba un guardado que nunca llegaba y, al recargar, el estado remoto pisaba el espejo local → los cambios desaparecían sin aviso.
  - **Guardado atómico**: `PUT /api/admin/content` y `PUT /api/admin/settings` ahora esperan `api_save_cfg` y devuelven un error real si falla (el editor muestra "No se pudo guardar" y no cambia la tienda).
  - **Cambios sin sincronizar protegidos**: si una sync falla (colas de pedidos/clientes/finanzas), queda un flag "dirty"; al recargar el panel NO pisa el espejo local, reenvía el trabajo a la nube y avisa con un toast ("los cambios quedaron en este equipo..."). Se llama por fin a `mtAdmFail()`, que estaba definido pero nunca activado.
  - **"Tienda no encontrada" ≠ demo**: si la RPC devuelve `store_not_found` (URL sin `?tienda=` válido), la página muestra un aviso claro en vez de servirse la demo LUMA — que clavaba la sensación de "volvió a cero".
- 3 tests nuevos en [`tests/edit-mode-cloud.spec.js`](tests/edit-mode-cloud.spec.js): error de nube visible en el editor (sin falso guardado), aviso de tienda inexistente, y preservación+reintento de cambios locales al recargar.

## v0.8.0 · 2026-09-24
- **Modo edición visual (clic para editar)** en la tienda: con la sesión del dueño activa aparece el botón flotante **"Editar página"**. Hacés clic sobre cualquier parte del home y se abre un editor contextual para cambiarla al instante, guardando por los mismos endpoints del panel (demo en `localStorage`, cloud en Supabase):
  - **Textos**: títulos, botones, menú, beneficios (envío/cambios/protección/gift), nota del hero, tarjeta del producto destacado, manuscrito, manifiesto, newsletter y datos editoriales.
  - **Imágenes del hero y del editorial**: subirlas desde el dispositivo (PNG/JPG/WEBP) con optimización automática o restaurar el original con un clic.
  - **Productos**: clic sobre una tarjeta abre el editor de producto del panel.
  - **Colores y marca**: la barra superior tiene **Colores** (paleta con preview); la marca y el logo se editan tocando el logo o el nombre en el encabezado/pie.
- El botón respeta la sesión y el lugar: oculto sin sesión del dueño, oculto dentro del panel y al cerrar sesión; al terminar el modo edición vuelve a aparecer. En modo edición la barra superior ya no tapa el anuncio ni el encabezado (reserva su propio espacio).
- **7 tests nuevos** (offline + cloud stubbeado): visibilidad del botón según sesión, edición de texto con persistencia en el store offline, apertura del editor de producto, paleta, cierre de sesión y **sync del guardado a la nube** (`api_save_cfg` con la `p_key` correcta para contenido y ajustes, véase [`tests/edit-mode.spec.js`](tests/edit-mode.spec.js) y [`tests/edit-mode-cloud.spec.js`](tests/edit-mode-cloud.spec.js)).
- El smoke test de la puerta cloud (test 10) ahora stubea `api_public` y es determinístico con o sin red.

## v0.7.3 · 2026-09-15
- **El dueño ahora puede cambiar su Clave de acceso** desde Ajustes → **Seguridad**, sin depender de POPUPS. La clave actual se verifica contra el hash bcrypt de la base y la nueva se guarda cifrada (nunca viaja ni se almacena en texto); rige en todos los dispositivos y **la sesión abierta no se corta** (el token `ck:` se actualiza solo).
- **Fix del bloqueo de Configuración** (era el síntoma más feo del mismo bug): los campos de clave estaban *dentro* del formulario de Ajustes y eran numéricos (`pattern="[0-9]*"`, `maxlength="8"`). Pegar una clave con letras (ej. `juan-demo`) la truncaba y la validación nativa del navegador **cancelaba el guardado de toda la configuración**, sin mostrar ningún error. La tarjeta de acceso pasó a ser un `<form>` propio, con reglas por modo: **4–8 dígitos en la demo / 6–64 caracteres libres en la nube**.
- Botón para mostrar/ocultar cada campo y mensajes en español para cada rechazo (clave actual incorrecta, muy corta, no coincide la confirmación, igual a la anterior).
- **Sin callejón ciego**: si la RPC nueva todavía no está desplegada, el frontend lo detecta (`PGRST202`) y la tarjeta cambia sola a *"Tu clave la cambia POPUPS"* con el mail listo para pedirla. Antes devolvía un 403 que no llevaba a ningún lado.
- **Requiere una vez**: ejecutar [`supabase/api_key_change.sql`](supabase/api_key_change.sql) en el SQL Editor (nueva RPC `api_key_change`, la nº 12 del cliente). Sin eso la tienda sigue operando normal, sólo que el cambio de clave se pide a POPUPS.
- 8 smoke tests nuevos ([`tests/security.spec.js`](tests/security.spec.js)): 4 de nube con las RPC stubeadas (`page.route`, sin depender de la red) y 4 de la demo offline, con la regresión exacta del reporte.

## v0.7.1 · 2026-09-15
- **Repo auditable**: contratos de las 11 RPC de Supabase verificados en vivo (`supabase/contratos-rpc.md`), esquema reconstruido ejecutable para staging/recuperación (`supabase/esquema-reconstruido.sql`) y guía de exportación del SQL real (`supabase/export.sql`).
- **10 smoke tests Playwright + CI** (GitHub Actions): vitrina, carrito, checkout demo, newsletter, login y 7 secciones del panel, pedido→panel y puerta cloud. En cada push se valida la sintaxis de los 6 bloques JS del `index.html`.
- **README reescrito** (los 3 modos: demo offline, vitrina cloud, panel del dueño; arquitectura real del archivo) y **CHANGELOG reordenado**.
- Fix menor: las tiendas con `?tienda=` ya no flashean el título "LUMA Offline" mientras cargan.
- Ficha POPUPS completa (`supabaseRef`, urls de admin y docs).

## v0.7.0 · 2026-09-07
- **Fix crítico en la web publicada**: el panel del dueño no cargaba desde la nube (`ReferenceError: loadAdminTab is not defined`). El puente de la barra de plan había quedado dentro del primer script del bundle, donde esas funciones no existen; se rehízo como puente entre scripts (`window.mtCloudGlue`) y la tienda vuelve a operar en línea: vitrina, login con Clave de acceso, panel y edición desde la nube.
- **Barra del plan reparada**: ahora sí se muestra en el panel (plan, uso de productos y vencimiento) tanto en la web publicada como en local.
- **Guía de bienvenida en PDF (botón "Guía (PDF)" en el panel)**: descarga un PDF con el link de la tienda, la clave de acceso, el plan y su vencimiento, más instrucciones ilustradas con capturas reales de la web (catálogo, login, panel, productos, pedidos y cobros con Mercado Pago). El PDF se genera con los datos del dueño en el momento.
- Se corrige también el ícono y la posición del botón junto a "Ver tienda" y "Cerrar sesión" (escritorio y celular).

## v0.6.1 · 2026-09-07
- **Cobro Mercado Pago más estable**: el pago ahora se arma con el método asíncrono de la nube (dispara la llamada a Mercado Pago y consulta la respuesta al instante), evitando el corte del plan Free por tiempo. Conexión del token, cobro y confirmación de pago pasan por este flujo (requiere correr `mp_async.sql` una vez).

## v0.6.0 · 2026-09-07
- **Cobros con Mercado Pago de verdad (por dueño)**: cada local conecta SU cuenta de Mercado Pago desde Ajustes → **Cobros**, con un paso a paso de 5 pasos (crear app en developers.mercadopago.com.ar → copiar el Access Token `APP_USR-` → pegarlo y probar). POPUPS no toca el dinero: las ventas entran directo a la cuenta del local.
- **Checkout real (Checkout Pro)**: cuando el local tiene su Mercado Pago conectado, el cliente paga con tarjeta/débito/dinero en cuenta en la página segura de Mercado Pago; al aprobarse, el pedido pasa a **Confirmado** solo, se registra la venta en finanzas y el stock ya se había reservado. Si el pago queda pendiente, el pedido queda "Esperando pago" para que el local lo gestione.
- El token se guarda cifrado en la nube del local (nunca viaja al navegador del cliente) y se puede actualizar o desconectar cuando quiera. La demo local (sin plan) sigue en modo demostración.
- Requiere correr el esquema SQL actualizado (sección Mercado Pago) una vez.

## v0.5.0 · 2026-09-07
- **Panel del dueño en la nube**: el dueño de una tienda vendida entra con su **Clave de acceso** (la que le entrega POPUPS al venderla, no el PIN de la demo). Administra su tienda completa **desde cualquier dispositivo** (celular o computadora) y todo se guarda en la nube: productos, stock, pedidos, clientes, finanzas, textos, colores y legales.
- **Límite del plan aplicado de verdad**: al llegar al cupo de su plan (25/50/100/200), la base rechaza el producto siguiente con un mensaje claro. La barra del plan en el panel muestra cuánto lleva (ej: "vas 4 de 50 productos"), **avisa al 80% del cupo** y recuerda el vencimiento del pago, con el contacto de POPUPS para subir de plan.
- Cambios de plan, bloqueos y bajas que hagas desde la Consola se reflejan al instante en el panel del dueño (la demo @juan y @mariela ya están migradas con sus claves `juan-demo` y `mariela-demo`).
- Los pedidos entrantes, compras del newsletter y finanzas se guardan en la nube con el stock validado en la base.

## v0.4.0 · 2026-09-07
- **Las tiendas vendidas viven en la nube (Supabase)**: cada tienda vendida (Juan, Mariela, las que vengas) abre su catálogo real desde la nube, separado del resto. Cada una con sus productos, colores, textos y legales propios.
- **Puerta por impago real (multi-dispositivo)**: el bloqueo de una tienda suspendida o dada de baja ahora lo decide la nube — funciona desde cualquier celular o computadora, no solo donde se abrió la consola. Al regularizar el pago, la tienda vuelve sola.
- **Compras y newsletter en la nube**: el checkout valida stock y precios en la base (si alguien compra desde dos dispositivos a la vez, la base descuenta una sola vez el stock real) y registra cliente, pedido y finanzas en la nube.
- Los precios de costo/mayorista no se exponen en la vitrina pública.
- La demo local (sin `?tienda=`) sigue funcionando igual, y las tiendas aún no migradas conservan el comportamiento anterior.

## v0.3.0 · 2026-09-07
- **Fotos aligeradas solas al subir**: toda foto (productos, comprobantes y logo) pasa por un optimizador que la deja liviana sin pérdida visible — máximo 1400 px por lado, calidad ~82% en WebP (JPEG si el navegador no lo soporta). Una foto de 4 MB del celular queda en ~100 KB, y la tienda carga mucho más rápido.
- Las fotos que ya son chicas se guardan tal cual (no se tocan). El mensaje de éxito muestra cuánto se redujo: "Imagen lista ✓ · 4,2 MB → 98 KB".
- Los PNG con transparencia (logos) conservan su fondo transparente.

## v0.2.0 · 2026-09-07
- **Puerta POPUPS (suspensión por falta de pago)**: cada tienda vendida se abre con su link `?tienda=<dueño>`. Si POPUPS la bloquea (impago o baja) desde la Consola POPUPS, la página entera muestra el cartel de suspendida y no vende ni edita. Al regularizar, vuelve sola.
- El estado de cada tienda lo administra POPUPS desde la Consola (altas, pagos +30 días, bloqueos, bajas).

## v0.1.1 · 2026-09-07
- Ficha de estándar POPUPS (`popups.app.json`) para detección automática de versiones en la Consola.
