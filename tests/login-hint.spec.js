// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.10.1 · Pista de credenciales en el login.
 * Bug de confusión reportado por el dueño: "no puedo entrar al panel".
 * Causa: en la TIENDA REAL (?tienda=…) el panel pide la Clave de acceso de
 * POPUPS, no el PIN 1234 (que es solo de la demo). Ahora el login lo dice.
 */

const SUPA_HOST = 'zfnlcfnutnuatrhgbbci.supabase.co';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
  });
});

test('La demo muestra la pista del PIN 1234', async ({ page }) => {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  const hint = page.locator('#loginCloudHint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('el PIN es 1234');
  await expect(page.locator('#loginForm label span')).toHaveText('PIN de administrador');
});

test('Una tienda cloud pide la Clave de acceso de POPUPS (no el PIN)', async ({ page }) => {
  await page.route(`**/rest/v1/rpc/**`, async (route) => {
    if (!route.request().url().includes(SUPA_HOST)) return route.fallback();
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey,authorization,content-type', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const name = req.url().split('/rpc/')[1];
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
    if (name === 'api_public') {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, biz: 'Tecno Test', status: 'activa', contact: '', mp_ok: false, cfg: { settings: { brandName: 'Tecno Test' }, content: null, legal: null }, products: [] }) });
    }
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'bad_key' }) });
  });
  await page.goto('/index.html?tienda=prueba#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 20_000 });
  const hint = page.locator('#loginCloudHint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Clave de acceso');
  await expect(page.locator('#loginForm label span')).toHaveText('Clave de acceso (te la dio POPUPS)');
});
