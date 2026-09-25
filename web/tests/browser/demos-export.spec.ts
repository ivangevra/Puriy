import { expect, test } from '@playwright/test';

test('descarga demos con o sin explicación y exporta el prototipo adaptativo', async ({ page }) => {
  await page.addInitScript(() => {
    const captureStream = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'captureStream')!.value as (frameRequestRate?: number) => MediaStream;
    HTMLCanvasElement.prototype.captureStream = function (frameRequestRate?: number) {
      Object.assign(window, { __demoVideoCanvas: this });
      return captureStream.call(this, frameRequestRate);
    };
    class TestRecorder {
      static isTypeSupported(type: string) { return type === 'video/webm'; }
      mimeType: string;
      state = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_stream: MediaStream, options: MediaRecorderOptions) {
        this.mimeType = options.mimeType || 'video/webm';
        Object.assign(window, { __demoRecorder: this });
      }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['video de prueba'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: TestRecorder });
  });

  await page.goto('/?demos');
  await expect(page.getByRole('heading', { name: 'Puriy en acción' })).toBeVisible();
  const clean = page.getByRole('radio', { name: /Solo video/ });
  const explained = page.getByRole('radio', { name: /Con explicación/ });
  const downloadButton = page.getByRole('button', { name: /Descargar .*:/ });
  await expect(clean).toBeChecked();
  await expect(downloadButton).toBeEnabled({ timeout: 20_000 });

  for (const [choice, suffix] of [[clean, 'solo-video'], [explained, 'con-explicacion']] as const) {
    await choice.check();
    const download = page.waitForEvent('download');
    await downloadButton.click();
    await expect(page.getByRole('status')).toContainText('Grabando');
    expect(await page.evaluate(() => {
      const canvas = (window as unknown as { __demoVideoCanvas: HTMLCanvasElement }).__demoVideoCanvas;
      return [canvas.width, canvas.height];
    })).toEqual([1920, 1080]);
    await page.evaluate(() => (window as unknown as { __demoRecorder: { stop: () => void } }).__demoRecorder.stop());
    expect((await download).suggestedFilename()).toBe(`puriy-demo-viaje-${suffix}.webm`);
    await expect(choice).toBeEnabled();
  }

  await page.getByRole('navigation', { name: 'Demostraciones' })
    .getByRole('button', { name: /Semáforos adaptativos/ }).click();
  await expect(page.locator('.lab-panel canvas')).toHaveCount(2);
  await clean.check();
  const labDownload = page.waitForEvent('download');
  await downloadButton.click();
  await page.evaluate(() => (window as unknown as { __demoRecorder: { stop: () => void } }).__demoRecorder.stop());
  expect((await labDownload).suggestedFilename()).toBe('puriy-demo-adaptativo-solo-video.webm');
});
