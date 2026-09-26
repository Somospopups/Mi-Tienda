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

/** Login cloud (dueño) → "Ver tienda / Editar" → el modo edición queda activo. */
async function enterEditModeCloud(page) {
  await page.goto('/index.html?tienda=prueba#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#loginForm').getByText('Clave de acceso (te la dio POPUPS)')).toBeVisible();
  await page.locator('#loginForm input[name="pin"]').fill('clave-dueño-2026');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });

  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
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

  test('16 · Si la nube falla al guardar se muestra un error (sin falso "Guardado")', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    handlers.api_save_cfg = (body) => {
      state.saveCfgWith.push(body.p_key);
      return { ok: false, error: 'Sin conexión con la nube.' };
    };
    const calls = await stubCloud(page, handlers);
    await enterEditModeCloud(page);

    await page.locator('[data-content="heroCardName"]').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input').fill('Foco Norte');
    await pop.locator('[data-mt-save]').click();

    // El error de api_save_cfg llega a la UI: no se festeja un guardado inexistente.
    await expect(pop.locator('.mt-err')).toBeVisible({ timeout: 15_000 });
    await expect(pop.locator('.mt-err')).toContainText('Sin conexión con la nube');
    // El contenido en pantalla NO cambió: no hubo falso éxito.
    await expect(page.locator('[data-content="heroCardName"]')).toHaveText('Lámpara Aura');
    // La RPC intentó el guardado con p_store/p_key correctas (aunque falló).
    expect(calls.some((c) => c.name === 'api_save_cfg' && c.body.p_store === 'prueba' && c.body.p_key === 'clave-dueño-2026' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Foco Norte')).toBe(true);
    expect(state.saveCfgWith.every((k) => k === 'clave-dueño-2026')).toBe(true);

    await page.locator('.mt-edit-popover [data-mt-cancel]').click();
    await page.locator('[data-mt-done]').click();
    await expectNoPageErrors(page);
  });

  test('17 · Tienda no encontrada: aviso claro en vez de la demo offline (no "vuelve a cero")', async ({ page }) => {
    await stubCloud(page, {
      api_public: () => ({ ok: false, error: 'store_not_found' }),
      api_panel: () => ({ ok: false, error: 'store_not_found' })
    });
    await page.goto('/index.html?tienda=no-existe');
    // No se sirve la demo LUMA: la tienda avisa que no existe.
    await expect(page.locator('#emptyState')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#emptyState h3')).toHaveText('No pudimos cargar la tienda');
    // El grid no muestra productos de la demo offline por defecto.
    await expect(page.locator('.product-card')).toHaveCount(0);
    await expectNoPageErrors(page);
  });

  test('18 · Cambios locales sin sincronizar no se pisan al recargar; se reintentan a la nube', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);

    // Simular una sesión con un fallo de sync previo: espejo local con un cambio
    // que la nube todavía no tiene, y el flag "dirty" activo (como deja mtAdmWrite).
    await page.goto('/index.html?tienda=prueba#admin');
    await page.evaluate(() => {
      sessionStorage.setItem('luma_mirror_slug', 'prueba');
      sessionStorage.setItem('luma_sync_dirty', '1');
      const local = {
        version: 1, nextOrderNumber: 1001,
        settings: { brandName: 'Panadería Test' },
        content: { heroCardName: 'Mi Panadería Local' },
        legal: {}, products: [], orders: [], customers: [], subscribers: [],
        finance: { movements: [], accounts: [] }, security: { adminPin: 'cloud' }
      };
      localStorage.setItem('luma_offline_store_v1', JSON.stringify(local));
    });

    await page.locator('#loginForm input[name="pin"]').fill('clave-dueño-2026');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });

    // mtAdmLoad NO pisó el cambio local: se reenvió a la nube (api_save_cfg con el contenido local).
    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Mi Panadería Local').length, { timeout: 20_000 }).toBeGreaterThan(0);
    const reSync = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Mi Panadería Local');
    expect(reSync.body.p_key).toBe('clave-dueño-2026');
    // Y la nube lo aceptó (el stub responde ok), el flag queda limpio.
    expect(state.saveCfgWith.every((k) => k === 'clave-dueño-2026')).toBe(true);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('luma_sync_dirty'))).toBe(null);
    await expectNoPageErrors(page);
  });

  test('19 · Tienda recién creada (cfg vacío): el dueño entra, edita y el 1er guardado materializa TODO el contenido en la nube', async ({ page }) => {
    const key = 'clave-cliente-2026';
    const state = { biz: 'Mi Panadería', saved: null };
    const handlers = {
      api_public: () => ({
        ok: true, biz: state.biz, status: 'activa', contact: '', mp_ok: false,
        cfg: { settings: null, content: state.saved, legal: null }, products: []
      }),
      api_panel: () => ({
        ok: true, biz: state.biz, owner: 'Cliente', status: 'activa', contact: '',
        plan_id: 'p25', plan: { max: 25, price: 20000 }, paid_until: '2099-12-31',
        mp_ok: false, mp_nick: '',
        cfg: { settings: null, content: state.saved, legal: null, customers: [], orders: [], subscribers: [], nextOrderNumber: 1001 },
        products: []
      }),
      api_save_cfg: (body) => {
        if (body.p_key !== key) return { ok: false, error: 'bad_key' };
        if (body.p_cfg && body.p_cfg.content) state.saved = body.p_cfg.content;
        return { ok: true };
      }
    };
    const calls = await stubCloud(page, handlers);

    // Escenario real: api_admin → 'create_store' solo con id/key/biz. La tienda
    // arranca sin cfg: el login del dueño usa la clave recién generada.
    await page.goto('/index.html?tienda=prueba#admin');
    await expect(page.locator('#loginForm input[name="pin"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginForm input[name="pin"]').fill(key);
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });

    await page.locator('#viewStore').click();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);

    // El cliente ve los defaults (la tienda estaba vacía) y edita el 1er texto.
    await page.locator('[data-content="heroCardName"]').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input').fill('Lámpara Norteña');
    await pop.locator('[data-mt-save]').click();
    await expect(page.locator('[data-content="heroCardName"]')).toHaveText('Lámpara Norteña');

    // El guardado va a api_save_cfg con TODO el bloque content (defaults + edición),
    // no solo el delta: así cfg = cfg ∪ p_cfg queda con el contenido completo.
    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Lámpara Norteña').length, { timeout: 20_000 }).toBeGreaterThan(0);
    const save = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroCardName === 'Lámpara Norteña');
    expect(save.body.p_store).toBe('prueba');
    expect(save.body.p_key).toBe(key);
    expect(save.body.p_cfg.content.heroTitle).toBe('Tu espacio.');
    expect(save.body.p_cfg.content.heroDescription).toBeDefined();

    // Recargar como VISITANTE (sin token ni espejo local): el cambio persiste en la nube.
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('/index.html?tienda=prueba');
    await expect(page.locator('[data-content="heroCardName"]')).toHaveText('Lámpara Norteña', { timeout: 20_000 });
    await expectNoPageErrors(page);
  });

  test('20 · Un bloque de la página se sincroniza con la nube y lo ve el visitante', async ({ page }) => {
    const { state, handlers } = fakeCloudStore();
    const calls = await stubCloud(page, handlers);
    await enterEditModeCloud(page);

    // Armar el home desde el panel de bloques.
    await page.locator('[data-mt-blocks]').click();
    await expect(page.locator('.bl-panel')).toBeVisible();
    await page.locator('[data-bl-add="hero"]').click();
    await expect(page.locator('.bl-editor')).toHaveClass(/open/);
    await page.locator('.bl-editor input[name="title"]').fill('Bienvenido a la prueba');
    await page.locator('[data-bl-editor-save]').click();
    await expect(page.locator('.bl-block[data-bl-index="0"] .bl-hero h2')).toHaveText('Bienvenido a la prueba');

    // El guardado va a api_save_cfg con la p_key correcta y los bloques en content.
    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && typeof c.body.p_cfg.content.builderBlocks === 'string' && c.body.p_cfg.content.builderBlocks.includes('Bienvenido a la prueba')).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const save = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && typeof c.body.p_cfg.content.builderBlocks === 'string' && c.body.p_cfg.content.builderBlocks.includes('Bienvenido a la prueba'));
    expect(save.body.p_store).toBe('prueba');
    expect(save.body.p_key).toBe(state.key);
    expect(JSON.parse(save.body.p_cfg.content.builderBlocks)[0].type).toBe('hero');

    // Visitante sin sesión: el home armado reemplaza al clásico.
    await page.locator('[data-mt-done]').click();
    await expect(page.locator('body')).toHaveClass(/mt-page/);
    await expect(page.locator('.bl-hero h2')).toHaveText('Bienvenido a la prueba');
    await expect(page.locator('#frontOfertas')).toBeHidden();
    await expect(page.locator('.luma-front').first()).toBeHidden();
    expectNoPageErrors(page);
  });

});