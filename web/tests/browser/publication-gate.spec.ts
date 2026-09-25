import { test, expect } from '@playwright/test';
import { resetWorkspace } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

const draft = {
  version: 1,
  id: 'prueba-n40',
  name: 'PRUEBA',
  code: 'N40',
  color: '#299b50',
  routingMode: 'manual',
  passengerVisible: true,
  outbound: [
    [-70.132, -15.488],
    [-70.128, -15.492],
  ],
  inbound: [],
  source: '',
  observedAt: '',
  boarding: '',
  risks: '',
  notes: '',
  checks: [],
  updatedAt: new Date().toISOString(),
};

test('sin fuente ni datos de servicio la publicación igual llega al pasajero', async ({
  page,
}) => {
  await page.addInitScript((d) => {
    localStorage.setItem(
      'juliaca-route-workbench-v1',
      JSON.stringify({ active: d.id, drafts: [d] }),
    );
  }, draft);
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Administrar plataforma' }).click();
  await page.getByRole('button', { name: 'Entrar al panel local' }).click();
  await page.getByRole('button', { name: 'Editor y frecuencias' }).click();
  const editor = page.locator('.route-editor');
  await expect(editor).toBeVisible();
  const publish = editor.getByRole('button', {
    name: 'Publicar para pasajeros',
  });
  await expect(publish).toBeEnabled();
  await page.screenshot({
    path: '../artifacts/publication-simple.png',
    fullPage: true,
  });
  await publish.click();
  await expect(page.locator('.admin-route-row')).toContainText(
    'Visible para pasajeros',
  );
  await page.getByRole('button', { name: 'Ver como pasajero' }).click();
  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await page.getByRole('button', { name: /N40 PRUEBA/ }).click();
  await expect(page.getByRole('heading', { name: 'PRUEBA' })).toBeVisible();
  await expect(page.locator('.detail-facts')).toContainText('Por verificar');
  await expect(page.locator('.detail-facts')).toContainText('05:00–23:00');
  await page.screenshot({
    path: '../artifacts/publication-passenger.png',
    fullPage: true,
  });
});

test('borrador nuevo trae horario por defecto 05:00–23:00', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Administrar plataforma' }).click();
  await page.getByRole('button', { name: 'Entrar al panel local' }).click();
  await page.getByRole('button', { name: 'Editor y frecuencias' }).click();
  await page.getByText('Configurar servicio del micro').click();
  await expect(page.getByLabel('Inicio del servicio')).toHaveValue('05:00');
  await expect(page.getByLabel('Fin del servicio')).toHaveValue('23:00');
});
