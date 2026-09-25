import { test, expect } from '@playwright/test';

test('registro de pasajero y acceso administrativo oculto', async ({ page }) => {
  const address = `pasajero-${Date.now()}@puriy.test`;
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Administrar plataforma' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill('Pasajero de prueba');
  await page.getByLabel('Correo electrónico').fill(address);
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByText('Pasajero de prueba', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Administrar plataforma' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Administrar plataforma' })).toHaveCount(0);
});

test('la sesión administradora muestra la herramienta y abre el panel', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puriy-session', 'session-for-ui-test'));
  await page.route('**/api/auth/me', async (route) => route.fulfill({
    json: { user: {
      id: 'admin-ui-test',
      email: 'ivangvera201@gmail.com',
      name: 'Administrador',
      role: 'admin',
      provider: 'google',
    } },
  }));
  await page.route('**/api/admin/workspace/state', async (route) => route.fulfill({
    json: { publications: [], signals: [] },
  }));

  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Administrar plataforma' }).click();
  await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible();
});

test('registro explica cómo recuperar la conexión si la API no responde', async ({ page }) => {
  await page.route('**/api/auth/register', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo electrónico').fill('prueba-conexion@puriy.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert')).toContainText('npm run dev');
});
