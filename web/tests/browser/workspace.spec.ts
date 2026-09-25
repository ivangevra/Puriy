import { test, expect } from '@playwright/test';
test('publica una propuesta local, persiste y puede retirarse sin borrar el borrador', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByLabel('Nombre del recorrido').fill('Recorrido de prueba');
  await page.getByLabel('Modo de trazado').selectOption('manual');
  await page.getByText('Añadir por coordenadas', { exact: true }).click();
  for (const [lat, lon] of [
    ['-15.49', '-70.13'],
    ['-15.48', '-70.12'],
  ]) {
    await page.getByLabel('Latitud', { exact: true }).fill(lat);
    await page.getByLabel('Longitud', { exact: true }).fill(lon);
    await page
      .getByRole('button', { name: 'Añadir vértice', exact: true })
      .click();
  }
  await page
    .getByRole('button', { name: 'Publicar en mi mapa', exact: true })
    .click();
  await expect(page.locator('.published-map-list')).toContainText(
    'Recorrido de prueba',
  );
  await expect(page.locator('.workspace-map-layers')).toContainText(
    'Propuesta sin validar',
  );
  await page.reload();
  await expect(page.locator('.published-map-list')).toContainText(
    'Recorrido de prueba',
  );
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Retirar del mapa', exact: true })
    .click();
  await expect(page.getByLabel('Nombre del recorrido')).toHaveValue(
    'Recorrido de prueba',
  );
  await page.getByRole('button', { name: 'Viajar', exact: true }).click();
  await expect(page.locator('.published-map-list')).toHaveCount(0);
});
test('guarda semáforos, revisa validación, modifica y elimina', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: 'Semáforos', exact: true }).click();
  await page.getByLabel('Cruce o nombre').fill('Cruce de prueba');
  await page.getByLabel('Latitud del semáforo').fill('-15.49');
  await page.getByLabel('Longitud del semáforo').fill('-70.13');
  await page.getByLabel('Estado registrado').selectOption('operational');
  await page
    .getByRole('button', { name: 'Guardar semáforo', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('fuente y fecha');
  await page.getByLabel('Fuente del semáforo').fill('Inspección de prueba');
  await page.getByLabel('Fecha de observación').fill('2026-09-06');
  await page.getByLabel('Rojo', { exact: true }).fill('40');
  await page.getByLabel('Ámbar', { exact: true }).fill('3');
  await page.getByLabel('Verde', { exact: true }).fill('27');
  await expect(page.locator('.signal-timings')).toContainText('70 s');
  await page
    .getByRole('button', { name: 'Guardar semáforo', exact: true })
    .click();
  await expect(page.locator('.signal-list')).toContainText('Cruce de prueba');
  await page.reload();
  await page.getByRole('button', { name: 'Semáforos', exact: true }).click();
  await page.locator('.signal-open').first().click();
  await expect(page.getByLabel('Rojo', { exact: true })).toHaveValue('40');
  await page.getByLabel('Rojo', { exact: true }).fill('45');
  await page
    .getByRole('button', { name: 'Guardar semáforo', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Eliminar semáforo Cruce de prueba' })
    .click();
  await expect(page.locator('.signal-open')).toHaveCount(0);
});
