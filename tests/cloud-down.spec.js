// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.20 · Nube caída con ?tienda= — fin del modo offline silencioso.
 *
 * Regresión del caso real de la tienda Eze.pece: el dueño abrió su tienda en
 * una PC que no llegaba a Supabase y, sin ningún aviso, el frontend le sirvió
 * la demo local (otro catálogo + PIN 1234). Conclusión equivocada: "mis
 * productos no existieron / mi clave no sirve". Ahora la nube inaccesible se
 * CORTA y se avisa; la demo local sólo existe sin ?tienda=.
 */

const SUPA_HOST = 'zfnlcfnutnuatrhgbbci.supabase.co';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey,authorization,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json'
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (_) { }
  });
  // Backends de sincronización secundaria (kvdb.io / restful-api.dev): son un
  // reintento de respaldo no fatal. Los abortamos para que los tests sean
  // deterministas y no ensucien la consola (abort → net::ERR, ya filtrado).
  await page.route(/kvdb\.io|restful-api\.dev/, (route) => route.abort('failed'));
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

/** Corta TODA la red hacia Supabase (proyecto inaccesible, DNS bloqueado, etc.). */
async function killCloud(page) {
  await page.route(/zfnlcfnutnuatrhgbbci\.supabase\.co/, (route) => route.abort('failed'));
}

/** Nube viva y determinística (mismo stub que edit-mode-cloud). `__abort` simula corte de red. */
async function stubCloud(page, handlers) {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    if (!route.request().url().includes(SUPA_HOST)) return route.fallback();
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
    const name = req.url().split('/rpc/')[1];
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (_) { }
    const handler = handlers[name];
    if (!handler) return route.fulfill({ status: 500, headers: CORS, body: JSON.stringify({ ok: false, error: 'unstubbed_' + name }) });
    const out = typeof handler === 'function' ? await handler(body) : handler;
    if (out && out.__abort) return route.abort('connectionrefused');
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(out) });
  });
}

function liveHandlers(key = 'clave-eze-2026') {
  const cfg = { settings: { brandName: 'Eze-pece Test', storefront: 'luma' }, content: null, legal: null, customers: [], orders: [], subscribers: [], nextOrderNumber: 1002 };
  return {
    api_public: () => ({ ok: true, biz: 'Eze-pece Test', status: 'activa', contact: '', mp_ok: false, cfg: { settings: cfg.settings, content: null, legal: null }, products: [] }),
    api_panel: () => ({ ok: true, biz: 'Eze-pece Test', owner: 'Dueño', status: 'activa', contact: '', plan_id: 'p100', plan: { max: 100, price: 100000 }, paid_until: '2099-12-31', mp_ok: false, mp_nick: '', cfg, products: [] }),
    api_save_cfg: () => ({ ok: true }),
    api_key_change: () => ({ ok: true })
  };
}

test.describe('Nube caída con ?tienda= (v0.20)', () => {

  test('1 · Se avisa y NO se sirve la demo local (antes: catálogo vacío sin explicación)', async ({ page }) => {
    await killCloud(page);
    await page.goto('/index.html?tienda=eze-pece');
    await expect(page.locator('#emptyState')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#emptyState h3')).toHaveText('Sin conexión con la nube');
    await expect(page.locator('#emptyState p')).toContainText('no mostramos una tienda de relleno');
    await expect(page.locator('#emptyReset')).toHaveText('Reintentar');
    await expect(page.locator('.product-card')).toHaveCount(0);
    // El cartel de suspensión (puerta) NO corresponde: la red falló, no la tienda.
    await expect(page.locator('#mt-gate')).toHaveCount(0);
    // Y la pastilla de estado queda visible para que nadie la confunda.
    await expect(page.locator('#mtModePill')).toBeVisible();
    await expect(page.locator('#mtModePill')).toContainText('no es la tienda real');
    await expectNoPageErrors(page);
  });

  test('2 · El panel cloud NO acepta el PIN local 1234 con la nube caída', async ({ page }) => {
    await killCloud(page);
    await page.goto('/index.html?tienda=eze-pece#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginForm input[name="pin"]').fill('1234');
    await page.locator('#loginForm #btnSubmitLogin').click();
    await expect(page.locator('#loginError')).not.toHaveText('', { timeout: 30_000 });
    await expect(page.locator('#adminShell')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('3 · Sin ?tienda= la demo local sigue funcionando igual (sin pastilla)', async ({ page }) => {
    await killCloud(page);
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card')).toHaveCount(6, { timeout: 15_000 });
    await expect(page.locator('#mtModePill')).toHaveCount(0);
    await expectNoPageErrors(page);
  });

  test('4 · Tienda cloud viva: el enlace con ?tienda= muestra la tienda real y el login pide la Clave de acceso', async ({ page }) => {
    await stubCloud(page, liveHandlers());
    await page.goto('/index.html?tienda=eze-pece');
    await expect(page.locator('[data-brand]').first()).toHaveText('Eze-pece Test', { timeout: 20_000 });
    await expect(page.locator('#mtModePill')).toHaveCount(0);
    await expect(page.locator('#emptyState h3')).not.toHaveText('Sin conexión con la nube');
    await page.goto('/index.html?tienda=eze-pece#admin');
    await expect(page.locator('#loginForm').getByText('Clave de acceso (te la dio POPUPS)')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginForm input[name="pin"]').fill('clave-eze-2026');
    await page.locator('#loginForm #btnSubmitLogin').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
    await expectNoPageErrors(page);
  });

  test('5 · Cambios sin sincronizar: banner en el panel y "Reintentar ahora" los sube', async ({ page }) => {
    await stubCloud(page, liveHandlers('clave-eze-2026'));
    await page.goto('/index.html?tienda=eze-pece#admin');
    await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginForm input[name="pin"]').fill('clave-eze-2026');
    await page.locator('#loginForm #btnSubmitLogin').click();
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });

    // Un cambio quedó en el equipo sin subir (lo que deja el panel cuando una
    // escritura falla a medias). El banner lo avisa y ofrece reintentar.
    await page.evaluate(() => {
      sessionStorage.setItem('luma_sync_dirty', '1');
      window.mtCloudGlue.syncBar();
    });
    await expect(page.locator('#mtSyncBar')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#mtSyncBar')).toContainText('Sin conexión con la nube');

    // Vuelve la nube: "Reintentar ahora" sube lo pendiente y el banner se va.
    await page.locator('#mtSyncRetry').click();
    await expect(page.locator('#mtSyncBar')).toHaveCount(0, { timeout: 30_000 });
    await expectNoPageErrors(page);
  });

  test('6 · store_not_found sigue siendo un aviso propio (no el de nube caída)', async ({ page }) => {
    await stubCloud(page, { api_public: () => ({ ok: false, error: 'store_not_found' }) });
    await page.goto('/index.html?tienda=__no_existe__');
    await expect(page.locator('#emptyState')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#emptyState h3')).toHaveText('No pudimos cargar la tienda');
    await expect(page.locator('#mtModePill')).toHaveCount(0);
  });

});
