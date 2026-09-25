import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  colorScheme: 'light',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/');
await page
  .locator('.transit-map[data-base-ready=true]')
  .waitFor({ timeout: 25000 });
await page.screenshot({ path: '../artifacts/redesign-light-desktop.png' });
await page.getByRole('button', { name: 'Tema oscuro', exact: true }).click();
await page
  .waitForResponse((r) => r.url().includes('/styles/dark') && r.ok())
  .catch(() => {});
await page
  .locator('.transit-map[data-base-ready=true]')
  .waitFor({ timeout: 25000 });
await page.screenshot({ path: '../artifacts/redesign-dark-desktop.png' });
await page.getByRole('button', { name: 'Movilidad', exact: true }).click();
await page
  .locator('.transit-map[data-base-ready=true]')
  .waitFor({ timeout: 25000 });
await page.screenshot({
  path: '../artifacts/redesign-dark-analysis.png',
  fullPage: true,
});
await page.getByRole('button', { name: 'Tema claro', exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({
  path: '../artifacts/redesign-light-analysis.png',
  fullPage: true,
});
await page.getByRole('button', { name: 'Viajar', exact: true }).click();
for (const theme of ['light', 'dark']) {
  await page
    .getByRole('button', {
      name: theme === 'light' ? 'Tema claro' : 'Tema oscuro',
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.transit-map[data-base-ready=true]')
    .waitFor({ timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `../artifacts/redesign-${theme}-mobile.png`,
    fullPage: true,
  });
}
console.log(
  JSON.stringify(
    {
      errors,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    },
    null,
    2,
  ),
);
await browser.close();
