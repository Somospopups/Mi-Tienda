// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * v0.15 · Apariencia de los complementos: fondo con color o imagen, velo, esquinas
 * redondeadas, fotos propias y animaciones de entrada.
 *
 * Cubre:
 *  - todo bloque acepta color de fondo, imagen de fondo, oscurecido y radio
 *  - la imagen de fondo se ve (background-image) y el velo acompaña con el valor puesto
 *  - la Oferta con foto pasa a dos columnas; Testimonios/Productos muestran la de cabecera
 *  - la animación elegida llega al bloque y se revela al entrar en pantalla
 *  - "reducir movimiento" del sistema no deja nada invisible
 *  - en modo edición los bloques se ven sin animar y el editor ofrece los campos
 */

const STORE_KEY = 'luma_offline_store_v1';

/** Una foto de 1x1 en PNG (se comprime al subir, pero acá va directo al store). */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__mt_design_clean')) {
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
      try { sessionStorage.setItem('__mt_design_clean', '1'); } catch (_) {}
    }
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  // @ts-ignore
  page.__jsErrors = errors;
});

function expectNoPageErrors(page) {
  // @ts-ignore
  const errors = page.__jsErrors || [];
  expect(errors, `Errores JS en consola:\n${errors.join('\n')}`).toEqual([]);
}

async function seedBlocks(page, blocks) {
  await page.goto('/index.html');
  await expect(page.locator('#shopApp')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(
    ([key, json]) => {
      const base = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...base, content: { ...(base.content || {}), builderBlocks: json } }));
    },
    [STORE_KEY, JSON.stringify(blocks)]
  );
  await page.reload();
  await expect(page.locator('#shopApp')).toBeVisible({ timeout: 15_000 });
}

async function loginAdmin(page) {
  await page.goto('/index.html#admin');
  await expect(page.locator('#adminLogin')).toBeVisible({ timeout: 15_000 });
  await page.locator('#loginForm input[name="pin"]').fill('1234');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 15_000 });
}

async function openBlockEditor(page, index) {
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await page.locator('[data-mt-blocks]').click();
  await page.locator(`.bl-block[data-bl-index="${index}"] .bl-ctl [data-bl-edit="${index}"]`).click();
  await expect(page.locator('.bl-editor')).toHaveClass(/open/);
}

async function storedBlocks(page) {
  return page.evaluate((key) => JSON.parse(JSON.parse(localStorage.getItem(key)).content.builderBlocks), STORE_KEY);
}

test('todo bloque acepta color de fondo, velo y esquinas redondeadas', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-txt', type: 'text', props: { title: 'Sección', body: 'Cuerpo', align: 'left', color: '', bg: '#eef4ff', bgImage: '', overlay: '', radius: 28, anim: 'up' } },
    { id: 'd-cta', type: 'cta', props: { title: 'Sumate', body: '', btnText: 'Escribinos', btnLink: '', color: '', bg: '#123a2a', bgImage: '', overlay: '', radius: 0, anim: 'up' } },
  ]);
  const text = page.locator('.bl-block[data-bl-index="0"] .bl-text');
  await expect(text).toHaveAttribute('style', /background-color:#eef4ff/);
  await expect(text).toHaveAttribute('style', /border-radius:28px/);
  // Radio 0 = rectángulo, y sin foto no se dibuja velo.
  const cta = page.locator('.bl-block[data-bl-index="1"] .bl-cta');
  await expect(cta).toHaveAttribute('style', /background-color:#123a2a/);
  await expect(cta).toHaveAttribute('style', /border-radius:0px/);
  await expect(page.locator('.bl-block[data-bl-index="1"] .bl-veil')).toHaveCount(0);
  expectNoPageErrors(page);
});

test('la imagen de fondo se aplica y el velo usa el oscurecido elegido', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-txt', type: 'text', props: { title: 'Con foto', body: 'Cuerpo', bg: '', bgImage: PIXEL, overlay: 70, radius: 16, anim: 'none' } },
  ]);
  const box = page.locator('.bl-block[data-bl-index="0"] .bl-text');
  await expect(box).toHaveAttribute('style', /background-image:url\(/);
  await expect(box).toHaveAttribute('style', /background-size:cover/);
  // Velo 70 → 0.7 en el stop inferior; el de arriba es el extra detrás del texto.
  const veil = page.locator('.bl-block[data-bl-index="0"] .bl-veil');
  await expect(veil).toHaveCount(1);
  await expect(veil).toHaveAttribute('style', /rgba\(8,10,20,0\.7\)/);
  expectNoPageErrors(page);
});

test('con foto de fondo y sin oscurecido puesto, el velo por defecto deja leer el texto', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-txt', type: 'text', props: { title: 'Sin tocar', body: 'Cuerpo', bg: '', bgImage: PIXEL, overlay: '', radius: 16, anim: 'none' } },
  ]);
  const veil = page.locator('.bl-block[data-bl-index="0"] .bl-veil');
  await expect(veil).toHaveAttribute('style', /rgba\(8,10,20,0\.3\)/);
});

test('la Oferta con foto pasa a dos columnas y las fotos de cabecera se ven', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-of', type: 'offer', props: { title: 'OFERTA', off: '30', note: 'nota', btnText: 'Ver ofertas', image: PIXEL, bg: '', bgImage: '', overlay: '', radius: 20, anim: 'up' } },
    { id: 'd-te', type: 'testimonial', props: { title: 'Clientes', image: PIXEL, items: 'Lu | Cliente | Muy bueno\nMar | Cliente | Perfecto', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
  ]);
  const offer = page.locator('.bl-block[data-bl-index="0"] .bl-offer');
  await expect(offer).toHaveClass(/has-img/);
  // Foto a la izquierda, texto a la derecha.
  const media = await offer.locator('.bl-media').boundingBox();
  const body = await offer.locator('.bl-offer-body').boundingBox();
  expect(media.x, 'la foto va a la izquierda').toBeLessThan(body.x);
  expect(media.width).toBeGreaterThan(100);
  // La foto de cabecera de los testimonios está arriba de la grilla.
  const head = page.locator('.bl-block[data-bl-index="1"] .bl-testi .bl-media');
  await expect(head).toHaveCount(1);
  expect((await head.boundingBox()).y).toBeLessThan((await page.locator('.bl-testi-card').first().boundingBox()).y);
  expectNoPageErrors(page);
});

test('la animación elegida llega al bloque y se revela al entrar en pantalla', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-1', type: 'text', props: { title: 'Arriba', body: 'a', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'left' } },
    { id: 'd-2', type: 'text', props: { title: 'Centrado', body: 'b', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'none' } },
    { id: 'd-3', type: 'testimonial', props: { title: 'Testis', items: 'Lu | C | Uno\nMar | C | Dos', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
  ]);
  await expect(page.locator('.bl-block[data-bl-index="0"]')).toHaveClass(/bl-in-up|bl-in-left/);
  await expect(page.locator('.bl-block[data-bl-index="0"]')).toHaveClass(/bl-in-left/);
  // 'none' no lleva clases de animación: el bloque se ve siempre.
  await expect(page.locator('.bl-block[data-bl-index="1"]')).not.toHaveClass(/bl-in/);
  // La grilla de testimonios entra escalonada.
  await expect(page.locator('.bl-testi-grid')).toHaveClass(/bl-st/);
  // El bloque de arriba ya está en pantalla: se revela solo.
  await expect(page.locator('.bl-block[data-bl-index="0"]')).toHaveClass(/bl-in-on/, { timeout: 5000 });
  // Y el de abajo también al hacer scroll.
  await page.locator('.bl-block[data-bl-index="2"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.bl-block[data-bl-index="2"]')).toHaveClass(/bl-in-on/, { timeout: 5000 });
  expectNoPageErrors(page);
});

test('con "reducir movimiento" del sistema nada queda invisible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedBlocks(page, [
    { id: 'd-1', type: 'text', props: { title: 'Arriba', body: 'a', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
    { id: 'd-2', type: 'testimonial', props: { title: 'Testis', items: 'Lu | C | Uno\nMar | C | Dos', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
  ]);
  // Sin clases de animación (el navegador lo pidió así) y nada con opacity 0.
  await expect(page.locator('#frontBuilder .bl-in')).toHaveCount(0);
  const opacities = await page.locator('.bl-testi-card').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(opacities).toEqual(['1', '1']);
});

test('una página con fotos gigantes se guarda sin cortar el JSON', async ({ page }) => {
  // Foto falsa de 2,7 MB: el guardado tiene un tope de 3 MB por clave y si lo pasara
  // recortaría el JSON a la mitad (la página aparecería vacía al siguiente guardado).
  const huge = 'data:image/png;base64,' + 'A'.repeat(2700000);
  await seedBlocks(page, [
    { id: 'd-1', type: 'text', props: { title: 'Pesada', body: 'a', bg: '', bgImage: huge, overlay: '', radius: 16, anim: 'none' } },
    { id: 'd-2', type: 'cta', props: { title: 'Sumate', body: '', btnText: 'Escribinos', btnLink: '', color: '', bg: '', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
  ]);
  await loginAdmin(page);
  await page.locator('#viewStore').click();
  await expect(page.locator('.mt-edit-bar')).toBeVisible();
  await page.locator('[data-mt-blocks]').click();
  // Duplicar dispara el guardado con la foto gigante.
  await page.locator('.bl-block[data-bl-index="0"] [data-bl-dup="0"]').click();
  await expect(page.locator('#toastRegion')).toContainText('Se ajustaron tus fotos', { timeout: 20_000 });
  // Lo que quedó guardado sigue siendo una página válida (no un JSON cortado) y pesa menos.
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORE_KEY);
  const saved = JSON.parse(JSON.parse(raw).content.builderBlocks);
  expect(saved.map((b) => b.type)).toEqual(['text', 'text', 'cta']);
  expect(raw.length, 'el contenido guardado entra en el tope').toBeLessThan(3000000);
  expectNoPageErrors(page);
});

test('en modo edición los bloques se ven completos y el editor ofrece los campos', async ({ page }) => {
  await seedBlocks(page, [
    { id: 'd-1', type: 'cta', props: { title: 'Sumate', body: '', btnText: 'Escribinos', btnLink: '', color: '', bg: '#123a2a', bgImage: '', overlay: '', radius: 16, anim: 'up' } },
  ]);
  await openBlockEditor(page, 0);
  // Grupo de apariencia con los campos nuevos.
  await expect(page.locator('.bl-editor .bl-field-sec')).toHaveText('Fondo y animación');
  await expect(page.locator('.bl-editor [data-bl-file="bgImage"]')).toHaveCount(1);
  await expect(page.locator('.bl-editor select[name="anim"]')).toBeVisible();
  await expect(page.locator('.bl-editor input[name="radius"]')).toBeVisible();
  // Subir una imagen de fondo la deja puesta y se puede volver a quitar.
  await page.setInputFiles('.bl-editor [data-bl-file="bgImage"]', {
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.locator('.bl-editor .bl-upimg')).toHaveCount(1, { timeout: 15_000 });
  await page.locator('[data-bl-editor-save]').click();
  await expect(page.locator('.bl-block[data-bl-index="0"] .bl-cta')).toHaveAttribute('style', /background-image:url\(/);
  // Con el panel abierto no hay animación: el dueño ve el bloque como queda.
  await expect(page.locator('.bl-block[data-bl-index="0"]')).not.toHaveClass(/bl-in /);
  // Y el botón para quitar deja el campo vacío otra vez.
  await page.locator('.bl-block[data-bl-index="0"] .bl-ctl [data-bl-edit="0"]').click();
  await expect(page.locator('.bl-editor .bl-upimg')).toHaveCount(1);
  await page.locator('.bl-editor [data-bl-clear="bgImage"]').click();
  await expect(page.locator('.bl-editor .bl-upimg')).toHaveCount(0);
  await page.locator('[data-bl-editor-save]').click();
  await expect(page.locator('.bl-block[data-bl-index="0"] .bl-cta')).not.toHaveAttribute('style', /background-image:url\(/);
  expectNoPageErrors(page);
});
