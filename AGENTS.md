# AGENTS.md — Mi-Tienda (POPUPS)

Reglas para cualquier IA que trabaje en este repositorio.

> **Este repo lo editan dos AIs en paralelo.** `index.html` es un monolito único (~11.850 líneas, 7 bloques `<script>` embebidos) que comparten. Si lo regenerás desde una copia propia, borrás el trabajo del otro. Eso ya pasó 3 veces.

---

## 1. Git: nunca empujes desde un árbol viejo

Antes de **cada** commit:

```bash
git fetch origin
git rebase origin/main
```

Y después de cada push, **re-verificá que tu trabajo siga presente** (ver §5). Si `origin/main` avanzó mientras trabajabas, re-aplicá tus ediciones de forma quirúrgica sobre el archivo actual — **nunca** sobrescribas `index.html` completo con una copia local o una plantilla.

## 2. `index.html` es intocable por formateadores

**No corras Prettier, Beautify, js-beautify ni ningún formatter sobre `index.html`**, ni sobre su contenido embebido.

El blob de jsPDF (bloque 4) contiene HTML dentro de un *string* JS:

```js
...");<\/script></body></html>"
```

Un formateador HTML inserta saltos de línea ahí dentro y rompe la carga de **todas** las páginas con `SyntaxError: Invalid or unexpected token` en cada carga. Pasó dos veces. Si necesitás formatear, hacelo en archivos `.js`/`.css` separados, nunca en `index.html`.

## 3. Ningún secreto en texto plano

- Comparar credenciales **solo por hash**. Ya existen los helpers `mtMasterKeyOk()` / `mtSuperKeyOk()` con las constantes `MT_MASTER_SHA256` y `MT_SUPER_SHA256`. Usá esas funciones en vez de comparar strings.
- Si necesitás validar una clave nueva, agregá **su SHA-256**, nunca el literal.
- Clave maestra POPUPS (SHA-256): `96267c2a75df89fc32304b48d05086d1ce3332f85784e65131bafeb09ffe137e`
- Clave Super Admin (SHA-256): `f7796b2c18e2649e197e0eba2e1a66b91a95f40b5944f2b4156aaed4b29bd58d`

Para verificar que no quedó nada en texto (debe dar **0**). Ojo: `Select-String` es *case-insensitive* por defecto y acá matchea base64, keyframes y `populateFinanceForm` → **siempre usá `-CaseSensitive`**, si no te da ~18 falsos positivos:

```bash
Select-String -Path index.html -CaseSensitive -Pattern "Ger\d{5,7}|Ger[A-Z0-9]{7,11}|Pop[A-Z0-9]{9,12}"
```

Tampoco escribas claves en comentarios, atributos HTML ni CSS (también pasó).

## 4. Versionado

- **Fuente de verdad:** el `<span>vNN</span>` del footer en `index.html`. Sube de 1 en 1, sin puntos (`v77` → `v78`).
- Si rompés caché de CSS/JS, actualizá el query string `?v=` en `index.html` con el **mismo** número.
- Espejá el mismo número en `package.json` (`version`) y en una entrada nueva de `CHANGELOG.md` (`## v0.NN.0 (vNN) · fecha · título`).
- Cada cambio publicado consume un número. El esquema viejo `v1.38.x` usaba el minor como contador (`v1.38.2` ≡ `v38`).

## 5. Chequeo previo al push (obligatorio)

El CI de GitHub **corre después del push** y no bloquea nada — vos tenés que correrlo antes:

```bash
# 1. sintaxis de los 7 bloques embebidos
node --check <bloque.js>   # (extraé cada <script> sin src)

# 2. tests mínimos
npx playwright test master-key login-hint smoke --reporter=line
```

Verde esperado: **7/7 bloques** y **5/5 + smoke 1**.

Comprobación rápida de que no revertiste nada:

| Chequeo | Esperado |
|---|---|
| Footer | `<span>vNN</span>` con tu número |
| `MT_MASTER_SHA256` | presente |
| `mtMasterKeyOk` | ≥ 1 referencias |
| Claves en texto plano | 0 |
| Bloque jsPDF (`new Function`) | OK |
| Errores en consola | 0 |

### Conocido y preexistente (no lo persigas)

- ~61 tests del rebase v45-v64 y `cloud-down` vienen rojos desde antes; no son tuyo salvo que los toques.
- Suelen fallar los backends secundarios `kvdb.io` / `restful-api.dev` (abort en el `beforeEach`).

## 6. Al empujar

Si otro AI empujó mientras trabajabas, **rebaseá, re-aplicá tus ediciones puntuales, re-verificá (§5) y recién entonces empujá.** Nunca `--force`. Después del deploy de GitHub Pages (~1 min), confirmá el sitio real con Playwright: versión, 0 claves en texto, jsPDF OK, 0 errores de consola.
