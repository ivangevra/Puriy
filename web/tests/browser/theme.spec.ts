import { test, expect, type Page } from '@playwright/test';

// Inspect actual rendered pixels: a loaded basemap alone does not prove routes rendered.
async function routePixels(page: Page) {
  return page
    .locator('.maplibregl-canvas')
    .evaluate((source: HTMLCanvasElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          pixels[i + 1] > pixels[i] * 1.6 &&
          pixels[i + 1] > pixels[i + 2] * 1.1 &&
          pixels[i + 1] > 70
        )
          count++;
      }
      return count;
    });
}

test('tema persistente y mapa vectorial conservan selección y controles', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-base-ready',
    'true',
    { timeout: 20000 },
  );
  await expect.poll(() => routePixels(page)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'D01', exact: true }).click();
  const canvas = await page.locator('.maplibregl-canvas').elementHandle();
  await page.getByRole('button', { name: 'Tema oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-base-ready',
    'true',
    { timeout: 20000 },
  );
  await expect(
    page.getByRole('heading', { name: 'Corredor norte–sur' }),
  ).toBeVisible();
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
  await expect.poll(() => routePixels(page)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Acercar mapa' }).click();
  await page.getByRole('button', { name: 'Centrar en Juliaca' }).click();
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Tema oscuro', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Observatorio', exact: true }).click();
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-theme',
    'dark',
  );
  await page.getByRole('button', { name: 'Tema claro', exact: true }).click();
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-theme',
    'light',
  );
  expect(errors).toEqual([]);
});

test('tema automático responde al sistema y respeta movimiento reducido', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('button', { name: 'Tema del sistema' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page
      .locator('.panel-content')
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('.project-info')
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
  await page.getByRole('button', { name: 'El proyecto' }).click();
  await expect(
    page.getByRole('heading', { name: 'Una ciudad mejor conectada.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar información' }).click();
  await expect(page.locator('.project-info')).toHaveAttribute('inert', '');
});
