import { estimateJourney } from './journey-timing';
import { trimProposalAccess } from './access-junctions';
import {
  demoPlan,
  distance,
  type Journey,
  type Network,
  type Point,
  type Stop,
  type WalkPath,
} from './mobility';

const point = (p: number[]): Point => ({ lon: p[0], lat: p[1] });
// Project onto every segment, retaining chain order so boarding never reverses travel.
function projections(coords: number[][], target: Point) {
  const cos = Math.cos((target.lat * Math.PI) / 180);
  return coords
    .slice(1)
    .map((b, i) => {
      const a = coords[i],
        dx = (b[0] - a[0]) * cos,
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((target.lon - a[0]) * cos * dx + (target.lat - a[1]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      return { p, order: i + t, gap: distance(point(p), target) };
    })
    .filter((p) => p.gap <= 650)
    .sort((a, b) => a.gap - b.gap);
}
export function localCandidates(
  net: Network,
  origin: Point,
  destination: Point,
  hour: string,
): Journey[] {
  const options = demoPlan(net, origin, destination, hour, 'walk', Infinity);
  for (const route of net.routes.filter((r) => r.status === 'proposal')) {
    for (const direction of [0, 1]) {
      if (
        route.service?.start &&
        route.service?.end &&
        (hour < route.service.start || hour >= route.service.end)
      )
        continue;
      const coords = direction ? route.inbound_geometry : route.geometry;
      if (coords.length < 2) continue;
      const starts = projections(coords, origin),
        ends = projections(coords, destination);
      // These are proposed access points, never official stops or observed service.
      const pairs = starts
        .flatMap((a) =>
          ends
            .filter((b) => b.order > a.order + 0.00001)
            .map((b) => ({ a, b })),
        )
        .sort((x, y) => x.a.gap - y.a.gap || x.b.gap - y.b.gap);
      const pair = pairs[0];
      if (!pair) continue;
      const { a, b } = pair;
      const geometry = [
        a.p,
        ...coords.slice(Math.floor(a.order) + 1, Math.ceil(b.order)),
        b.p,
      ];
      const meters = geometry
        .slice(1)
        .reduce((v, p, i) => v + distance(point(p), point(geometry[i])), 0);
      const stop = (p: number[], role: string): Stop => ({
        ...point(p),
        id: `${route.id}:${direction}:${role}`,
        name: `${role} ${role === 'Bajada' ? 'propuesta' : 'propuesto'} · ${route.code}`,
        kind: 'proposal',
      });
      const from = stop(a.p, 'Abordaje'),
        to = stop(b.p, 'Bajada');
      options.push({
        id: `${route.id}.${direction}`,
        legs: [
          {
            route_id: route.id,
            direction,
            from,
            to,
            stops: [from, to],
            minutes: Math.ceil(meters / 250),
            wait: null,
            fare: 0,
            coordinates: geometry,
          },
        ],
        minutes: 0,
        walk_meters: 0,
        transfers: 0,
        fare: 0,
        mode: 'proposal',
        service_unknown: true,
        warning:
          'Propuesta local: confirma abordaje, horario y tarifa con el operador.',
      });
    }
  }
  return options;
}

const endpoint = (
  (import.meta.env as Record<string, string | undefined>)
    .VITE_FOOT_ROUTING_URL || 'https://routing.openstreetmap.de/routed-foot'
).replace(/\/$/, '');
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, unknown>();
async function footRequest<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const job = queue
    .catch(() => {})
    .then(async () => {
      if (cache.has(path)) return cache.get(path) as T;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1050 - (Date.now() - lastRequest))),
      );
      lastRequest = Date.now();
      const response = await fetch(`${endpoint}/${path}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          'No se pudo consultar la red peatonal. Intenta nuevamente.',
        );
      const data = (await response.json()) as { code: string };
      if (data.code !== 'Ok')
        throw new Error(
          'No se encontró un camino peatonal conectado. Corrige los puntos en el mapa.',
        );
      if (cache.size > 200) cache.clear();
      cache.set(path, data);
      return data as T;
    });
  queue = job;
  return job;
}
const coordinate = (p: Point) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
type Pair = { a: Point; b: Point; key: string };
const pair = (a: Point, b: Point): Pair => ({
  a,
  b,
  key: `${coordinate(a)};${coordinate(b)}`,
});
export type FootRouter = {
  distances(pairs: Pair[]): Promise<(number | null)[]>;
  route(a: Point, b: Point): Promise<WalkPath>;
};
export const footRouter: FootRouter = {
  async distances(pairs) {
    const result: (number | null)[] = [];
    for (let offset = 0; offset < pairs.length; offset += 40) {
      const group = pairs.slice(offset, offset + 40);
      const data = await footRequest<{
        distances: (number | null)[][];
        sources: { distance: number }[];
        destinations: { distance: number }[];
      }>(
        `table/v1/foot/${group.map((p) => p.key).join(';')}?sources=${group.map((_, i) => i * 2).join(';')}&destinations=${group.map((_, i) => i * 2 + 1).join(';')}&annotations=distance`,
      );
      group.forEach((_, i) =>
        result.push(
          data.sources[i].distance > 75 || data.destinations[i].distance > 75
            ? null
            : data.distances[i][i],
        ),
      );
    }
    return result;
  },
  async route(a, b) {
    if (distance(a, b) < 1)
      return { coordinates: [[a.lon, a.lat]], meters: 0, seconds: 0 };
    const data = await footRequest<{
      routes: {
        distance: number;
        duration: number;
        geometry: { coordinates: number[][] };
        legs: { steps: { name: string }[] }[];
      }[];
      waypoints: { distance: number }[];
    }>(
      `route/v1/foot/${coordinate(a)};${coordinate(b)}?overview=full&geometries=geojson&steps=true`,
    );
    const route = data.routes[0];
    if (!route || data.waypoints.some((w) => w.distance > 75))
      throw new Error(
        'El punto está demasiado lejos de un camino registrado. Acércalo a una calle en el mapa.',
      );
    return {
      coordinates: route.geometry.coordinates,
      meters: Math.round(route.distance),
      seconds: route.duration,
      streets: [
        ...new Set(
          route.legs.flatMap((l) => l.steps.map((s) => s.name)).filter(Boolean),
        ),
      ],
    };
  },
};
export async function planLocalStreets(
  net: Network,
  origin: Point,
  destination: Point,
  hour: string,
  preference: string,
  router: FootRouter = footRouter,
  onProgress?: (results: Journey[]) => void,
): Promise<Journey[]> {
  const candidates = localCandidates(net, origin, destination, hour);
  if (!candidates.length) return [];
  const accesses = (j: Journey) => [
    pair(origin, j.legs[0].from),
    pair(j.legs.at(-1)!.to, destination),
  ];
  const unique = [
    ...new Map(candidates.flatMap(accesses).map((p) => [p.key, p])).values(),
  ];
  const costs = await router.distances(unique);
  const distances = new Map(unique.map((p, i) => [p.key, costs[i]]));
  const eligible = candidates.filter((j) =>
    accesses(j).every(
      (p) => distances.get(p.key) != null && distances.get(p.key)! <= 1500,
    ),
  );
  for (const j of eligible) {
    const [a, b] = accesses(j).map((p) => distances.get(p.key)!);
    j.boarding_meters = Math.round(a);
    j.walk_meters = Math.round(a + b);
    Object.assign(j, estimateJourney(j, net));
  }
  eligible.sort((a, b) =>
    preference === 'nearest'
      ? a.boarding_meters! - b.boarding_meters! || a.walk_meters - b.walk_meters
      : preference === 'walk'
        ? a.walk_meters - b.walk_meters || a.minutes - b.minutes
        : preference === 'transfers'
          ? a.transfers - b.transfers || a.minutes - b.minutes
          : a.minutes - b.minutes || a.boarding_meters! - b.boarding_meters!,
  );
  const seen = new Set<string>();
  const results: Journey[] = [];
  const walkingCache = new Map<string, Promise<WalkPath>>();
  for (let j of eligible) {
    const key = j.legs.map((l) => `${l.route_id}.${l.direction}`).join();
    if (seen.has(key)) continue;
    seen.add(key);
    j.walking = [];
    for (const p of accesses(j)) {
      if (!walkingCache.has(p.key))
        walkingCache.set(p.key, router.route(p.a, p.b));
      j.walking.push(await walkingCache.get(p.key)!);
    }
    j = estimateJourney(trimProposalAccess(j, net), net);
    const departure = Number(hour.slice(0, 2)) * 60 + Number(hour.slice(3));
    if (
      j.legs.some((l) => {
        const r = net.routes.find((r) => r.id === l.route_id);
        const end = r?.service?.end || r?.end;
        if (!end) return false;
        return (
          departure + j.minutes >
          Number(end.slice(0, 2)) * 60 + Number(end.slice(3))
        );
      })
    )
      continue;
    j.boarding_meters = j.walking![0].meters;
    j.walk_meters = j.walking!.reduce((v, w) => v + w.meters, 0);
    j.warning = j.service_unknown
      ? j.warning
      : 'Servicio de ejemplo; caminata calculada con OpenStreetMap.';
    results.push(j);
    if (results.length === 1) onProgress?.([...results]);
    if (results.length === 3) break;
  }
  if (preference === 'nearest')
    results.sort(
      (a, b) =>
        a.boarding_meters! - b.boarding_meters! ||
        a.walk_meters - b.walk_meters,
    );
  return results;
}
