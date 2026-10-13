# AGENTS.md — Mi-Tienda (POPUPS)

Reglas de trabajo para cualquier persona o agente que modifique este repositorio.

## 1. Git y publicación

- Antes de crear un commit, ejecutar `git fetch origin` y sincronizar con `origin/main` mediante `git rebase origin/main`.
- Si el rebase presenta conflictos, detenerse y resolverlos sobre el árbol actual. No sobrescribir `index.html` con otra copia.
- Nunca usar `git push --force` ni reescribir la historia compartida.
- Revisar `git status` y el diff antes de confirmar cambios; no incluir `.env`, credenciales, tokens, dumps de navegador ni artefactos de prueba.

## 2. `index.html` es un monolito sensible

- No ejecutar Prettier, Beautify, `js-beautify` ni otro formateador sobre `index.html` o los scripts embebidos.
- Hacer cambios pequeños y localizados, verificando cada ancla antes de escribir.
- El bloque jsPDF contiene HTML dentro de una cadena JavaScript. Mantener escapado el cierre de script (`<\\/script>`) y no insertar saltos de línea dentro de esa cadena.
- Extraer y comprobar la sintaxis de cada `<script>` inline antes de publicar.

## 3. Seguridad

- No guardar, imprimir, comentar ni enviar a logs credenciales, PIN, claves de propietario, hashes ni tokens. Si aparecen en un archivo, no copiar sus valores: retirar la exposición y coordinar una rotación fuera del repositorio.
- No usar autenticación secreta en el cliente, bypass compartidos, valores de respaldo, credenciales por defecto para tiendas cloud ni relays de datos de terceros.
- `?tienda=<slug>` siempre usa Supabase. Ante error de RPC, tienda inexistente o servicio suspendido, mostrar un estado claro; nunca sustituirla por la demo local.
- Las claves cloud se validan mediante RPC. No persistir la clave del dueño ni la clave central en `localStorage`, `sessionStorage`, documentos o PDF. Las claves nuevas se revelan una sola vez.
- La demo sin `?tienda=` es independiente y local; no debe compartir ni sobrescribir datos de tiendas cloud.
- Revisar cualquier SQL antes de empaquetarlo. No ejecutar migraciones en producción sin autorización explícita.

## 4. Pruebas

```bash
npm run check:syntax
npm run test:release -- --reporter=line
```

`npm test -- --reporter=line` conserva la suite histórica completa; varios specs esperan flujos de UI y persistencia ya retirados y deben migrarse antes de usarlos como gate. No considerar exitosa una prueba porque la demo local cargó cuando se esperaba una tienda cloud. Si una prueba depende de Supabase, interceptar/mockear las RPC de forma explícita.

## 5. Versionado

- El contador publicado está en el pie de página de `index.html` (`vNN`).
- Incrementar ese contador, `package.json` y el encabezado correspondiente de `CHANGELOG.md` juntos.
- Si se modifican parámetros de caché versionados, sincronizarlos con el mismo número.

## 6. Entrega

- `PUBLICAR.bat` es una ayuda local: valida sintaxis y tests, sincroniza `main`, solicita confirmación y prepara el commit/push normal. No contiene claves ni aplica SQL.
- La migración `supabase/super-admin-secure.sql` y la plantilla de rotación se entregan para revisión/aplicación explícita; no se conectan a producción desde este entorno.
