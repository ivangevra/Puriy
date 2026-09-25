import { test, expect } from '@playwright/test';
test('propuesta publicada participa, huellas por caminos y resultados ordenados', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'juliaca-published-map-v1',
      JSON.stringify([
        {
          publishedAt: new Date().toISOString(),
          draft: {
            version: 1,
            id: 'red-test',
            name: 'Ruta roja de prueba',
            code: 'N40',
            color: '#f04444',
            routingMode: 'manual',
            outbound: [
              [-70.1341, -15.492],
              [-70.13, -15.48],
              [-70.156, -15.467],
            ],
            inbound: [],
            source: 'Prueba',
            observedAt: '',
            boarding: '',
            risks: '',
            notes: '',
            checks: [],
            updatedAt: new Date().toISOString(),
          },
        },
      ]),
    ),
  );
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
  await page.route('https://routing.openstreetmap.de/routed-foot/**', (r) => {
    const u = new URL(r.request().url());
    const coords = u.pathname
      .split('/')
      .at(-1)!
      .split(';')
      .map((c) => c.split(',').map(Number));
    const distance = (a: number[], b: number[]) =>
      Math.round(
        Math.hypot((a[0] - b[0]) * 107000, (a[1] - b[1]) * 111000) * 1.2,
      );
    if (u.pathname.includes('/table/')) {
      const sources = u.searchParams.get('sources')!.split(';').map(Number),
        destinations = u.searchParams
          .get('destinations')!
          .split(';')
          .map(Number);
      return r.fulfill({
        json: {
          code: 'Ok',
          sources: sources.map(() => ({ distance: 0 })),
          destinations: destinations.map(() => ({ distance: 0 })),
          distances: sources.map((a) =>
            destinations.map((b) => distance(coords[a], coords[b])),
          ),
        },
      });
    }
    return r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [{ distance: 0 }, { distance: 0 }],
        routes: [
          {
            distance: distance(coords[0], coords[1]),
            duration: 60,
            geometry: {
              coordinates: [coords[0], [coords[0][0], coords[1][1]], coords[1]],
            },
            legs: [{ steps: [{ name: 'Calle de prueba' }] }],
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
  await page.getByLabel('Desde', { exact: true }).fill('Origen de prueba');
  await page.getByRole('option', { name: /Origen de prueba/ }).click();
  await page.getByLabel('Hasta', { exact: true }).fill('aeropuerto');
  await page
    .getByRole('option', { name: /Aeropuerto Inca Manco Cápac/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Buscar mi ruta' }).click();
  await expect(page.locator('.journey-card').first()).toContainText('N40', {
    timeout: 20000,
  });
  await expect(page.locator('.journey-card').first()).toContainText(
    'Tarifa por verificar',
  );
  await expect(page.locator('.journey-step').first()).toContainText(
    'Calle de prueba',
  );
  await expect(page.locator('.journey-card').first()).toBeEnabled();
  const distances = await page.locator('.boarding-distance').allTextContents();
  const meters = distances.map((s) => Number(s.match(/\d+/)![0]));
  expect(meters).toEqual([...meters].sort((a, b) => a - b));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({
    path: '../artifacts/nearest-proposal-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: '../artifacts/nearest-proposal-mobile.png',
    fullPage: true,
  });
});
