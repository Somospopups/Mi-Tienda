// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Constructor de página v0.14 (estilo Google Sites) — demo offline, sin ?tienda=
 *
 * Cubre el modo de armar el home por bloques + complementos:
 *  - el botón "Bloques" de la barra de edición abre el panel lateral
 *  - agregar complementos (Portada, Productos) y guardar persiste `builderBlocks`
 *  - con bloques guardados, el home armado reemplaza al hogar clásico y al catálogo
 *  - los complementos Oferta y Testimonios renderizan desde sus propiedades
 *  - reordenar, duplicar y eliminar bloques persiste el orden final
 *  - editar las propiedades de un bloque guarda el texto nuevo
 * El store offline se siembra con la forma completa que espera la app.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Limpieza sólo en la primera carga del test: las navegaciones posteriores
    // (seed + reload) tienen que conservar el store ya sembrado.
    if (!sessionStorage.getItem('__mt_builder_clean')) {
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
      try { sessionStorage.setItem('__mt_builder_clean', '1'); } catch (_) {}
    }
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|net::ERR/i.test(msg.text())) errors.push(msg.text());
  });
  // @ts-ignore
  page.__jsErrors = errors;
});

function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

const STORE_KEY = 'luma_offline_store_v1';

/** Siembra `builderBlocks` sobre el store offline (que ya trae los defaults de la demo). */
async function seedBlocks(page, blocks) {
  await page.goto('/index.html');
  await expect(page.locator('#shopApp')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(
    ([key, json]) => {
      const base = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...base, content: { ...(base.content || {}), builderBlocks: json } }));
    },
    [STORE_KEY, JSON.stringify(blocks)]
  );
  await page.reload();
  await expect(page.locator('#shopApp')).toBeVisible({ timeout: 15_000 });
}

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

async function enterEditMode(page) {
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
}

test('1 · El botón "Bloques" abre el panel lateral y los complementos se agregan y se guardan', async ({ page }) => {
  await enterEditMode(page);
  // El panel lateral arranca oculto y se abre desde la barra de edición.
  await expect(page.locator('.bl-panel')).toBeHidden();
  await page.locator('[data-mt-blocks]').click();
  await expect(page.locator('.bl-panel')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/bl-editing/);
  // Los complementos pedidos están en el panel.
  for (const name of ['Portada', 'Oferta', 'Testimonios', 'Video', 'Productos', 'Banner']) {
    await expect(page.locator('.bl-panel .bl-card', { hasText: name }).first()).toBeVisible();
  }

  // Portada: se agrega y abre el editor del bloque.
  await page.locator('[data-bl-add="hero"]').click();
  await expect(page.locator('.bl-editor')).toHaveClass(/open/);
  await expect(page.locator('#blEditorTitle')).toHaveText('Editar · Portada');
  await page.locator('[data-bl-editor-save]').click();
  await expect(page.locator('.bl-block[data-bl-index="0"] .bl-hero')).toBeVisible();

  // Productos: bloque con los productos de la tienda.
  await page.locator('[data-bl-add="products"]').click();
  await page.locator('[data-bl-editor-save]').click();
  await expect(page.locator('.bl-block[data-bl-index="1"] .bl-products')).toBeVisible();

  // Quedó persistido en el store offline.
  const stored = await page.evaluate(
    (key) => JSON.parse(JSON.parse(localStorage.getItem(key)).content.builderBlocks),
    STORE_KEY
  );
  expect(stored).toHaveLength(2);
  expect(stored.map((b) => b.type)).toEqual(['hero', 'products']);
  expect(stored[0].id).toMatch(/^bl-/);

  // "Terminar" sale del modo edición y el panel se oculta…
  await page.locator('[data-mt-done]').click();
  await expect(page.locator('body')).not.toHaveClass(/bl-editing/);
  await expect(page.locator('.bl-panel')).toBeHidden();
  await expect(page.locator('.mt-edit-bar')).toBeHidden();
  // …pero el home armado queda publicado.
  await expect(page.locator('body')).toHaveClass(/mt-page/);
  await expect(page.locator('#frontBuilder')).toBeVisible();
  await expect(page.locator('.luma-front').first()).toBeHidden();
  expectNoPageErrors(page);
});

test('2 · Con página guardada, el home armado reemplaza al clásico y el catálogo se abre a demanda', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'bl-x1', type: 'offer', props: { title: 'OFERTA DE LA SEMANA', off: '20', note: 'Descuentos en el catálogo', btnText: 'Ver ofertas', bg: '#b91c1c' } },
    { id: 'bl-x2', type: 'hero', props: { title: 'Mi título', subtitle: 'Subtítulo', tone: 'dark', height: '', bg: '#141a2e', overlay: 45, btnText: 'Ver catálogo' } },
    { id: 'bl-x3', type: 'testimonial', props: { title: 'Lo que dicen', items: 'Lu | Cliente hace 1 año | El mejor empaque.\nMar | Cliente hace 6 meses | Todo perfecto.' } }
  ]);

  await expect(page.locator('body')).toHaveClass(/mt-page/);
  await expect(page.locator('#frontBuilder')).toBeVisible();
  await expect(page.locator('.luma-front').first()).toBeHidden();
  await expect(page.locator('#frontOfertas')).toBeHidden();
  await expect(page.locator('#coleccion')).toBeHidden();
  await expect(page.locator('.bl-offer')).toBeVisible();
  await expect(page.locator('.bl-offer h3')).toHaveText('OFERTA DE LA SEMANA');
  await expect(page.locator('.bl-offer-badge')).toContainText('-20% OFF');
  await expect(page.locator('.bl-hero h2')).toHaveText('Mi título');
  await expect(page.locator('.bl-testi-grid .bl-testi-card')).toHaveCount(2);

  // El catálogo sigue alcanzable desde un botón de la página (se muestra a demanda).
  await expect(page.locator('body')).not.toHaveClass(/show-catalog/);
  await page.locator('.bl-offer a[href="#coleccion"]').click();
  await expect(page.locator('body')).toHaveClass(/show-catalog/);
  await expect(page.locator('#coleccion')).toBeVisible();
  expectNoPageErrors(page);
});

test('3 · Editar las propiedades de un bloque guarda el texto nuevo', async ({ page }) => {
  await seedBlocks(page, [{ id: 'bl-t1', type: 'text', props: { title: 'Título viejo', body: 'Cuerpo viejo' } }]);
  await expect(page.locator('.bl-text h3')).toHaveText('Título viejo');

  await enterEditMode(page);
  await page.locator('[data-mt-blocks]').click();
  await page.locator('.bl-block[data-bl-index="0"] .bl-ctl [data-bl-edit="0"]').click();
  await expect(page.locator('.bl-editor')).toHaveClass(/open/);
  await expect(page.locator('#blEditorTitle')).toHaveText('Editar · Texto');
  await page.locator('.bl-editor input[name="title"]').fill('Título nuevo');
  await page.locator('.bl-editor textarea[name="body"]').fill('Cuerpo nuevo');
  await page.locator('[data-bl-editor-save]').click();
  await expect(page.locator('.bl-editor')).not.toHaveClass(/open/);

  const stored = await page.evaluate(
    (key) => JSON.parse(JSON.parse(localStorage.getItem(key)).content.builderBlocks),
    STORE_KEY
  );
  expect(stored[0].props.title).toBe('Título nuevo');
  expect(stored[0].props.body).toBe('Cuerpo nuevo');
  await expect(page.locator('.bl-text h3')).toHaveText('Título nuevo');
  expectNoPageErrors(page);
});

test('4 · Reordenar, duplicar y eliminar bloques persiste el resultado', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'bl-a', type: 'text', props: { title: 'A', body: 'primero' } },
    { id: 'bl-b', type: 'text', props: { title: 'B', body: 'segundo' } }
  ]);
  await expect(page.locator('#frontBuilder .bl-block')).toHaveCount(2);
  await expect(page.locator('.bl-text h3').first()).toHaveText('A');

  await enterEditMode(page);
  await page.locator('[data-mt-blocks]').click();

  // Bajar el primer bloque lo intercambia con el segundo.
  await page.locator('.bl-block[data-bl-index="0"] [data-bl-down="0"]').click();
  await expect(page.locator('.bl-text h3').first()).toHaveText('B');
  // Subirlo de nuevo.
  await page.locator('.bl-block[data-bl-index="1"] [data-bl-up="1"]').click();
  await expect(page.locator('.bl-text h3').first()).toHaveText('A');

  // Duplicar.
  await page.locator('.bl-block[data-bl-index="0"] [data-bl-dup="0"]').click();
  await expect(page.locator('#frontBuilder .bl-block')).toHaveCount(3);

  // Eliminar el duplicado.
  await page.locator('.bl-block[data-bl-index="1"] [data-bl-del="1"]').click();
  await expect(page.locator('#frontBuilder .bl-block')).toHaveCount(2);

  const stored = await page.evaluate(
    (key) => JSON.parse(JSON.parse(localStorage.getItem(key)).content.builderBlocks),
    STORE_KEY
  );
  expect(stored.map((b) => b.id)).toEqual(['bl-a', 'bl-b']);
  expect(new Set(stored.map((b) => b.id)).size).toBe(2);

  await page.locator('[data-mt-done]').click();
  expectNoPageErrors(page);
});

test('5 · Tocar un bloque en modo edición abre su editor, y el catálogo público sigue comprando', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'bl-p1', type: 'products', props: { title: 'Destacados', count: '4' } }
  ]);
  await enterEditMode(page);
  await page.locator('[data-mt-blocks]').click();
  // Click sobre el bloque (no sobre el botón) abre el editor del bloque.
  await page.locator('.bl-block[data-bl-index="0"] .bl-products').click();
  await expect(page.locator('.bl-editor')).toHaveClass(/open/);
  await expect(page.locator('#blEditorTitle')).toHaveText('Editar · Productos');
  // El count es un select, no un input libre.
  await expect(page.locator('.bl-editor select[name="count"]')).toBeVisible();
  await page.locator('[data-bl-editor-save]').click();

  // Fuera del modo edición, el botón de agregar al carrito del bloque funciona para el público.
  await page.locator('[data-mt-done]').click();
  const addBtn = page.locator('#frontBuilder [data-add-product]').first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.locator('#cartCount')).toHaveText('1');
  expectNoPageErrors(page);
});

test('6 · El panel y el editor se abren sin taparse ni tapar la barra de edición', async ({ page }) => {
  const box = async (sel) => page.locator(sel).first().boundingBox();
  const vw = page.viewportSize().width;
  await seedBlocks(page, [
    { id: 'bl-l1', type: 'hero', props: { title: 'Título', subtitle: 'Subtítulo', tone: 'dark', height: '', bg: '#141a2e', overlay: 45, btnText: 'Ver catálogo' } },
    { id: 'bl-l2', type: 'offer', props: { title: 'OFERTA', off: '30', note: 'nota', btnText: 'Ver ofertas', bg: '' } },
    { id: 'bl-l3', type: 'testimonial', props: { title: 'Clientes', items: 'Lu | Cliente | Muy bueno\nMar | Cliente | Perfecto' } }
  ]);

  // El home publicado no genera scroll horizontal y los bloques salen apilados.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'scroll horizontal en el home armado').toBeLessThanOrEqual(1);
  const hero = await box('.bl-hero');
  const offer = await box('.bl-offer');
  const testi = await box('.bl-testi');
  expect(offer.y, 'los bloques se apilan').toBeGreaterThan(hero.y);
  expect(testi.y).toBeGreaterThan(offer.y);
  // Las tarjetas de testimonio van en grilla, en paralelo.
  const cards = [];
  for (const loc of await page.locator('.bl-testi-card').all()) cards.push(await loc.boundingBox());
  expect(cards).toHaveLength(2);
  expect(Math.abs(cards[0].y - cards[1].y), 'tarjetas en paralelo').toBeLessThan(4);
  expect(cards[1].x, 'la segunda tarjeta a la derecha').toBeGreaterThan(cards[0].x);

  await enterEditMode(page);
  await page.locator('[data-mt-blocks]').click();
  await expect(page.locator('.bl-panel')).toBeVisible();
  const panel = await box('.bl-panel');
  expect(panel.x + panel.width, 'el panel abre contra el borde derecho').toBeGreaterThan(vw - 8);
  expect(panel.height).toBeGreaterThan(300);
  // El editor arranca fuera de pantalla.
  expect((await box('.bl-editor')).x, 'el editor arranca fuera de pantalla').toBeGreaterThan(vw);

  // Se abre a la izquierda del panel, debajo de la barra de edición (que tiene z-index 1080).
  await page.locator('.bl-block[data-bl-index="1"] .bl-ctl [data-bl-edit="1"]').click();
  await expect(page.locator('.bl-editor')).toBeVisible();
  const panelOpen = await box('.bl-panel');
  // El drawer entra con transition de transform: se espera al final del recorrido.
  await expect.poll(async () => {
    const e = await box('.bl-editor');
    return Math.round(e.x + e.width);
  }, { timeout: 5000 }).toBe(Math.round(panelOpen.x));
  const editor = await box('.bl-editor');
  expect(editor.x, 'el editor abre a la izquierda del panel').toBeLessThan(panelOpen.x);
  expect(editor.y, 'el editor arranca debajo de la barra').toBeGreaterThanOrEqual(46);
  await expect(page.locator('.bl-editor input[name="off"]')).toBeVisible();

  // Regresión: la × del editor se puede tocar (antes la barra la interceptaba).
  await page.locator('[data-bl-editor-close]').click();
  await expect(page.locator('.bl-editor')).not.toHaveClass(/open/);
  await expect.poll(async () => (await box('.bl-editor')).x, { timeout: 5000 }).toBeGreaterThan(vw);

  // Y con panel + editor abiertos tampoco hay scroll horizontal.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator('[data-mt-done]').click();
  await expect(page.locator('.bl-panel')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/bl-editing/);
  expectNoPageErrors(page);
});
