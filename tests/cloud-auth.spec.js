const { test, expect } = require('@playwright/test');
const { randomBytes } = require('crypto');

const publicStore = {
  ok: true,
  biz: 'Tienda de prueba',
  status: 'activa',
  paid_until: '2030-12-31',
  cfg: { settings: { storefront: 'tech' }, content: {}, legal: {} },
  products: [],
  mp_ok: false
};

function invalidCredential() {
  return randomBytes(24).toString('hex');
}

async function mockRpc(page, overrides = {}) {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').pop();
    const override = overrides[name];
    if (typeof override === 'function') return override(route, request);
    if (override) return route.fulfill({ status: override.status || 200, contentType: 'application/json', body: JSON.stringify(override.body) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

test.describe('Cloud auth fails closed', () => {
  test('a public RPC outage never renders the offline demo catalog', async ({ page }) => {
    const relayRequests = [];
    page.on('request', (request) => {
      if (/kvdb\.io|restful-api\.dev/i.test(request.url())) relayRequests.push(request.url());
    });
    await mockRpc(page, {
      api_public: async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) })
    });

    await page.goto('/?tienda=cloud-unavailable');
    await expect(page.locator('#emptyState')).toBeVisible();
    await expect(page.locator('#emptyState h3')).toHaveText(/Sin conexión con la nube/);
    await expect(page.locator('#productGrid .product-card')).toHaveCount(0);
    await expect(page.locator('#actitudProductGrid .product-card')).toHaveCount(0);
    expect(relayRequests).toEqual([]);
  });

  test('owner login does not accept local/demo auth when the panel RPC is unavailable', async ({ page }) => {
    await mockRpc(page, {
      api_public: { body: publicStore },
      api_panel: async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) })
    });
    await page.goto('/?tienda=cloud-login#admin');
    const input = page.locator('#loginForm input[name="pin"]');
    await expect(input).toBeVisible();
    await input.fill(invalidCredential());
    await page.locator('#btnSubmitLogin').click();
    await expect(page.locator('#loginError')).not.toBeEmpty();
    await expect(page.locator('#adminShell')).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('luma_admin_token'))).toBeNull();
  });

  test('a successful cloud owner login keeps the key out of Web Storage', async ({ page }) => {
    await mockRpc(page, {
      api_public: { body: publicStore },
      api_panel: { body: { ...publicStore, cfg: { settings: { storefront: 'tech' }, content: {}, legal: {} } } }
    });
    await page.goto('/?tienda=cloud-session#admin');
    const input = page.locator('#loginForm input[name="pin"]');
    await expect(input).toBeVisible();
    await input.fill(invalidCredential());
    await page.locator('#btnSubmitLogin').click();
    await expect(page.locator('#adminShell')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('luma_admin_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('luma_admin_token'))).toBeNull();
    expect(await page.evaluate(() => typeof window.mtCloudGlue.key)).toBe('undefined');
  });

  test('central POPUPS login calls api_admin and rejects an invalid credential', async ({ page }) => {
    let adminRequest = null;
    await mockRpc(page, {
      api_admin: async (route, request) => {
        adminRequest = request.postDataJSON();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'bad_pin' }) });
      }
    });
    await page.goto('/#admin');
    const launch = page.locator('#showSuperAdminLogin');
    await expect(launch).toBeVisible();
    await launch.click();
    const form = page.locator('#superAdminLoginForm');
    await form.locator('input[name="pin"]').fill(invalidCredential());
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#superAdminLoginError')).toHaveText(/no coincide|rotada/i);
    expect(adminRequest && adminRequest.p_action).toBe('list');
    await expect(page.locator('#superAdminBackdrop')).toBeHidden();
  });
});
