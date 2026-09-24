// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Modo edición visual v0.8 — guardado en la nube (Supabase stubbeado, sin red).
 *
 * La demo del WYSIWYG guarda offline por el mock /api/*; para una tienda vendida
 * eso mismo se sincroniza con la nube vía writeStore → mtAdmWrite → api_save_cfg.
 * Este spec verifica el camino NUEVO de v0.8: editar un texto del hero y guardar
 * desde la tienda en modo cloud debe disparar api_save_cfg con la p_key correcta
 * y el diff de contenido. Las RPC de Supabase se stubean con page.route (misma
 * técnica que tests/security.spec.js) para no depender de la red del runner.
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

function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

/**
 * Stub de las RPC de Supabase. `handlers` mapea nombre de RPC → función (body) => respuesta,
 * u objeto `{ status, json }`. Devuelve `calls`, la lista de RPC invocadas con su payload.
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

/** Estado mutable de una tienda cloud falsa. */
function fakeCloudStore(seed = { slug: 'prueba', key: 'clave-dueño-2026', biz: 'Panadería Test' }) {
  const state = { slug: seed.slug, key: seed.key, biz: seed.biz, saveCfgWith: [] };
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
      nextOrderNumber: 1002
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
    }
  };
  return { state, handlers };
}

/** Login cloud (dueño) → "Ver tienda" → botón flotante visible → modo edición activo. */
async function enterEditModeCloud(page) {
  await page.goto('/index.html?tienda=prueba#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#loginForm').getByText('Clave de acceso (te la dio POPUPS)')).toBeVisible();
  await page.locator('#loginForm input[name="pin"]').fill('clave-dueño-2026');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });

  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-float')).toBeVisible();
  await page.locator('.mt-edit-float').click();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
}

test.describe('Modo edición visual en la nube (dueño cloud)', () => {

  test('14 · Editar un texto desde la tienda sincroniza con api_save_cfg', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);
    await enterEditModeCloud(page);

    await page.locator('[data-content="heroCardName"]').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input').fill('Foco Norte');
    await pop.locator('[data-mt-save]').click();
    await expect(page.locator('[data-content="heroCardName"]')).toHaveText('Foco Norte');

    // El guardado cloud es asíncrono (mtAdmQueue → api_save_cfg): esperar que pegue
    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Foco Norte').length, { timeout: 20_000 }).toBeGreaterThan(0);
    const save = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Foco Norte');
    expect(save.body.p_store).toBe('prueba');
    expect(save.body.p_key).toBe('clave-dueño-2026');
    expect(state.saveCfgWith.every((k) => k === 'clave-dueño-2026')).toBe(true);

    await page.locator('.mt-edit-popover [data-mt-cancel]').click();
    await page.locator('[data-mt-done]').click();
    await expectNoPageErrors(page);
  });

  test('15 · La barra de anuncio (settings) también se sincroniza en la nube', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);
    await enterEditModeCloud(page);

    await page.locator('#announcement').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input').fill('Cambios gratis esta semana');
    await pop.locator('[data-mt-save]').click();
    await expect(page.locator('#announcement')).toContainText('Cambios gratis esta semana');

    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.settings && c.body.p_cfg.settings.announcement === 'Cambios gratis esta semana').length, { timeout: 20_000 }).toBeGreaterThan(0);
    const save = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.settings && c.body.p_cfg.settings.announcement === 'Cambios gratis esta semana');
    expect(save.body.p_store).toBe('prueba');
    expect(save.body.p_key).toBe('clave-dueño-2026');
    expect(state.saveCfgWith.every((k) => k === 'clave-dueño-2026')).toBe(true);

    await page.locator('.mt-edit-popover [data-mt-cancel]').click();
    await page.locator('[data-mt-done]').click();
    await expectNoPageErrors(page);
  });

});