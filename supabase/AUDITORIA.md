# Auditoría de seguridad · Mi-Tienda

## Alcance

Revisión estática del frontend, la documentación y los SQL versionados. No se accedió a la consola de Supabase ni se hicieron cambios en producción.

## Hallazgos corregidos en el repositorio

- Retirada la autenticación global que aceptaba una clave de POPUPS para abrir cualquier tienda. `supabase/master-key.sql` ahora es un aviso deprecado que falla intencionalmente.
- La ruta cloud ya no cae a un catálogo o sesión de demo cuando `api_public` o una RPC de administración no responde.
- Eliminada la persistencia de la clave del dueño cloud en Web Storage y su inclusión en la guía PDF. La sesión cloud queda en memoria y requiere volver a ingresar al recargar.
- Retirados los relays públicos de catálogo y la consola POPUPS guardada localmente como fuente de verdad.
- Preparada `super-admin-secure.sql` con autenticación por hash, limitación de intentos, rotación de claves y soporte de frentes. No fue aplicada.
- Actualizados los textos de operación para no publicar credenciales de prueba ni hashes.

## Riesgos que siguen requiriendo operación

- La historia compartida de Git no fue reescrita. Los archivos actuales están saneados, pero el historial puede conservar material retirado; no se hizo `push --force`.
- No se rotaron claves ni hashes en Supabase. Una persona autorizada debe rotar cualquier credencial que haya podido quedar expuesta y confirmar que la anterior ya no funciona.
- `super-admin-secure.sql` restaura ocho RPC según `schema-real.sql`. Comparar primero cada función con el esquema real de producción y revisar `GRANT`, RLS, `pgcrypto` y la confianza de las cabeceras que usa el limitador de intentos.
- El frontend contiene configuración pública necesaria para invocar Supabase. Debe ser una clave publicable/anon con permisos restringidos por RLS y RPC; no colocar claves de servicio en el cliente.

## Validación pendiente de producción

Después de la revisión y aplicación autorizada, probar con cuentas controladas: RPC disponible/no disponible, clave válida e inválida, tienda activa/suspendida/inexistente, creación/rotación de dueño, cambio de frente y actualización desde más de un dispositivo. No probar con credenciales reales en tests compartidos ni pegar secretos en reportes.
