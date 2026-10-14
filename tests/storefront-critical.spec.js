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

/** v104/v107: cambia la demo a la vidriera Actitud y espera la home con destacados. */
async function useActitudFront(page) {
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('luma_offline_store_v1') || 'null');
    if (!store || !store.settings) throw new Error('No se inicializó la tienda demo.');
    store.settings.storefront = 'actitud';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('#actitudOwnerProducts .product-card')).toHaveCount(4, { timeout: 15_000 });
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

/** v105: nube con demora � ?tienda= decide la vidriera ANTES del primer frame. */
const flashCloudStore = {
  ok: true,
  biz: 'Tienda de prueba',
  status: 'activa',
  paid_until: '2030-12-31',
  cfg: { settings: { storefront: 'actitud' }, content: {}, legal: {} },
  products: [],
  mp_ok: false
};

async function delayPublicStore(page, ms, body) {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (name === 'api_public') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

test('Sin pantallazo: ?tienda= sin memoria espera neutral y nunca pinta Tech', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await delayPublicStore(page, 2500, flashCloudStore);
  await page.goto('/index.html?tienda=cloud-flash');

  // Mientras la nube no responde: estado neutro con spinner, sin NINGUNA vidriera.
  expect(await page.evaluate(() => document.documentElement.dataset.front)).toBe('boot');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontTech')).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('siteHeader')).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').animationName)).toBe('mt-boot-spin');

  // Resuelve en la vidriera real de la tienda y queda recordada para la pr�xima visita.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mt_front:cloud-flash')), { timeout: 15_000 }).toBe('actitud');
  await expect(page.locator('html')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontTech')).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontActitud')).display)).toBe('block');
  await expectNoPageErrors(page, errors);
});

test('Sin pantallazo: ?tienda= pinta la vidriera recordada desde el primer frame', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.addInitScript(() => {
    try { localStorage.setItem('mt_front:cloud-vidriera', 'actitud'); } catch (_) {}
  });
  await delayPublicStore(page, 2500, flashCloudStore);
  await page.goto('/index.html?tienda=cloud-vidriera');

  // Primer frame ya con la marca del due�o: Tech oculta, Actitud visible, sin spinner.
  expect(await page.evaluate(() => document.documentElement.dataset.front)).toBe('actitud');
  expect(await page.evaluate(() => document.body.dataset.front)).toBe('actitud');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontActitud')).display)).toBe('block');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontTech')).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').animationName)).toBe('none');

  await expect.poll(() => page.evaluate(() => localStorage.getItem('mt_front:cloud-vidriera')), { timeout: 15_000 }).toBe('actitud');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('frontTech')).display)).toBe('none');
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  await expectNoPageErrors(page, errors);
});

/** v107: home con 4 destacados + pantalla de catálogo estilo Mercado Libre. */

test('La home de Actitud muestra 4 destacados y "Ver más" abre el catálogo con todos', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await useActitudFront(page);

  await expect(page.locator('#actitudOwnerProducts .product-card')).toHaveCount(4);
  await expect(page.locator('#actSeeAll')).toBeVisible();
  await expect(page.locator('#actSeeAllSub')).toHaveText('6 productos');

  await page.locator('#actSeeAll').click();
  await expect(page.locator('#actCatalog')).toHaveClass(/open/);
  await expect(page.locator('#actCatalogCount')).toHaveText('6 resultados');
  await expect(page.locator('#actCatalogRange')).toHaveText('Mostrando 1–6 de 6');
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(6);
  await page.locator('#actCatalogClose').click();
  await expect(page.locator('#actCatalog')).not.toHaveClass(/open/);

  // La lupa del header abre el mismo catálogo (reemplaza al buscador viejo de la home).
  await revealHeader(page);
  await page.locator('#searchToggle').click();
  await expect(page.locator('#actCatalog')).toHaveClass(/open/);
  await expect(page.locator('#actCatalogCount')).toHaveText('6 resultados');
  await expectNoPageErrors(page, errors);
});

test('El catálogo busca, ordena y filtra con cantidades al estilo Mercado Libre', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await useActitudFront(page);
  await page.locator('#actSeeAll').click();

  // Chips de categoría dinámicos con el conteo entre paréntesis.
  await expect(page.locator('#actCatalogChips [data-cat="all"]')).toContainText('(6)');
  const categoryChip = page.locator('#actCatalogChips [data-cat]').nth(1);
  const chipLabel = (await categoryChip.locator('span').textContent()) || '';
  const chipCount = Number((chipLabel.match(/\d+/) || ['0'])[0]);
  expect(chipCount).toBeGreaterThan(0);
  await categoryChip.click();
  await expect(page.locator('#actCatalogCount')).toHaveText(`${chipCount} resultado${chipCount === 1 ? '' : 's'}`);
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(chipCount);
  await page.locator('#actCatalogChips [data-cat="all"]').click();
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(6);

  // Orden por menor precio: los precios quedan ascendentes.
  await page.locator('#actCatalogSort').selectOption('price-asc');
  const prices = await page.locator('#actCatalogGrid .product-price span').allTextContents();
  const numbers = prices.map((text) => Number(text.replace(/[^\d]/g, '')));
  expect(numbers).toHaveLength(6);
  expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);

  // Búsqueda: filtra, actualiza el contador y la vacía muestra el estado sin resultados.
  const firstName = ((await page.locator('#actCatalogGrid .product-card h3').first().textContent()) || '').trim();
  expect(firstName.length).toBeGreaterThan(3);
  await page.locator('#actCatalogSearch').fill(firstName.slice(0, 4));
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(1);
  await expect(page.locator('#actCatalogCount')).toHaveText('1 resultado');
  await expect(page.locator('#actCatalogRange')).toHaveText('Mostrando 1–1 de 1');

  await page.locator('#actCatalogSearch').fill('zzzzz-no-existe');
  await expect(page.locator('#actCatalogEmpty')).toBeVisible();
  await expect(page.locator('#actCatalogCount')).toHaveText('0 resultados');
  await page.locator('#actCatalogReset').click();
  await expect(page.locator('#actCatalogEmpty')).toBeHidden();
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(6);
  await expectNoPageErrors(page, errors);
});

test('El catálogo pagina de a 20 con "Ver más" y la home nunca crece', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('luma_offline_store_v1') || 'null');
    if (!store || !store.settings) throw new Error('No se inicializó la tienda demo.');
    const base = store.products[0];
    for (let i = 0; i < 19; i++) {
      store.products.push({ ...base, id: `extra-${i}`, name: `Gadget Extra ${String(i + 1).padStart(2, '0')}`, featured: false });
    }
    store.settings.storefront = 'actitud';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('#actitudOwnerProducts .product-card')).toHaveCount(4, { timeout: 15_000 });

  await page.locator('#actSeeAll').click();
  await expect(page.locator('#actCatalogCount')).toHaveText('25 resultados');
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(20);
  await expect(page.locator('#actCatalogRange')).toHaveText('Mostrando 1–20 de 25');
  await expect(page.locator('#actCatalogMore')).toBeVisible();

  await page.locator('#actCatalogMore').click();
  await expect(page.locator('#actCatalogGrid .product-card')).toHaveCount(25);
  await expect(page.locator('#actCatalogRange')).toHaveText('Mostrando 1–25 de 25');
  await expect(page.locator('#actCatalogMore')).toBeHidden();
  await expectNoPageErrors(page, errors);
});

test('El switch "Destacado" del Panel define el orden de la home', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/index.html');
  const names = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('luma_offline_store_v1') || 'null');
    if (!store || !store.settings) throw new Error('No se inicializó la tienda demo.');
    store.products.forEach((product, index) => { product.featured = index >= 2 && index < 4; });
    store.settings.storefront = 'actitud';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
    return store.products.map((product) => product.name);
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'actitud');
  await expect(page.locator('#actitudOwnerProducts .product-card')).toHaveCount(4, { timeout: 15_000 });

  const shown = await page.locator('#actitudOwnerProducts .product-card h3').allTextContents();
  expect(shown.map((text) => text.trim())).toEqual([names[2], names[3], names[0], names[1]]);
  await expectNoPageErrors(page, errors);
});
