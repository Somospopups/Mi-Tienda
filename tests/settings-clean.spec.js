// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.13.0 · Panel limpio: se retiraron los tabs "Apariencia" y "Contenido de
 * página" (se edita todo desde el frente). Queda la tarjeta compacta de paleta
 * dentro de General. Demo offline, sin ?tienda=.
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

async function openSettings(page) {
  await loginAdmin(page);
  await page.locator('[data-admin-tab="settings"]').click();
  await expect(page.locator('#adminContent')).not.toBeEmpty({ timeout: 15_000 });
}

test.describe('Panel limpio v0.13.0 · Configuración', () => {

  test('S1 · El submenú de Configuración tiene solo 3 secciones y no quedan Apariencia/Contenido', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('.settings-subnav [data-settings-view]')).toHaveCount(3);
    for (const view of ['general', 'payments', 'legal']) {
      await expect(page.locator(`.settings-subnav [data-settings-view="${view}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-settings-view="appearance"]')).toHaveCount(0);
    await expect(page.locator('[data-settings-view="content"]')).toHaveCount(0);
    await expect(page.locator('#appearanceForm')).toHaveCount(0);
    await expect(page.locator('#contentForm')).toHaveCount(0);
    await expect(page.locator('#mtOpenBuilder')).toHaveCount(0);
    await expectNoPageErrors(page);
  });

  test('S2 · La tarjeta de paleta en General aplica el preset, calcula contraste y persiste', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('h2', { hasText: 'Paleta de colores' })).toBeVisible();
    await expect(page.locator('.palette-presets [data-palette-preset]')).toHaveCount(4);
    await expect(page.locator('#randomPaletteButton')).toBeVisible();

    await page.locator('[data-palette-preset="oceano"]').click();
    await expect(page.locator('#toastRegion')).toContainText(/Paleta aplicada/i, { timeout: 15_000 });
    await expect(page.locator('#paletteContrast')).not.toHaveText('—');
    await expect(page.locator('#paletteContrastStatus')).not.toContainText('Se calcula al aplicar');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings);
    expect(String(stored.accentColor).toLowerCase()).toBe('#2f80ed');
    expect(String(stored.darkColor).toLowerCase()).toBe('#102a43');
    await expectNoPageErrors(page);
  });

  test('S3 · El botón Random genera una paleta distinta y la aplica', async ({ page }) => {
    await openSettings(page);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings);
    const beforeSig = [before.accentColor, before.darkColor, before.backgroundColor, before.surfaceColor, before.secondaryColor].join('|');

    await page.locator('#randomPaletteButton').click();
    await expect(page.locator('#toastRegion')).toContainText(/Paleta aplicada/i, { timeout: 15_000 });
    await expect(page.locator('#paletteContrast')).not.toHaveText('—');

    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings);
    const afterSig = [after.accentColor, after.darkColor, after.backgroundColor, after.surfaceColor, after.secondaryColor].join('|');
    expect(afterSig).not.toBe(beforeSig);
    await expectNoPageErrors(page);
  });

});