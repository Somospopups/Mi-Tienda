// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.11.2 · La imagen del final de la página (sección editorial) no se podía
 * reemplazar: el velo ::after de .editorial-image interceptaba los clics y el
 * atributo de edición estaba en el <img>, que quedaba debajo. Ahora el atributo
 * va en el contenedor: un clic en CUALQUIER parte de la imagen abre el editor.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_ed_clean')) {
        localStorage.clear(); sessionStorage.clear();
        sessionStorage.setItem('__mt_ed_clean', '1');
      }
    } catch (_) {}
  });
});

async function loginYModoEdicion(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
  await page.goto('/index.html'); // misma sesión, tienda visible
  await expect(page.locator('.mt-edit-float')).toBeVisible({ timeout: 15_000 });
  await page.locator('.mt-edit-float').click();
}

test('La imagen editorial del final abre el editor con un clic en el centro (velo ::after) y se reemplaza', async ({ page }) => {
  await loginYModoEdicion(page);
  const editorial = page.locator('.editorial-image');
  await editorial.scrollIntoViewIfNeeded();
  await expect(editorial).toHaveAttribute('data-content-image', 'editorialImage');
  // Clic en el CENTRO de la imagen: zona cubierta por el velo ::after (antes no abría nada)
  const box = await editorial.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#mtEditBody')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#mtEditTitle')).toContainText('Imagen de la tienda');
  // Reemplazar con una foto real
  await page.locator('#mtEditBody input[type="file"]').setInputFiles('/tmp/foto-editorial.png');
  await expect(page.locator('#mtEditBody')).toContainText('Imagen actualizada ✓', { timeout: 20_000 });
  // Persiste tras recargar: el src ya no es el de la demo (data:image/webp;UklGRkAq…)
  await page.goto('/index.html');
  const src = await page.locator('.editorial-image img').getAttribute('src');
  expect(src.startsWith('data:image/webp;base64,UklGRkAq')).toBe(false);
});

test('Las imágenes del hero siguen editables con el nuevo bind por contenedor', async ({ page }) => {
  await loginYModoEdicion(page);
  const hero = page.locator('.hero-main-image');
  await expect(hero).toHaveAttribute('data-content-image', 'heroImageMain');
  await hero.scrollIntoViewIfNeeded();
  const box = await hero.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#mtEditBody')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#mtEditTitle')).toContainText('Imagen de la tienda');
});
