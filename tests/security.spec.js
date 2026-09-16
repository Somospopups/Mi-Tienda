// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Seguridad del panel · cambio de acceso (v0.7.3)
 *
 * Cubre el bug reportado: el dueño pegaba su Clave de acceso en Ajustes →
 * Seguridad para cambiarla y (a) el backend cloud rechazaba siempre con 403 y
 * (b) los campos numéricos del formulario de Configuración cancelaban el submit
 * por validación nativa, trabando TODO el guardado de ajustes.
 *
 * Los casos offline (demo) son 100% determinísticos. Los casos cloud stubbean
 * las RPC de Supabase con page.route para no depender de la red del runner.
 */

const SUPA_HOST = 'zfnlcfnutnuatrhgbbci.supabase.co';

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

function expectNoPageErrors(page, ignore = /(?!)/) {
  // @ts-ignore
  const errors = (page.__jsErrors || []).filter((e) => !ignore.test(e));
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

/**
 * Stub del backend Supabase. `handlers` mapea nombre de RPC → función (body) => respuesta,
 * o un objeto `{ status, json }` para simular errores de PostgREST (función inexistente).
 * Devuelve `calls`, la lista de RPCs invocadas con su payload (para aserciones).
 */
async function stubCloud(page, handlers) {
  const calls = [];
  await page.route(`**/rest/v1/rpc/**`, async (route) => {
    if (!route.request().url().includes(SUPA_HOST)) return route.fallback();
    const req = route.request();
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Content-Type': 'application/json'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const name = req.url().split('/rpc/')[1];
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
    calls.push({ name, body });
    const handler = handlers[name];
    if (!handler) return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'unstubbed_' + name }) });
    const out = typeof handler === 'function' ? await handler(body, calls) : handler;
    const json = { ...(out || {}) };
    const status = json.__status || 200;
    delete json.__status;
    return route.fulfill({ status, headers: cors, body: JSON.stringify(json) });
  });
  return calls;
}

/** Estado mutable de una tienda cloud falsa: clave actual + fecha de último cambio. */
function fakeCloudStore(seed = { slug: 'prueba', key: 'clave-vieja-123', biz: 'Panadería Test' }) {
  const state = { slug: seed.slug, key: seed.key, biz: seed.biz, changedAt: null, saveCfgWith: [] };
  const panel = () => ({
    ok: true,
    biz: state.biz,
    owner: 'Dueño Test',
    status: 'activa',
    contact: '351 555-0101',
    plan_id: 'p50',
    plan: { max: 50, price: 50000 },
    paid_until: '2099-12-31',
    mp_ok: false,
    mp_nick: '',
    cfg: {
      settings: { brandName: state.biz, tagline: 'Test', whatsappNumber: '', mercadoPagoEnabled: false, whatsappEnabled: true },
      content: null,
      legal: null,
      customers: [],
      orders: [],
      subscribers: [],
      nextOrderNumber: 1002,
      ...(state.changedAt ? { security: { changedAt: state.changedAt } } : {})
    },
    products: []
  });
  const handlers = {
    api_public: () => ({ ok: true, biz: state.biz, status: 'activa', contact: '', mp_ok: false, cfg: { settings: panel().cfg.settings, content: null, legal: null }, products: [] }),
    api_panel: () => panel(),
    api_save_cfg: (body) => {
      state.saveCfgWith.push(body.p_key);
      if (body.p_key !== state.key) return { ok: false, error: 'bad_key' };
      return { ok: true };
    },
    api_key_change: (body) => {
      if (body.p_key !== state.key) return { ok: false, error: 'bad_key' };
      if (!body.p_new_key || body.p_new_key.length < 6) return { ok: false, error: 'clave_corta' };
      if (body.p_new_key === body.p_key) return { ok: false, error: 'key_equal' };
      state.key = body.p_new_key;
      state.changedAt = '2026-09-15T12:00:00.000Z';
      return { ok: true, changedAt: state.changedAt };
    }
  };
  return { state, handlers };
}

async function loginCloud(page, key) {
  await page.goto('/index.html?tienda=prueba#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
  // El login se adapta a clave alfanumérica (eso siempre funcionó; lo que estaba roto era el cambio)
  await expect(page.locator('#loginForm').getByText('Clave de acceso (te la dio POPUPS)')).toBeVisible();
  await page.locator('#loginForm input[name="pin"]').fill(key);
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-admin-tab="settings"]').click();
  await expect(page.locator('#adminContent .admin-loader')).toHaveCount(0, { timeout: 20_000 });
}

async function openKeyForm(page) {
  await expect(page.locator('#keyForm')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#keyForm input[name="currentPin"]')).toBeVisible();
}

test.describe('Cambio de Clave de acceso en la nube (panel del dueño)', () => {

  test('11 · Cambia la clave, mantiene la sesión y registra el último cambio', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);
    await loginCloud(page, 'clave-vieja-123');
    await openKeyForm(page);

    // En la nube los campos NO son numéricos: aca se puede pegar la clave real
    const nuevo = page.locator('#keyForm input[name="newPin"]');
    await expect(nuevo).toHaveAttribute('maxlength', '64');
    await expect(nuevo).not.toHaveAttribute('pattern', '[0-9]*');
    await expect(page.locator('#keyForm')).toContainText('Nueva clave');

    await page.locator('#keyForm input[name="currentPin"]').fill('clave-vieja-123');
    await page.locator('#keyForm input[name="newPin"]').fill('pan-esperanza-2026');
    await page.locator('#keyForm input[name="confirmPin"]').fill('pan-esperanza-2026');
    await page.locator('#keyForm button[type="submit"]').click();

    await expect(page.locator('#toastRegion')).toContainText('Acceso actualizado', { timeout: 20_000 });
    const change = calls.find((c) => c.name === 'api_key_change');
    expect(change.body.p_store).toBe('prueba');
    expect(change.body.p_key).toBe('clave-vieja-123');
    expect(change.body.p_new_key).toBe('pan-esperanza-2026');

    // La sesión sigue viva con la clave nueva (si no, el panel se cortaría al minuto)
    expect(await page.evaluate(() => sessionStorage.getItem('luma_admin_token'))).toBe('ck:pan-esperanza-2026');
    expect(state.key).toBe('pan-esperanza-2026');

    // El panel sigue operando: guardar ajustes sincroniza con la clave nueva
    await page.locator('#settingsForm input[name="tagline"]').fill('Tagline editada');
    await page.locator('#settingsForm button[type="submit"]').click();
    await expect.poll(async () => state.saveCfgWith.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(state.saveCfgWith.every((k) => k === 'pan-esperanza-2026')).toBe(true);

    // "Último cambio" aparece en la tarjeta cuando el panel se recarga desde la nube
    await page.locator('[data-admin-tab="products"]').click();
    await page.locator('[data-admin-tab="settings"]').click();
    await expect(page.locator('#adminContent .security-card')).toContainText('Último cambio', { timeout: 20_000 });
    await expectNoPageErrors(page);
  });

  test('12 · Clave actual incorrecta: avisa y NO cambia el acceso', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);
    await loginCloud(page, 'clave-vieja-123');
    await openKeyForm(page);

    await page.locator('#keyForm input[name="currentPin"]').fill('la-claveequivocada');
    await page.locator('#keyForm input[name="newPin"]').fill('nueva-clave-123');
    await page.locator('#keyForm input[name="confirmPin"]').fill('nueva-clave-123');
    await page.locator('#keyForm button[type="submit"]').click();

    await expect(page.locator('#toastRegion')).toContainText('La clave actual no coincide', { timeout: 20_000 });
    expect(state.key).toBe('clave-vieja-123');
    expect(calls.filter((c) => c.name === 'api_key_change')).toHaveLength(1);
    // el 404 del stub es deliberado (así responde PostgREST cuando la función no existe)
    await expectNoPageErrors(page, /status of 404/);
  });

  test('13 · Regresión del bug: pegar una clave con letras no traba Configuración', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    await stubCloud(page, handlers);
    await loginCloud(page, 'clave-vieja-123');
    await openKeyForm(page);

    // El reporte textual del dueño: "le pide la que pasó el administrador, la pega…".
    // Antes esto bastaba para que el botón "Guardar cambios" no hiciera nada.
    await page.locator('#keyForm input[name="currentPin"]').fill('clave-vieja-123-con-letras-y-guiones');
    await page.locator('#settingsForm input[name="tagline"]').fill('Tagline salva');
    await page.locator('#settingsForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('Configuración guardada', { timeout: 20_000 });

    // y los campos de acceso no viven más dentro del formulario de ajustes
    await expect(page.locator('#settingsForm input[name="newPin"]')).toHaveCount(0);
    expect(state.key).toBe('clave-vieja-123');
    await expectNoPageErrors(page);
  });

  test('14 · Sin la RPC instalada: tarjeta honesta con botón para pedírsela a POPUPS', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    // PostgREST cuando la función no existe: 404 + PGRST202
    handlers.api_key_change = { __status: 404, code: 'PGRST202', message: 'Could not find the function public.api_key_change(text, text, text) in the schema cache' };
    const calls = await stubCloud(page, handlers);
    await loginCloud(page, 'clave-vieja-123');
    await openKeyForm(page);

    await page.locator('#keyForm input[name="currentPin"]').fill('clave-vieja-123');
    await page.locator('#keyForm input[name="newPin"]').fill('nueva-clave-123');
    await page.locator('#keyForm input[name="confirmPin"]').fill('nueva-clave-123');
    await page.locator('#keyForm button[type="submit"]').click();

    await expect(page.locator('#toastRegion')).toContainText('Tu clave la cambia POPUPS', { timeout: 20_000 });

    // La tarjeta se reemplaza por la vía de pedido (sin callejón sin salida, sin 403 críptico)
    await expect(page.locator('#keyForm')).toHaveCount(0, { timeout: 20_000 });
    const pedir = page.locator('.security-card a.button');
    await expect(pedir).toBeVisible();
    await expect(pedir).toHaveText(/Pedir cambio de clave/);
    expect(await pedir.getAttribute('href')).toContain('mailto:somospopups@gmail.com');
    expect(state.key).toBe('clave-vieja-123');
    expect(calls.filter((c) => c.name === 'api_key_change')).toHaveLength(1);
    // el 404 del stub es deliberado (así responde PostgREST cuando la función no existe)
    await expectNoPageErrors(page, /status of 404/);
  });

});

test.describe('PIN de la demo offline (sin ?tienda=)', () => {

  async function loginDemo(page) {
    await page.goto('/index.html#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-admin-tab="settings"]').click();
    await expect(page.locator('#adminContent .admin-loader')).toHaveCount(0, { timeout: 20_000 });
  }

  test('15 · Cambia el PIN y se puede entrar con el nuevo', async ({ page }) => {
    await loginDemo(page);
    await openKeyForm(page);
    await expect(page.locator('#keyForm')).toContainText('Nuevo PIN');
    await expect(page.locator('#keyForm input[name="newPin"]')).toHaveAttribute('maxlength', '8');

    await page.locator('#keyForm input[name="currentPin"]').fill('1234');
    await page.locator('#keyForm input[name="newPin"]').fill('4321');
    await page.locator('#keyForm input[name="confirmPin"]').fill('4321');
    await page.locator('#keyForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('Acceso actualizado', { timeout: 20_000 });
    await expect(page.locator('#adminContent .security-card')).toContainText('Último cambio');

    // el Pin nuevo rige de inmediato: salir y volver a entrar
    await page.locator('#logoutButton').click();
    await expect(page.locator('#adminLogin')).toBeVisible();
    await page.locator('#loginForm input[name="pin"]').fill('4321');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
    await expectNoPageErrors(page);
  });

  test('16 · PIN actual incorrecto no cambia nada y avisos claros', async ({ page }) => {
    await loginDemo(page);
    await openKeyForm(page);
    await page.locator('#keyForm input[name="currentPin"]').fill('9999');
    await page.locator('#keyForm input[name="newPin"]').fill('4321');
    await page.locator('#keyForm input[name="confirmPin"]').fill('4321');
    await page.locator('#keyForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('El PIN actual no es correcto', { timeout: 20_000 });

    await page.locator('#logoutButton').click();
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
    await expectNoPageErrors(page);
  });

  test('17 · Valida formato y confirmación antes de llamar a la API', async ({ page }) => {
    await loginDemo(page);
    await openKeyForm(page);
    // demasiado corto
    await page.locator('#keyForm input[name="currentPin"]').fill('1234');
    await page.locator('#keyForm input[name="newPin"]').fill('12');
    await page.locator('#keyForm input[name="confirmPin"]').fill('12');
    await page.locator('#keyForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('entre 4 y 8 números', { timeout: 20_000 });

    // no coincide la confirmación
    await page.locator('#keyForm input[name="newPin"]').fill('4321');
    await page.locator('#keyForm input[name="confirmPin"]').fill('8765');
    await page.locator('#keyForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('no coincide', { timeout: 20_000 });

    // igual a la actual
    await page.locator('#keyForm input[name="newPin"]').fill('1234');
    await page.locator('#keyForm input[name="confirmPin"]').fill('1234');
    await page.locator('#keyForm button[type="submit"]').click();
    await expect(page.locator('#toastRegion')).toContainText('distinta a la actual', { timeout: 20_000 });

    // el PIN sigue siendo el original
    const pinActual = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).security.adminPin);
    expect(pinActual).toBe('1234');
    await expectNoPageErrors(page);
  });

  test('18 · El botón "mostrar" de la clave funciona y no rompe el formulario', async ({ page }) => {
    await loginDemo(page);
    await openKeyForm(page);
    const campo = page.locator('#keyForm input[name="newPin"]');
    await expect(campo).toHaveAttribute('type', 'password');
    await page.locator('#keyForm button[data-key-reveal]').nth(1).click();
    await expect(campo).toHaveAttribute('type', 'text');
    await page.locator('#keyForm button[data-key-reveal]').nth(1).click();
    await expect(campo).toHaveAttribute('type', 'password');
    await expectNoPageErrors(page);
  });

});
