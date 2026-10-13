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
  const hint = await page.locator('#loginCloudHint').textContent();
  const demoPin = hint?.match(/\b\d{4}\b/)?.[0];
  expect(demoPin).toBeTruthy();
  await page.locator('#loginForm input[name="pin"]').fill(demoPin);
  await page.locator('#loginForm #btnSubmitLogin').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

/** Login → Ver tienda / Editar → elegir modo → el panel cierra y el modo edición queda activo. */
async function enterEditMode(page) {
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
  await expect(page.locator('#modeChooserBackdrop')).toHaveCount(0);
}

async function saveAndFinishEditMode(page) {
  await page.locator('[data-mt-done]').click();
  await expect(page.locator('#confirmPopover')).toBeVisible();
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

test.describe('Modo edición visual (demo offline)', () => {

  test('1 · El botón flotante sigue a la sesión y "Ver tienda / Editar" entra directo al modo edición', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.mt-edit-float')).toBeHidden({ timeout: 15_000 });

    await loginAdmin(page);
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    await page.locator('#viewStore').click();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await expect(page.locator('#modeChooserBackdrop')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);

    await saveAndFinishEditMode(page);
    await expect(page.locator('#adminShell')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('2 · Editar un texto visible de TECH guarda y persiste en el store offline', async ({ page }) => {
    await enterEditMode(page);
    const titleNode = page.locator('#frontTech [data-content="tchCatsTitle"]');
    await expect(titleNode).toBeVisible();
    const original = (await titleNode.textContent())?.trim() || '';
    const updated = 'Accesorios para tus dispositivos';

    await titleNode.click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    const input = pop.locator('input, textarea').first();
    await expect(input).toHaveValue(original);
    await input.fill(updated);
    await pop.locator('[data-mt-save]').click();

    await expect(titleNode).toHaveText(updated);
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).content.tchCatsTitle);
    expect(persisted).toBe(updated);

    if (await pop.isVisible()) await pop.locator('[data-mt-cancel]').click();
    await expect(pop).toBeHidden();
    await saveAndFinishEditMode(page);
    await expectNoPageErrors(page);
  });

  test('3 · Los productos se editan desde el Panel, no al comprar en la vidriera', async ({ page }) => {
    await enterEditMode(page);
    await page.locator('#productGrid .product-card').first().click();
    await expect(page.locator('#toastRegion')).toContainText('Gestión de productos');
    await expect(page.locator('#productEditorBackdrop')).toBeHidden();

    await saveAndFinishEditMode(page);
    await page.locator('[data-admin-tab="products"]').click();
    const editButton = page.locator('#adminProductTableBody [data-edit-product]').first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();
    await expect(page.locator('#productEditorBackdrop')).toBeVisible();
    await expect(page.locator('#productForm input[name="name"]')).not.toHaveValue('');
    await page.locator('#closeProductEditor').click();
    await expect(page.locator('#productEditorBackdrop')).toBeHidden();
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
    if (await pop.isVisible()) await pop.locator('[data-mt-close]').click();
    await saveAndFinishEditMode(page);
    await expectNoPageErrors(page);
  });

  test('5 · Cerrar sesión oculta el botón flotante y permite volver a iniciar sesión', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await saveAndFinishEditMode(page);
    await expect(page.locator('#adminShell')).toBeVisible();

    await page.locator('#logoutButton').click();
    const confirmPopover = page.locator('#confirmPopover');
    if (await confirmPopover.isVisible()) await page.locator('#confirmAccept').click();
    await expect(page.locator('#adminApp')).toBeHidden();
    await expect(page.locator('.mt-edit-float')).toBeHidden();

    await page.locator('#tfAdmin').click();
    await expect(page.locator('#adminLogin')).toBeVisible();
    await expect(page.locator('.mt-edit-float')).toBeHidden();
    await expectNoPageErrors(page);
  });

});