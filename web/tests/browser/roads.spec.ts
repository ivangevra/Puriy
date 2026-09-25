import { test, expect, type Page } from '@playwright/test';
test('orienta la calzada y permite corregir un rodeo sin conservar un cálculo anterior', async ({
  page,
}) => {
  const urls: URL[] = [];
  await page.route('https://router.project-osrm.org/**', async (route) => {
    const url = new URL(route.request().url());
    urls.push(url);
    const points = url.pathname
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
            geometry: { type: 'LineString', coordinates: points },
            legs: [
              {
                distance: 1200,
                steps: [
                  {
                    name: 'Avenida de prueba',
                    maneuver: { bearing_after: 0, modifier: 'uturn' },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByText('Añadir por coordenadas', { exact: true }).click();
  await addPoint(page, '-15.493', '-70.134');
  await addPoint(page, '-15.492', '-70.134');
  await expect(page.locator('.street-review')).toContainText('hacia el norte');
  await expect(page.locator('.street-review')).toContainText('Revisar rodeo');
  expect(urls.at(-1)!.searchParams.get('bearings')).toBe('0,75;0,75');
  expect(urls.at(-1)!.searchParams.get('continue_straight')).toBe('false');
  await page
    .getByRole('button', { name: 'Reubicar punto 2', exact: true })
    .click();
  await expect(page.locator('.editor-panel')).toContainText(
    'Vértice 2: haz clic en su nueva ubicación',
  );
  await page.getByLabel('Elegir calzada').selectOption('nearest');
  await expect
    .poll(() => urls.at(-1)?.searchParams.has('bearings'))
    .toBe(false);
  await expect(page.locator('.routing-status')).toContainText(
    'Ajustada a calles',
  );
  const key = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('juliaca-route-workbench-v1')!).drafts[0]
        .roads.outbound.key,
  );
  expect(key).toContain('v2:nearest:');
});
async function addPoint(page: Page, lat: string, lon: string) {
  await page.getByLabel('Latitud', { exact: true }).fill(lat);
  await page.getByLabel('Longitud', { exact: true }).fill(lon);
  await page
    .getByRole('button', { name: 'Añadir vértice', exact: true })
    .click();
}
test('falla de ajuste no dibuja rectas, reintenta y calcula el retorno por separado', async ({
  page,
}) => {
  let available = false;
  const requests: number[][][] = [];
  await page.route('https://router.project-osrm.org/**', async (route) => {
    const points = new URL(route.request().url()).pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((p) => p.split(',').map(Number));
    requests.push(points);
    await route.fulfill({
      json: available
        ? {
            code: 'Ok',
            waypoints: points.map(() => ({ distance: 0 })),
            routes: [
              {
                geometry: {
                  type: 'LineString',
                  coordinates: [points[0], [-70.131, -15.488], points.at(-1)],
                },
              },
            ],
          }
        : { code: 'NoRoute' },
    });
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByText('Añadir por coordenadas', { exact: true }).click();
  await addPoint(page, '-15.493', '-70.134');
  await addPoint(page, '-15.479', '-70.132');
  await expect(page.locator('.routing-status')).toContainText(
    'No se encontró una conexión',
  );
  await expect(
    page.getByRole('button', { name: 'GeoJSON · ambos' }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('juliaca-route-workbench-v1')!)
          .drafts[0].roads,
    ),
  ).toBeUndefined();
  available = true;
  await page.getByRole('button', { name: 'Reintentar ajuste' }).click();
  await expect(page.locator('.routing-status')).toContainText(
    'Ajustada a calles',
  );
  await page
    .locator('.editor-direction')
    .getByRole('button', { name: /Vuelta/ })
    .click();
  await page
    .getByRole('button', { name: 'Copiar el otro sentido al revés' })
    .click();
  await expect(
    page.getByRole('button', { name: 'GeoJSON · ambos' }),
  ).toBeEnabled({ timeout: 10000 });
  expect(requests.at(-1)?.[0]).toEqual([-70.132, -15.479]);
  const d = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('juliaca-route-workbench-v1')!).drafts[0],
  );
  expect(d.outbound).toHaveLength(2);
  expect(d.roads.outbound.geometry).toHaveLength(3);
  expect(d.roads.inbound.geometry[0]).toEqual(d.inbound[0]);
});
test('respuesta de un trazado anterior no reemplaza puntos más recientes', async ({
  page,
}) => {
  let first = true;
  await page.route('https://router.project-osrm.org/**', async (route) => {
    const points = new URL(route.request().url()).pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((p) => p.split(',').map(Number));
    if (first) {
      first = false;
      await new Promise((r) => setTimeout(r, 1600));
    }
    await route
      .fulfill({
        json: {
          code: 'Ok',
          waypoints: points.map(() => ({ distance: 0 })),
          routes: [{ geometry: { type: 'LineString', coordinates: points } }],
        },
      })
      .catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByText('Añadir por coordenadas', { exact: true }).click();
  await addPoint(page, '-15.493', '-70.134');
  const started = page.waitForRequest('https://router.project-osrm.org/**');
  await addPoint(page, '-15.479', '-70.132');
  await started;
  await addPoint(page, '-15.480', '-70.130');
  await expect(page.locator('.routing-status')).toContainText(
    'Ajustada a calles',
  );
  const d = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('juliaca-route-workbench-v1')!).drafts[0],
  );
  expect(d.roads.outbound.key).toBe(
    `v2:direction:${JSON.stringify(d.outbound)}`,
  );
  expect(d.roads.outbound.geometry).toHaveLength(3);
});
