import { expect, it } from 'vitest';
import {
  newDraft,
  parseDraft,
  draftWarnings,
  draftNetwork,
  exportDraft,
  pathKm,
  draftGeometry,
  draftReady,
} from '../lib/route-drafts';
import { mapBounds, mapData } from '../lib/map-data';
import { roadKey } from '../lib/road-routing';

it('un ajuste antiguo no se muestra ni exporta después de mover un punto', () => {
  const points: [number, number][] = [
    [-70.134, -15.493],
    [-70.132, -15.479],
  ];
  const result = {
    key: roadKey(points),
    geometry: [points[0], [-70.13, -15.49] as [number, number], points[1]],
    provider: 'test',
    calculatedAt: new Date().toISOString(),
  };
  const d = {
    ...newDraft(),
    outbound: points,
    inbound: points,
    roads: { outbound: result, inbound: result },
  };
  expect(draftReady(d)).toBe(true);
  expect(exportDraft(d).features[0].geometry.coordinates).toEqual(
    result.geometry,
  );
  const moved = {
    ...d,
    outbound: [points[0], [-70.12, -15.48] as [number, number]],
  };
  expect(draftGeometry(moved, 'outbound')).toEqual([]);
  expect(draftReady(moved)).toBe(false);
  expect(() => exportDraft(moved)).toThrow();
});
it('las flechas son puntos para iconos de tamaño fijo, nunca polígonos de tamaño geográfico', () => {
  const d = {
    ...newDraft(),
    routingMode: 'manual' as const,
    outbound: [
      [-70.13, -15.49],
      [-70.14, -15.5],
    ] as [number, number][],
  };
  const features = mapData(
    {
      network: draftNetwork(d, 'outbound'),
      selected: d.id,
      origin: null,
      destination: null,
      journey: null,
      positions: [],
    },
    false,
    0,
  ).features.filter((f) => f.properties?.kind === 'arrow');
  expect(features.length).toBeGreaterThan(0);
  expect(
    features.every(
      (f) =>
        f.geometry.type === 'Point' && Number.isFinite(f.properties?.bearing),
    ),
  ).toBe(true);
});
it('los borradores conservan sentidos independientes, no se publican y se exportan con fuente', () => {
  const d = {
    ...newDraft(),
    routingMode: 'manual' as const,
    name: 'Estudio',
    source: 'Equipo local',
    outbound: [
      [-70.13, -15.49],
      [-70.14, -15.5],
    ] as [number, number][],
    inbound: [
      [-70.14, -15.5],
      [-70.16, -15.48],
    ] as [number, number][],
  };
  expect(parseDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  expect(draftNetwork(d, 'outbound').routes[0].status).toBe('proposal');
  const exported = exportDraft(d);
  expect(exported.features).toHaveLength(2);
  expect(exported.features[1].geometry.coordinates).toEqual(d.inbound);
  expect(exported.features[0].properties.verified).toBe(false);
  expect(pathKm(d.outbound)).toBeGreaterThan(1);
  expect(draftWarnings(d)).toContain(
    'Falta la fecha del levantamiento o documento.',
  );
});
it('rechaza coordenadas o versiones inválidas antes de dibujar', () => {
  expect(() => parseDraft({ ...newDraft(), outbound: [[181, 0]] })).toThrow();
  expect(() => parseDraft({ ...newDraft(), inbound: [[0, NaN]] })).toThrow();
  expect(() => parseDraft({ ...newDraft(), version: 2 })).toThrow();
  expect(() =>
    parseDraft({ ...newDraft(), outbound: Array(1001).fill([0, 0]) }),
  ).toThrow();
});
it('la vuelta usa su geometría real y entra en el encuadre aunque pase por otras calles', () => {
  const d = {
    ...newDraft(),
    routingMode: 'manual' as const,
    outbound: [
      [-70.13, -15.49],
      [-70.14, -15.5],
    ] as [number, number][],
    inbound: [
      [-70.14, -15.5],
      [-70.16, -15.48],
    ] as [number, number][],
  };
  const props = {
    network: draftNetwork(d, 'inbound'),
    selected: d.id,
    origin: null,
    destination: null,
    journey: null,
    positions: [],
    direction: 'inbound' as const,
  };
  const f = mapData(props, false, 0).features.filter(
    (f) => f.properties?.kind === 'route',
  );
  expect(f).toHaveLength(1);
  expect(f[0].geometry).toEqual({ type: 'LineString', coordinates: d.inbound });
  expect(f[0].properties?.direction).toBe(1);
  expect(mapBounds(props)[0][0]).toBe(-70.16);
  expect(
    mapData({ ...props, direction: 'both' }, false, 0).features.filter(
      (f) => f.properties?.kind === 'route',
    ),
  ).toHaveLength(2);
  expect(
    mapData(props, false, 0).features.some(
      (f) => f.properties?.kind === 'arrow',
    ),
  ).toBe(true);
});
