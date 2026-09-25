import { expect, it } from 'vitest';
import {
  endpointBearings,
  travelBearing,
  roadKey,
  compassDirection,
} from '../lib/road-routing';
import { newDraft, draftGeometry, parseDraft } from '../lib/route-drafts';
it('orienta llegada y salida en sentido de marcha y deja libres los cruces', () => {
  expect(
    endpointBearings([
      [0, 0],
      [0, 1],
      [1, 1],
    ]),
  ).toBe('0,75;;90,75');
  expect(
    endpointBearings([
      [1, 1],
      [0, 1],
      [0, 0],
    ]),
  ).toBe('270,75;;180,75');
  expect(travelBearing([0, 0], [0, -1])).toBe(180);
  expect(compassDirection(359)).toBe('norte');
  expect(
    endpointBearings([
      [0, 0],
      [0, 0],
    ]),
  ).toBe(';');
});
it('mover un punto invalida el cálculo; versiones anteriores se muestran', () => {
  const points: [number, number][] = [
    [0, 0],
    [0, 1],
  ];
  const road = (key: string) => ({
    ...newDraft(),
    outbound: points,
    roads: { outbound: { key, geometry: points, provider: 'test', calculatedAt: '2026-09-06' } },
  });
  expect(draftGeometry(road(roadKey(points)), 'outbound')).toHaveLength(2);
  expect(draftGeometry(road(`v2:nearest:${JSON.stringify(points)}`), 'outbound')).toHaveLength(2);
  expect(draftGeometry({ ...road(roadKey(points)), outbound: [[0, 0], [0, 2]] }, 'outbound')).toHaveLength(0);
});
