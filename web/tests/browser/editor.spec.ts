import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('https://router.project-osrm.org/**', async (route) => {
    const points = new URL(route.request().url()).pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((p) => p.split(',').map(Number));
    await route.fulfill({
      json: {
        code: 'Ok',
        waypoints: points.map(() => ({ distance: 0 })),
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: points.flatMap((p, i) =>
                i
                  ? [[(p[0] + points[i - 1][0]) / 2, points[i - 1][1]], p]
                  : [p],
              ),
            },
          },
        ],
      },
    });
  });
});
test('dibuja dos sentidos, corrige, deshace, conserva borrador y exporta', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByLabel('Nombre del recorrido').fill('Propuesta de conexión');
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-base-ready',
    'true',
    { timeout: 20000 },
  );
  const map = page.locator('.map-canvas');
  await map.click({ position: { x: 220, y: 190 } });
  await map.click({ position: { x: 300, y: 250 } });
  await map.click({ position: { x: 340, y: 320 } });
  await expect(page.locator('.editor-vertices li')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Mover vértice 2', exact: true })
    .click();
  await map.click({ position: { x: 310, y: 260 } });
  await expect(page.locator('.editor-vertices li')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Eliminar vértice 3', exact: true })
    .click();
  await expect(page.locator('.editor-vertices li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Deshacer trazado' }).click();
  await expect(page.locator('.editor-vertices li')).toHaveCount(3);
  await page
    .locator('.editor-direction')
    .getByRole('button', { name: /Vuelta/ })
    .click();
  await page
    .getByRole('button', { name: 'Copiar el otro sentido al revés' })
    .click();
  await expect(page.locator('.editor-vertices li')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GeoJSON · ambos' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.geojson');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await expect(page.getByLabel('Nombre del recorrido')).toHaveValue(
    'Propuesta de conexión',
  );
  await expect(page.locator('.editor-vertices li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await expect(page.locator('.route-main')).toHaveCount(4);
  expect(errors).toEqual([]);
});
test('selector de la ficha y mapa comparten sentido; editor funciona con respaldo y teclado', async ({
  page,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'D01', exact: true }).click();
  await page.getByRole('button', { name: 'Vuelta', exact: true }).click();
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-direction',
    'inbound',
  );
  await page.getByRole('button', { name: 'Ver ida en el mapa' }).click();
  await expect(page.locator('.stop-timeline li').first()).toContainText(
    'Salida a Cusco',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await expect(page.locator('.transit-map')).toHaveAttribute(
    'data-renderer',
    'raster',
    { timeout: 20000 },
  );
  await page.getByText('Añadir por coordenadas', { exact: true }).click();
  for (const [lat, lon] of [
    ['-15.49', '-70.13'],
    ['-15.495', '-70.135'],
  ]) {
    await page.getByLabel('Latitud', { exact: true }).fill(lat);
    await page.getByLabel('Longitud', { exact: true }).fill(lon);
    await page
      .getByRole('button', { name: 'Añadir vértice', exact: true })
      .click();
  }
  await expect(page.locator('.editor-vertices li')).toHaveCount(2);
  await expect(
    page.locator('.leaflet-overlay-pane path').first(),
  ).toBeAttached();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
