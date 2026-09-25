import type { Coordinate } from './route-drafts';
export type RoadAlignment = 'direction' | 'nearest';
export type RoadSegment = {
  from: number;
  to: number;
  streets: string;
  bearing: number | null;
  distance: number;
  review: boolean;
};
export type RoadResult = {
  key: string;
  geometry: Coordinate[];
  provider: string;
  calculatedAt: string;
  segments?: RoadSegment[];
};
export const roadKey = (
  points: Coordinate[],
  alignment: RoadAlignment = 'direction',
) => `v4:${alignment}:${JSON.stringify(points)}`;
export function travelBearing(a: Coordinate, b: Coordinate) {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360);
  return (
    (Math.round((Math.atan2(dx, b[1] - a[1]) * 180) / Math.PI) + 360) % 360
  );
}
export function endpointBearings(points: Coordinate[]) {
  return points
    .map((p, i) => {
      // Intermediate intersections may turn sharply: don't constrain their heading.
      if (i !== 0 && i !== points.length - 1) return '';
      const a = i === 0 ? p : points[i - 1],
        b = i === 0 ? points[1] : p;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.0001) return '';
      return `${travelBearing(a, b)},75`;
    })
    .join(';');
}
export const compassDirection = (bearing: number) =>
  [
    'norte',
    'noreste',
    'este',
    'sureste',
    'sur',
    'suroeste',
    'oeste',
    'noroeste',
  ][Math.round(bearing / 45) % 8];
export const ROUTING_BASE = (
  (import.meta.env as ImportMetaEnv & { VITE_ROAD_ROUTING_URL?: string })
    .VITE_ROAD_ROUTING_URL || 'https://router.project-osrm.org'
).replace(/\/$/, '');
let lastRequest = 0;
/** Ordered driving route, never a straight-line fallback. Control points stay editable. */
export async function routeOnRoads(
  points: Coordinate[],
  signal: AbortSignal,
  alignment: RoadAlignment = 'direction',
): Promise<RoadResult> {
  if (points.length < 2 || points.length > 80)
    throw new Error('Usa entre 2 y 80 puntos de paso para ajustar a calles.');
  const url = `${ROUTING_BASE}/route/v1/driving/${points.map((p) => p.join(',')).join(';')}?overview=full&geometries=geojson&steps=true&continue_straight=false&radiuses=${points.map(() => '100').join(';')}${alignment === 'direction' ? `&bearings=${endpointBearings(points)}` : ''}`;
  while (Date.now() - lastRequest < 1100) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1100 - (Date.now() - lastRequest)),
    );
    signal.throwIfAborted();
  }
  signal.throwIfAborted();
  lastRequest = Date.now();
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok && response.status !== 400)
    throw new Error(
      'El servicio de calles no está disponible. Intenta de nuevo.',
    );
  const data = (await response.json()) as {
    code?: string;
    routes?: {
      geometry?: { type?: string; coordinates?: unknown[] };
      legs?: {
        distance?: number;
        steps?: {
          name?: string;
          maneuver?: { bearing_after?: number; modifier?: string };
        }[];
      }[];
    }[];
    waypoints?: { distance: number }[];
  };
  if (data.code !== 'Ok' || !data.routes?.[0])
    throw new Error(
      data.code === 'NoSegment'
        ? 'No hay una calzada compatible a menos de 100 m. Mueve el punto o prueba el ajuste por cercanía.'
        : 'No se encontró una conexión transitable. Revisa los puntos de paso.',
    );
  const geometry = data.routes[0].geometry;
  if (
    geometry?.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    geometry.coordinates.length > 50000 ||
    geometry.coordinates.some(
      (p: unknown) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    throw new Error('El servicio devolvió una geometría inválida.');
  if (
    data.waypoints?.some(
      (p: { distance: number }) =>
        !Number.isFinite(p.distance) || p.distance > 100,
    )
  )
    throw new Error(
      'La vía calculada queda demasiado lejos de un punto. Reubícalo.',
    );
  return {
    key: roadKey(points, alignment),
    geometry: geometry.coordinates as Coordinate[],
    provider: ROUTING_BASE,
    calculatedAt: new Date().toISOString(),
    segments: (data.routes[0].legs || [])
      .slice(0, points.length - 1)
      .map((leg, i) => {
        const a = points[i],
          b = points[i + 1];
        const direct =
          Math.hypot(
            (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
            b[1] - a[1],
          ) * 111320;
        const distance =
          Number.isFinite(leg.distance) && leg.distance! >= 0
            ? leg.distance!
            : 0;
        const bearing = leg.steps?.[0]?.maneuver?.bearing_after;
        return {
          from: i,
          to: i + 1,
          streets:
            [
              ...new Set(
                (leg.steps || [])
                  .map((s) => (typeof s.name === 'string' ? s.name : ''))
                  .filter(Boolean),
              ),
            ]
              .join(' → ')
              .slice(0, 600) || 'Vía sin nombre registrado',
          bearing:
            Number.isFinite(bearing) && bearing! >= 0 && bearing! <= 360
              ? bearing!
              : null,
          distance,
          review:
            distance > Math.max(direct * 2, direct + 250) ||
            !!leg.steps?.some((s) => s.maneuver?.modifier === 'uturn'),
        };
      }),
  };
}
