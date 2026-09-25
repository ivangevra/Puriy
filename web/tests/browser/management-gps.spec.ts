import { test, expect } from '@playwright/test';
test('edita elimina y restaura una ruta de la red local', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Administrar rutas · editar y eliminar' })
    .click();
  await page
    .getByRole('button', { name: 'Editar ruta D01', exact: true })
    .click();
  await page
    .getByLabel('Nombre de la ruta', { exact: true })
    .fill('Corredor editado');
  await page.getByRole('button', { name: 'Guardar cambios de ruta' }).click();
  await page
    .getByRole('button', { name: 'Eliminar ruta D01', exact: true })
    .click();
  await expect(page.locator('.managed-route')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Deshacer eliminación de D01' })
    .click();
  await expect(page.locator('.managed-route')).toContainText([
    'D02',
    'D03',
    'D04',
    'Corredor editado',
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await expect(page.locator('.route-list')).toContainText('Corredor editado');
});
test('pide GPS reciente preciso y muestra margen de error', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (
          success: PositionCallback,
          _error: PositionErrorCallback,
          options: PositionOptions,
        ) => {
          if (!options.enableHighAccuracy || options.maximumAge !== 0)
            throw new Error('GPS obsoleto');
          success({
            coords: {
              latitude: -15.49,
              longitude: -70.13,
              accuracy: 160,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
  await expect(page.getByLabel('Desde', { exact: true })).toHaveValue(
    'Mi ubicación',
  );
  await expect(page.locator('.gps-status')).toContainText('±160 m');
  await expect(page.locator('.gps-status')).toContainText('Señal imprecisa');
});
