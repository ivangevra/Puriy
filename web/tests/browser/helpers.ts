import { expect, type APIRequestContext } from '@playwright/test';
import { API_URL, DEV_ADMIN_TOKEN } from '../../playwright.config';

const auth = { Authorization: `Bearer ${DEV_ADMIN_TOKEN}` };

export async function resetWorkspace(request: APIRequestContext) {
  const response = await request.post(`${API_URL}/api/admin/workspace/state`, {
    headers: auth,
    data: { publications: [], signals: [] },
  });
  expect(response.ok()).toBe(true);
}

export async function seedPublication(
  request: APIRequestContext,
  draft: Record<string, unknown>,
) {
  const response = await request.post(`${API_URL}/api/admin/workspace/state`, {
    headers: auth,
    data: {
      publications: [{ draft, publishedAt: new Date().toISOString() }],
      signals: [],
    },
  });
  expect(response.ok()).toBe(true);
}
