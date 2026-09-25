import { test, expect } from '@playwright/test';
import { resetWorkspace } from './helpers';
import { DEV_ADMIN_TOKEN, API_URL } from '../../playwright.config';

const draft = {
  version: 1,
  id: 'compartida-n40',
  name: 'PRUEBA COMPARTIDA',
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

test('el administrador publica en el servidor y otro navegador la ve', async ({
  browser,
  request,
}) => {
  await resetWorkspace(request);
  const admin = await browser.newContext();
  const passenger = await browser.newContext();
  try {
    await admin.addInitScript((d) => {
      localStorage.setItem(
        'juliaca-route-workbench-v1',
        JSON.stringify({ active: d.id, drafts: [d] }),
      );
    }, draft);
    const pageA = await admin.newPage();
    await pageA.goto('/');
    await pageA.locator('.app-shell[data-ready="true"]').waitFor();
    await pageA.getByRole('button', { name: 'Administrar plataforma' }).click();
    await pageA.getByLabel('Clave del administrador').fill(DEV_ADMIN_TOKEN);
    await pageA.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(
      pageA.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();
    await pageA.getByRole('button', { name: 'Editor y frecuencias' }).click();
    await pageA
      .getByRole('button', { name: 'Publicar para pasajeros' })
      .click();
    await expect(pageA.locator('.admin-route-row')).toContainText(
      'Visible para pasajeros',
    );

    const shared = await request.get(`${API_URL}/api/public/workspace`);
    const body = await shared.json();
    expect(
      body.publications.some(
        (p: { draft: { name: string } }) => p.draft.name === 'PRUEBA COMPARTIDA',
      ),
    ).toBe(true);

    const pageB = await passenger.newPage();
    await pageB.goto('/');
    await pageB.locator('.app-shell[data-ready="true"]').waitFor();
    expect(
      await pageB.evaluate(() =>
        localStorage.getItem('juliaca-published-map-v1'),
      ),
    ).toBeNull();
    await pageB.getByRole('button', { name: 'Rutas', exact: true }).click();
    await expect(
      pageB.getByText('PRUEBA COMPARTIDA', { exact: true }),
    ).toBeVisible();
    await pageB.screenshot({ path: '../artifacts/compartida-pasajero.png' });
  } finally {
    await admin.close();
    await passenger.close();
  }
});
