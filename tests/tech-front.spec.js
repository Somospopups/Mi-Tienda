// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Regresiones de la vidriera TECH actual (página nativa, no iframe).
 * Los flujos de selección antiguos con iframe y selector de modo se migran
 * a las rutas/controles que existen hoy en la tienda.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_tech_native_clean')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__mt_tech_native_clean', '1');
      }
    } catch (_) {}
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

async function openTech(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
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

async function enterEditMode(page) {
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
  await expect(page.locator('#modeChooserBackdrop')).toHaveCount(0);
}

async function finishEditMode(page) {
  await page.locator('[data-mt-done]').click();
  await expect(page.locator('#confirmPopover')).toBeVisible();
  await page.locator('#confirmAccept').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

async function addFirstProduct(page) {
  await page.locator('#productGrid [data-add-product]').first().click();
  await expect(page.locator('#leadCaptureBackdrop')).toBeVisible();
  await page.locator('#leadNameInput').fill('Persona de prueba');
  await page.locator('#leadPhoneInput').fill('2065550100');
  await page.locator('#leadCaptureForm button[type="submit"]').click();
  await expect(page.locator('#leadCaptureBackdrop')).toBeHidden();
}

test.describe('TECH nativo · compatibilidad de la tienda actual', () => {
  test('1 · La configuración inicial activa TECH y oculta las otras vidrieras', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('#frontTech')).toBeVisible();
    await expect(page.locator('#frontOfertas')).toBeHidden();
    await expect(page.locator('#frontGamer')).toBeHidden();
    await expect(page.locator('#frontActitud')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('2 · El propietario entra directamente a editar la vidriera TECH', async ({ page }) => {
    await enterEditMode(page);
    await expect(page.locator('#tfHead')).toBeVisible();
    await expect(page.locator('[data-mt-blocks]')).toBeVisible();
    await finishEditMode(page);
    await expectNoPageErrors(page);
  });

  test('3 · El detalle de un producto se abre en la misma página TECH', async ({ page }) => {
    await openTech(page);
    const card = page.locator('#productGrid .product-card').first();
    const name = (await card.locator('.product-name').textContent())?.trim() || '';
    await card.locator('[data-open-product]').first().click();
    await expect(page.locator('#productModalBackdrop')).toBeVisible();
    await expect(page.locator('#productModal')).toContainText(name);
    await page.locator('#productModal [data-close-product]').click();
    await expect(page.locator('#productModalBackdrop')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('4 · Comprar desde el catálogo TECH registra los datos y abre el carrito compartido', async ({ page }) => {
    await openTech(page);
    await addFirstProduct(page);
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expect(page.locator('#tfCartCount')).toHaveText('1');
    await page.locator('#tfCart').click();
    await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
    await expect(page.locator('#cartContent .cart-item')).toHaveCount(1);
    await expectNoPageErrors(page);
  });

  test('5 · Cambiar categoría actualiza la selección sin vaciar el catálogo', async ({ page }) => {
    await openTech(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#tfCats .tf-cat[data-tf-cat="fundas"]').click();
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible();
    expect(await page.evaluate(() => window.pageYOffset)).toBeLessThan(40);
    await expectNoPageErrors(page);
  });

  test('6 · El checkout TECH completo confirma la compra y vacía el carrito', async ({ page }) => {
    await openTech(page);
    await addFirstProduct(page);
    await page.locator('#tfCart').click();
    await page.locator('#checkoutButton').click();
    await expect(page.locator('#checkoutBackdrop')).toBeVisible();
    await page.locator('#checkoutForm [name="name"]').fill('Persona de prueba');
    await page.locator('#checkoutForm [name="phone"]').fill('2065550100');
    await page.locator('#checkoutForm [name="address"]').fill('123 Test Avenue, Seattle, WA 98101');
    await page.locator('#placeOrderButton').click();
    await expect(page.locator('#successBackdrop')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#cartCount')).toHaveText('0');
    await expectNoPageErrors(page);
  });

  test('7 · Editar un texto TECH se aplica al instante y persiste', async ({ page }) => {
    await enterEditMode(page);
    const title = page.locator('#frontTech [data-content="tchCatsTitle"]');
    await expect(title).toBeVisible();
    await title.click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input, textarea').first().fill('Accesorios para todos tus dispositivos');
    await pop.locator('[data-mt-save]').click();
    await expect(title).toHaveText('Accesorios para todos tus dispositivos');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1') || '{}').content.tchCatsTitle);
    expect(saved).toBe('Accesorios para todos tus dispositivos');
    await pop.locator('[data-mt-cancel]').click();
    await finishEditMode(page);
    await expectNoPageErrors(page);
  });

  test('8 · El storefront TECH se conserva al recargar sin parámetros en la URL', async ({ page }) => {
    await openTech(page);
    await page.evaluate(() => {
      const key = 'luma_offline_store_v1';
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      store.settings.storefront = 'tech';
      localStorage.setItem(key, JSON.stringify(store));
      localStorage.setItem('luma_active_front', 'tech');
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
    await expect(page.locator('#tfHead')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('9 · Cancelar la salida conserva el editor; confirmar vuelve al panel', async ({ page }) => {
    await enterEditMode(page);
    await page.locator('[data-mt-done]').click();
    await expect(page.locator('#confirmPopover')).toBeVisible();
    await page.locator('#confirmCancel').click();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await expect(page.locator('#adminShell')).toBeHidden();
    await finishEditMode(page);
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expectNoPageErrors(page);
  });

  test('10 · Una imagen TECH se puede reemplazar y restaurar al original', async ({ page }) => {
    await enterEditMode(page);
    const image = page.locator('#tfShots img[data-tf-shot="todo"]');
    const original = await image.getAttribute('src');
    await image.click({ position: { x: 10, y: 10 } });
    const body = page.locator('#mtEditBody');
    await expect(body).toBeVisible();
    await expect(page.locator('#mtEditTitle')).toContainText('Imagen de la tienda');
    await body.locator('input[type="file"]').setInputFiles('tests/fixtures/foto-editorial.png');
    await expect(body).toContainText('Imagen actualizada ✓', { timeout: 20_000 });
    await expect(image).not.toHaveAttribute('src', original || '');
    await body.locator('[data-mt-img-restore]').click();
    await expect(image).toHaveAttribute('src', original || '', { timeout: 15_000 });
    if (await body.locator('[data-mt-cancel]').isVisible()) await body.locator('[data-mt-cancel]').click();
    await finishEditMode(page);
    await expectNoPageErrors(page);
  });
});
