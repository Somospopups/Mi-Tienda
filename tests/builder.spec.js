// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.10 · Constructor de página (front "libre") — demo offline.
 * El dueño arma la portada con bloques (texto, imagen, video, galería,
 * productos, banner, separador): arrastra, edita en vivo y guarda.
 * Se persiste en content.builderBlocks por el PUT de contenido de siempre.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__mt_builder_clean')) {
        localStorage.clear(); sessionStorage.clear();
        sessionStorage.setItem('__mt_builder_clean', '1');
      }
    } catch (_) {}
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|net::ERR|youtube/i.test(msg.text())) errors.push(msg.text());
  });
  // @ts-ignore
  page.__jsErrors = errors;
});

function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

async function openBuilder(page) {
  await loginAdmin(page);
  await page.locator('[data-admin-tab="settings"]').click();
  await page.locator('[data-settings-view="appearance"]').click();
  await expect(page.locator('#mtOpenBuilder')).toBeVisible({ timeout: 15_000 });
  await page.locator('#mtOpenBuilder').click();
  await expect(page.locator('.bl-addbar')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-front', 'libre');
}

test.describe('v0.10 · Constructor de página', () => {

  test('B1 · Agregar un bloque de texto, editarlo, guardar y verlo en el frente público', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-bl-add="text"]').click();
    await expect(page.locator('#blEditor')).toHaveClass(/open/);
    await page.locator('#blEditorBody input[name="title"]').fill('Servicio técnico oficial');
    await page.locator('#blEditorBody textarea[name="body"]').fill('Reparamos lo que otros dan por perdido.');
    // Guardar (persiste bloques + frente libre)
    await page.locator('[data-bl-save]').click();
    await expect(page.locator('#toastRegion')).toContainText(/guardada/i, { timeout: 15_000 });
    // Recargar: el frente público muestra el bloque
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'libre', { timeout: 15_000 });
    await expect(page.locator('#frontBuilder')).toContainText('Servicio técnico oficial');
    await expect(page.locator('#frontBuilder')).toContainText('Reparamos lo que otros dan por perdido.');
    // El catálogo sigue disponible debajo (la tienda sigue vendiendo)
    await expect(page.locator('#productGrid .product-card').first()).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('B2 · Bloques hero, video de YouTube e imagen subida renderizan', async ({ page }) => {
    await openBuilder(page);
    // Hero por defecto
    await page.locator('[data-bl-add="hero"]').click();
    await page.locator('[data-bl-edone]').click();
    // Video con URL de YouTube
    await page.locator('[data-bl-add="video"]').click();
    await page.locator('#blEditorBody input[name="url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-bl-edone]').click();
    // Imagen subida (archivo sintético grande → pasa por la compresión)
    await page.locator('[data-bl-add="image"]').click();
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(1200, 800);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (i * 11) % 256; img.data[i + 1] = (i * 5) % 256; img.data[i + 2] = 128; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'foto.png', { type: 'image/png' }));
      const input = document.querySelector('#blEditorBody [data-bl-file]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#frontBuilder .bl-imgblock img')).toHaveCount(1, { timeout: 20_000 });
    await page.locator('[data-bl-save]').click();
    await expect(page.locator('#toastRegion')).toContainText(/guardada/i, { timeout: 15_000 });
    await page.goto('/index.html');
    await expect(page.locator('#frontBuilder .bl-hero')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#frontBuilder iframe.bl-video')).toBeVisible();
    await expect(page.locator('#frontBuilder .bl-imgblock img')).toBeVisible();
    await expectNoPageErrors(page);
  });

  test('B3 · Arrastrar reordena los bloques y el orden persiste', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-bl-add="text"]').click();
    await page.locator('#blEditorBody input[name="title"]').fill('BLOQUE-UNO');
    await page.locator('[data-bl-edone]').click();
    await page.locator('[data-bl-add="text"]').click();
    await page.locator('#blEditorBody input[name="title"]').fill('BLOQUE-DOS');
    await page.locator('[data-bl-edone]').click();
    await expect(page.locator('#frontBuilder .bl-block')).toHaveCount(2);
    // Arrastrar el segundo bloque hacia arriba (drop encima de la primera mitad del primero)
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await page.locator('[data-bl-drag="1"]').dispatchEvent('dragstart', { dataTransfer: dt });
    const first = page.locator('#frontBuilder .bl-block').first();
    const box = await first.boundingBox();
    await first.dispatchEvent('dragover', { dataTransfer: dt, clientY: box.y + box.height * 0.25 });
    await first.dispatchEvent('drop', { dataTransfer: dt, clientY: box.y + box.height * 0.25 });
    // El orden visual cambió al instante
    await expect(page.locator('#frontBuilder .bl-block').first()).toContainText('BLOQUE-DOS');
    await page.locator('[data-bl-save]').click();
    await expect(page.locator('#toastRegion')).toContainText(/guardada/i, { timeout: 15_000 });
    await page.goto('/index.html');
    await expect(page.locator('#frontBuilder .bl-block').first()).toContainText('BLOQUE-DOS', { timeout: 15_000 });
    await expect(page.locator('#frontBuilder .bl-block').nth(1)).toContainText('BLOQUE-UNO');
    await expectNoPageErrors(page);
  });


  test('B4 · Agrandar/achicar: ancho del bloque y columnas de galería se aplican y persisten', async ({ page }) => {
    await openBuilder(page);
    // Bloque de texto achicado al 65%
    await page.locator('[data-bl-add="text"]').click();
    await expect(page.locator('#blEditor')).toHaveClass(/open/);
    await expect(page.locator('#blEditorBody select[name="w"]')).toBeVisible();
    await page.locator('#blEditorBody select[name="w"]').selectOption('65');
    await expect(page.locator('#frontBuilder .bl-block .bl-inner').first()).toHaveAttribute('style', /max-width:\s*65%/);
    // Galería con 2 columnas
    await page.locator('[data-bl-add="gallery"]').click();
    await expect(page.locator('#blEditorBody select[name="cols"]')).toBeVisible();
    await page.locator('#blEditorBody select[name="cols"]').selectOption('2');
    await page.locator('#blEditorBody select[name="w"]').selectOption('85');
    // La galería vacía muestra placeholder: subirle una foto para ver el grid
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 320;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#d9633c'; ctx.fillRect(0, 0, 320, 320);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'foto.png', { type: 'image/png' }));
      const input = document.querySelector('#blEditorBody [data-bl-file]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#frontBuilder .bl-gallery.g2')).toHaveCount(1, { timeout: 15_000 });
    // Guardar y verificar que el tamaño sobrevive a la recarga
    await page.locator('[data-bl-save]').click();
    await expect(page.locator('#toastRegion')).toContainText(/guardada/i, { timeout: 15_000 });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveAttribute('data-front', 'libre', { timeout: 15_000 });
    await expect(page.locator('#frontBuilder .bl-block .bl-inner').first()).toHaveAttribute('style', /max-width:\s*65%/);
    await expect(page.locator('#frontBuilder .bl-gallery').last()).toHaveClass(/g2/);
    await expectNoPageErrors(page);
  });
});
