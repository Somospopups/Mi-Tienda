// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Uber Direct (modo demo) — Mi-Tienda
 * La demo offline no toca Supabase: corre 100% local y determinística.
 * Cada test arranca con el almacenamiento limpio.
 *
 * Escenarios cubiertos:
 *  1) La opción "Envío con Uber" aparece en el checkout con costo demo y ETA.
 *  2) Elegir Uber actualiza envío + total y el pedido se guarda con tipo
 *     'uber' (panel → Pedidos muestra "Envio con Uber" + ETA).
 *  3) Contrato de la API demo: /api/uber/quote responde ok conmutable y
 *     rechaza (400 uber_disabled) cuando la tienda desactiva la opción.
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

async function firstProductToCheckout(page) {
  await page.goto('/index.html');
  await expect(page.locator('#productGrid [data-add-product]').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#productGrid [data-add-product]').first().click();
  await page.locator('#cartButton').click();
  await page.locator('#checkoutButton').click();
  await expect(page.locator('#checkoutForm')).toBeVisible();
}

test.describe('Uber Direct (modo demo)', () => {

  test('1 · La opción Uber aparece en el checkout con costo demo y ETA', async ({ page }) => {
    await firstProductToCheckout(page);
    await expect(page.locator('#uberChoiceCard')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#uberChoiceMeta')).toContainText(/demo/i);

    // seleccionar Uber: el envío toma el costo demo y la dirección sigue visible/obligatoria
    await page.locator('#uberChoiceCard input[type="radio"]').check();
    await expect(page.locator('#checkoutShipping')).toHaveText('$ 4.850');
    await expect(page.locator('#checkoutTotal')).not.toHaveText('$0');
    await expect(page.locator('#addressField')).toBeVisible();
    await expect(page.locator('#checkoutForm textarea[name="address"]')).toBeEditable();

    // el total debe ser subtotal + costo demo (4.850)
    const subtotal = parseInt((await page.locator('#checkoutSubtotal').textContent()).replace(/\D/g, ''), 10);
    const total = parseInt((await page.locator('#checkoutTotal').textContent()).replace(/\D/g, ''), 10);
    expect(total).toBe(subtotal + 4850);
    await expectNoPageErrors(page);
  });

  test('2 · Pedido con envío Uber se guarda con tipo uber, dirección y ETA', async ({ page }) => {
    await firstProductToCheckout(page);
    await page.locator('#checkoutForm input[name="name"]').fill('Ana Test');
    await page.locator('#checkoutForm input[name="phone"]').fill('3515550000');
    await page.locator('#checkoutForm input[name="email"]').fill('ana@test.com');
    await page.locator('#uberChoiceCard input[type="radio"]').check();
    await page.locator('#checkoutForm textarea[name="address"]').fill('Av. Test 1234, Córdoba');
    await page.locator('#placeOrderButton').click();
    await expect(page.locator('#successBackdrop')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#successOrderNumber')).toHaveText('LU-1001');

    // cerrar éxito y abrir el panel SIN recargar (el initScript limpiaría el storage)
    await page.locator('#successContinue').click();
    await expect(page.locator('#successBackdrop')).toBeHidden();
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible();
    await page.locator('[data-admin-tab="orders"]').click();
    await expect(page.locator('#adminContent').getByText('LU-1001')).toBeVisible({ timeout: 15_000 });
    await page.locator('#adminContent .order-card-head').first().click();
    await expect(page.locator('#adminContent').getByText('Envio con Uber')).toBeVisible();
    await expect(page.locator('#adminContent').getByText('Av. Test 1234, Córdoba')).toBeVisible();
    await expect(page.locator('#adminContent').getByText(/ETA estimada: 45–60 min/)).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('3 · Contrato API demo + toggle en panel (habilitar/deshabilitar)', async ({ page }) => {
    // con Uber habilitado (default de la demo): la API responde ok con el costo demo
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    const quote = await page.evaluate(async () => {
      const r = await fetch('/api/uber/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status, body: await r.json() };
    });
    expect(quote.status).toBe(200);
    expect(quote.body.ok).toBe(true);
    expect(quote.body.demo).toBe(true);
    expect(quote.body.cost).toBe(4850);

    // deshabilitar desde el panel (sin recargar; el hash no relanza el initScript)
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible();

    const toggler = page.locator('#adminContent #settingsForm input[name="uberEnabled"]');
    await page.locator('[data-admin-tab="settings"]').click();
    await expect(toggler).toBeVisible({ timeout: 15_000 });
    // el tab re-renderiza la vista al cargar: dejamos asentar y re-aplicamos
    await page.waitForTimeout(300);
    if (await toggler.isChecked()) await toggler.uncheck();
    await expect(toggler).not.toBeChecked();
    await page.waitForTimeout(300);
    if (await toggler.isChecked()) await toggler.uncheck();
    await page.locator('#adminContent #settingsForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('Configuración guardada');
    // el re-render posterior al guardado debe reflejar el estado persistido
    await expect(toggler).not.toBeChecked();

    // ahora la API responde 400 uber_disabled y la opción queda oculta en el checkout
    const disabled = await page.evaluate(async () => {
      const r = await fetch('/api/uber/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status, body: await r.json() };
    });
    expect(disabled.status).toBe(400);
    expect(disabled.body.error).toBe('uber_disabled');

    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#productGrid [data-add-product]').first().click();
    await page.locator('#cartButton').click();
    await page.locator('#checkoutButton').click();
    await expect(page.locator('#uberChoiceCard')).toBeHidden({ timeout: 10_000 });
    await expectNoPageErrors(page);
  });

});