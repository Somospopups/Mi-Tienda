// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Frentes de tienda (v0.9) — demo offline, sin ?tienda=
 * El dueño elige la vidriera pública (Boutique / Ofertas / Gamer) desde
 * Configuración → Apariencia. El panel no cambia; el catálogo, carrito y
 * checkout se comparten entre frentes. Cada test arranca con storage limpio.
 */

test.beforeEach(async ({ page }) => {
  // Limpiar solo en la PRIMERA carga del test: si limpiáramos en cada
  // navegación borraríamos el guardado que estos tests quieren verificar.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_frentes_clean')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__mt_frentes_clean', '1');
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

async function setFrontFromAdmin(page, front) {
  await loginAdmin(page);
  await page.locator('[data-admin-tab="settings"]').click();
  await expect(page.locator('#adminContent')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('[data-settings-view="appearance"]').click();
  await expect(page.locator('#appearanceForm')).toBeVisible({ timeout: 15_000 });
  await page.locator(`#appearanceForm input[name="storefront"][value="${front}"]`).check({ force: true });
  await page.locator('#appearanceForm button[type="submit"]').click();
  await expect(page.locator('#toastRegion')).toContainText(/aplicada|actualizada/i, { timeout: 15_000 });
}

test.describe('Frentes de tienda (v0.9)', () => {

  test('F1 · El frente por defecto es Boutique (luma) y oculta los otros', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expect(page.locator('#lumaHeadBlock .hero')).toBeVisible();
    await expect(page.locator('#frontOfertas')).toBeHidden();
    await expect(page.locator('#frontGamer')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('F2 · Cambiar a Gamer desde el panel: vidriera oscura, mosaico de categorías y carrito funcionando', async ({ page }) => {
    await setFrontFromAdmin(page, 'gamer');
    // Volver a la tienda (recarga limpia: la demo persiste en localStorage)
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer', { timeout: 15_000 });
    await expect(page.locator('#frontGamer')).toBeVisible();
    await expect(page.locator('#lumaHeadBlock .hero')).toBeHidden();
    await expect(page.locator('#gmrCategoryTiles .gmr-tile').first()).toBeVisible();
    // El catálogo compartido sigue operativo en el frente oscuro
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible();
    await page.locator('#productGrid [data-add-product]').first().click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    // El mosaico navega por categoría (delega en el mismo estado de filtros)
    const tileLabel = await page.locator('#gmrCategoryTiles .gmr-tile b').first().textContent();
    await page.locator('#gmrCategoryTiles .gmr-tile').first().click();
    await expect(page.locator('#categoryPills .category-pill.active')).toHaveText(tileLabel || '');
    await expectNoPageErrors(page);
  });

  test('F3 · Cambiar a Ofertas: hero de campaña, ofertas calculadas del catálogo y chips de categoría', async ({ page }) => {
    await setFrontFromAdmin(page, 'ofertas');
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'ofertas', { timeout: 15_000 });
    await expect(page.locator('#frontOfertas')).toBeVisible();
    await expect(page.locator('#frontGamer')).toBeHidden();
    await expect(page.locator('#lumaHeadBlock .hero')).toBeHidden();
    // Lámpara Aura tiene compareAtPrice 76.000 > 68.400 → al menos una oferta con % off
    const deals = page.locator('#ofrDealsRow .ofr-deal');
    await expect(deals.first()).toBeVisible();
    await expect(page.locator('#ofrDealsRow .ofr-off').first()).toHaveText(/-\d+%/);
    await expect(page.locator('#ofrDealsRow .ofr-prices s').first()).toBeVisible();
    // Chips de categorías generadas desde el catálogo
    await expect(page.locator('#ofrCategoryStrip button').first()).toBeVisible();
    // Agregar desde la oferta suma al carrito compartido
    await page.locator('#ofrDealsRow [data-front-add]').first().click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expectNoPageErrors(page);
  });

  test('F4 · El frente elegido persiste tras recargar la página', async ({ page }) => {
    await setFrontFromAdmin(page, 'gamer');
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer', { timeout: 15_000 });
    await expect(page.locator('#frontGamer')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('F5 · El selector de frentes existe en Apariencia y previsualiza en vivo', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('[data-admin-tab="settings"]').click();
    await page.locator('[data-settings-view="appearance"]').click();
    await expect(page.locator('.front-picker-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.front-option')).toHaveCount(4);
    // Preview en vivo: marcar Gamer aplica data-front sin guardar todavía
    await page.locator('#appearanceForm input[name="storefront"][value="gamer"]').check({ force: true });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer');
    // Volver a Boutique antes de salir para no dejar el preview aplicado sin guardar
    await page.locator('#appearanceForm input[name="storefront"][value="luma"]').check({ force: true });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expectNoPageErrors(page);
  });

  test('F6 · Click real sobre la tarjeta selecciona, resalta y previsualiza', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('[data-admin-tab="settings"]').click();
    await page.locator('[data-settings-view="appearance"]').click();
    await expect(page.locator('.front-picker-card')).toBeVisible({ timeout: 15_000 });
    // Estado inicial: Boutique activa
    await expect(page.locator('.front-option.active')).toHaveCount(1);
    await expect(page.locator('.front-option.active .front-meta b')).toHaveText(/Boutique/);
    // El usuario hace click en la tarjeta Gamer (label, no el input oculto)
    const gamerCard = page.locator('.front-option').filter({ hasText: 'Gamer · Hardware' });
    await gamerCard.click();
    // La tarjeta queda resaltada y la anterior se apaga
    await expect(gamerCard).toHaveClass(/active/);
    await expect(page.locator('.front-option.active')).toHaveCount(1);
    // El preview en vivo aplica el frente sin guardar
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer');
    // Y el guardar persiste el frente elegido con el click real
    await page.locator('#appearanceForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText(/aplicada|actualizada/i, { timeout: 15_000 });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer', { timeout: 15_000 });
    await expectNoPageErrors(page);
  });

});
