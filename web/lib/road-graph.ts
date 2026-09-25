// Street graph of Juliaca (OpenStreetMap) with one-way directions, plus the
// shortest-path algorithms used by the demos: Dijkstra and A*. Both record the
// order in which edges are explored so the search can be animated.
import { line, meters, project as projectOnLine, slice, type Coord } from './demo-geo';

export type Mode = 'drive' | 'walk';
export type RawGraph = {
  source: string;
  generated: string;
  nodes: number[];
  names: string[];
  edges: [number, number, number, number, number, number, number[]][];
};
export type Edge = {
  id: number;
  u: number;
  v: number;
  length: number;
  drive: boolean;
  walk: boolean;
  oneway: boolean;
  speed: number;
  name: string;
  mid: Coord[];
};
export type RoadGraph = {
  source: string;
  x: Float64Array;
  y: Float64Array;
  edges: Edge[];
  /** Outgoing arcs per node: [edgeIndex, forward] pairs. */
  out: { drive: [number, boolean][][]; walk: [number, boolean][][] };
  /** Lazy spatial index of edges (cell key to edge ids). */
  grid?: Map<string, number[]>;
};

export function parseGraph(raw: RawGraph): RoadGraph {
  const n = raw.nodes.length / 2;
  const x = new Float64Array(n),
    y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = raw.nodes[i * 2] / 1e6;
    y[i] = raw.nodes[i * 2 + 1] / 1e6;
  }
  const drive: [number, boolean][][] = Array.from({ length: n }, () => []);
  const walk: [number, boolean][][] = Array.from({ length: n }, () => []);
  const edges = raw.edges.map(([u, v, length, flags, speed, name, mid], id) => {
    const e: Edge = {
      id,
      u,
      v,
      length,
      drive: (flags & 1) > 0,
      walk: (flags & 2) > 0,
      oneway: (flags & 4) > 0,
      speed,
      name: raw.names[name] || '',
      mid: Array.from({ length: mid.length / 2 }, (_, i) => [mid[i * 2] / 1e6, mid[i * 2 + 1] / 1e6] as Coord),
    };
    if (e.drive) {
      drive[u].push([id, true]);
      // One-way streets only get the arc in their legal direction.
      if (!e.oneway) drive[v].push([id, false]);
    }
    if (e.walk) {
      walk[u].push([id, true]);
      walk[v].push([id, false]);
    }
    return e;
  });
  return { source: raw.source, x, y, edges, out: { drive, walk } };
}

let cache: Promise<RoadGraph> | null = null;
export function loadGraph() {
  cache ??= fetch('/data/red-vial.json')
    .then((r) => {
      if (!r.ok) throw new Error('No se encontró la red vial.');
      return r.json() as Promise<RawGraph>;
    })
    .then(parseGraph)
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

export const nodeAt = (g: RoadGraph, i: number): Coord => [g.x[i], g.y[i]];

/** Closest node reachable in the given mode. */
export function nearestNode(g: RoadGraph, p: number[], mode: Mode = 'drive') {
  let best = -1,
    dist = Infinity;
  const arcs = g.out[mode];
  for (let i = 0; i < g.x.length; i++) {
    if (!arcs[i].length) continue;
    const d = meters([g.x[i], g.y[i]], p);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

export function edgeCoords(g: RoadGraph, e: Edge, forward = true): Coord[] {
  const c = [nodeAt(g, e.u), ...e.mid, nodeAt(g, e.v)];
  return forward ? c : c.reverse();
}

type Heap = { push: (n: number, p: number) => void; pop: () => number; size: () => number };
function heap(): Heap {
  const items: number[] = [],
    prio: number[] = [];
  const swap = (a: number, b: number) => {
    [items[a], items[b]] = [items[b], items[a]];
    [prio[a], prio[b]] = [prio[b], prio[a]];
  };
  return {
    size: () => items.length,
    push(n, p) {
      items.push(n);
      prio.push(p);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (prio[parent] <= prio[i]) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const lastItem = items.pop()!,
        lastPrio = prio.pop()!;
      if (items.length) {
        items[0] = lastItem;
        prio[0] = lastPrio;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1,
            r = l + 1;
          let m = i;
          if (l < items.length && prio[l] < prio[m]) m = l;
          if (r < items.length && prio[r] < prio[m]) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

export type SearchOptions = {
  mode?: Mode;
  /** 'dijkstra' explores in all directions; 'astar' is guided to the target. */
  algorithm?: 'dijkstra' | 'astar';
  /** Travel time (seconds) instead of distance. */
  weight?: 'time' | 'distance';
  /** Multiplies an edge's cost (e.g. 2.5 for a congested stretch, Infinity to close it). */
  penalty?: (e: Edge) => number;
  /** Ignore one-way restrictions (to show why they matter). */
  ignoreOneway?: boolean;
  /** Only start moving in this direction along the start edge (no U-turn at a waypoint). */
  startForward?: boolean;
};
export type SearchResult = {
  found: boolean;
  path: Coord[];
  edges: Edge[];
  meters: number;
  seconds: number;
  /** Every street segment the algorithm examined, in order (for animation). */
  explored: { edge: Edge; forward: boolean }[];
  settled: number;
  ms: number;
  /** Direction of travel on the final edge (to continue without a U-turn). */
  arriveForward: boolean;
  /** Street points where the route starts and ends (chosen snaps). */
  start?: Snap;
  end?: Snap;
};

const WALK_SPEED = 4.8; // km/h
const CELL = 0.002; // ≈ 220 m

function gridOf(g: RoadGraph) {
  if (g.grid) return g.grid;
  const grid = new Map<string, number[]>();
  for (const e of g.edges) {
    const c = edgeCoords(g, e);
    let w = Infinity, s = Infinity, east = -Infinity, n = -Infinity;
    for (const p of c) {
      w = Math.min(w, p[0]); east = Math.max(east, p[0]);
      s = Math.min(s, p[1]); n = Math.max(n, p[1]);
    }
    for (let x = Math.floor(w / CELL); x <= Math.floor(east / CELL); x++)
      for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++) {
        const k = `${x}:${y}`;
        const list = grid.get(k);
        if (list) list.push(e.id);
        else grid.set(k, [e.id]);
      }
  }
  g.grid = grid;
  return grid;
}

export type Snap = { edge: Edge; along: number; point: Coord; gap: number };

/** Edges in the grid cells around a point (≈ 440 m square). */
export function nearbyEdges(g: RoadGraph, p: number[]): Edge[] {
  const grid = gridOf(g);
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
  const ids = new Set<number>();
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let y = cy - 1; y <= cy + 1; y++) for (const id of grid.get(`${x}:${y}`) || []) ids.add(id);
  return [...ids].map((id) => g.edges[id]);
}

/** Closest point on a street usable in `mode` (projection, not nearest node). */
export function snapToEdge(g: RoadGraph, p: number[], mode: Mode = 'drive', maxGap = 250): Snap | null {
  const grid = gridOf(g);
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
  const cos = Math.cos((p[1] * Math.PI) / 180);
  let best: Snap | null = null;
  for (let ring = 1; ring <= 2 && !best; ring++) {
    const seen = new Set<number>();
    for (let x = cx - ring; x <= cx + ring; x++)
      for (let y = cy - ring; y <= cy + ring; y++)
        for (const id of grid.get(`${x}:${y}`) || []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const e = g.edges[id];
          if (mode === 'drive' ? !e.drive : !e.walk) continue;
          const c = edgeCoords(g, e);
          let along = 0;
          for (let i = 0; i < c.length - 1; i++) {
            const ax = (c[i][0] - p[0]) * cos * 111320, ay = (c[i][1] - p[1]) * 110540;
            const bx = (c[i + 1][0] - p[0]) * cos * 111320, by = (c[i + 1][1] - p[1]) * 110540;
            const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
            const gap = Math.hypot(ax + dx * t, ay + dy * t);
            const seg = Math.sqrt(len2);
            if (gap <= maxGap && (!best || gap < best.gap))
              best = {
                edge: e,
                along: Math.min(e.length, along + seg * t),
                point: [c[i][0] + (c[i + 1][0] - c[i][0]) * t, c[i][1] + (c[i + 1][1] - c[i][1]) * t],
                gap,
              };
            along += seg;
          }
        }
  }
  return best;
}

/** Part of an edge between two distances from its start node, oriented. */
function partial(g: RoadGraph, e: Edge, from: number, to: number): Coord[] {
  const l = line(edgeCoords(g, e));
  const scale = l.total / (e.length || 1);
  const s = slice(l, Math.min(from, to) * scale, Math.max(from, to) * scale);
  return from <= to ? s : s.reverse();
}

type Seed = { node: number; cost: number; meters: number; seconds: number; edge: Edge; forward: boolean; geom: Coord[] };

/** Shortest path between two points on the street network. Starts and ends
 * on the street itself (snapped), respects one-way streets and can forbid a
 * U-turn at the start. Dijkstra or A*, with every examined arc recorded. */
export function route(g: RoadGraph, source: Snap | Snap[], target: Snap | Snap[], o: SearchOptions = {}): SearchResult {
  const as = Array.isArray(source) ? source : [source];
  // A place can be reached from several streets: every candidate snap is a
  // target, and the metres from the street to the place count as walking.
  const bs = Array.isArray(target) ? target : [target];
  const t0 = performance.now();
  const mode = o.mode || 'drive',
    weight = o.weight || 'time',
    astar = o.algorithm === 'astar';
  const speed = (e: Edge) => (mode === 'walk' ? WALK_SPEED : e.speed) / 3.6;
  const cost = (e: Edge, m: number) => (weight === 'time' ? m / speed(e) : m) * (o.penalty ? o.penalty(e) : 1);
  const legal = (e: Edge, forward: boolean) => forward || mode === 'walk' || !e.oneway || !!o.ignoreOneway;
  const n = g.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevForward = new Uint8Array(n);
  const seedOf = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const maxSpeed = mode === 'walk' ? WALK_SPEED : 60;
  const h = (i: number) => {
    if (!astar) return 0;
    let d = Infinity;
    for (const b of bs) d = Math.min(d, meters([g.x[i], g.y[i]], b.point) - b.gap);
    d = Math.max(0, d);
    return weight === 'time' ? d / (maxSpeed / 3.6) : d;
  };
  const arcsOf = (i: number): [number, boolean][] =>
    !o.ignoreOneway || mode === 'walk' ? g.out[mode][i] : g.out.walk[i].filter(([id]) => g.edges[id].drive);
  const explored: SearchResult['explored'] = [];
  // Seeds: leave the start point along its street in each legal direction.
  const seeds: (Seed & { a: Snap })[] = [];
  const startGap = (a: Snap) => (as.length > 1 ? (weight === 'time' ? a.gap / (WALK_SPEED / 3.6) : a.gap) : 0);
  for (const a of as)
    for (const forward of [true, false]) {
      if (o.startForward !== undefined && o.startForward !== forward) continue;
      if (!legal(a.edge, forward)) continue;
      const m = forward ? a.edge.length - a.along : a.along;
      seeds.push({
        a,
        node: forward ? a.edge.v : a.edge.u,
        cost: cost(a.edge, m) + startGap(a),
        meters: m,
        seconds: m / speed(a.edge),
        edge: a.edge,
        forward,
        geom: partial(g, a.edge, a.along, forward ? a.edge.length : 0),
      });
    }
  // Targets: reach the end point from either end of its street.
  const targets = new Map<number, { extra: number; forward: boolean; m: number; k: number }>();
  const gapCost = (b: Snap) => (bs.length > 1 ? (weight === 'time' ? b.gap / (WALK_SPEED / 3.6) : b.gap) : 0);
  bs.forEach((b, k) => {
    for (const forward of [true, false]) {
      if (!legal(b.edge, forward)) continue;
      const node = forward ? b.edge.u : b.edge.v;
      const m = forward ? b.along : b.edge.length - b.along;
      const extra = cost(b.edge, m) + gapCost(b);
      const old = targets.get(node);
      if (!old || extra < old.extra) targets.set(node, { extra, forward, m, k });
    }
  });
  let best = Infinity,
    bestNode = -1,
    direct: boolean | null = null,
    directK = 0;
  // Same street, already heading the right way.
  let directSeed: (typeof seeds)[0] | null = null;
  bs.forEach((b, k) => {
    for (const s of seeds) {
      const a = s.a;
      if (a.edge.id !== b.edge.id) continue;
      const ok = s.forward ? b.along >= a.along : b.along <= a.along;
      if (ok && legal(a.edge, s.forward)) {
        const c = cost(a.edge, Math.abs(b.along - a.along)) + gapCost(b) + startGap(a);
        if (c < best) {
          best = c;
          direct = s.forward;
          directK = k;
          directSeed = s;
        }
      }
    }
  });
  const q = heap();
  seeds.forEach((s, k) => {
    if (s.cost < dist[s.node]) {
      dist[s.node] = s.cost;
      seedOf[s.node] = k;
      prevEdge[s.node] = -1;
      q.push(s.node, s.cost + h(s.node));
    }
    explored.push({ edge: s.edge, forward: s.forward });
  });
  let settled = 0;
  while (q.size()) {
    const i = q.pop();
    if (done[i]) continue;
    if (dist[i] + h(i) >= best) break;
    done[i] = 1;
    settled++;
    const t = targets.get(i);
    if (t && dist[i] + t.extra < best) {
      best = dist[i] + t.extra;
      bestNode = i;
      direct = null;
    }
    for (const [id, forward] of arcsOf(i)) {
      const e = g.edges[id];
      const j = forward ? e.v : e.u;
      explored.push({ edge: e, forward });
      if (done[j]) continue;
      const c = cost(e, e.length);
      if (!Number.isFinite(c)) continue;
      const nd = dist[i] + c;
      if (nd < dist[j]) {
        dist[j] = nd;
        prevEdge[j] = id;
        prevForward[j] = forward ? 1 : 0;
        seedOf[j] = seedOf[i];
        q.push(j, nd + h(j));
      }
    }
  }
  const result: SearchResult = {
    found: best < Infinity,
    path: [],
    edges: [],
    meters: 0,
    seconds: 0,
    explored,
    settled,
    ms: 0,
    arriveForward: true,
  };
  if (direct !== null) {
    const b = bs[directK];
    const a = directSeed!.a;
    result.end = b;
    result.start = a;
    result.path = partial(g, a.edge, a.along, b.along);
    result.edges = [a.edge];
    result.meters = Math.abs(b.along - a.along);
    result.seconds = result.meters / speed(a.edge);
    result.arriveForward = direct;
  } else if (bestNode >= 0) {
    const chain: [Edge, boolean][] = [];
    let i = bestNode;
    while (prevEdge[i] >= 0) {
      const e = g.edges[prevEdge[i]];
      const forward = prevForward[i] === 1;
      chain.push([e, forward]);
      i = forward ? e.u : e.v;
    }
    chain.reverse();
    const seed = seeds[seedOf[bestNode]];
    result.start = seed.a;
    const target = targets.get(bestNode)!;
    const b = bs[target.k];
    result.end = b;
    const push = (c: Coord[]) => result.path.push(...(result.path.length ? c.slice(1) : c));
    push(seed.geom);
    if (seed.meters > 0.5) result.edges.push(seed.edge);
    result.meters += seed.meters;
    result.seconds += seed.seconds;
    for (const [e, forward] of chain) {
      push(edgeCoords(g, e, forward));
      result.edges.push(e);
      result.meters += e.length;
      result.seconds += e.length / speed(e);
    }
    push(partial(g, b.edge, target.forward ? 0 : b.edge.length, b.along));
    if (target.m > 0.5) result.edges.push(b.edge);
    result.meters += target.m;
    result.seconds += target.m / speed(b.edge);
    result.arriveForward = target.forward;
  }
  result.ms = performance.now() - t0;
  return result;
}

/** Node-to-node variant, kept for tests and simple uses. */
export function shortestPath(g: RoadGraph, from: number, to: number, o: SearchOptions = {}): SearchResult {
  // Start at the end of an edge entering `from`; finish at the start of an
  // edge leaving `to`, so both snaps sit exactly on the nodes.
  const usable = (e: Edge) => (o.mode === 'walk' ? e.walk : e.drive);
  const into = g.edges.find((e) => e.v === from && usable(e));
  const outOf = g.edges.find((e) => e.u === to && usable(e));
  if (!into || !outOf) return route(g, { edge: g.edges[0], along: 0, point: nodeAt(g, from), gap: 0 }, { edge: g.edges[0], along: 0, point: nodeAt(g, to), gap: 0 }, o);
  return route(
    g,
    { edge: into, along: into.length, point: nodeAt(g, from), gap: 0 },
    { edge: outOf, along: 0, point: nodeAt(g, to), gap: 0 },
    { ...o, startForward: true },
  );
}

/** Walking path between two points along streets and footpaths. */
export function walkPath(g: RoadGraph, a: number[], b: number[]) {
  const sa = snapToEdge(g, a, 'walk'),
    sb = snapToEdge(g, b, 'walk');
  if (!sa || !sb) return [a, b] as Coord[];
  const r = route(g, sa, sb, { mode: 'walk', algorithm: 'astar', weight: 'distance' });
  return r.found ? ([a as Coord, ...r.path, b as Coord] as Coord[]) : ([a, b] as Coord[]);
}

/** Drivable one-way streets as line features (for direction arrows). */
export function onewayFeatures(g: RoadGraph) {
  return g.edges
    .filter((e) => e.oneway && e.drive)
    .map((e) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: edgeCoords(g, e) },
      properties: { kind: 'oneway', name: e.name },
    }));
}

/**
 * Walking distances from a point to every reachable intersection within
 * `limit` meters (one Dijkstra, not one search per candidate). `pathTo`
 * rebuilds the walk from the point to any reached node along streets.
 */
export function walkTree(g: RoadGraph, p: number[], limit = 1500) {
  const n = g.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevForward = new Uint8Array(n);
  const seedGeom = new Map<number, Coord[]>();
  const snap = snapToEdge(g, p, 'walk', 300);
  if (!snap) return { dist, pathTo: () => [] as Coord[], snap };
  const e = snap.edge;
  const q = heap();
  for (const forward of [true, false]) {
    const node = forward ? e.v : e.u;
    const m = forward ? e.length - snap.along : snap.along;
    if (m < dist[node]) {
      dist[node] = m;
      seedGeom.set(node, [p as Coord, ...partial(g, e, snap.along, forward ? e.length : 0)]);
      q.push(node, m);
    }
  }
  const done = new Uint8Array(n);
  while (q.size()) {
    const i = q.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (dist[i] > limit) break;
    for (const [id, forward] of g.out.walk[i]) {
      const edge = g.edges[id];
      const j = forward ? edge.v : edge.u;
      const nd = dist[i] + edge.length;
      if (nd < dist[j]) {
        dist[j] = nd;
        prevEdge[j] = id;
        prevForward[j] = forward ? 1 : 0;
        q.push(j, nd);
      }
    }
  }
  const pathTo = (node: number): Coord[] => {
    const chain: Coord[][] = [];
    let i = node;
    while (prevEdge[i] >= 0) {
      const edge = g.edges[prevEdge[i]];
      const forward = prevForward[i] === 1;
      chain.push(edgeCoords(g, edge, forward));
      i = forward ? edge.u : edge.v;
    }
    const out: Coord[] = [...(seedGeom.get(i) || [p as Coord])];
    for (const c of chain.reverse()) out.push(...c.slice(1));
    return out;
  };
  return { dist, pathTo, snap };
}

/** Intersections lying on a route line (within `gap` m), with their distance along it. */
export function nodesOnLine(g: RoadGraph, l: { coords: Coord[]; cum: number[]; total: number }, gap = 18) {
  let w = Infinity, s = Infinity, east = -Infinity, north = -Infinity;
  for (const c of l.coords) {
    w = Math.min(w, c[0]); east = Math.max(east, c[0]);
    s = Math.min(s, c[1]); north = Math.max(north, c[1]);
  }
  const pad = 0.0003;
  const out: { node: number; at: number; p: Coord }[] = [];
  for (let i = 0; i < g.x.length; i++) {
    const x = g.x[i], y = g.y[i];
    if (x < w - pad || x > east + pad || y < s - pad || y > north + pad || !g.out.walk[i].length) continue;
    const pr = projectOnLine(l, [x, y]);
    if (pr.gap <= gap) out.push({ node: i, at: pr.at, p: [x, y] });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every drivable street within `radius` m of a place (one snap per street), nearest first. */
export function accessSnaps(g: RoadGraph, p: number[], radius = 90, mode: Mode = 'drive'): Snap[] {
  const cos = Math.cos((p[1] * Math.PI) / 180);
  const out: Snap[] = [];
  for (const e of nearbyEdges(g, p)) {
    if (mode === 'drive' ? !e.drive : !e.walk) continue;
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
        best = { edge: e, along: Math.min(e.length, along + seg * t), point: [c[i][0] + (c[i + 1][0] - c[i][0]) * t, c[i][1] + (c[i + 1][1] - c[i][1]) * t], gap };
      along += seg;
    }
    if (best && best.gap <= radius) out.push(best);
  }
  out.sort((x, y) => x.gap - y.gap);
  return out.length ? out : [snapToEdge(g, p, mode, 400)].filter((x): x is Snap => !!x);
}
