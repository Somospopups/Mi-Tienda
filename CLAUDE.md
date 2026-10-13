# Guía para asistentes de código

1. Leer `AGENTS.md` antes de editar.
2. Tratar `index.html` como monolito: cambios puntuales, sin formateadores, y validar todos los scripts inline.
3. No copiar credenciales, PIN, hashes o tokens a la respuesta, comandos visibles, logs ni archivos. Si se detecta una exposición, retirarla y recomendar rotación; no afirmar que se rotó sin acceso confirmado.
4. No reintroducir bypass de cliente, autenticación compartida, persistencia de claves cloud ni relays externos.
5. Una URL `?tienda=` nunca cae a datos de demo/local si Supabase falla.
6. No aplicar SQL a producción sin autorización explícita. Mantener las migraciones revisables y sin secretos.
7. Antes de commit, `git fetch origin` y `git rebase origin/main`; nunca `push --force`.
8. Sincronizar el número del footer, `package.json` y `CHANGELOG.md`; ejecutar `npm run check:syntax` y las pruebas de Playwright.
