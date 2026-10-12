// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Modo Tech (v0.17) — el HTML de Eze.pece tal cual, en un iframe aislado,
 * con el catálogo de Mi-Tienda inyectado adentro (compra completa).
 * El selector de modos (Tienda / Tech) sale al tocar "Ver tienda / Editar"
 * y persiste en settings.storefront. Es extensible: MT_MODES.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_tech_clean')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__mt_tech_clean', '1');
      }
    } catch (_) {}
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

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm #btnSubmitLogin').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

/** Activa el modo Tech en la demo offline y recarga. */
async function useTechFront(page) {
  await page.goto('/index.html');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const raw = localStorage.getItem('luma_offline_store_v1');
    if (!raw) throw new Error('No hay store demo en localStorage');
    const store = JSON.parse(raw);
    store.settings.storefront = 'tech';
    localStorage.setItem('luma_offline_store_v1', JSON.stringify(store));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
}

test.describe('Modo Tech (v0.17)', () => {

  test('T1 · "Ver tienda / Editar" abre el selector con los modos Tienda y Tech', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    const cards = page.locator('#modeChooserGrid .mode-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#modeChooserGrid [data-mode-id="luma"]')).toBeVisible();
    await expect(page.locator('#modeChooserGrid [data-mode-id="tech"]')).toBeVisible();
    // el modo actual viene marcado (luma de fábrica)
    await expect(page.locator('#modeChooserGrid [data-mode-id="luma"]')).toHaveClass(/is-active/);
    // cerrar con la X no entra al modo edición ni cambia nada
    await page.locator('#modeChooserClose').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeHidden();
    await expect(page.locator('#adminShell')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expectNoPageErrors(page);
  });

  test('T2 · Elegir Tienda aplica luma, cierra el panel y entra al modo edición', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    await page.locator('#modeChooserGrid [data-mode-id="luma"]').click();
    await expect(page.locator('#shopApp')).toBeVisible();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/);
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expectNoPageErrors(page);
  });

  test('T3 · Elegir Tech muestra el HTML de Eze.pece en el iframe y persiste el modo', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await expect(page.locator('#modeChooserBackdrop')).toBeVisible();
    await page.locator('#modeChooserGrid [data-mode-id="tech"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
    await expect(page.locator('#frontTech')).toBeVisible();
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    // el home clásico y el catálogo luma quedan ocultos
    await expect(page.locator('#lumaHeadBlock')).toBeHidden();
    await expect(page.locator('#coleccion')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    // el iframe muestra el HTML de Eze.pece tal cual (header, categorías, servicio)
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('#categorias')).toBeVisible();
    await expect(frame.locator('#servicio')).toBeVisible();
    // quedó guardado en settings.storefront
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_offline_store_v1')).settings.storefront);
    expect(stored).toBe('tech');
    await expectNoPageErrors(page);
  });

  test('T4 · El catálogo se inyecta en el iframe y se compra desde ahí', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    // la sección de catálogo se inserta después de #categorias
    await expect(frame.locator('#mtTechCatalog')).toBeVisible({ timeout: 15_000 });
    const cards = frame.locator('#mtTechGrid .product-card');
    await expect(cards.first()).toBeVisible();
    // agregar desde el iframe actualiza el contador del padre y el del FAB
    await cards.first().locator('.product-add').click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expect(frame.locator('#mtTechFabCount')).toHaveText('1');
    // el FAB del iframe abre el drawer del padre
    await frame.locator('.mt-tech-fab').click();
    await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
    await expect(page.locator('#cartContent .cart-item')).toHaveCount(1);
    await expectNoPageErrors(page);
  });

  test('T5 · Clic en un producto del iframe abre el detalle en el padre', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('#mtTechGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await frame.locator('#mtTechGrid .product-media').first().click();
    await expect(page.locator('#productModalBackdrop')).toBeVisible();
    await expect(page.locator('#productModal .product-modal-copy h2')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('T6 · Regresión: con storefront luma el modo tech queda oculto y sin montar', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expect(page.locator('#frontTech')).toBeHidden();
    const mounted = await page.evaluate(() => {
      const frame = document.getElementById('techFrame');
      return Boolean(frame && frame.srcdoc);
    });
    expect(mounted).toBe(false);
    await expectNoPageErrors(page);
  });

  test('T7 · El FAB del carrito queda al lado del botón de WhatsApp (sin pisarse)', async ({ page }) => {
    await useTechFront(page);
    const frame = page.frameLocator('#techFrame');
    await expect(frame.locator('.mt-tech-fab')).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('a.wa')).toBeVisible();
    const check = async () => {
      const fab = await frame.locator('.mt-tech-fab').boundingBox();
      const wa = await frame.locator('a.wa').boundingBox();
      if (!fab || !wa) throw new Error('FAB o .wa sin bounding box');
      // sin solape: el carrito queda a la IZQUIERDA del círculo de WhatsApp
      const overlap = fab.x < wa.x + wa.width && wa.x < fab.x + fab.width &&
                      fab.y < wa.y + wa.height && wa.y < fab.y + fab.height;
      expect(overlap, `Se pisan: fab=${JSON.stringify(fab)} wa=${JSON.stringify(wa)}`).toBe(false);
      expect(fab.x + fab.width).toBeLessThanOrEqual(wa.x);
      // verticalmente centrados respecto al círculo (tolerancia 10px)
      const fabCenter = fab.y + fab.height / 2;
      const waCenter = wa.y + wa.height / 2;
      expect(Math.abs(fabCenter - waCenter), `Desalineados: fab=${JSON.stringify(fab)} wa=${JSON.stringify(wa)}`).toBeLessThanOrEqual(10);
    };
    await check();
    // también en mobile, donde el media query mueve ambos
    await page.setViewportSize({ width: 390, height: 844 });
    await check();
    await expectNoPageErrors(page);
  });

  test('T8 · Editar un texto de la landing se aplica al instante y persiste', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await page.locator('#modeChooserGrid [data-mode-id="tech"]').click();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/, { timeout: 15_000 });
    const frame = page.frameLocator('#techFrame');
    // en Tech la barra no muestra Bloques ni Colores (no aplican al diseño de Eze.pece)
    await expect(page.locator('[data-mt-blocks]')).toBeHidden();
    await expect(page.locator('[data-mt-colors]')).toBeHidden();
    await expect(frame.locator('html')).toHaveClass(/mt-tech-editing/, { timeout: 15_000 });
    const h2 = frame.locator('h2', { hasText: 'Todo para tu equipo' }).first();
    await expect(h2).toBeVisible({ timeout: 15_000 });
    // la landing anima sus secciones (reveal) y el header sticky tapa el punto medio del h2:
    // se despacha el click sobre el nodo para disparar el handler de edición con target exacto
    await h2.dispatchEvent('click');
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await expect(pop.locator('#mtEditTitle')).toHaveText('Texto de la landing');
    const field = pop.locator('#mtEditBody textarea, #mtEditBody input').first();
    await expect(field).toHaveValue(/Todo para tu equipo/);
    await field.fill('Listo para tu equipo,\ncon garantía real');
    await pop.locator('[data-mt-save]').click();
    await expect(pop.locator('.mt-saved')).toBeVisible();
    // el texto nuevo reemplazó al viejo dentro del iframe (el locator viejo ya no resuelve)
    await expect(frame.locator('h2', { hasText: 'Listo para tu equipo' })).toBeVisible({ timeout: 15_000 });
    const persisted = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('luma_offline_store_v1')).content.techOverrides;
      return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    });
    expect(Object.values(persisted).some((v) => String(v).includes('Listo para tu equipo')), JSON.stringify(persisted)).toBe(true);
    // recarga: el texto sigue publicado (lo ve el visitante, sin sesión de edición)
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech', { timeout: 15_000 });
    await expect(page.frameLocator('#techFrame').locator('h2', { hasText: 'Listo para tu equipo' })).toBeVisible({ timeout: 15_000 });
    await expectNoPageErrors(page);
  });

  test('T9 · "Terminar" en el Modo Tech vuelve siempre al panel de administración', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await page.locator('#modeChooserGrid [data-mode-id="tech"]').click();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/, { timeout: 15_000 });
    await expect(page.locator('.mt-edit-bar')).toBeVisible();
    await page.locator('[data-mt-done]').click();
    await expect(page.locator('#adminShell')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/mt-edit-mode/);
    await expect(page.locator('.mt-edit-bar')).toBeHidden();
    await expect(page.locator('#shopApp')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('T10 · Cambiar una foto de la landing guarda el override y se puede restaurar', async ({ page }) => {
    await loginAdmin(page);
    await page.locator('#viewStore').click();
    await page.locator('#modeChooserGrid [data-mode-id="tech"]').click();
    await expect(page.locator('body')).toHaveClass(/mt-edit-mode/, { timeout: 15_000 });
    const frame = page.frameLocator('#techFrame');
    const img = frame.locator('img[data-tech-key]:visible').first();
    await expect(img).toBeVisible({ timeout: 15_000 });
    const original = await img.getAttribute('src');
    expect(original, 'la landing tiene fotos').toBeTruthy();
    // ídem T8: el click sintático llega al nodo exacto pese a las animaciones de la landing
    await img.dispatchEvent('click');
    const pop = page.locator('.mt-edit-popover');
    await expect(pop).toBeVisible();
    await expect(pop.locator('#mtEditTitle')).toHaveText('Foto de la landing');
    // abrió sobre ESTA foto (la preview es el src original)
    await expect(pop.locator('.mt-edit-imgpreview')).toHaveAttribute('src', original);
    await pop.locator('#mtEditBody input[type="file"]').setInputFiles({
      name: 'landing.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    });
    await expect(pop.locator('[data-mt-img-zone]')).toHaveText(/Foto actualizada/, { timeout: 20_000 });
    await expect(img).toHaveAttribute('src', /^data:image\//);
    const persisted = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('luma_offline_store_v1')).content.techOverrides;
      return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    });
    const key = Object.keys(persisted).find((k) => k.charAt(0) === 'i');
    expect(key, `override de foto en ${JSON.stringify(Object.keys(persisted))}`).toBeTruthy();
    expect(String(persisted[key])).toMatch(/^data:image\//);
    // restaurar vuelve a la foto original de la landing
    await expect(pop.locator('[data-mt-img-restore]')).toBeVisible();
    await pop.locator('[data-mt-img-restore]').click();
    await expect(img).toHaveAttribute('src', original);
    await expectNoPageErrors(page);
  });

});
