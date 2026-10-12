// @ts-check
const { test, expect } = require('@playwright/test');
const { createHash } = require('crypto');

/**
 * Clave maestra POPUPS (v0.19)
 *
 * index.html acepta, además del PIN de la demo, una CLAVE MAESTRA que se
 * compara por SHA-256 (el texto no está en el código). Para testear el
 * mecanismo sin commitear la clave real (el repo es público), el test sirve
 * index.html con el hash reemplazado por el de una clave de prueba.
 *
 * En la nube la maestra la valida supabase/master-key.sql (no alcanza a CI):
 * ver la verificación manual del CHANGELOG v0.19.0.
 */

// la clave de prueba respeta el maxlength=12 del login de la demo
const TEST_KEY = 'maestra-test';
const TEST_SHA = createHash('sha256').update(TEST_KEY).digest('hex');

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
  await page.route('**/index.html', async (route) => {
    const resp = await route.fetch();
    const html = (await resp.text()).replace(
      /const MT_MASTER_SHA256 = '[0-9a-f]{64}';/,
      `const MT_MASTER_SHA256 = '${TEST_SHA}';`
    );
    await route.fulfill({ response: resp, body: html });
  });
});

function expectNoPageErrors(page, ignore = /(?!)/) {
  // @ts-ignore
  const errors = (page.__jsErrors || []).filter((e) => !ignore.test(e));
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

async function openLogin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
}

async function tryLogin(page, key) {
  await page.locator('#loginForm input[name="pin"]').fill(key);
  await page.locator('#loginForm #btnSubmitLogin').click();
}

test.describe('Clave maestra POPUPS (v0.19)', () => {

  test('19 · La clave maestra abre el panel de la demo', async ({ page }) => {
    await openLogin(page);
    await tryLogin(page, TEST_KEY);
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#adminContent')).toContainText('Panel en tiempo real');
    await expectNoPageErrors(page);
  });

  test('20 · Una clave que no es la maestra queda rechazada', async ({ page }) => {
    await openLogin(page);
    await tryLogin(page, 'esto-no-es-la-clave');
    await expect(page.locator('#loginError')).not.toHaveText('');
    await expect(page.locator('#adminShell')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('21 · El PIN de la demo sigue funcionando al lado de la maestra', async ({ page }) => {
    await openLogin(page);
    await tryLogin(page, '1234');
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
    await expectNoPageErrors(page);
  });

});
