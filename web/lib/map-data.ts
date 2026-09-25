import { vehicleAt } from './vehicle-simulation';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  type Network,
  type Journey,
  type Point,
  type Position,
  isFresh,
  distance,
} from './mobility';
import { decodePolyline } from './polyline';
import { signalCycle, phaseNames } from './signal-cycle';
import { signalStatuses, type SignalPoint } from './map-workspace';
export type MapDirection = 'both' | 'outbound' | 'inbound';
export type MapDataProps = {
  network: Network;
  selected: string | null;
  origin: Point | null;
  destination: Point | null;
  journey: Journey | null;
  coverage?: boolean;
  positions: Position[];
  direction?: MapDirection;
  signals?: SignalPoint[];
  simulationMeters?: number;
  analysisPoints?: (Point & { id: string; name: string; color: string; radius?: number })[];
};
export const validCoordinate = (p: number[]) =>
  p.length >= 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90;
export function mapBounds(
  props: MapDataProps,
): [[number, number], [number, number]] {
  const routes = props.journey
    ? props.network.routes.filter((r) =>
        props.journey!.legs.some((l) => l.route_id === r.id),
      )
    : props.selected
      ? props.network.routes.filter((r) => r.id === props.selected)
      : props.network.routes;
  const points = routes
    .flatMap((r) =>
      props.direction === 'inbound'
        ? r.inbound_geometry
        : props.direction === 'outbound'
          ? r.geometry
          : [...r.geometry, ...r.inbound_geometry],
    )
    .filter(validCoordinate);
  if (props.journey) {
    points.push(
      ...(props.journey.walking || [])
        .flatMap((w) => w.coordinates)
        .filter(validCoordinate),
    );
    for (const p of [props.origin, props.destination])
      if (p) points.push([p.lon, p.lat]);
  }
  if (!points.length)
    return [
      [-70.16, -15.52],
      [-70.1, -15.46],
    ];
  return [
    [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ],
    [
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ],
  ];
}
export function mapData(
  props: MapDataProps,
  simulation: boolean,
  tick: number,
  zoom = 12,
  tileSize = 512,
  now = Date.now(),
): FeatureCollection {
  const features: Feature<Geometry>[] = [];
  for (const p of props.analysisPoints || []) features.push({type:'Feature',geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{kind:'analysis',id:p.id,name:p.name,color:p.color,radius:p.radius||3}});
  const activeIds = props.journey
    ? props.journey.legs.map((l) => l.route_id)
    : props.selected
      ? [props.selected]
      : [];
  for (const r of props.network.routes) {
    const leg = props.journey?.legs.find((l) => l.route_id === r.id);
    const directions = leg
      ? [leg.direction]
      : props.direction === 'inbound'
        ? [1]
        : props.direction === 'outbound'
          ? [0]
          : [0, 1];
    for (const direction of directions) {
      let coords = (direction ? r.inbound_geometry : r.geometry).filter(
        validCoordinate,
      );
      if (leg?.coordinates) coords = leg.coordinates.filter(validCoordinate);
      else if (leg?.geometry) {
        try {
          coords = decodePolyline(leg.geometry);
        } catch {}
      }
      const color = r.color,
        active = !activeIds.length || activeIds.includes(r.id),
        opacity = active ? 0.95 : 0.2;
      if (coords.length > 1) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            kind: 'route',
            id: r.id,
            direction,
            color,
            width: activeIds.includes(r.id) ? 5.5 : 4,
            opacity,
            name: `${r.code} · ${direction ? 'Vuelta' : 'Ida'}`,
          },
        });
        // Screen-space spacing, converted at the route latitude. Opposite
        // directions are staggered so their rounded chevrons never form a star.
        if (active) {
          const metresPerPixel =
            (40075016.686 * Math.cos((coords[0][1] * Math.PI) / 180)) /
            (tileSize * 2 ** zoom);
          const spacing = 168 * metresPerPixel;
          let remaining = spacing * (direction ? 0.75 : 0.25);
          for (let i = 1; i < coords.length; i++) {
            const a = coords[i - 1],
              b = coords[i],
              dx = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180),
              dy = (b[1] - a[1]) * 111320,
              length = Math.hypot(dx, dy);
            if (length < 0.01) continue;
            while (remaining < length) {
              const f = remaining / length;
              features.push({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [
                    a[0] + (b[0] - a[0]) * f,
                    a[1] + (b[1] - a[1]) * f,
                  ],
                },
                properties: {
                  kind: 'arrow',
                  id: r.id,
                  color,
                  direction,
                  bearing: (Math.atan2(dx, dy) * 180) / Math.PI,
                  icon: `direction-${r.id}`,
                },
              });
              remaining += spacing;
            }
            remaining -= length;
          }
        }
      }
    }
  }
  const visibleStops = new Set(
    (activeIds.length
      ? props.network.routes.filter((r) => activeIds.includes(r.id))
      : props.network.routes
    ).flatMap((r) =>
      props.direction === 'inbound'
        ? r.inbound
        : props.direction === 'outbound'
          ? r.stops
          : [...r.stops, ...r.inbound],
    ),
  );
  for (const s of props.network.stops.filter((s) => visibleStops.has(s.id))) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { kind: 'stop', id: s.id, name: s.name, color: '#ffffff' },
    });
    if (props.coverage) {
      const ring = Array.from({ length: 49 }, (_, i) => {
        const a = (i * Math.PI) / 24;
        return [
          s.lon +
            (Math.cos(a) * 650) / (111320 * Math.cos((s.lat * Math.PI) / 180)),
          s.lat + (Math.sin(a) * 650) / 111320,
        ];
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { kind: 'coverage' },
      });
    }
  }
  for (const [kind, p] of [
    ['origin', props.origin],
    ['destination', props.destination],
  ] as const)
    if (p && validCoordinate([p.lon, p.lat]))
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          kind,
          color:
            kind === 'origin'
              ? p.locatedAt
                ? '#3478da'
                : '#285c94'
              : '#d5792e',
        },
      });
  const gps = props.origin;
  if (gps?.locatedAt && Number.isFinite(gps.accuracy) && gps.accuracy! > 0) {
    const radius = Math.min(gps.accuracy!, 100000);
    const ring = Array.from({ length: 65 }, (_, i) => {
      const angle = (i * Math.PI) / 32;
      return [
        gps.lon +
          (Math.cos(angle) * radius) /
            (111320 * Math.max(0.001, Math.cos((gps.lat * Math.PI) / 180))),
        gps.lat + (Math.sin(angle) * radius) / 111320,
      ];
    });
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { kind: 'gps-accuracy' },
    });
  }
  for (const walk of props.journey?.walking || []) {
    if (walk.coordinates.length > 1)
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: walk.coordinates },
        properties: { kind: 'walk' },
      });
  }
  for (const encoded of props.journey?.walk_geometry || []) {
    try {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: decodePolyline(encoded) },
        properties: { kind: 'walk' },
      });
    } catch {}
  }
  const boarding = props.journey?.legs[0]?.from;
  if (boarding)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [boarding.lon, boarding.lat] },
      properties: {
        kind: 'boarding',
        proposed: boarding.kind === 'proposal',
        color: '#285c94',
        name:
          boarding.kind === 'proposal'
            ? 'Encuentro sugerido con la ruta · no es un paradero registrado'
            : `Sube al micro en ${boarding.name}`,
      },
    });
  const exit = props.journey?.legs.at(-1)?.to;
  if (exit?.kind === 'proposal')
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [exit.lon, exit.lat] },
      properties: {
        kind: 'boarding',
        proposed: true,
        color: '#285c94',
        name: 'Bajada sugerida para continuar a pie · no es un paradero registrado',
      },
    });
  for (const p of props.positions.filter((p) => isFresh(p)))
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { kind: 'vehicle', color: '#173e35', name: p.vehicle_id },
    });
  for (const s of props.signals || [])
    if (validCoordinate([s.lon, s.lat])) {
      const cycle = signalCycle(s, now);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          kind: 'signal',
          id: s.id,
          color: '#a76b15',
          phase: cycle.phase,
          remaining: cycle.remaining,
          name: `${s.name} · ${signalStatuses[s.status]} · ${cycle.phase === 'off' ? 'Sin ciclo disponible' : `Simulación: ${phaseNames[cycle.phase]} · ${cycle.remaining} s`}`,
        },
      });
    }
  if (simulation) {
    const route =
      props.network.routes.find((r) => r.id === props.selected) ||
      props.network.routes[0];
    const vehicleDirection =
      props.journey?.legs.find((l) => l.route_id === route?.id)?.direction ??
      (props.direction === 'inbound' ? 1 : 0);
    const g =
      (vehicleDirection === 1
        ? route?.inbound_geometry
        : route?.geometry
      )?.filter(validCoordinate) || [];
    if (g.length > 1) {
      const location = vehicleAt(
        g,
        props.simulationMeters ??
          (tick * (route.service?.speedKmh || 15)) / 3.6,
      )!;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: location.coordinates,
        },
        properties: {
          kind: 'vehicle',
          color: route.color,
          name: 'Combi de demostración',
          bearing: location.bearing,
        },
      });
    }
  }
  for (const f of [...features])
    if (f.properties?.kind === 'walk' && f.geometry.type === 'LineString') {
      const coords = f.geometry.coordinates;
      const lengths = coords
        .slice(1)
        .map((p, i) =>
          distance(
            { lon: coords[i][0], lat: coords[i][1] },
            { lon: p[0], lat: p[1] },
          ),
        );
      const total = lengths.reduce((a, b) => a + b, 0);
      if (total < 10) continue;
      const metersPerPixel =
        (40075016.686 * Math.cos((coords[0][1] * Math.PI) / 180)) /
        (tileSize * 2 ** zoom);
      const spacing = Math.max(2, 76 * metersPerPixel);
      for (
        let cursor = Math.min(spacing / 2, total / 2);
        cursor < total;
        cursor += spacing
      ) {
        let remaining = cursor;
        for (let i = 0; i < lengths.length; i++) {
          if (remaining <= lengths[i] && lengths[i] > 0) {
            const t = remaining / lengths[i];
            const dx =
              (coords[i + 1][0] - coords[i][0]) *
              Math.cos((coords[i][1] * Math.PI) / 180);
            const dy = coords[i + 1][1] - coords[i][1];
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [
                  coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
                  coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
                ],
              },
              properties: {
                kind: 'walk-marker',
                bearing: (Math.atan2(-dy, dx) * 180) / Math.PI,
                name: 'Tramo a pie',
                color: '#285c94',
              },
            });
            break;
          }
          remaining -= lengths[i];
        }
      }
    }
  // Keep shared corridors legible: neighboring routes must not stack arrowheads.
  const occupied = new Map<string, [number, number][]>();
  const world = tileSize * 2 ** zoom;
  const separated = features.filter((f) => {
    if (f.properties?.kind !== 'arrow' || f.geometry.type !== 'Point')
      return true;
    const [lon, lat] = f.geometry.coordinates;
    const x = ((lon + 180) / 360) * world;
    const sin = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
    const gx = Math.floor(x / 28),
      gy = Math.floor(y / 28);
    for (let a = gx - 1; a <= gx + 1; a++)
      for (let b = gy - 1; b <= gy + 1; b++) {
        if (
          occupied
            .get(`${a}:${b}`)
            ?.some((p) => Math.hypot(p[0] - x, p[1] - y) < 28)
        )
          return false;
      }
    const key = `${gx}:${gy}`;
    occupied.set(key, [...(occupied.get(key) || []), [x, y]]);
    return true;
  });
  return { type: 'FeatureCollection', features: separated };
}
