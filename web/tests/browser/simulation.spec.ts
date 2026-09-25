import { test, expect } from '@playwright/test';
test('el mapa de respaldo cambia las luces y representa el micro con SVG', async ({
  page,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      'juliaca-signals-v1',
      JSON.stringify([
        {
          id: 'signal-test',
          name: 'Cruce simulado',
          approach: 'Norte',
          lat: -15.49,
          lon: -70.13,
          status: 'unknown',
          red: 2,
          green: 2,
          amber: 2,
          pedestrian: false,
          source: 'Prueba',
          observedAt: '2026-09-06',
          notes: '',
          updatedAt: new Date().toISOString(),
        },
      ]),
    ),
  );
  await page.goto('/');
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-renderer',
    'raster',
  );
  const signal = page.locator('.signal-map-marker').first();
  await expect(signal).toBeVisible();
  const phase = await signal.getAttribute('data-phase');
  expect(['red', 'green', 'amber']).toContain(phase);
  await expect
    .poll(() => signal.getAttribute('data-phase'), { timeout: 8000 })
    .not.toBe(phase);
  await expect(page.locator('.signal-simulation-label')).toContainText(
    'ciclo simulado',
  );
  await page.getByRole('button', { name: 'Simular un micro' }).click();
  await expect(page.locator('.micro-map-marker img')).toHaveAttribute(
    'src',
    '/micro.svg',
  );
});
test('los pasos incluyen la caminata al abordaje para un origen alejado', async ({
  page,
}) => {
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [-70.134, -15.492] },
            properties: {
              name: 'Origen de prueba',
              osm_id: 99,
              osm_type: 'N',
              city: 'Juliaca',
            },
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByLabel('Desde', { exact: true }).fill('Origen de prueba');
  await page.getByRole('option', { name: /Origen de prueba/ }).click();
  await page.getByLabel('Hasta', { exact: true }).fill('aeropuerto');
  await page
    .getByRole('option', { name: /Aeropuerto Inca Manco Cápac/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Buscar mi ruta' }).click();
  await expect(page.locator('.journey-step').first()).toContainText(
    'Camina hasta Plaza de Armas',
  );
  await expect(page.locator('.journey-step').first()).toContainText(/\d+ m · aprox/);
  await expect(page.locator('.journey-step').first()).not.toContainText('línea recta');
  await expect(page.locator('.journey-step').nth(1)).toContainText('Toma el');
});
