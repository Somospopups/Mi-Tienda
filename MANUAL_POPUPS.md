# Manual de operación · Mi-Tienda / POPUPS

## 1. Abrir una tienda

- Una URL sin `?tienda=` abre la demo local; úsala para explorar la interfaz, no para operar datos de un cliente.
- `?tienda=<slug>` abre una tienda cloud. El slug, el catálogo y el estado del servicio se consultan en Supabase.
- Si la nube no responde, la página muestra un error y permite reintentar. No uses ni aceptes datos de la demo como reemplazo de una tienda cloud.
- El dueño entra desde `?tienda=<slug>#admin` con la clave propia de su comercio.

## 2. Acceso del dueño

La clave del dueño se valida en la RPC `api_panel`. En cloud, el navegador conserva la clave solo en memoria durante esa sesión; al recargar se solicita otra vez. No la compartas por comentarios, capturas, documentos públicos o correo sin protección.

La consola no puede recuperar una clave existente. Si se pierde, la persona autorizada debe rotarla desde POPUPS y entregar la nueva clave una sola vez por un canal acordado con el cliente. La guía PDF de bienvenida no incluye claves.

## 3. Consola POPUPS

1. En la pantalla de acceso, abrir **Acceso POPUPS · administración**.
2. Ingresar la clave central. La valida Supabase mediante `api_admin`; no es la clave de un dueño.
3. Revisar el listado, cambiar fecha/estado/frente y guardar.
4. Para crear una tienda, completar comercio, slug, titular, WhatsApp y vencimiento. Se puede ingresar una clave de dueño de 12–64 caracteres o dejarla vacía para generarla con el generador criptográfico del navegador.
5. La clave inicial aparece en un diálogo de entrega única. Copiarla y entregarla al dueño antes de cerrar el diálogo.
6. Para rotar, usar **Rotar clave** y guardar la nueva clave mostrada una sola vez. La anterior deja de funcionar.
7. Para cambiar la vidriera, seleccionar el frente y usar **Guardar**. El nuevo valor se guarda en la configuración cloud.

Si la consola informa que falta la acción de vidriera, significa que la migración aún no está instalada. No intentes evitarlo con almacenamiento local.

## 4. Supabase y seguridad

- `supabase/super-admin-secure.sql`: restaura las ocho RPC de tienda desde el snapshot del repo, quita el antiguo helper de clave global, endurece `api_admin`, aplica límites de intentos y añade `set_storefront`.
- `supabase/rotate-admin-pin.template.sql`: instrucciones de rotación sin una clave real. Generar una nueva fuera del repo y actualizar el hash de `config.admin_pin` desde un entorno autorizado.
- Revisar primero `supabase/schema-real.sql` y comparar las definiciones actuales de producción con la migración.
- La migración no debe ejecutarse desde `PUBLICAR.bat` ni desde el navegador. Este paquete solo la entrega para revisión y aplicación explícita.
- Los archivos y commits históricos pueden conservar referencias ya retiradas. No reescribir la historia compartida; rotar cualquier secreto que haya podido quedar expuesto.

## 5. Desarrollo y publicación

Usa `AGENTS.md` como reglas de contribución. Antes de publicar:

```bash
npm run check:syntax
npm run test:release -- --reporter=line
```

En Windows, `PUBLICAR.bat` hace `git fetch`, guarda/restaura los cambios locales alrededor del rebase de `origin/main`, valida los flujos vigentes, y pide confirmación antes del commit y el push normal. Si hay conflictos o fallan esas pruebas, se detiene; no fuerza el push ni aplica SQL. `npm test -- --reporter=line` ejecuta además specs históricos que todavía requieren migración.
