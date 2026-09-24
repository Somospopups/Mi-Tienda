// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.9.2 · Guardado de imágenes en tiendas cloud (modo edición).
 *
 * Bug real reportado (tienda ?tienda=eze-pece): al cambiar la imagen del hero,
 * la subida fallaba. Causas raíz corregidas:
 *  1. mtRpc cortaba a los 9 s con un solo intento → subidas lentas morían con
 *     "sin conexión" aunque el servidor las recibiera. Ahora: 45 s para
 *     api_save_cfg + 1 reintento automático ante fallo de red/timeout.
 *  2. El espejo local (localStorage sin cupo) podía tumbar el guardado DESPUÉS
 *     de que la nube lo aceptó. Ahora la escritura del espejo es best-effort.
 *  3. Las imágenes del modo edición se comprimen con tope estricto (escalera
 *     1400→600 px) para que el payload viaje bien por conexiones lentas.
 *
 * Las RPC de Supabase se stubean con page.route (sin red real).
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
 * Stub de RPC de Supabase. handlers: nombre → (body) => respuesta, o
 * { __abort: true } para simular un fallo de red real (fetch rechaza).
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
    if (out && out.__abort) return route.abort('connectionrefused'); // fallo de red REAL (fetch rechaza)
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(out || {}) });
  });
  return calls;
}

function fakeCloudHandlers() {
  const state = { slug: 'prueba', key: 'clave-dueño-2026', biz: 'Tecno Test', saveCalls: 0 };
  const panel = () => ({
    ok: true, biz: state.biz, owner: 'Dueño', status: 'activa', contact: '', plan_id: 'p50',
    plan: { max: 50, price: 50000 }, paid_until: '2099-12-31', mp_ok: false, mp_nick: '',
    cfg: { settings: { brandName: state.biz, tagline: 'Test', whatsappNumber: '', mercadoPagoEnabled: false, whatsappEnabled: true }, content: null, legal: null, customers: [], orders: [], subscribers: [], nextOrderNumber: 1002 },
    products: []
  });
  const handlers = {
    api_public: () => ({ ok: true, biz: state.biz, status: 'activa', contact: '', mp_ok: false, cfg: { settings: panel().cfg.settings, content: null, legal: null }, products: [] }),
    api_panel: () => panel(),
    api_save_cfg: (body) => {
      state.saveCalls++;
      if (body.p_key !== state.key) return { ok: false, error: 'bad_key' };
      return { ok: true };
    }
  };
  return { state, handlers };
}

async function enterEditModeCloud(page) {
  await page.goto('/index.html?tienda=prueba#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
  await page.locator('#loginForm input[name="pin"]').fill('clave-dueño-2026');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 20_000 });
  await page.locator('#viewStore').click();
  await expect(page.locator('#shopApp')).toBeVisible();
  await expect(page.locator('.mt-edit-float')).toBeVisible();
  await page.locator('.mt-edit-float').click();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
}

test.describe('v0.9.2 · Imágenes y resiliencia de guardado cloud', () => {

  test('I1 · Cambiar la imagen del hero en tienda cloud: se comprime con tope y sincroniza', async ({ page }) => {
    const { handlers } = fakeCloudHandlers();
    const calls = await stubCloud(page, handlers);
    await enterEditModeCloud(page);

    // Abrir el editor de la imagen principal del hero
    await page.locator('.hero-main-image img').click();
    await expect(page.locator('#mtEditBody')).toBeVisible();
    await expect(page.locator('#mtEditTitle')).toContainText('Imagen de la tienda');

    // Elegir una imagen grande y ruidosa (fuerza la escalera de compresión)
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = 1000;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(1600, 1000);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (i * 7) % 256; img.data[i + 1] = (i * 13) % 256; img.data[i + 2] = (i * 29) % 256; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'hero.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('#mtEditBody input[type="file"]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // La zona confirma la actualización (antes: acá aparecía el error)
    await expect(page.locator('#mtEditBody')).toContainText('Imagen actualizada ✓', { timeout: 30_000 });

    // La nube recibió el contenido con la imagen, comprimida bajo el tope
    await expect.poll(() => calls.filter((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && typeof c.body.p_cfg.content.heroImageMain === 'string' && c.body.p_cfg.content.heroImageMain.startsWith('data:')).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const save = calls.find((c) => c.name === 'api_save_cfg' && c.body.p_cfg && c.body.p_cfg.content && c.body.p_cfg.content.heroImageMain);
    expect(save.body.p_store).toBe('prueba');
    expect(save.body.p_key).toBe('clave-dueño-2026');
    expect(save.body.p_cfg.content.heroImageMain.length).toBeLessThan(900_000);
    expect(save.body.p_cfg.content.heroImageMain.startsWith('data:image/')).toBe(true); // es una imagen válida (el PNG sintético de patrón regular comprime a pocos cientos de bytes)
    await expectNoPageErrors(page);
  });

  test('I2 · Si la red falla una vez, api_save_cfg se reintenta solo y el guardado sale bien', async ({ page }) => {
    const { state, handlers } = fakeCloudHandlers();
    let saveAttempts = 0;
    const calls = await stubCloud(page, {
      ...handlers,
      api_save_cfg: (body) => {
        saveAttempts++;
        if (saveAttempts === 1) return { __abort: true }; // primer intento: fallo de red real
        return handlers.api_save_cfg(body);
      }
    });
    await enterEditModeCloud(page);

    // Editar un texto y guardar (dispara api_save_cfg en cola)
    await page.locator('[data-content="heroCardName"]').click();
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await pop.locator('input').fill('Nombre con reintento');
    await pop.locator('[data-mt-save]').click();
    await expect(page.locator('[data-content="heroCardName"]')).toHaveText('Nombre con reintento');

    // El primer intento aborta, el segundo llega: exactamente 2 llamadas
    await expect.poll(() => saveAttempts, { timeout: 20_000 }).toBe(2);
    const okCall = calls.filter((c) => c.name === 'api_save_cfg')[1];
    expect(okCall.body.p_cfg.content.heroCardName).toBe('Nombre con reintento');
    expect(state.saveCalls).toBe(1); // la real (el abort nunca llegó al handler de negocio)
    await page.locator('.mt-edit-popover [data-mt-cancel]').click();
    await expectNoPageErrors(page);
  });

});

test('I3 · Presupuesto de payload: si el contenido acumulado es muy grande, las imágenes se re-comprimen antes de viajar', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
  const result = await page.evaluate(async () => {
    // Dos imágenes reales grandes (~500 KB c/u como dataURL) + texto
    const makeImage = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400; canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      // ruido pseudoaleatorio para que comprima como una foto real
      const img = ctx.createImageData(1400, 1400);
      let seed = 12345;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = seed % 256; img.data[i + 1] = (seed >> 8) % 256; img.data[i + 2] = (seed >> 16) % 256; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
    };
    const content = { heroImageMain: await makeImage(), editorialImage: await makeImage(), catalogTitle: 'x'.repeat(50) };
    const before = Object.values(content).reduce((n, v) => n + String(v).length, 0);
    const out = await window.mtShrinkContentForCloud(content);
    const after = Object.values(out).reduce((n, v) => n + String(v).length, 0);
    return { before, after };
  });
  expect(result.before).toBeGreaterThan(900_000);
  expect(result.after).toBeLessThan(950_000);
  expect(result.after).toBeLessThan(result.before);
  await expectNoPageErrors(page);
});
