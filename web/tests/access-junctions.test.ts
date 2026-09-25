import { it, expect } from 'vitest';
import { trimProposalAccess } from '../lib/access-junctions';
import { DEMO_NETWORK, type Journey, type Network } from '../lib/mobility';
// Horizontal bus route eastbound. Access arrives at x=.002 and unnecessarily
// continues to .003; exit starts at .009 and walks back to .008.
const x = -70.14,
  y = -15.49;
const route = {
  ...DEMO_NETWORK.routes[0],
  id: 'red',
  status: 'proposal',
  geometry: [
    [x, y],
    [x + 0.01, y],
  ],
  inbound_geometry: [],
};
const net: Network = { stops: [], routes: [route] };
const stop = (lon: number) => ({
  lon,
  lat: y,
  id: 'proposed',
  name: 'Propuesto',
  kind: 'proposal',
});
const journey: Journey = {
  id: 'red.0',
  mode: 'proposal',
  service_unknown: true,
  legs: [
    {
      route_id: 'red',
      direction: 0,
      from: stop(x + 0.003),
      to: stop(x + 0.009),
      stops: [],
      minutes: 4,
      wait: null,
      fare: 0,
    },
  ],
  minutes: 10,
  fare: 0,
  walk_meters: 600,
  transfers: 0,
  walking: [
    {
      coordinates: [
        [x + 0.002, y - 0.002],
        [x + 0.002, y],
        [x + 0.003, y],
      ],
      meters: 300,
      seconds: 240,
    },
    {
      coordinates: [
        [x + 0.009, y],
        [x + 0.008, y],
        [x + 0.008, y - 0.002],
      ],
      meters: 300,
      seconds: 240,
    },
  ],
};
it('sube en la primera esquina y baja en la última conexión antes del destino', () => {
  const result = trimProposalAccess(journey, net);
  expect(result.legs[0].from.lon).toBeCloseTo(x + 0.002, 7);
  expect(result.legs[0].to.lon).toBeCloseTo(x + 0.008, 7);
  expect(result.walking![0].coordinates.at(-1)).toEqual([x + 0.002, y]);
  expect(result.walking![1].coordinates[0]).toEqual([x + 0.008, y]);
  expect(result.walk_meters).toBeLessThan(journey.walk_meters);
  expect(result.legs[0].coordinates).toEqual([
    [x + 0.002, y],
    [x + 0.008, y],
  ]);
});
it('encuentra cruces en mitad de un segmento peatonal', () => {
  const j = structuredClone(journey);
  j.walking![0].coordinates = [
    [x + 0.002, y - 0.002],
    [x + 0.002, y + 0.002],
    [x + 0.003, y],
  ];
  expect(trimProposalAccess(j, net).legs[0].from.lon).toBeCloseTo(x + 0.002, 7);
});
it('no mueve paraderos registrados ni invierte el sentido', () => {
  expect(
    trimProposalAccess({ ...journey, service_unknown: false }, net),
  ).toEqual({ ...journey, service_unknown: false });
  const reversed = {
    ...net,
    routes: [{ ...route, geometry: [...route.geometry].reverse() }],
  };
  expect(trimProposalAccess(journey, reversed)).toEqual(journey);
});
