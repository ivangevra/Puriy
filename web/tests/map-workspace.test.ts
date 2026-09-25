import { it, expect } from 'vitest';
import { newDraft } from '../lib/route-drafts';
import {
  publicationError,
  mapWorkspaceNetwork,
  readPublications,
  newSignal,
  validateSignal,
  readSignals,
} from '../lib/map-workspace';
import { DEMO_NETWORK, demoPlan } from '../lib/mobility';
it('permite un único sentido completo y no publica sentidos pendientes', () => {
  const d = {
    ...newDraft(),
    name: 'Propuesta',
    routingMode: 'manual' as const,
    outbound: [
      [-70.13, -15.49],
      [-70.12, -15.48],
    ] as [number, number][],
  };
  expect(publicationError(d)).toBe('');
  expect(publicationError({ ...d, inbound: [[-70.12, -15.48]] })).toContain(
    'incompleto',
  );
  expect(publicationError({ ...d, routingMode: 'roads' })).not.toBe('');
  const published = readPublications([{ draft: d, publishedAt: '2026-09-06' }]);
  const merged = mapWorkspaceNetwork(DEMO_NETWORK, published);
  expect(merged.routes.at(-1)?.stops).toEqual([]);
  expect(merged.stops).toBe(DEMO_NETWORK.stops);
  expect(merged.routes.at(-1)?.geometry).toEqual(d.outbound);
  expect(
    demoPlan(merged, DEMO_NETWORK.stops[0], DEMO_NETWORK.stops[2]).every((j) =>
      j.legs.every((l) => !l.route_id.startsWith('published:')),
    ),
  ).toBe(true);
});
it('valida tiempos y fuente del inventario, sin inventar fase en vivo', () => {
  const s = { ...newSignal(), name: 'Cruce' };
  expect(validateSignal(s).red).toBeNull();
  expect(() => validateSignal({ ...s, green: -1 })).toThrow();
  expect(() => validateSignal({ ...s, amber: 1.5 })).toThrow();
  expect(() => validateSignal({ ...s, status: 'operational' })).toThrow(
    'fuente',
  );
  expect(() => validateSignal({ ...s, lon: Infinity })).toThrow();
  expect(readSignals([s, { ...s, red: 700 }, null])).toEqual([s]);
});
