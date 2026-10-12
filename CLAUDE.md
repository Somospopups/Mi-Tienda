# CLAUDE.md

**Leé y seguí [`AGENTS.md`](AGENTS.md) antes de tocar cualquier archivo.** Contiene las reglas completas de este repo.

Resumen de las tres que ya causaron problemas (rompen la app si las incumplís):

1. **`git fetch` + `git rebase origin/main` antes de cada commit.** Este repo lo editan dos AIs en paralelo sobre el mismo monolito `index.html`; empujar desde un árbol viejo o regenerar `index.html` completo desde una copia propia **borra el trabajo del otro**. Ediciones puntuales sobre el archivo actual, siempre.
2. **No corras ningún formatter sobre `index.html`** (Prettier/Beautify/js-beautify). Inserta saltos de línea dentro del string de jsPDF y rompe la carga de todas las páginas con `SyntaxError`.
3. **Cero secretos en texto plano.** Validar solo por hash vía `mtMasterKeyOk()` / `mtSuperKeyOk()` (`MT_MASTER_SHA256` / `MT_SUPER_SHA256`), incluidos los comentarios.

Antes de empujar: 7/7 bloques `node --check` + `npx playwright test master-key login-hint smoke`.
