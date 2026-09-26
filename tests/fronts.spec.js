// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Frentes de tienda (v0.9) — demo offline, sin ?tienda=
 * v0.13.0: el frente ya no se cambia desde el panel (se eliminó el tab
 * Apariencia y el selector). El frente se fija por tienda en `settings.storefront`.
 * El catálogo, carrito y checkout se comparten entre frentes.
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

});