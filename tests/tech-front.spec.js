// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Modo Tech (v0.17) — el HTML de Eze.pece tal cual, en un iframe aislado,
 * con el catálogo de Mi-Tienda inyectado adentro (compra completa).
 * El selector de modos (Tienda / Tech) sale al tocar "Ver tienda / Editar"
 * y persiste en settings.storefront. Es extensible: MT_MODES.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_tech_clean')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__mt_tech_clean', '1');
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

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

/** Activa el modo Tech en la demo offline y recarga. */
async function useTechFront(page) {
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const raw = localStorage.getItem('luma_offline_store_v1');
    if (!raw) throw new Error('No hay store demo en localStorage');
    const store = JSON.parse(raw);
    store.settings.storefront = 'tech';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
}

test.describe('Modo Tech (v0.17)', () => {

  test('T1 · "Ver tienda / Editar" abre el selector con los modos Tienda y Tech', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    const cards = page.locator('#modeChooserGrid .mode-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#modeChooserGrid [data-mode-id="luma"]')).toBeVisible();
    await expect(page.locator('#modeChooserGrid [data-mode-id="tech"]')).toBeVisible();
    // el modo actual viene marcado (luma de fábrica)
    await expect(page.locator('#modeChooserGrid [data-mode-id="luma"]')).toHaveClass(/is-active/);
    // cerrar con la X no entra al modo edición ni cambia nada
    await page.locator('#modeChooserClose').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeHidden();
    await expect(page.locator('#adminShell')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expectNoPageErrors(page);
  });

  test('T2 · Elegir Tienda aplica luma, cierra el panel y entra al modo edición', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    await page.locator('#modeChooserGrid [data-mode-id="luma"]').click();
    await expect(page.locator('#shopApp')).toBeVisible();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expectNoPageErrors(page);
  });

  test('T3 · Elegir Tech muestra el HTML de Eze.pece en el iframe y persiste el modo', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    await page.locator('#modeChooserGrid [data-mode-id="tech"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
    await expect(page.locator('#frontTech')).toBeVisible();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    // el home clásico y el catálogo luma quedan ocultos
    await expect(page.locator('#lumaHeadBlock')).toBeHidden();
    await expect(page.locator('#coleccion')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    // el iframe muestra el HTML de Eze.pece tal cual (header, categorías, servicio)
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('#categorias')).toBeVisible();
    await expect(frame.locator('#servicio')).toBeVisible();
    // quedó guardado en settings.storefront
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings.storefront);
    expect(stored).toBe('tech');
    await expectNoPageErrors(page);
  });

  test('T4 · El catálogo se inyecta en el iframe y se compra desde ahí', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    // la sección de catálogo se inserta después de #categorias
    await expect(frame.locator('#mtTechCatalog')).toBeVisible({ timeout: 15_000 });
    const cards = frame.locator('#mtTechGrid .product-card');
    await expect(cards.first()).toBeVisible();
    // agregar desde el iframe actualiza el contador del padre y el del FAB
    await cards.first().locator('.product-add').click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expect(frame.locator('#mtTechFabCount')).toHaveText('1');
    // el FAB del iframe abre el drawer del padre
    await frame.locator('.mt-tech-fab').click();
    await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
    await expect(page.locator('#cartContent .cart-item')).toHaveCount(1);
    await expectNoPageErrors(page);
  });

  test('T5 · Clic en un producto del iframe abre el detalle en el padre', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('#mtTechGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await frame.locator('#mtTechGrid .product-media').first().click();
    await expect(page.locator('#productModalBackdrop')).toBeVisible();
    await expect(page.locator('#productModal .product-modal-copy h2')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('T6 · Regresión: con storefront luma el modo tech queda oculto y sin montar', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expect(page.locator('#frontTech')).toBeHidden();
    const mounted = await page.evaluate(() => {
      const frame = document.getElementById('techFrame');
      return Boolean(frame && frame.srcdoc);
    });
    expect(mounted).toBe(false);
    await expectNoPageErrors(page);
  });

  test('T7 · El FAB del carrito no se pisa con el botón flotante de WhatsApp', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('.mt-tech-fab')).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('a.wa')).toBeVisible();
    const check = async () => {
      const fab = await frame.locator('.mt-tech-fab').boundingBox();
      const wa = await frame.locator('a.wa').boundingBox();
      if (!fab || !wa) throw new Error('FAB o .wa sin bounding box');
      // sin solape horizontal ni vertical
      const overlap = fab.x < wa.x + wa.width && wa.x < fab.x + fab.width &&
                      fab.y < wa.y + wa.height && wa.y < fab.y + fab.height;
      expect(overlap, `Se pisan: fab=${JSON.stringify(fab)} wa=${JSON.stringify(wa)}`).toBe(false);
      // el carrito queda apilado arriba de WhatsApp
      expect(fab.y + fab.height).toBeLessThanOrEqual(wa.y);
    };
    await check();
    // también en mobile, donde el media query mueve ambos
    await page.setViewportSize({ width: 390, height: 844 });
    await check();
    await expectNoPageErrors(page);
  });

});
