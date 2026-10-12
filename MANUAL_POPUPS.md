# POPUPS Business Platform · Manual Maestro de Arquitectura y Operaciones

> **IMPORTANTE PARA CUALQUIER AGENTE / MODELO DE INTELIGENCIA ARTIFICIAL:**  
> Este documento define las reglas de negocio, la arquitectura inviolable del sistema, el flujo de desarrollo para nuevos clientes y el protocolo estricto de entrega mediante `PUBLICAR.bat`. Cualquier modificación en este repositorio DEBE respetar estas directivas.

---

## 1. El Modelo de Negocio de POPUPS

POPUPS es una plataforma de software e infraestructura para vender tiendas web autogestionables a diversos comercios (tecnología, indumentaria, gastronomía, ferretería, servicios, etc.).

- Cada cliente recibe su enlace personalizado con su propio identificador:  
  `https://somospopups.github.io/Mi-Tienda/?tienda=<identificador-del-cliente>`
- La vidriera de cada cliente se **diseña y personaliza a medida** en conjunto con él.
- El cliente tiene autonomía total para gestionar sus productos, precios, fotos, pedidos y cobros desde su propio panel administrativo (`#admin`).
- El desarrollador (POPUPS) tiene control centralizado a través de su **Super Admin Secreto** (clave hasheada, no va en el manual).

---

## 2. Los 3 Pilares Sagrados e Intocables (Core Inviolable)

Bajo ninguna circunstancia ni actualización se deben alterar o romper estos 3 pilares estructurales:

### Pilar 1: La Cabecera Superior de la Vidriera (`#siteHeader` / `.tf-head`)
- **Navegación fluida y rápida**: Categorías dinámicas clickeables con desplazamiento táctil suave.
- **Acciones directas fijas**:
  - Acceso directo al Carrito de compras con contador en tiempo real (`#cartButton` / `#tfCart`).
  - Buscador predictivo en vivo (`#tfSearch` / `#searchInput`).
  - Botón de acceso al Panel de Administración (`#tfAdmin` / `#adminButton`).
- **Comportamiento**: Sticky responsivo al hacer scroll, sin oscilaciones ni temblores (`jitter`), optimizado para no ocupar espacio excesivo en celulares.

### Pilar 2: El Pie de Página Oficial POPUPS (`.footer-bottom`)
- **Firma de autoría no invasiva**:
  - Sello en cápsula moderna con motion graphics: **Aurora Glow Glass**.
  - Texto exacto en mayúsculas: `DESARROLLADO POR` seguido del **Isotipo oficial de POPUPS** (contorno blanco nítido, letra P blanca y punto verde lima fluorescente brillante `#bbf426`).
  - Enlace oficial externo clickeable: `https://somospopups.netlify.app/` (abre en pestaña nueva con `target="_blank" rel="noopener"`).
  - Centrado simétrico y armónico en celulares junto con el copyright de la tienda y la versión del sistema.

### Pilar 3: El Panel de Administración Universal (`#adminApp`)
- **Acceso Privado Neutro (`#adminLogin`)**:
  - Encabezado corporativo universal: `🔒 ACCESO PRIVADO · ADMINISTRACIÓN`.
  - **Sin logos de tiendas específicas ni marcas particulares**: es exactamente la misma pantalla ejecutiva para todos los clientes del mundo.
  - Fotografía institucional de arquitectura/oficinas modernas en el lateral derecho con la premisa:  
    *"Todo tu negocio en orden. Decisiones con claridad."*
- **Ingreso del Dueño del Comercio**:
  - En la **demo local** (sin `?tienda=`): clave universal inicial **`1234`**; al ingresar, el sistema despliega el popup para que configure su clave personal.
  - En una **tienda real** (`?tienda=…`): el dueño entra con su **Clave de acceso** que le entregó POPUPS. El login se valida SIEMPRE contra la nube (Supabase); no hay acceso offline al panel.
- **Panel Maestro de Desarrollador / Super Admin**:
  - Acceso con la clave de desarrollador de POPUPS (guardada como hash, no en texto).
  - Tabla de control de tiendas: Nombre del Comercio, Nombre del Titular, Frente asignado (exclusivo para el desarrollador, oculto del cliente), Fecha de Vencimiento, Estado (activa/suspendida), Clave elegida por el cliente (modo solo lectura), botón para **Blanquear** la clave a `1234`, botón directo a WhatsApp del titular y botón para copiar el enlace de la tienda.
  - Guardado rápido fila por fila con el botón de tilde (`✓`).
- **Clave Maestra Universal (POPUPS)**:
  - Una clave única de POPUPS permite ingresar a cualquier tienda. Se compara por hash (SHA-256 en el frontend, bcrypt en Supabase) — no está en texto en el código ni en el manual.

---

## 3. Protocolo Estricto de Entrega con `PUBLICAR.bat` (Flujo de Trabajo del Usuario)

El usuario tiene un método de publicación automatizado, simple y cómodo en Windows basado en un archivo `.bat`:

### ¿Cómo funciona el paquete de actualización?
1. Cada entrega se empaqueta en un archivo ZIP descargable:  
   `/home/user/actualizacion-mi-tienda-v0.16.0.zip`
2. El ZIP contiene una carpeta con:
   - `PUBLICAR.bat`: Script batch para Windows de 1 solo clic.
   - `cambio-v0.16.0.bundle`: Git bundle autocontenido con los commits generados sobre el último commit remoto de `origin/main`.
   - `LEEME.txt`: Breve instrucción explicativa.
3. El usuario simplemente:
   - Descarga el ZIP.
   - Descomprime la carpeta.
   - Hace **doble clic en `PUBLICAR.bat`**.
   - El script clona en `%TEMP%`, aplica los cambios automáticamente y ejecuta `git push origin main`.
   - En 1 minuto, GitHub Pages publica la nueva versión en la web.

### Reglas críticas para la IA al preparar actualizaciones:
- **Siempre sincronizar contra el último commit de `origin/main`** antes de generar el bundle (`git fetch origin main`), para evitar conflictos de cherry-pick.
- **Incrementar correlativamente la versión** (v55 -> v56 -> v57 -> v58 -> v59...) en el pie de página (`<span>vXX</span>`).
- **Verificar sintaxis con `node --check`** en todos los scripts antes de empaquetar para evitar roturas silenciosas en el navegador del cliente.

---

## 4. Guía para Diseñar una Nueva Vidriera con un Cliente

Cuando se venda una página a un nuevo comercio:
1. **Crear la tienda en el Super Admin** (ingresando con la clave de desarrollador de POPUPS):
   - Asignar Nombre del comercio, Titular, WhatsApp, Slug (ej: `calzados-cordoba`) y fecha de abono.
   - La clave se asigna automáticamente en `1234`.
2. **Definir el Frente de Tienda (`storefront`)**:
   - `tech`: Vidriera tecnológica (como Eze-pece), flat-lay con cambio de categorías y servicio técnico.
   - `luma`: Tienda boutique minimalista con diseño esencial.
   - `ofertas`: Diseño tipo supermercado enfocado en promociones masivas.
   - `gamer`: Estética oscura con alto impacto visual y acentos neón.
   - `libre`: Catálogo abierto y flexible para propósitos generales.
3. **Personalizar el Catálogo y Secciones Intermedias**:
   - El cliente o vos pueden cargar los productos, precios, fotos y descripciones desde el panel de administración.
   - La cabecera superior y el pie de página oficial de POPUPS se mantienen automáticamente intactos.

---
*Documento mantenido y actualizado por POPUPS · Todos los derechos reservados.*
