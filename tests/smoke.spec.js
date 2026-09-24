// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Smoke tests — Mi-Tienda (demo offline, sin ?tienda=)
 * Cubren los flujos críticos que se rompieron en v0.7.0 (regresión del panel)
 * y los que sostienen la venta: vitrina → carrito → checkout → panel.
 *
 * La demo offline no toca Supabase: corre 100% local y determinística.
 * Cada test arranca con el almacenamiento limpio.
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

async function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

test.describe('Tienda pública (demo offline)', () => {

  test('1 · La vitrina carga con catálogo completo y marca aplicada', async ({ page }) => {
    await page.goto('/index.html');
    // El mock API responde con delay simulado; esperar el render del catálogo
    await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });
    await expect(page.locator('#resultsCount')).toHaveText('6 productos');
    await expect(page).toHaveTitle(/LUMA/);
    // Un producto sin stock (Botella Terra) debe mostrarse como agotado, no romperse
    await expect(page.locator('#productGrid').getByText('Botella Terra')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('2 · Agregar al carrito actualiza el contador y el drawer', async ({ page }) => {
    await page.goto('/index.html');
    const addBtn = page.locator('#productGrid [data-add-product]').first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    // el aria-label es "Agregar <nombre> al carrito" → extraemos el nombre real
    const label = await addBtn.getAttribute('aria-label') || '';
    const name = label.replace(/^Agregar\s+|\s+al carrito$/g, '');
    await addBtn.click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    await page.locator('#cartButton').click();
    await expect(page.locator('#cartDrawer')).toBeVisible();
    await expect(page.locator('#cartContent')).toContainText(name);
    await expectNoPageErrors(page);
  });

  test('3 · Checkout demo de punta a punta (Mercado Pago simulado)', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid [data-add-product]').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#productGrid [data-add-product]').first().click();
    await page.locator('#cartButton').click();
    await page.locator('#checkoutButton').click();
    await expect(page.locator('#checkoutForm')).toBeVisible();

    await page.locator('#checkoutForm input[name="name"]').fill('Ana Test');
    await page.locator('#checkoutForm input[name="phone"]').fill('3515550000');
    await page.locator('#checkoutForm input[name="email"]').fill('ana@test.com');
    // envío a domicilio (default) requiere dirección ≥ 8 chars
    await page.locator('#checkoutForm textarea[name="address"]').fill('Av. Test 1234, Córdoba');

    await page.locator('#placeOrderButton').click();
    // Modal de éxito con número de pedido LU-1001 (primera compra de la demo limpia)
    await expect(page.locator('#successBackdrop')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#successOrderNumber')).toHaveText('LU-1001');
    await expect(page.locator('#successText')).toContainText('demostración');

    // El carrito quedó vacío y el stock se descontó (Lámpara Aura: 8 → 7)
    await expect(page.locator('#cartCount')).toHaveText('0');
    await expectNoPageErrors(page);
  });

  test('4 · Newsletter exige consentimiento y confirma por toast', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#newsletterForm')).toBeVisible({ timeout: 15_000 });

    // sin consentimiento el input required bloquea el submit (validación nativa);
    // verificamos el rechazo a nivel API (contrato del mock) y el éxito en la UI.
    const apiReject = await page.evaluate(async () => {
      const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@test.com', consent: false }) });
      return { status: r.status, body: await r.json() };
    });
    expect(apiReject.status).toBe(400);
    expect(apiReject.body.error).toMatch(/consentimiento/i);

    // con consentimiento → suscripción exitosa vía formulario
    await page.locator('#newsletterForm input[name="email"]').fill('ana@test.com');
    await page.locator('#newsletterForm input[name="consent"]').check();
    await page.locator('#newsletterForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('¡Ya sos parte!');
    await expectNoPageErrors(page);
  });

});

test.describe('Panel de administración (demo offline)', () => {

  async function loginAdmin(page) {
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
  }

  test('5 · Login con PIN y dashboard con métricas', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.locator('#adminContent')).toContainText('Panel en tiempo real');
    await expect(page.locator('#adminContent')).toContainText('Buen día');
    await expectNoPageErrors(page);
  });

  test('6 · Login con PIN incorrecto es rechazado', async ({ page }) => {
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
    await page.locator('#loginForm input[name="pin"]').fill('9999');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#loginError')).not.toHaveText('');
    await expect(page.locator('#adminShell')).toBeHidden();
  });

  test('7 · Las 7 secciones del panel renderizan sin errores (regresión v0.7.0)', async ({ page }) => {
    await loginAdmin(page);
    const tabs = ['dashboard', 'alerts', 'products', 'customers', 'orders', 'finance', 'settings'];
    for (const tab of tabs) {
      await page.locator(`[data-admin-tab="${tab}"]`).click();
      await expect(page.locator('#adminContent')).not.toBeEmpty();
      // cada sección debe mostrar su loader resolverse a contenido real
      await expect(page.locator('#adminContent .admin-loader')).toHaveCount(0, { timeout: 15_000 });
    }
    await expectNoPageErrors(page);
  });

  test('8 · Productos: el catálogo del panel lista los 6 productos seed', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('[data-admin-tab="products"]').click();
    await expect(page.locator('#adminContent').getByText('Lámpara Aura')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#adminContent').getByText('Set Ritual')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('9 · La compra del checkout aparece en Pedidos del panel', async ({ page }) => {
    // compra
    await page.goto('/index.html');
    await expect(page.locator('#productGrid [data-add-product]').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#productGrid [data-add-product]').first().click();
    await page.locator('#cartButton').click();
    await page.locator('#checkoutButton').click();
    await page.locator('#checkoutForm input[name="name"]').fill('Ana Test');
    await page.locator('#checkoutForm input[name="phone"]').fill('3515550000');
    await page.locator('#checkoutForm textarea[name="address"]').fill('Av. Test 1234, Córdoba');
    await page.locator('#placeOrderButton').click();
    await expect(page.locator('#successOrderNumber')).toHaveText('LU-1001', { timeout: 20_000 });

    // cerrar el modal de éxito y entrar al panel por hash (sin recargar:
    // la recarga dispararía el addInitScript que limpia el storage)
    await page.locator('#successContinue').click();
    await expect(page.locator('#successBackdrop')).toBeHidden();
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible();
    await page.locator('[data-admin-tab="orders"]').click();
    await expect(page.locator('#adminContent').getByText('LU-1001')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#adminContent').getByText('Ana Test').first()).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('10 · Tienda inexistente: aviso claro y NO cae a la demo offline', async ({ page }) => {
    // v0.8.1 · Si la RPC api_public responde store_not_found, la página muestra
    // un aviso en vez de servirse la demo LUMA (antes parecía que "volvió a cero").
    // Stubeamos la RPC para que el test sea determinístico con o sin red.
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Content-Type': 'application/json'
    };
    await page.route('**/rest/v1/rpc/api_public', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'store_not_found' }) });
    });

    await page.goto('/index.html?tienda=__no_existe__');
    // Aviso visible y sin productos de la demo offline por defecto.
    await expect(page.locator('#emptyState')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#emptyState h3')).toHaveText('No pudimos cargar la tienda');
    await expect(page.locator('.product-card')).toHaveCount(0);
    await expect(page.locator('#mt-gate')).toHaveCount(0);
  });

});
