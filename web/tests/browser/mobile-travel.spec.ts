import { test, expect } from '@playwright/test';
import { resetWorkspace, seedPublication } from './helpers';

const draft = {
  version: 1,
  id: 'movil-n40',
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
  service: { start: '05:00', end: '23:00' },
};

test('movil: mapa a pantalla completa y panel de opciones colapsable', async ({
  page,
  request,
}) => {
  await resetWorkspace(request);
  await seedPublication(request, draft);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.app-shell[data-ready="true"]').waitFor();
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    innerH: innerHeight,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(metrics.overflowX).toBe(false);
  expect(metrics.scrollH).toBe(metrics.innerH);

  const handle = page.locator('.sheet-handle');
  await expect(handle).toBeVisible();
  const controlsAbovePanel = async () => {
    const sheetTop = (await page.locator('.travel-panel').boundingBox())!.y;
    const controls = (await page.locator('.map-controls').boundingBox())!;
    return controls.y + controls.height <= sheetTop + 1;
  };
  expect(await controlsAbovePanel()).toBe(true);

  await handle.click();
  await expect(handle).toContainText('Ver el mapa');
  await page.waitForTimeout(400);
  expect(
    (await page.locator('.travel-panel').boundingBox())!.height,
  ).toBeGreaterThan(500);
  await page.screenshot({
    path: '../artifacts/mobile-review/panel-full.png',
  });

  await handle.click();
  await expect(handle).toContainText('Ver opciones');
  await page.waitForTimeout(350);
  await page.screenshot({
    path: '../artifacts/mobile-review/panel-peek.png',
  });

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 700, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(
    (await page.locator('.travel-panel').boundingBox())!.height,
  ).toBeGreaterThan(500);

  await page.getByRole('button', { name: 'Rutas', exact: true }).click();
  await page.locator('.route-row').first().click();
  await expect(page.getByRole('heading', { name: 'PRUEBA' })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const el = document.querySelector('.panel-content')!;
      return el.scrollHeight > el.clientHeight;
    }),
  ).toBe(true);
});
