import { test, expect, type Page } from '@playwright/test';
import catalog from '../../lib/pdu-catalog.json' with { type: 'json' };

async function openLab(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page
    .getByRole('button', { name: 'Administrar plataforma', exact: true })
    .click();
  await page.getByRole('button', { name: 'Entrar al panel local' }).click();
  await page
    .getByRole('navigation', { name: 'Herramientas de administración' })
    .getByRole('button', { name: 'Laboratorio de movilidad', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Laboratorio de movilidad',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Calcular comparación', exact: true }),
  ).toBeEnabled();
}
test('censo real, worker, escenarios, exportación y persistencia', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openLab(page);
  await page
    .getByRole('button', { name: 'Calcular comparación', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toBeVisible();
  await expect(page.locator('.lab-results caption')).toContainText('246');
  await expect(page.locator('.lab-results caption')).toContainText(
    /3[,. ]?728/,
  );
  await expect(page.locator('.lab-results')).toContainText('Sin destinos');
  await page
    .getByRole('button', { name: 'Guardar estudio', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Secciones del laboratorio' })
    .getByRole('button', { name: 'Estudios guardados' })
    .click();
  await expect(page.locator('.lab-saved')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cargar parámetros' }).click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Calcular comparación', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', {
      name: 'Exportar estudio reproducible con datos de entrada',
    })
    .click();
  expect((await download).suggestedFilename()).toContain('juliaca-estudio-');
  await page
    .getByLabel('Intervalo propuesto (min)', { exact: true })
    .fill('12');
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toHaveCount(0);
  await page.reload();
  await openLab(page);
  await page
    .getByRole('navigation', { name: 'Secciones del laboratorio' })
    .getByRole('button', { name: 'Estudios guardados' })
    .click();
  await expect(page.locator('.lab-saved')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('editar destino y calendario sin perder trazabilidad', async ({
  page,
}) => {
  await openLab(page);
  const nav = page.getByRole('navigation', {
    name: 'Secciones del laboratorio',
  });
  await nav.getByRole('button', { name: 'Destinos', exact: true }).click();
  await page.getByRole('button', { name: /Mercado San José/ }).click();
  await page.getByLabel('Latitud de entrada').fill('-15.491');
  await page.getByLabel('Longitud de entrada').fill('-70.131');
  await page.getByLabel('Abre', { exact: true }).fill('06:00');
  await page.getByLabel('Cierra', { exact: true }).fill('20:00');
  await page.getByLabel('Lun', { exact: true }).check();
  await page.getByLabel('Tipo de evidencia').selectOption('assumption');
  await page.getByLabel('Validación', { exact: true }).selectOption('reviewed');
  await page
    .getByLabel('Fuente y fecha de verificación')
    .fill('Ubicación de prueba automatizada, no evidencia de campo');
  await page.getByRole('button', { name: 'Guardar destino' }).click();
  await expect(
    page.getByRole('button', { name: /Mercado San José/ }),
  ).toContainText('Listo para estudio');
  await nav.getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.getByRole('button', { name: /Feria del lunes/ }).click();
  await page.getByLabel('Recorrido afectado').selectOption('D01');
  await page.getByLabel('Desde', { exact: true }).fill('06:00');
  await page.getByLabel('Hasta', { exact: true }).fill('09:00');
  await page.getByLabel('Minutos adicionales por ciclo completo').fill('20');
  await page.getByLabel('Validación', { exact: true }).selectOption('reviewed');
  await page.getByRole('button', { name: 'Guardar afectación' }).click();
  await expect(
    page.getByRole('button', { name: /Feria del lunes/ }),
  ).toContainText('Aplicable al estudio');
  await nav.getByRole('button', { name: 'Comparar propuestas' }).click();
  await page
    .getByRole('button', { name: 'Calcular comparación', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toBeVisible();
  await page
    .getByText('Supuestos, fuentes y límites del resultado', { exact: true })
    .click();
  await expect(page.locator('.lab-results')).toContainText(
    'Feria del lunes (supuesto)',
  );
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('juliaca-mobility-lab-v1')!),
  );
  expect(
    state.events.find((e: { id: string }) => e.id === 'pdu-event-2').evidence,
  ).toBe('assumption');
});
test('fuentes, accesibilidad de formularios y diseño adaptable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLab(page);
  await page
    .getByRole('button', { name: 'Calcular comparación', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toBeVisible();
  await page.screenshot({
    path: '../artifacts/lab-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('navigation', { name: 'Secciones del laboratorio' })
    .getByRole('button', { name: 'Fuentes y calidad' })
    .click();
  await page.getByLabel('Buscar empresa o código PDU').fill('Mercedes');
  await expect(page.locator('.lab-catalog-table tbody tr')).toHaveCount(1);
  await expect(page.getByText(/Conciliación pendiente/)).toBeVisible();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('navigation', { name: 'Secciones del laboratorio' })
    .getByRole('button', { name: 'Comparar propuestas' })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: '../artifacts/lab-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Tema oscuro', exact: true }).click();
  await page.screenshot({
    path: '../artifacts/lab-mobile-dark.png',
    fullPage: true,
  });
});

test('desvío de ida y vuelta, revisión y aislamiento de pasajeros', async ({
  page,
}) => {
  const seed = {
    version: 1,
    revision: 0,
    places: catalog.places.map((p, i) =>
      i === 0
        ? {
            ...p,
            point: { lon: -70.13, lat: -15.494 },
            validation: 'reviewed',
            open: '06:00',
            close: '20:00',
            days: [1],
            evidence: 'assumption',
          }
        : p,
    ),
    events: catalog.events,
    boarding: [],
    observations: [],
    studies: [],
    walking: null,
  };
  await page.addInitScript(
    (value) => {
      if(!localStorage.getItem('juliaca-mobility-lab-v1')) localStorage.setItem('juliaca-mobility-lab-v1', JSON.stringify(value));
    },
    seed,
  );
  let requests = 0;
  await page.route('**/route/v1/driving/**', async (route) => {
    requests++;
    const coordinates = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/driving/')[1],
    )
      .split(';')
      .map((p) => p.split(',').map(Number));
    await route.fulfill({
      json: {
        code: 'Ok',
        waypoints: coordinates.map(() => ({ distance: 0 })),
        routes: [
          {
            geometry: { type: 'LineString', coordinates },
            legs: coordinates
              .slice(1)
              .map(() => ({
                distance: 500,
                steps: [
                  { name: 'Calle de prueba', maneuver: { bearing_after: 0 } },
                ],
              })),
          },
        ],
      },
    });
  });
  await openLab(page);
  await page.getByLabel('Destino del desvío').selectOption('pdu-place-1');
  await page
    .getByRole('button', { name: 'Generar desvío candidato', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Revisar alternativa en el editor' }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.getByLabel('Recorrido propuesto')).toHaveValue(/^draft:/);
  await page
    .getByRole('button', { name: 'Calcular comparación', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Qué cambia con la propuesta' }),
  ).toBeVisible();
  const saved = await page.evaluate(() => ({
    draft: JSON.parse(localStorage.getItem('juliaca-route-workbench-v1')!)
      .drafts[0],
    publications: localStorage.getItem('juliaca-published-map-v1'),
  }));
  expect(saved.draft.roads.outbound.geometry.length).toBeGreaterThan(2);
  expect(saved.draft.roads.inbound.geometry.length).toBeGreaterThan(2);
  expect(saved.publications).toBeNull();
  expect(saved.draft.passengerVisible).not.toBe(true);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('juliaca-mobility-lab-v1')!).candidates
          .length,
    ),
  ).toBe(1);
  await page.evaluate(() =>
    localStorage.removeItem('juliaca-route-workbench-v1'),
  );
  await page.reload();
  await openLab(page);
  await expect(
    page
      .getByLabel('Recorrido propuesto')
      .locator('option')
      .filter({ hasText: 'Alternativa D01' }),
  ).toHaveCount(1);
});

test('observaciones y errores de importación preservan datos', async ({
  page,
}) => {
  await openLab(page);
  const nav = page.getByRole('navigation', {
    name: 'Secciones del laboratorio',
  });
  await nav
    .getByRole('button', { name: 'Trabajo de campo', exact: true })
    .click();
  await page.getByLabel('Fecha y hora · Lima').fill('2026-09-18T07:00');
  await page.getByLabel('Vehículos observados').fill('3');
  await page.getByLabel('Ascensos observados').fill('21');
  await page.getByLabel('Intervalos entre unidades (min)').fill('8, 12, 10');
  await page
    .getByLabel('Fuente / equipo y punto de conteo')
    .fill('Prueba de registro agregado');
  await page.getByRole('button', { name: 'Guardar observación' }).click();
  await expect(page.locator('.lab-observation')).toContainText('10.0 min');
  await page
    .getByRole('button', {
      name: 'Usar intervalo como referencia del escenario',
    })
    .click();
  await expect(
    page.getByLabel('Intervalo base (min)', { exact: true }),
  ).toHaveValue('10');
  const before = await page.evaluate(() =>
    localStorage.getItem('juliaca-mobility-lab-v1'),
  );
  await page
    .getByLabel('Importar respaldo')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByRole('alert')).toContainText('versión 1');
  expect(
    await page.evaluate(() => localStorage.getItem('juliaca-mobility-lab-v1')),
  ).toBe(before);
});
