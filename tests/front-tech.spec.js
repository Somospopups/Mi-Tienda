// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Frente TECH (v0.16) — vidriera de accesorios y servicio técnico.
 * Demo offline, sin ?tienda=. El frente se fija por tienda en
 * `settings.storefront = 'tech'`; acá se previsualiza con ?front=tech.
 * El catálogo, el carrito y el checkout se comparten con el resto de los frentes.
 */

const STORAGE_KEY = 'luma_offline_store_v1';

test.beforeEach(async ({ page }) => {
  // Limpiar solo en la PRIMERA carga del test: si limpiáramos en cada
  // navegación borraríamos el guardado que estos tests quieren verificar.
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

async function openTech(page) {
  await page.goto('/index.html?front=tech');
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Frente TECH (v0.16)', () => {

  test('T1 · ?front=tech activa el frente y esconde los demás', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
    await expect(page.locator('#tfHead')).toBeVisible();
    await expect(page.locator('.tf-plist')).toBeVisible();
    await expect(page.locator('#frontOfertas')).toBeHidden();
    await expect(page.locator('#frontGamer')).toBeHidden();
    await expect(page.locator('#lumaHeadBlock')).toBeHidden();
    await expectNoPageErrors(page);
  });

  test('T2 · La cabecera fusionada reemplaza al header y conserva las acciones', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('#tfHead')).toBeVisible();
    await expect(page.locator('#tfCats .tf-cat')).toHaveCount(5);
    await expect(page.locator('#tfSearch')).toBeVisible();
    await expect(page.locator('#tfAdmin')).toBeVisible();
    await expect(page.locator('#tfCart')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('T3 · El hero arranca en "todo" y cada categoría cambia la foto', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('#tfShots img[data-tf-shot="todo"]')).toHaveClass(/is-on/);
    await expect(page.locator('#tfShots img')).toHaveCount(6);
    await page.locator('#tfCats .tf-cat[data-tf-cat="audio"]').click();
    await expect(page.locator('#tfShots img[data-tf-shot="audio"]')).toHaveClass(/is-on/);
    await expect(page.locator('#tfShots img[data-tf-shot="todo"]')).not.toHaveClass(/is-on/);
    await expect(page.locator('#tfNowTag')).toHaveClass(/is-on/);
    await page.locator('#tfNowReset').click();
    await expect(page.locator('#tfShots img[data-tf-shot="todo"]')).toHaveClass(/is-on/);
    await expectNoPageErrors(page);
  });

  test('T4 · Las fotos del hero son imágenes reales embebidas (demo sin internet)', async ({ page }) => {
    await openTech(page);
    const src = await page.locator('#tfShots img[data-tf-shot="todo"]').getAttribute('src');
    expect(src || '').toMatch(/^data:image\//);
    const loaded = await page.locator('#tfShots img[data-tf-shot="todo"]')
      .evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth > 0);
    expect(loaded).toBe(true);
    await expectNoPageErrors(page);
  });

  test('T5 · Tocar una categoría filtra el catálogo sin mover el scroll', async ({ page }) => {
    await openTech(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#tfCats .tf-cat[data-tf-cat="fundas"]').click();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.pageYOffset)).toBeLessThan(40);
    // la categoría no existe en el catálogo demo: degrada a "Todos" en vez de vaciar la grilla
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('T6 · El carrito compartido suma y el contador de la cabecera lo refleja', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('#tfCartCount')).toHaveText('0');
    await page.locator('#productGrid .product-card .product-add').first().click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expect(page.locator('#tfCartCount')).toHaveText('1');
    await expectNoPageErrors(page);
  });

  test('T7 · Los textos del frente salen de state.content y se pueden editar', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('[data-content="tchCatsTitle"]')).not.toBeEmpty();
    await expect(page.locator('#tfWhatListOut li').first()).toBeVisible();
    await expect(page.locator('.tf-plist div')).toHaveCount(6);
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('luma_offline_store_v1') || '{}');
      raw.content.tchCatsTitle = 'Título cambiado desde el panel';
      localStorage.setItem('luma_offline_store_v1', JSON.stringify(raw));
    });
    await page.goto('/index.html?front=tech');
    await expect(page.locator('[data-content="tchCatsTitle"]')).toHaveText('Título cambiado desde el panel');
    await expectNoPageErrors(page);
  });

  test('T8 · La marca de la cabecera sigue a settings.brandName', async ({ page }) => {
    await openTech(page);
    await expect(page.locator('#tfBrandText')).toContainText(/\S/);
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('luma_offline_store_v1') || '{}');
      raw.settings.brandName = 'Eze.pece';
      localStorage.setItem('luma_offline_store_v1', JSON.stringify(raw));
    });
    await page.goto('/index.html?front=tech');
    await expect(page.locator('#tfBrandText')).toHaveText('Eze.pece');
    await expect(page.locator('#tfBrandText i')).toHaveText('.pece');
    await expectNoPageErrors(page);
  });

  test('T9 · settings.storefront = "tech" activa el frente sin parámetros en la URL', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('luma_offline_store_v1') || '{}');
      raw.settings.storefront = 'tech';
      localStorage.setItem('luma_offline_store_v1', JSON.stringify(raw));
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'tech');
    await expect(page.locator('#tfHead')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('T10 · Los otros frentes siguen intactos', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-front', 'luma');
    await expect(page.locator('#frontTech')).toBeHidden();
    await expect(page.locator('#lumaHeadBlock .hero')).toBeVisible();

    await page.goto('/index.html?front=gamer');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'gamer');
    await expect(page.locator('#frontGamer')).toBeVisible();
    await expect(page.locator('#frontTech')).toBeHidden();

    await page.goto('/index.html?front=ofertas');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'ofertas');
    await expect(page.locator('#frontOfertas')).toBeVisible();
    await expect(page.locator('#frontTech')).toBeHidden();
    await expectNoPageErrors(page);
  });

});
