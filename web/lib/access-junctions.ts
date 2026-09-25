import {
  distance,
  type Journey,
  type Network,
  type Point,
  type WalkPath,
} from './mobility';
const asPoint = (p: number[]): Point => ({ lon: p[0], lat: p[1] });
const length = (c: number[][]) =>
  c
    .slice(1)
    .reduce((sum, p, i) => sum + distance(asPoint(c[i]), asPoint(p)), 0);
type Hit = { routeOrder: number; walkOrder: number; p: number[] };
// Find the actual junction of the pedestrian path with the drawn route, not
// the perpendicular projection of the passenger onto that route.
function junctions(walk: number[][], route: number[][]): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < walk.length - 1; i++)
    for (let k = 0; k < route.length - 1; k++) {
      const a = walk[i],
        b = walk[i + 1],
        c = route[k],
        d = route[k + 1];
      const rx = b[0] - a[0],
        ry = b[1] - a[1],
        sx = d[0] - c[0],
        sy = d[1] - c[1];
      const cross = rx * sy - ry * sx;
      if (Math.abs(cross) > 1e-16) {
        const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / cross;
        const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / cross;
        if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7)
          hits.push({
            walkOrder: i + Math.max(0, Math.min(1, t)),
            routeOrder: k + Math.max(0, Math.min(1, u)),
            p: [a[0] + t * rx, a[1] + t * ry],
          });
      }
      // Collinear shared sections: retain vertices within 2 m of the line.
      for (const [p, order] of [
        [a, i],
        [b, i + 1],
      ] as [number[], number][]) {
        const cos = Math.cos((p[1] * Math.PI) / 180),
          dx = sx * cos,
          dy = sy;
        const u = Math.max(
          0,
          Math.min(
            1,
            ((p[0] - c[0]) * cos * dx + (p[1] - c[1]) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
        const q = [c[0] + u * sx, c[1] + u * sy];
        if (distance(asPoint(p), asPoint(q)) <= 2)
          hits.push({ walkOrder: order, routeOrder: k + u, p: q });
      }
    }
  return hits;
}
function sliced(path: WalkPath, hit: Hit, access: boolean): WalkPath {
  const coords = access
    ? [...path.coordinates.slice(0, Math.ceil(hit.walkOrder)), hit.p]
    : [hit.p, ...path.coordinates.slice(Math.floor(hit.walkOrder) + 1)];
  const fraction = Math.min(
    1,
    length(coords) / (length(path.coordinates) || 1),
  );
  // Street names from the original route may include the removed tail.
  return {
    ...path,
    coordinates: coords,
    meters: Math.round(path.meters * fraction),
    seconds: path.seconds * fraction,
    streets: fraction > 0.995 ? path.streets : undefined,
  };
}
export function trimProposalAccess(j: Journey, net: Network): Journey {
  if (!j.service_unknown || j.legs.length !== 1 || j.walking?.length !== 2)
    return j;
  const leg = j.legs[0],
    r = net.routes.find((r) => r.id === leg.route_id);
  if (!r) return j;
  const route = leg.direction ? r.inbound_geometry : r.geometry;
  const boards = junctions(j.walking[0].coordinates, route).sort(
    (a, b) => a.walkOrder - b.walkOrder,
  );
  const exits = junctions(j.walking[1].coordinates, route).sort(
    (a, b) => b.walkOrder - a.walkOrder,
  );
  let board: Hit | undefined, exit: Hit | undefined;
  for (const candidate of boards) {
    const end = exits.find((e) => e.routeOrder > candidate.routeOrder + 1e-6);
    if (end) {
      board = candidate;
      exit = end;
      break;
    }
  }
  if (!board || !exit) return j;
  const from = { ...leg.from, ...asPoint(board.p) },
    to = { ...leg.to, ...asPoint(exit.p) };
  const geometry = [
    board.p,
    ...route.slice(
      Math.floor(board.routeOrder) + 1,
      Math.ceil(exit.routeOrder),
    ),
    exit.p,
  ];
  const access = sliced(j.walking[0], board, true),
    egress = sliced(j.walking[1], exit, false);
  return {
    ...j,
    legs: [
      {
        ...leg,
        from,
        to,
        stops: [from, to],
        coordinates: geometry,
        minutes: Math.ceil(length(geometry) / 250),
      },
    ],
    walking: [access, egress],
    boarding_meters: access.meters,
    walk_meters: access.meters + egress.meters,
  };
}
