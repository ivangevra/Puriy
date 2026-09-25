import { it, expect } from 'vitest';
import { mapBounds, mapData } from '../lib/map-data';
import { DEMO_NETWORK } from '../lib/mobility';
const props = {
  network: DEMO_NETWORK,
  selected: null,
  origin: null,
  destination: null,
  journey: null,
  positions: [],
};
it('repite flechas sin seleccionar ruta y aumenta densidad con el zoom', () => {
  const arrows = (zoom: number) =>
    mapData(props, false, 0, zoom).features.filter(
      (f) => f.properties?.kind === 'arrow',
    );
  expect(arrows(12).length).toBeGreaterThan(0);
  expect(arrows(16).length).toBeGreaterThan(arrows(14).length * 3.5);
  expect(new Set(arrows(16).map((f) => f.properties?.direction))).toEqual(
    new Set([0, 1]),
  );
  expect(
    arrows(16).every(
      (f) =>
        f.geometry.type === 'Point' && Number.isFinite(f.properties?.bearing),
    ),
  ).toBe(true);
});
it('encuadra todos los recorridos y mantiene orden longitud/latitud', () => {
  const [sw, ne] = mapBounds(props);
  for (const r of DEMO_NETWORK.routes)
    for (const p of r.geometry) {
      expect(p[0]).toBeGreaterThanOrEqual(sw[0]);
      expect(p[0]).toBeLessThanOrEqual(ne[0]);
      expect(p[1]).toBeGreaterThanOrEqual(sw[1]);
      expect(p[1]).toBeLessThanOrEqual(ne[1]);
    }
  expect(sw[0]).toBeLessThan(-70);
  expect(ne[1]).toBeLessThan(-15);
});
it('solo GPS vigente entra a las capas visibles', () => {
  const now = Date.now(),
    p = {
      vehicle_id: 'v1',
      route_id: 'D01',
      direction: 0,
      lat: -15.49,
      lon: -70.13,
      source: 'test',
      timestamp: new Date(now - 91000).toISOString(),
      simulated: false,
    };
  expect(
    mapData({ ...props, positions: [p] }, false, 0).features.some(
      (f) => f.properties?.kind === 'vehicle',
    ),
  ).toBe(false);
  expect(
    mapData(
      {
        ...props,
        positions: [{ ...p, timestamp: new Date(now).toISOString() }],
      },
      false,
      0,
    ).features.some((f) => f.properties?.kind === 'vehicle'),
  ).toBe(true);
});
