// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Frente Eze.pece (v0.16) — accesorios & servicio técnico, estilo landing celeste.
 * Se activa con settings.storefront = 'eze'. El catálogo, carrito y checkout
 * se comparten con el resto de los frentes (mismo motor v0.9).
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_eze_clean')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__mt_eze_clean', '1');
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

async function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

/** Activa el frente eze en la demo offline y recarga. */
async function useEzeFront(page) {
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const raw = localStorage.getItem('luma_offline_store_v1');
    if (!raw) throw new Error('No hay store demo en localStorage');
    const store = JSON.parse(raw);
    store.settings.storefront = 'eze';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'eze');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Frente Eze.pece (v0.16)', () => {

  test('E1 · El frente eze se activa, oculta el home clásico y pinta el catálogo', async ({ page }) => {
    await useEzeFront(page);
    await expect(page.locator('#frontEze')).toBeVisible();
    await expect(page.locator('#lumaHeadBlock .hero')).toBeHidden();
    await expect(page.locator('#frontOfertas')).toBeHidden();
    await expect(page.locator('#frontGamer')).toBeHidden();
    await expect(page.locator('#coleccion')).toBeVisible();
    await expect(page.locator('.eze-display').first()).toBeVisible();
    await expect(page.locator('#ezeServicio')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('E2 · Las tarjetas de categorías se generan desde el catálogo y filtran', async ({ page }) => {
    await useEzeFront(page);
    const cards = page.locator('#ezeCatCards .eze-card');
    await expect(cards.first()).toBeVisible();
    const firstCategory = (await cards.first().locator('h3').textContent())?.trim();
    expect(firstCategory).toBeTruthy();
    // El chip del hero también se genera
    await expect(page.locator('#ezeCatChips .eze-chip').first()).toBeVisible();
    // Clic en la tarjeta → filtra el catálogo y muestra "Limpiar filtros"
    await cards.first().click();
    await expect(page.locator('#clearFilters')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('E3 · Los botones del hero bajan al catálogo y al servicio técnico', async ({ page }) => {
    await useEzeFront(page);
    await page.locator('.eze-hero [data-front-scroll="#coleccion"]').click();
    await expect(page.locator('#coleccion')).toBeInViewport({ timeout: 5_000 });
    await page.locator('.eze-hero [data-front-scroll="#ezeServicio"]').click();
    await expect(page.locator('#ezeServicio')).toBeInViewport({ timeout: 5_000 });
    await expectNoPageErrors(page);
  });

  test('E4 · Los botones de WhatsApp usan el número de la tienda', async ({ page }) => {
    await useEzeFront(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem('luma_offline_store_v1');
      if (!raw) throw new Error('No hay store demo');
      const store = JSON.parse(raw);
      store.settings.whatsappNumber = '5493511234567';
      localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
    });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-front', 'eze');
    const waLinks = page.locator('#frontEze [data-eze-wa]');
    await expect(waLinks.first()).toHaveAttribute('href', 'https://wa.me/5493511234567');
    await expect(waLinks.first()).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('E5 · Regresión: con storefront luma el frente eze queda oculto', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expect(page.locator('#frontEze')).toBeHidden();
    await expectNoPageErrors(page);
  });

});
