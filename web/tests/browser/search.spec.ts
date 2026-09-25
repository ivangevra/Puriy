import { test, expect } from '@playwright/test';
test('sugiere lugares sin tildes y permite elegir con teclado', async ({
  page,
}) => {
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: { features: [] } }),
  );
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const input = page.getByLabel('Hasta', { exact: true });
  await input.fill('tupac');
  await expect(
    page.getByRole('option', { name: /Mercado Túpac Amaru/ }),
  ).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('Mercado Túpac Amaru');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Buscar mi ruta' }).click();
  await expect(
    page.getByRole('heading', { name: 'Opciones para tu viaje' }),
  ).toBeVisible();
  await expect(page.locator('.journey-card').first()).toContainText('Sube en');
});
test('consulta calles, descarta respuestas anteriores y muestra error recuperable', async ({
  page,
}) => {
  await page.route('https://photon.komoot.io/**', async (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    if (q === 'error') {
      await r.abort();
      return;
    }
    if (q === 'antigua')
      await new Promise((resolve) => setTimeout(resolve, 1200));
    await r
      .fulfill({
        json: {
          features: [
            {
              geometry: { coordinates: [-70.132, -15.49] },
              properties: {
                name:
                  q === 'antigua' ? 'Calle antigua' : 'Jirón Gonzales Prada',
                city: 'Juliaca',
                osm_id: 1,
                osm_type: 'W',
              },
            },
          ],
        },
      })
      .catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const input = page.getByLabel('Hasta', { exact: true });
  await input.fill('antigua');
  await page.waitForRequest('https://photon.komoot.io/**');
  await input.fill('Gonzales');
  await expect(
    page.getByRole('option', { name: /Jirón Gonzales Prada/ }),
  ).toBeVisible();
  await expect(page.getByRole('option', { name: /Calle antigua/ })).toHaveCount(
    0,
  );
  await page.getByRole('option', { name: /Jirón Gonzales Prada/ }).click();
  await expect(input).toHaveValue('Jirón Gonzales Prada');
  await input.fill('error');
  await expect(page.locator('.place-suggestions')).toContainText(
    'Búsqueda en línea no disponible',
  );
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});
