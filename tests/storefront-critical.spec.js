// @ts-check
const { test, expect } = require('@playwright/test');

/** Regressions for storefront rendering, add-to-cart, checkout and Actitud isolation. */

async function expectNoPageErrors(page, errors) {
  expect(errors, `Errores JavaScript: ${errors.join(', ')}`).toEqual([]);
}

/** v99: el panel superior se oculta al bajar; para usarlo hay que volver a subir. */
async function revealHeader(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('body')).not.toHaveClass(/mt-head-hidden/);
}

/** v104: cambia la demo a la vidriera Actitud y espera el catálogo del dueño. */
async function useActitudFront(page) {
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('luma_offline_store_v1') || 'null');
    if (!store || !store.settings) throw new Error('No se inicializó la tienda demo.');
    store.settings.storefront = 'actitud';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('#actitudOwnerProducts .product-card')).toHaveCount(6, { timeout: 15_000 });
}

/** v104: el popup "¿Cómo te llamás?" aparece en el primer alta y se resuelve. */
async function submitLeadCapture(page) {
  await expect(page.locator('#leadCaptureBackdrop')).toBeVisible();
  await page.locator('#leadNameInput').fill('Persona de prueba');
  await page.locator('#leadPhoneInput').fill('2065550100');
  await page.locator('#leadCaptureForm button[type="submit"]').click();
  await expect(page.locator('#leadCaptureBackdrop')).toBeHidden();
}

test('la vidriera TECH coincide antes y después del arranque y muestra el catálogo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');

  await expect(page.locator('html')).toHaveAttribute('data-front', 'tech');
  await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
  await expect(page.locator('#frontTech')).toBeVisible();
  await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });
  await expectNoPageErrors(page, errors);
});

test('agregar al carrito y completar el checkout demo funciona en TECH', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });

  const firstProduct = page.locator('#productGrid .product-card').first();
  const productName = (await firstProduct.locator('.product-name').textContent())?.trim();
  expect(productName).toBeTruthy();
  await firstProduct.locator('[data-add-product]').click();
  await expect(page.locator('#leadCaptureBackdrop')).toBeVisible();
  await page.locator('#leadNameInput').fill('Persona de prueba');
  await page.locator('#leadPhoneInput').fill('2065550100');
  await page.locator('#leadCaptureForm button[type="submit"]').click();

  await expect(page.locator('#leadCaptureBackdrop')).toBeHidden();
  await expect(page.locator('#cartCount')).toHaveText('1');
  await revealHeader(page);
  await page.locator('#tfCart').click();
  await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
  await expect(page.locator('#cartContent')).toContainText(productName || '');
  await page.locator('#checkoutButton').click();
  await expect(page.locator('#checkoutBackdrop')).toBeVisible();

  // La hoja de estilos de Actitud no debe esconder el checkout compartido.
  await expect(page.locator('#checkoutForm [name="name"]')).toBeVisible();
  await page.locator('#checkoutForm [name="name"]').fill('Persona de prueba');
  await page.locator('#checkoutForm [name="phone"]').fill('2065550100');
  await page.locator('#checkoutForm [name="address"]').fill('123 Test Avenue, Seattle, WA 98101');
  await page.locator('#placeOrderButton').click();

  await expect(page.locator('#successBackdrop')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#cartCount')).toHaveText('0');
  await expectNoPageErrors(page, errors);
});

test('Actitud es independiente de TECH y su carrito usa los productos cargados', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });

  await useActitudFront(page);

  await expect(page.locator('html')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('#frontActitud')).toBeVisible();
  expect(await page.locator('#frontTechTail').evaluate((node) => node.contains(document.getElementById('frontActitud')))).toBe(false);
  await page.locator('#actitudOwnerProducts [data-add]').first().click();
  await submitLeadCapture(page);
  await expect(page.locator('#actitudCartCount')).toHaveText('1');
  await revealHeader(page);
  await page.locator('#cartToggle').click();
  await expect(page.locator('#actitudCartDrawer')).toHaveClass(/open/);
  await expectNoPageErrors(page, errors);
});

test('En Actitud hay 4 productos a lo ancho y al presionar uno se abre su detalle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });
  await useActitudFront(page);

  const columns = await page.locator('#actitudProductGrid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(4);

  const firstCard = page.locator('#actitudOwnerProducts .product-card').first();
  const productName = (await firstCard.locator('h3').textContent())?.trim();
  expect(productName).toBeTruthy();
  await firstCard.locator('h3').click();

  await expect(page.locator('#productModalBackdrop')).toBeVisible();
  await expect(page.locator('#productModal h2')).toContainText(productName || '');

  await page.locator('#productModal [data-modal-add]').click();
  await submitLeadCapture(page);
  await expect(page.locator('#actitudCartCount')).toHaveText('1');
  await expect(page.locator('#actitudCartDrawer')).toHaveClass(/open/, { timeout: 5_000 });
  await expect(page.locator('#cartItems')).toContainText(productName || '');
  await expectNoPageErrors(page, errors);
});

test('el acceso local abre el panel y permite volver al modo de edición', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible();

  // Usa el acceso indicado por la propia demo, sin guardar el valor en el test ni en logs.
  const demoPin = await page.locator('#loginCloudHint').textContent().then((text) => text?.match(/\b\d{4}\b/)?.[0]);
  expect(demoPin).toBeTruthy();
  await page.locator('#loginForm input[name="pin"]').fill(demoPin);
  await page.locator('#btnSubmitLogin').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
  await page.locator('#viewStore').click();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
  await expectNoPageErrors(page, errors);
});
