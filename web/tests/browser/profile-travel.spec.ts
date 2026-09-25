import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const network = JSON.parse(
  readFileSync(new URL('../../lib/network.json', import.meta.url), 'utf8'),
) as { routes: { id: string }[]; stops: unknown[] };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/network', (route) => route.fulfill({ json: network }));
  await page.route('**/api/public/workspace', (route) =>
    route.fulfill({ json: { publications: [], signals: [] } }),
  );
});

test('Viajar espera la búsqueda y Rutas contiene el catálogo', async ({ page }) => {
  await page.route('**/api/plan', (route) =>
    route.fulfill({
      json: {
        itineraries: [{
          id: 'journey-test',
          legs: [{
            route_id: network.routes[0].id,
            direction: 0,
            from: network.stops[0],
            to: network.stops[1],
            stops: [network.stops[0], network.stops[1]],
            minutes: 8,
            wait: 5,
            fare: 1,
          }],
          minutes: 13,
          walk_meters: 0,
          transfers: 0,
          fare: 1,
          mode: 'demo',
        }],
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu viaje empieza con dos puntos' })).toBeVisible();
  await expect(page.locator('.route-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rutas disponibles' })).toBeVisible();
  await expect(page.locator('.route-row')).toHaveCount(network.routes.length);
  const save = page.getByRole('button', { name: 'Guardar D01' });
  await save.click();
  await expect(page.locator('.route-row').first().locator('.save-route')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Rutas guardadas' }).click();
  await expect(page.locator('.route-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Viajar', exact: true }).click();
  await expect(page.locator('.route-list')).toHaveCount(0);
  await page.getByLabel('Desde', { exact: true }).fill('Salida a Cusco');
  await page.getByRole('option', { name: /Salida a Cusco/ }).first().click();
  await page.getByLabel('Hasta', { exact: true }).fill('San Miguel');
  await page.getByRole('option', { name: /San Miguel/ }).first().click();
  await page.getByRole('button', { name: 'Buscar mi ruta' }).click();
  await expect(page.getByRole('heading', { name: 'Opciones para tu viaje' })).toBeVisible();
  await expect(page.locator('.journey-card')).toHaveCount(1);
});

test('el perfil muestra la cuenta y cierra la sesión', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puriy-session', 'test-session'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'test-user',
          email: 'pasajero@puriy.test',
          name: 'Pasajero de prueba',
          role: 'passenger',
          provider: 'password',
        },
      },
    }),
  );
  await page.route('**/api/auth/favorites', (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir mi perfil' }).click();
  const profile = page.getByRole('dialog', { name: 'Mi perfil' });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText('pasajero@puriy.test');
  await expect(profile.getByRole('button', { name: 'Administración' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await profile.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await profile.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('puriy-session'))).toBeNull();
});
