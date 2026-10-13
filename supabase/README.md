# Supabase · Mi-Tienda

Este directorio contiene el snapshot del esquema, contratos de RPC, migraciones opcionales y notas de auditoría. Ninguna herramienta de este repo aplica SQL automáticamente.

## Archivos

- `schema-real.sql`: snapshot versionado del esquema usado como referencia; antes de migrar, compararlo con las definiciones reales del proyecto Supabase.
- `super-admin-secure.sql`: migración propuesta. Restaura las ocho RPC de tienda desde el snapshot sin el helper de clave global, sustituye `api_admin`, limita intentos de consola, y añade lectura/actualización de la vidriera.
- `rotate-admin-pin.template.sql`: instrucciones comentadas para rotar el hash de la clave central sin guardar un valor real en Git.
- `master-key.sql`: archivo retirado que falla deliberadamente si se intenta aplicar. No usar.
- `api_key_change.sql`: RPC opcional para que el dueño cambie su propia clave. Revisar su política de longitud y grants antes de instalar.
- `alta-cliente.sql`, `export.sql`, `limpieza-pruebas.sql` y los demás scripts: utilidades históricas; leer cada archivo y verificar su alcance antes de ejecutar.

## Procedimiento seguro

1. Obtener una exportación actual de funciones, tablas, grants y políticas desde el proyecto correcto.
2. Comparar la exportación con `schema-real.sql` y con `super-admin-secure.sql`. La migración reemplaza funciones de autenticación; si producción ha cambiado desde el snapshot, reconciliar los cambios antes de continuar.
3. Hacer copia de seguridad y acordar ventana de mantenimiento.
4. Aplicar primero la migración segura mediante una persona autorizada y verificar inicio de sesión, rechazo de clave incorrecta, tienda inexistente/suspendida, creación/rotación y selección de vidriera.
5. Rotar la clave central y cualquier credencial histórica expuesta de forma independiente. No seleccionar, imprimir ni enviar hashes o claves al chat.
6. Si una operación no puede validarse, detenerse; no restaurar el bypass ni sustituir datos cloud por la demo.

## No realizado

El asistente no tiene acceso de escritura al proyecto Supabase. La migración y la rotación quedan preparadas para revisión/aplicación explícita; no se afirma que producción haya sido modificada.
