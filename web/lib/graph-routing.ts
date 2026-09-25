// Route editor on the local street graph (OpenStreetMap), replacing the choice
// of "calzada": every control point is tried on the nearby carriageways and the
// combination with the most coherent trip wins (Viterbi over candidates).
// Legs chain without U-turns at control points and always respect one-way
// streets.
import { roadKey, type RoadResult } from './road-routing';
import type { Coordinate } from './route-drafts';
import { bearing, meters } from './demo-geo';
import { edgeCoords, loadGraph, nearbyEdges, route, type RoadGraph, type SearchResult, type Snap } from './road-graph';

const PROVIDER = 'Red vial Puriy · OpenStreetMap';

/** Nearby carriageways for a point: the closest street plus any other within 25 m. */
function candidates(g: RoadGraph, p: Coordinate): Snap[] {
  const cos = Math.cos((p[1] * Math.PI) / 180);
  const found: Snap[] = [];
  for (const e of nearbyEdges(g, p)) {
    if (!e.drive) continue;
    const c = edgeCoords(g, e);
    let along = 0,
      best: Snap | null = null;
    for (let i = 0; i < c.length - 1; i++) {
      const ax = (c[i][0] - p[0]) * cos * 111320, ay = (c[i][1] - p[1]) * 110540;
      const bx = (c[i + 1][0] - p[0]) * cos * 111320, by = (c[i + 1][1] - p[1]) * 110540;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const gap = Math.hypot(ax + dx * t, ay + dy * t);
      const seg = Math.sqrt(len2);
      if (!best || gap < best.gap)
        best = {
          edge: e,
          along: Math.min(e.length, along + seg * t),
          point: [c[i][0] + (c[i + 1][0] - c[i][0]) * t, c[i][1] + (c[i + 1][1] - c[i][1]) * t],
          gap,
        };
      along += seg;
    }
    if (best && best.gap <= 100) found.push(best);
  }
  found.sort((a, b) => a.gap - b.gap);
  if (!found.length) return [];
  return found.filter((s) => s.gap <= Math.max(found[0].gap + 25, 35)).slice(0, 8);
}

type State = { cost: number; dir: boolean | undefined; legs: SearchResult[]; snap: Snap };

export function routeControlPoints(g: RoadGraph, points: Coordinate[]) {
  const layers = points.map((p) => candidates(g, p));
  const missing = layers.findIndex((l) => !l.length);
  if (missing >= 0) throw new Error(`El punto ${missing + 1} está a más de 100 m de una calle transitable. Acércalo a la vía.`);
  // Each state: candidate snap + direction of arrival.
  let states: State[] = layers[0].map((snap) => ({ cost: snap.gap / 4, dir: undefined, legs: [], snap }));
  for (let k = 1; k < points.length; k++) {
    const next = new Map<string, State>();
    for (const s of states)
      for (const snap of layers[k]) {
        const r = route(g, s.snap, snap, { algorithm: 'astar', startForward: s.dir });
        if (!r.found) continue;
        // Travel time plus a small penalty for snapping far from the click.
        const cost = s.cost + r.seconds + snap.gap / 4;
        const key = `${snap.edge.id}:${r.arriveForward}`;
        const old = next.get(key);
        if (!old || cost < old.cost) next.set(key, { cost, dir: r.arriveForward, legs: [...s.legs, r], snap });
      }
    if (!next.size) throw new Error(`No hay una conexión por calles entre los puntos ${k} y ${k + 1} respetando los sentidos. Mueve uno de ellos.`);
    states = [...next.values()];
  }
  return states.reduce((a, b) => (b.cost < a.cost ? b : a));
}

export async function routeOnGraph(points: Coordinate[], signal: AbortSignal): Promise<RoadResult> {
  if (points.length < 2 || points.length > 120) throw new Error('Usa entre 2 y 120 puntos de paso para ajustar a calles.');
  const g = await loadGraph();
  signal.throwIfAborted();
  const best = routeControlPoints(g, points);
  const geometry: Coordinate[] = [];
  for (const leg of best.legs) geometry.push(...(geometry.length ? leg.path.slice(1) : leg.path));
  return {
    key: roadKey(points),
    geometry,
    provider: PROVIDER,
    calculatedAt: new Date().toISOString(),
    segments: best.legs.map((leg, i) => {
      const a = points[i],
        b = points[i + 1];
      const direct = meters(a, b);
      const names = leg.edges.map((e) => e.name).filter(Boolean);
      return {
        from: i,
        to: i + 1,
        streets: names.filter((n, j) => names.indexOf(n) === j).join(' → ').slice(0, 600) || 'Vía sin nombre registrado',
        bearing: leg.path.length > 1 ? Math.round(bearing(leg.path[0], leg.path[1])) : null,
        distance: Math.round(leg.meters),
        review: leg.meters > Math.max(direct * 2, direct + 250),
      };
    }),
  };
}
