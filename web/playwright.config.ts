import { defineConfig } from '@playwright/test';

export const DEV_ADMIN_TOKEN =
  process.env.ADMIN_TOKEN || 'puriy-dev-2026-clave-local-4f8a2c91d6b7e3';
export const API_URL = process.env.API_URL || 'http://127.0.0.1:8001';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  use: { baseURL: 'http://localhost:5173', headless: true },
  workers: 1,
  reporter: 'list',
  webServer: [
    {
      command:
        '.\\.venv\\Scripts\\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001',
      cwd: '..',
      env: {
        ADMIN_TOKEN: DEV_ADMIN_TOKEN,
        ALLOW_ADMIN_TOKEN_FOR_TESTS: 'true',
        DEMO_MODE: 'false',
        CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
      },
      url: `${API_URL}/api/public/workspace`,
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev:web -- --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
