import { it, expect } from 'vitest';
import {
  localCandidates,
  planLocalStreets,
  type FootRouter,
} from '../lib/local-planner';
import { DEMO_NETWORK, distance, type Network } from '../lib/mobility';
import { mapData } from '../lib/map-data';
const origin = { lon: -70.134, lat: -15.492 },
  destination = DEMO_NETWORK.stops.find((s) => s.name.includes('Aeropuerto'))!;
const proposal = {
  ...DEMO_NETWORK.routes[0],
  id: 'published:red',
  code: 'N40',
  status: 'proposal',
  stops: [],
  inbound: [],
  geometry: [
    [-70.1341, -15.492],
    [destination.lon, destination.lat],
  ],
  inbound_geometry: [],
  start: '',
  end: '',
  frequency: [0, 0],
};
const net: Network = {
  ...DEMO_NETWORK,
  routes: [...DEMO_NETWORK.routes, proposal],
};
const router: FootRouter = {
  distances: async (pairs) => pairs.map((p) => distance(p.a, p.b) * 1.2),
  route: async (a, b) => ({
    coordinates: [
      [a.lon, a.lat],
      [a.lon, b.lat],
      [b.lon, b.lat],
    ],
    meters: Math.round(distance(a, b) * 1.2),
    seconds: distance(a, b) / 1.2,
    streets: ['Camino de prueba'],
  }),
};
it('incluye propuesta roja, prioriza abordaje cercano y conserva datos desconocidos', async () => {
  const results = await planLocalStreets(
    net,
    origin,
    destination,
    '10:00',
    'nearest',
    router,
  );
  expect(results[0].legs[0].route_id).toBe('published:red');
  expect(results[0].service_unknown).toBe(true);
  expect(results[0].legs[0].wait).toBeNull();
  expect(results.map((j) => j.boarding_meters)).toEqual(
    results.map((j) => j.boarding_meters).sort((a, b) => a! - b!),
  );
  expect(results[0].walking?.[0].coordinates).toHaveLength(3);
});
it('un sentido único no se recorre al revés', () => {
  const only = { stops: [], routes: [proposal] };
  expect(localCandidates(only, destination, origin, '10:00')).toHaveLength(0);
});
it('una línea cercana que no alcanza el destino no es candidata', () => {
  const only = {
    stops: [],
    routes: [
      {
        ...proposal,
        geometry: [
          [-70.134, -15.492],
          [-70.135, -15.492],
        ],
      },
    ],
  };
  expect(localCandidates(only, origin, destination, '10:00')).toHaveLength(0);
});
it('usa distancia peatonal, no proximidad en línea recta para ordenar', async () => {
  const detour: FootRouter = {
    ...router,
    distances: async (pairs) =>
      pairs.map((p) => (p.b.lon === -70.1341 ? 900 : distance(p.a, p.b))),
    route: async (a, b) => ({
      ...(await router.route(a, b)),
      meters: b.lon === -70.1341 ? 900 : Math.round(distance(a, b)),
    }),
  };
  const results = await planLocalStreets(
    net,
    origin,
    destination,
    '10:00',
    'nearest',
    detour,
  );
  expect(results[0].legs[0].route_id).not.toBe('published:red');
});
it('fallo del servicio no genera caminatas rectas', async () => {
  await expect(
    planLocalStreets(net, origin, destination, '10:00', 'nearest', {
      ...router,
      distances: async () => {
        throw Error('offline');
      },
    }),
  ).rejects.toThrow('offline');
  const journey = localCandidates(net, origin, destination, '10:00')[0];
  const features = mapData(
    {
      network: net,
      origin,
      destination,
      journey,
      selected: null,
      positions: [],
    },
    false,
    0,
  ).features;
  expect(features.some((f) => f.properties?.kind === 'walk')).toBe(false);
});
it('el mapa conserva la geometría peatonal completa y el tramo propuesto', async () => {
  const journey = (
    await planLocalStreets(net, origin, destination, '10:00', 'nearest', router)
  )[0];
  const features = mapData(
    {
      network: net,
      origin,
      destination,
      journey,
      selected: null,
      positions: [],
    },
    false,
    0,
  ).features;
  const walk = features.find((f) => f.properties?.kind === 'walk');
  expect(walk?.geometry).toEqual({
    type: 'LineString',
    coordinates: journey.walking![0].coordinates,
  });
});

it('reutiliza caminatas compartidas y muestra la primera opción antes de terminar', async () => {
  let calls = 0,
    progress = 0,
    finished = false;
  const counting: FootRouter = {
    ...router,
    route: async (a, b) => {
      calls++;
      return router.route(a, b);
    },
  };
  const plaza = DEMO_NETWORK.stops.find((s) => s.id === 'plaza')!;
  const results = await planLocalStreets(
    DEMO_NETWORK,
    plaza,
    destination,
    '10:00',
    'nearest',
    counting,
    (partial) => {
      expect(finished).toBe(false);
      expect(partial).toHaveLength(1);
      progress++;
    },
  );
  finished = true;
  expect(results).toHaveLength(3);
  expect(progress).toBe(1);
  expect(calls).toBe(2); // Three alternatives share the same access and exit.
});
