// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Modo edición visual v0.8 (clic para editar) — demo offline, sin ?tienda=
 *
 * Cubre el ciclo completo del WYSIWYG sobre el home:
 *  - el botón flotante "Editar página" aparece/desaparece según la sesión
 *    (hooks de openAdmin / closeAdmin / invalidateAdminSession)
 *  - entrar al modo edición resalta los nodos editables
 *  - editar un texto del hero, guardar y verificar persistencia en el store offline
 *  - clic sobre una tarjeta de producto abre el editor de producto existente
 *  - la paleta de colores guarda los ajustes
 * Cada test arranca con el almacenamiento limpio y la demo es 100% local.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
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

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

/** Login → Ver tienda → botón flotante visible → modo edición activo. */
async function enterEditMode(page) {
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-float')).toBeVisible();
  await page.locator('.mt-edit-float').click();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
}

test.describe('Modo edición visual (demo offline)', () => {

  test('1 · El botón flotante sigue a la sesión y al modo edición', async ({ page }) => {
    await page.goto('/index.html');
    // sin sesión no aparece
    await expect(page.locator('.mt-edit-float')).toBeHidden({ timeout: 15_000 });

    await loginAdmin(page);
    // dentro del panel queda oculto
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    // al volver a la tienda aparece
    await page.locator('#viewStore').click();
    await expect(page.locator('.mt-edit-float')).toBeVisible();
    // al entrar a modo edición se esconde (queda la barra)
    await page.locator('.mt-edit-float').click();
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    // al terminar vuelve a aparecer
    await page.locator('[data-mt-done]').click();
    await expect(page.locator('.mt-edit-float')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expectNoPageErrors(page);
  });

  test('2 · Editar un texto del hero guarda y persiste en el store offline', async ({ page }) => {
    await enterEditMode(page);
    const nameNode = page.locator('[data-content="heroCardName"]');
    await expect(nameNode).toHaveText('Lámpara Aura');

    await nameNode.click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    const input = pop.locator('input');
    await expect(input).toHaveValue('Lámpara Aura');
    await input.fill('Lámpara Nova');
    await pop.locator('[data-mt-save]').click();

    await expect(nameNode).toHaveText('Lámpara Nova');
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).content.heroCardName);
    expect(persisted).toBe('Lámpara Nova');

    await page.locator('.mt-edit-popover [data-mt-cancel]').click();
    await expect(pop).toBeHidden();
    await page.locator('[data-mt-done]').click();
    await expectNoPageErrors(page);
  });

  test('3 · Clic en una tarjeta de producto abre el editor del panel', async ({ page }) => {
    await enterEditMode(page);
    const firstCard = page.locator('#productGrid .product-card').first();
    const expectedName = (await firstCard.locator('.product-name').textContent()).trim();
    await firstCard.click();
    await expect(page.locator('#productEditorBackdrop')).toBeVisible();
    await expect(page.locator('#productForm input[name="name"]')).toHaveValue(expectedName);

    await page.locator('#closeProductEditor').click();
    await expect(page.locator('#productEditorBackdrop')).toBeHidden();
    await page.locator('[data-mt-done]').click();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expect(page.locator('.mt-edit-float')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('4 · La paleta de colores desde la barra guarda los ajustes', async ({ page }) => {
    await enterEditMode(page);
    await page.locator('[data-mt-colors]').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop.locator('.mt-edit-swatches')).toBeVisible();

    const accent = pop.locator('[data-mt-color="accentColor"]');
    await accent.evaluate((el) => {
      el.value = '#123456';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pop.locator('[data-mt-save]').click();

    await expect(pop.locator('.mt-saved')).toBeVisible();
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings.accentColor);
    expect(persisted.toLowerCase()).toBe('#123456');
    await expect(page.locator('#shopApp')).toBeVisible();
    await page.locator('[data-mt-done]').click();
    await expectNoPageErrors(page);
  });

  test('5 · Cerrar sesión oculta el botón flotante', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('.mt-edit-float')).toBeVisible();

    // volver al panel (navegación por hash, sin recargar) y salir
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminShell')).toBeVisible();
    await page.locator('#logoutButton').click();
    await expect(page.locator('#adminLogin')).toBeVisible();
    // sin sesión el botón queda oculto aunque la tienda esté detrás
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    await expectNoPageErrors(page);
  });

});