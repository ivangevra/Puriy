import { it, expect } from 'vitest';
import { estimateJourney } from '../lib/journey-timing';
import { journeySteps } from '../lib/walking-steps';
import { localCandidates } from '../lib/local-planner';
import { DEMO_NETWORK } from '../lib/mobility';
import { newDraft, parseDraft } from '../lib/route-drafts';
const origin = { lon: -70.134, lat: -15.49 },
  destination = { lon: -70.134, lat: -15.5 };
const route = {
  ...DEMO_NETWORK.routes[0],
  id: 'published:uuid',
  code: 'N40',
  status: 'proposal',
  geometry: [
    [origin.lon, origin.lat],
    [destination.lon, destination.lat],
  ],
  inbound_geometry: [],
  service: {
    headway: 10,
    speedKmh: 15,
    fare: 1.5,
    start: '06:00',
    end: '22:00',
  },
};
const net = { stops: [], routes: [route] };
it('suma caminatas, espera de medio intervalo y trayecto con velocidad configurada', () => {
  const j = localCandidates(net, origin, destination, '10:00')[0];
  j.walking = [
    { coordinates: [], meters: 124, seconds: 100 },
    { coordinates: [], meters: 225, seconds: 200 },
  ];
  const timed = estimateJourney(j, net);
  expect(timed.timing).toEqual({ walk: 6, wait: 5, ride: 5, total: 16 });
  expect(timed.fare).toBe(1.5);
  const steps = journeySteps(timed, origin, destination, net);
  expect(steps.find((s) => s.kind === 'ride')?.title).toBe('Toma el N40');
});
it('no inventa espera ni total completo sin frecuencia', () => {
  const j = localCandidates(net, origin, destination, '10:00')[0];
  expect(
    estimateJourney(j, { ...net, routes: [{ ...route, service: undefined }] })
      .timing?.total,
  ).toBeNull();
  expect(localCandidates(net, origin, destination, '02:00')).toHaveLength(0);
});
it('rechaza frecuencias y horarios inválidos conservando borradores antiguos', () => {
  const draft = newDraft();
  expect(parseDraft(draft)).toEqual(draft);
  expect(() => parseDraft({ ...draft, service: { headway: -10 } })).toThrow();
  expect(() =>
    parseDraft({ ...draft, service: { start: '22:00', end: '06:00' } }),
  ).toThrow();
  expect(
    parseDraft({ ...draft, service: route.service }).service?.headway,
  ).toBe(10);
});
