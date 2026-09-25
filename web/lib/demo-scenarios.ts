// Presentation demos. Each scenario is a pure function of time `t` (seconds)
// returning map features and the numbers shown beside the map.
//
// Geometry: the corridor comes from the route drawn in the editor (ida and,
// when drawn, vuelta), falling back to demo-corridor.json. Walking paths,
// detours and alternatives are computed on the OpenStreetMap street graph
// (road-graph.ts), which respects one-way streets. Times, GPS and traffic are
// simulated for explanation only.
import baked from './demo-corridor.json';
import { DESTINATIONS, type Destination } from './destinations';
import { DAYS, HOURS, detourSpeed, level, usualSpeed } from './traffic-model';
import { evaluate, fixedPlan, optimize, signalState, type Plan, type Site } from './signal-timing';
import { arrivals, createSim, type LabDemand, type LabSim } from './adaptive-signals';

const num1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-PE');
import {
  along,
  bearing,
  bounds,
  circle,
  clamp01,
  ease,
  fleet,
  line,
  meters,
  phase,
  project,
  slice,
  type Coord,
  type Line,
} from './demo-geo';
import {
  edgeCoords,
  accessSnaps,
  nodesOnLine,
  route,
  snapToEdge,
  walkTree,
  type Edge,
  type RoadGraph,
  type SearchResult,
  type Snap,
} from './road-graph';

type Props = Record<string, string | number | boolean>;
export type DemoFeature = {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: Coord }
    | { type: 'LineString'; coordinates: Coord[] }
    | { type: 'Polygon'; coordinates: Coord[][] };
  properties: Props;
};
const pt = (at: Coord, properties: Props): DemoFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: at },
  properties,
});
const ln = (coords: Coord[], properties: Props): DemoFeature[] =>
  coords.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties }] : [];
const poly = (ring: Coord[], properties: Props): DemoFeature => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [ring] },
  properties,
});

export const TRAFFIC = { ok: '#2f9e6b', slow: '#d99a2b', jam: '#c9423d', alt: '#275cba' };
export const SEARCH = { dijkstra: '#3b82f6', astar: '#8b5cf6', illegal: '#c9423d', path: '#f59e0b' };

export type Corridor = {
  code: string;
  name: string;
  color: string;
  service: { speedKmh?: number; headway?: number; fare?: number };
  outbound: Coord[];
  inbound: Coord[];
  inboundSource: 'editor' | 'estimada';
  source: string;
};
export const BAKED: Corridor = {
  code: baked.code,
  name: baked.name,
  color: baked.color,
  service: baked.service,
  outbound: baked.outbound as Coord[],
  inbound: baked.inbound as Coord[],
  inboundSource: 'estimada',
  source: 'Copia guardada del recorrido',
};

export type Frame = {
  features: DemoFeature[];
  hud: Record<string, unknown>;
  caption: string;
  /** Animated search layers: how many explored edges to show. */
  explore?: { dijkstra?: number; astar?: number; fadeDijkstra?: boolean; fadeAstar?: boolean };
  oneway?: boolean;
  /** Temporary camera target (e.g. zoom in to read one-way arrows). */
  focus?: [[number, number], [number, number]];
};
export type Scenario = {
  id: string;
  title: string;
  slide: string;
  duration: number;
  loop?: boolean;
  needsGraph?: boolean;
  /** 'lab': drawn on its own stage (vehicle simulation) instead of the map. */
  stage?: 'lab';
  bounds: [[number, number], [number, number]];
  captions: [number, string][];
  /** Static layers for the search animation (edges carry an `order`). */
  explored?: { dijkstra: DemoFeature[]; astar: DemoFeature[] };
  frame: (t: number, input: DemoInput) => Frame;
};
export type DemoInput = {
  /** Traffic demo: day (0 = lunes) and hour. */
  day: number;
  hour: number;
  /** Traffic demo: share of speed lost at the incident (0.45 moderate … 0.8 almost stopped). */
  severity: number;
  headway: number;
  speed: number;
  layover: number;
  manzanas?: { at: Coord; people: number }[];
  /** Signals demo: demand over today's illustrative counts (1 = today, 1.2 = +20 %). */
  demand?: number;
  /** Adaptive signals prototype: demand profile and priority by passengers. */
  labDemand?: LabDemand;
  labPriority?: boolean;
};
const captionAt = (captions: [number, string][], t: number) =>
  captions.reduce((c, [start, text]) => (t >= start ? text : c), captions[0][1]);
const clock = (minutes: number) => {
  const total = Math.floor(minutes * 60);
  const h = Math.floor(total / 3600) % 24,
    mi = Math.floor(total / 60) % 60,
    s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const place = (name: string) => DESTINATIONS.find((d) => d.name === name)!;
const at = (d: Destination): Coord => [d.lon, d.lat];

function stopsAlong(l: Line, every = 450): Coord[] {
  const out: Coord[] = [];
  for (let m = 0; m < l.total - every / 2; m += every) out.push(along(l, m).at);
  out.push(l.coords[l.coords.length - 1]);
  return out;
}

/** Street names along a line, in order, from the nearest graph edges. */
function streetNames(g: RoadGraph | null, coords: Coord[], fallback: string[]) {
  if (!g) return fallback;
  const l = line(coords);
  const names: string[] = [];
  for (let m = 40; m < l.total; m += 120) {
    const p = along(l, m).at;
    const snap = snapToEdge(g, p, 'drive', 30);
    const best = snap?.edge.name ? snap.edge : null;
    if (best && names[names.length - 1] !== best.name) names.push(best.name);
  }
  return names.filter((n, i) => names.indexOf(n) === i);
}


export type AlgoPoints = { from: Coord; to: Coord; fromLabel: string; toLabel: string };
export const DEFAULT_ALGO: AlgoPoints = {
  from: [-70.1265, -15.4935],
  to: [-70.1265, -15.4935],
  fromLabel: 'Terminal Terrestre',
  toLabel: 'Plaza Vea',
};
{
  const a = DESTINATIONS.find((d) => d.name === 'Terminal Terrestre Micaela Bastidas');
  const b = DESTINATIONS.find((d) => d.name === 'Plaza Vea');
  if (a) DEFAULT_ALGO.from = [a.lon, a.lat];
  if (b) DEFAULT_ALGO.to = [b.lon, b.lat];
}

/** Moving dots along a line: shows direction and flow of a route. */
function flow(l: Line, t: number, color: string, every = 90, speed = 60): DemoFeature[] {
  const out: DemoFeature[] = [];
  if (l.total < 10) return out;
  for (let m = (t * speed) % every; m < l.total; m += every)
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: along(l, m).at }, properties: { kind: 'flow', color } });
  return out;
}

export const DEFAULT_TRIP: AlgoPoints = { from: [-70.1489, -15.4882], to: [-70.1235, -15.4885], fromLabel: 'UNAJ', toLabel: 'Mercado Túpac Amaru' };
{
  const a = DESTINATIONS.find((d) => d.name === 'Universidad Nacional de Juliaca');
  const b = DESTINATIONS.find((d) => d.name === 'Mercado Túpac Amaru');
  if (a) DEFAULT_TRIP.from = [a.lon, a.lat];
  if (b) DEFAULT_TRIP.to = [b.lon, b.lat];
}

export function createScenarios(
  c: Corridor,
  g: RoadGraph | null,
  algoPoints: AlgoPoints = DEFAULT_ALGO,
  tripPoints: AlgoPoints = DEFAULT_TRIP,
  algoWeight: 'time' | 'distance' = 'time',
): Scenario[] {
  const COLOR = c.color || '#275cba';
  const OUT = line(c.outbound);
  const IN = line(c.inbound.length > 1 ? c.inbound : [...c.outbound].reverse());
  const LOOP = line([...OUT.coords, ...IN.coords.slice(1)]);
  const SPEED = Number(c.service?.speedKmh) || 15;
  const HEADWAY = Number(c.service?.headway) || 10;
  const FARE = Number(c.service?.fare) || 1;
  const ALL = bounds([...OUT.coords, ...IN.coords]);
  const STOPS = stopsAlong(OUT);
  const nearCorridor = (radius: number) =>
    DESTINATIONS.filter((d) => d.category !== 'inicial' && STOPS.some((s) => meters(s, at(d)) <= radius));
  const LANDMARKS = nearCorridor(350).filter((d) => d.pdu);
  const places = (items: Destination[], labels = false) =>
    items.map((d) => pt(at(d), { kind: 'place', category: d.category, label: labels ? d.name : '' }));
  const stops = (list: Coord[], color = COLOR) => list.map((s) => pt(s, { kind: 'stop', color }));
  const base = (opacity = 0.35): DemoFeature[] => [
    ...ln(OUT.coords, { kind: 'route', color: COLOR, width: 4, opacity }),
    ...ln(IN.coords, { kind: 'route-dash', color: COLOR, width: 3, opacity: opacity * 0.8 }),
  ];
  const micro = (l: Line, m: number, props: Props = {}) => {
    const p = along(l, m);
    return pt(p.at, { kind: 'micro', bearing: p.bearing, opacity: 1, ...props });
  };

  // Continue in the travel direction when starting on the corridor's street.
  const snapOnCorridor = (l: Line, m: number): { snap: Snap; forward?: boolean } | null => {
    if (!g) return null;
    const p = along(l, m);
    const snap = snapToEdge(g, p.at, 'drive', 40);
    if (!snap) return null;
    const c = edgeCoords(g, snap.edge);
    const eb = bearing(c[0], c[c.length - 1]);
    const diff = Math.abs(((eb - p.bearing + 540) % 360) - 180);
    return { snap, forward: diff < 90 };
  };
  /** Distance from an edge (three sample points) to a polyline, memoized. */
  const nearLine = (points: Coord[]) => {
    const memo = new Map<number, number>();
    return (e: Edge) => {
      let d = memo.get(e.id);
      if (d === undefined) {
        const c = edgeCoords(g!, e);
        const probes = [c[0], c[Math.floor(c.length / 2)], c[c.length - 1]];
        d = Math.max(...probes.map((q) => Math.min(...points.map((p) => meters(p, q)))));
        memo.set(e.id, d);
      }
      return d;
    };
  };
  const densify = (coords: Coord[], step = 25) => {
    const l = line(coords);
    return Array.from({ length: Math.ceil(l.total / step) + 1 }, (_, i) => along(l, i * step).at);
  };

  // 1. Trip planning: walk (on streets), wait, ride, walk. Slides 2, 11, 13.
  // Micros in Juliaca stop at any corner of their route, so every
  // intersection on the route is a possible boarding point. One walking
  // Dijkstra from the origin and one from the destination give the walk to
  // all of them; Puriy keeps the pair with the lowest total time, in the
  // direction (ida or vuelta) that actually goes from origin to destination.
  const origin = tripPoints.from,
    dest = tripPoints.to;
  type Pick = { L: Line; board: { at: number; p: Coord }; alight: { at: number; p: Coord }; W1: Line; W2: Line; minutes: number; compared: number; dir: 'ida' | 'vuelta' };
  let best: Pick | null = null;
  let compared = 0;
  // Fastest option regardless of walking, to tell the passenger if walking
  // more would save real time.
  let fastest: { minutes: number; walk: number } | null = null;
  if (g) {
    const fromTree = walkTree(g, origin, 1500),
      toTree = walkTree(g, dest, 1500);
    for (const [L, dir] of [[IN, 'vuelta'], [OUT, 'ida']] as const) {
      const corners = nodesOnLine(g, L);
      const boards = corners.filter((k) => fromTree.dist[k.node] <= 1500);
      const alights = corners.filter((k) => toTree.dist[k.node] <= 1500);
      for (const bo of boards)
        for (const al of alights) {
          if (al.at <= bo.at + 150) continue;
          compared++;
          // Choice cost: walking weighs double (people prefer to ride; the
          // same "walk reluctance" OpenTripPlanner uses). Shown times are real.
          const walk = (fromTree.dist[bo.node] + toTree.dist[al.node]) / 75;
          const real = walk + HEADWAY / 2 + ((al.at - bo.at) / 1000 / SPEED) * 60;
          if (!fastest || real < fastest.minutes) fastest = { minutes: real, walk: walk * 75 };
          const minutes = walk * 2 + HEADWAY / 2 + ((al.at - bo.at) / 1000 / SPEED) * 60;
          if (!best || minutes < best.minutes)
            best = { L, board: { at: bo.at, p: bo.p }, alight: { at: al.at, p: al.p }, W1: line([]), W2: line([]), minutes, compared: 0, dir };
        }
    }
    if (best) {
      const bNode = nodesOnLine(g, best.L).find((k) => k.at === best!.board.at)!.node;
      const aNode = nodesOnLine(g, best.L).find((k) => k.at === best!.alight.at)!.node;
      best.W1 = line(fromTree.pathTo(bNode));
      // The walk from the destination tree runs backwards: reverse it.
      best.W2 = line([...toTree.pathTo(aNode)].reverse());
    }
  }
  const L = best?.L ?? IN;
  const board = best?.board ?? { at: project(IN, origin).at, p: along(IN, project(IN, origin).at).at };
  const alight = best?.alight ?? { at: project(IN, dest).at, p: along(IN, project(IN, dest).at).at };
  const boardAt = board.p,
    alightAt = alight.p;
  const W1 = best?.W1.coords.length ? best.W1 : line([origin, boardAt]),
    W2 = best?.W2.coords.length ? best.W2 : line([alightAt, dest]);
  const ride = Math.max(0, alight.at - board.at);
  const TRIP = {
    walk1: Math.max(1, Math.round(W1.total / 75)),
    wait: Math.round(HEADWAY / 2),
    ride: Math.max(1, Math.round((ride / 1000 / SPEED) * 60)),
    walk2: Math.max(1, Math.round(W2.total / 75)),
  };
  const trip: Scenario = {
    id: 'viaje',
    title: 'Planificar un viaje',
    slide: 'Láminas 2, 11 y 13',
    duration: 32,
    bounds: bounds([origin, dest, ...W1.coords, ...W2.coords, ...slice(L, board.at, alight.at)]),
    captions: [
      [0, `Una persona que no conoce Juliaca quiere ir de ${tripPoints.fromLabel} a ${tripPoints.toLabel}.`],
      [3, `El micro para en cualquier esquina de su recorrido: Puriy compara ${compared.toLocaleString('es-PE')} combinaciones de esquinas y elige la de menor tiempo total.`],
      [6, `Camina por calles y veredas hasta la esquina donde pasa el ${c.code} (${best?.dir ?? 'vuelta'}).`],
      [9, `Espera el micro: con salidas cada ${HEADWAY} min, la espera media es ${TRIP.wait} min.`],
      [13, `Viaja a bordo del ${c.code} por calles reales.`],
      [24, 'Baja en la esquina más conveniente y camina hasta el destino.'],
      [29, 'Puriy muestra el tiempo completo, no solo el tramo en micro.'],
    ],
    frame(t) {
      const f: DemoFeature[] = [...base(0.25)];
      f.push(pt(origin, { kind: 'pin', color: '#2f9e6b', label: tripPoints.fromLabel }));
      f.push(pt(dest, { kind: 'pin', color: '#c4622d', label: tripPoints.toLabel }));
      if (g && !best)
        return {
          features: f,
          caption: `El ${c.code} no conecta estos puntos a menos de 1,5 km a pie. Mueve el origen o el destino.`,
          hud: { noTrip: true, segments: [], compared: 0, total: 0, fare: FARE, rideKm: 0, walkM: 0, onStreets: true, from: tripPoints.fromLabel, to: tripPoints.toLabel },
        };
      const w1 = ease(phase(t, 3, 9)),
        w2 = ease(phase(t, 24, 29)),
        r = ease(phase(t, 13, 24));
      if (w1 > 0) f.push(...ln(slice(W1, 0, W1.total * w1), { kind: 'walk' }));
      if (r > 0) f.push(...ln(slice(L, board.at, board.at + ride * r), { kind: 'route', color: COLOR, width: 7, opacity: 1 }));
      if (w2 > 0) f.push(...ln(slice(W2, 0, W2.total * w2), { kind: 'walk' }));
      f.push(...stops([boardAt, alightAt]));
      const approach = board.at - 900 * (1 - ease(phase(t, 9, 13)));
      const m = t < 13 ? approach : board.at + ride * r;
      if (t >= 7 && t < 25) f.push(micro(L, m, { label: c.code }));
      const person = t < 9 ? along(W1, W1.total * w1).at : t < 24 ? along(L, m).at : along(W2, W2.total * w2).at;
      if (t < 9 || t >= 24) f.push(pt(person, { kind: 'person' }));
      const segments = [
        ['Caminar', TRIP.walk1, phase(t, 3, 9)],
        ['Esperar', TRIP.wait, phase(t, 9, 13)],
        ['A bordo', TRIP.ride, phase(t, 13, 24)],
        ['Caminar', TRIP.walk2, phase(t, 24, 29)],
      ] as const;
      return {
        features: f,
        caption: captionAt(this.captions, t),
        hud: {
          segments,
          compared,
          dir: best?.dir,
          total: TRIP.walk1 + TRIP.wait + TRIP.ride + TRIP.walk2,
          fare: FARE,
          rideKm: ride / 1000,
          walkM: Math.round(W1.total + W2.total),
          faster:
            fastest && TRIP.walk1 + TRIP.wait + TRIP.ride + TRIP.walk2 - fastest.minutes >= 3
              ? { save: Math.round(TRIP.walk1 + TRIP.wait + TRIP.ride + TRIP.walk2 - fastest.minutes), walkMore: Math.round(fastest.walk - (W1.total + W2.total)) }
              : null,
          onStreets: !!g,
          from: tripPoints.fromLabel,
          to: tripPoints.toLabel,
        },
      };
    },
  };

  // 2. The route follows the streets. Slide 12.
  const outStreets = streetNames(g, OUT.coords, baked.outboundStreets);
  const routeDraw: Scenario = {
    id: 'ruta',
    title: 'Recorrido sobre calles reales',
    slide: 'Lámina 12',
    duration: 24,
    bounds: ALL,
    captions: [
      [0, `El trazo del ${c.code} sigue la red vial de OpenStreetMap, no líneas rectas.`],
      [8, c.inboundSource === 'editor'
        ? 'La vuelta, dibujada en el editor, usa otras calles por el sentido de circulación.'
        : 'Vuelta estimada: dibuja la vuelta en el editor y esta demo la usará.'],
      [15, 'Las flechas marcan calles de un solo sentido: una ruta no puede ir en contra.'],
      [19, 'Cada ~450 m se propone un abordaje; los lugares concurridos quedan a la vista.'],
    ],
    frame(t) {
      const pOut = ease(phase(t, 0.5, 8)),
        pIn = ease(phase(t, 8, 15));
      const f: DemoFeature[] = [];
      if (pOut > 0) f.push(...ln(slice(OUT, 0, OUT.total * pOut), { kind: 'route', color: COLOR, width: 5, opacity: 1 }));
      if (pIn > 0) f.push(...ln(slice(IN, 0, IN.total * pIn), { kind: 'route-dash', color: COLOR, width: 4, opacity: 0.85 }));
      if (pOut > 0 && pOut < 1) f.push(micro(OUT, OUT.total * pOut));
      else if (pIn > 0 && pIn < 1) f.push(micro(IN, IN.total * pIn));
      const shown = Math.floor(STOPS.length * phase(t, 19, 22));
      f.push(...stops(STOPS.slice(0, shown)));
      if (t > 20) f.push(...places(LANDMARKS));
      return {
        features: f,
        caption: captionAt(this.captions, t),
        oneway: t >= 15,
        hud: {
          outKm: OUT.total / 1000,
          inKm: IN.total / 1000,
          inboundSource: c.inboundSource,
          stops: shown,
          streets: outStreets.slice(0, 8),
          landmarks: t > 20 ? LANDMARKS.map((d) => d.name).slice(0, 6) : [],
        },
      };
    },
  };

  // 3. How the route is computed: Dijkstra vs A*, and one-way streets.
  const scenarios: Scenario[] = [trip, routeDraw];
  if (g) {
    const fromP = algoPoints.from,
      toP = algoPoints.to;
    // A place is reached from any street within 90 m (entrances on several
    // sides); the last metres are walked. Weight: time or distance.
    const sa = accessSnaps(g, fromP).slice(0, 12),
      sb = accessSnaps(g, toP).slice(0, 12);
    const weight = algoWeight;
    const dj = route(g, sa, sb, { algorithm: 'dijkstra', weight });
    const as = route(g, sa, sb, { algorithm: 'astar', weight });
    const illegal = route(g, sa, sb, { ignoreOneway: true, weight });
    const exploredFeatures = (r: SearchResult) =>
      r.explored.map(({ edge, forward }, order) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: edgeCoords(g, edge, forward) },
        properties: { order },
      }));
    const wrongWay = illegal.edges.filter((e) => e.oneway).map((e) => e.name).filter(Boolean);
    const onewayFocus = bounds([...illegal.path, ...dj.path]);
    const algo: Scenario = {
      id: 'algoritmo',
      title: 'Cómo se calcula la ruta',
      slide: 'Método (láminas 10 y 13)',
      duration: 46,
      needsGraph: true,
      bounds: bounds([...dj.explored.flatMap((x) => edgeCoords(g, x.edge)), fromP, toP]),
      explored: { dijkstra: exploredFeatures(dj), astar: exploredFeatures(as) },
      captions: [
        [0, `Las calles son un grafo: ${g.x.length.toLocaleString('es-PE')} intersecciones y ${g.edges.length.toLocaleString('es-PE')} tramos, cada uno con su sentido y su tiempo.`],
        [3, 'Dijkstra avanza como una onda: revisa cada calle en orden de tiempo desde el origen, en todas direcciones.'],
        [13, 'Al tocar el destino, la ruta más rápida se reconstruye hacia atrás.'],
        [16, 'A* suma a cada calle una estimación de lo que falta (línea recta al destino) y avanza hacia él.'],
        [26, 'Mismo resultado óptimo revisando menos calles. Es el que usa Puriy para trazar y desviar.'],
        [29, 'Las flechas son sentidos de circulación. Ignorarlos daría una ruta más corta, pero en contra.'],
        [37, 'Con más ciudad, Contraction Hierarchies (OSRM); con micros y transbordos, RAPTOR (OpenTripPlanner).'],
      ],
      frame(t) {
        const f: DemoFeature[] = [];
        const djN = Math.floor(dj.explored.length * ease(phase(t, 3, 13)));
        const asN = Math.floor(as.explored.length * ease(phase(t, 16, 24)));
        const showDj = t < 16,
          showAs = t >= 16 && t < 29;
        const legalP = t < 16 ? ease(phase(t, 13, 15)) : t < 29 ? ease(phase(t, 24, 26)) : 1;
        const legal = line(dj.path);
        // The result always in amber, distinct from both explorations.
        if (legalP > 0) f.push(...ln(slice(legal, 0, legal.total * legalP), { kind: 'route', color: SEARCH.path, width: 7, opacity: 1 }));
        if (t >= 30) {
          const il = line(illegal.path);
          f.push(...ln(slice(il, 0, il.total * ease(phase(t, 30, 34))), { kind: 'route-dash', color: SEARCH.illegal, width: 5, opacity: 0.95 }));
        }
        if (t >= 26 || (t >= 15 && t < 16)) f.push(...flow(legal, t, SEARCH.path, 110, 90));
        // Walk between the place and the street where the car starts/ends.
        if (legalP > 0 && dj.start) f.push(...ln([fromP, dj.start.point], { kind: 'walk' }));
        if (legalP >= 1 && dj.end) f.push(...ln([dj.end.point, toP], { kind: 'walk' }));
        f.push(pt(fromP, { kind: 'pin', color: '#2f9e6b', label: algoPoints.fromLabel }));
        f.push(pt(toP, { kind: 'pin', color: '#c9423d', label: algoPoints.toLabel }));
        const share = (r: SearchResult, n: number) => Math.round((r.settled * n) / Math.max(1, r.explored.length));
        return {
          features: f,
          caption: captionAt(this.captions, t),
          // During A*, Dijkstra's area stays faded underneath: the gap is
          // what A* saves by aiming at the destination.
          explore: {
            dijkstra: showDj ? djN : showAs ? dj.explored.length : 0,
            astar: showAs ? asN : 0,
            fadeDijkstra: !showDj || t >= 13,
            fadeAstar: t >= 24,
          },
          oneway: t >= 29 && t < 37,
          focus: t >= 29 && t < 37 ? onewayFocus : undefined,
          hud: {
            dj: { settled: dj.settled, shown: t < 16 ? share(dj, djN) : dj.settled, ms: dj.ms, streets: dj.explored.length },
            as: { settled: as.settled, shown: t < 16 ? 0 : t < 29 ? share(as, asN) : as.settled, ms: as.ms, streets: as.explored.length },
            legalM: dj.meters,
            legalMin: dj.seconds / 60,
            illegalM: illegal.meters,
            wrongWay: [...new Set(wrongWay)].slice(0, 3),
            found: dj.found,
            weight,
            startStreet: dj.start?.edge.name || 'calle de acceso',
            endStreet: dj.end?.edge.name || 'calle de acceso',
            from: algoPoints.fromLabel,
            to: algoPoints.toLabel,
            phase: t < 16 ? 'dijkstra' : t < 29 ? 'astar' : t < 37 ? 'oneway' : 'eleccion',
          },
        };
      },
    };
    scenarios.push(algo);
  }

  // 4. Live GPS: pings, stale vehicles and bunching. Slides 17 and 21.
  const UNITS = [1, 2, 3, 4, 5].map((i) => `${c.code}-0${i}`);
  const gps: Scenario = {
    id: 'gps',
    title: 'GPS de las unidades',
    slide: 'Láminas 17 y 21',
    duration: 40,
    loop: true,
    bounds: ALL,
    captions: [
      [0, 'Cada micro envía su posición cada 10 s. El pulso indica un dato recibido.'],
      [12, `La unidad ${UNITS[2]} deja de transmitir. Puriy no inventa su posición.`],
      [22, 'Tras 90 s sin datos se marca desactualizada y se retira del mapa del pasajero.'],
      [30, `${UNITS[0]} alcanza a ${UNITS[1]}: micros agrupados, el intervalo real se rompe.`],
    ],
    frame(t) {
      const simMinutes = 7 * 60 + t * 0.1; // 1 s de demo = 6 s simulados
      const f: DemoFeature[] = [...base(0.45)];
      const spacing = LOOP.total / UNITS.length;
      const PING = 10 / 6;
      const pos = (i: number, time: number) => (i * spacing + time * 55) % LOOP.total;
      const gap = spacing - (spacing - 250) * ease(phase(t, 20, 32));
      const rows = UNITS.map((id, i) => {
        const m = i === 0 ? (pos(1, t) - gap + LOOP.total) % LOOP.total : pos(i, t);
        const silent = i === 2 && t >= 12;
        const age = silent ? (t - 12) * 6 : (t % PING) * 6;
        const stale = silent && age > 90;
        const p = along(LOOP, silent ? pos(i, 12) : m);
        const since = (t % PING) / PING;
        if (!silent) f.push(pt(p.at, { kind: 'ping', r: 6 + 22 * since, opacity: 0.5 * (1 - since), color: COLOR }));
        f.push(pt(p.at, { kind: 'micro', bearing: p.bearing, opacity: stale ? 0.28 : silent ? 0.6 : 1, label: id }));
        return { id, age: Math.round(age), state: stale ? 'Desactualizada' : silent ? 'Sin datos' : 'Vigente' };
      });
      return {
        features: f,
        caption: captionAt(this.captions, t),
        hud: {
          clock: clock(simMinutes),
          rows,
          bunched: t >= 30,
          gapMin: (gap / 1000 / SPEED) * 60,
          headway: (spacing / 1000 / SPEED) * 60,
          pair: [UNITS[0], UNITS[1]],
        },
      };
    },
  };
  scenarios.push(gps);

  // 5. Traffic by 100 m stretch, day and hour. Slide 17.
  // "Usual" comes from the speed model (what GPS history would give for this
  // day and hour); "recent" adds today's incident near the market. The
  // alternative is searched with the same model, so times are comparable.
  const market = place('Mercado Túpac Amaru');
  const marketAt = project(OUT, at(market)).at;
  const STEP = 100;
  const CORRIDOR_FREE = 28;
  const startAt = Math.max(0, marketAt - 800),
    endAt = Math.min(OUT.total, marketAt + 800);
  const segs = Array.from({ length: Math.ceil(OUT.total / STEP) }, (_, i) => {
    const from = i * STEP,
      to = Math.min(OUT.total, (i + 1) * STEP);
    return { from, to, mid: along(OUT, (from + to) / 2).at };
  }).filter((s) => s.to > startAt - 1100 && s.from < endAt + 1100);
  let sev = 0.6;
  const incident = (m: number, grow: number) => 1 - sev * Math.max(0, 1 - Math.abs(m - marketAt) / 600) * grow;
  const usualAt = (p: Coord, day: number, hour: number) =>
    usualSpeed({ free: CORRIDOR_FREE, p, main: 1, day, hour, corridor: true });
  const corridorMinutes = (day: number, hour: number, grow: number) => {
    let sum = 0;
    for (let m = startAt; m < endAt; m += 50) {
      const p = along(OUT, m + 25).at;
      sum += 50 / ((usualAt(p, day, hour) * incident(m + 25, grow)) / 3.6);
    }
    return sum / 60;
  };
  const zone = slice(OUT, marketAt - 600, marketAt + 600);
  const toZone = g ? nearLine(densify(zone)) : () => Infinity;
  // Search area: the whole compared stretch, one or two blocks either side.
  const toSection = g ? nearLine(densify(slice(OUT, startAt - 50, endAt + 50))) : () => Infinity;
  const affected = DESTINATIONS.filter(
    (d) => d.category !== 'inicial' && d.category !== 'colegio' && zone.some((p) => meters(p, at(d)) < 350),
  );
  const heat = (p: Coord) => DAYS.map((_, day) => HOURS.map((hour) => usualAt(p, day, hour) / CORRIDOR_FREE));
  const marketHeat = heat(along(OUT, marketAt).at);
  type Alt = { path: Coord[]; minutes: number; streets: string[]; extraM: number; kmh: number; school: boolean; top: number };
  type Compare = { corridor: number; usual: number; alt: Alt | null };
  const altMemo = new Map<string, Compare | null>();
  // Corridor and alternative are timed with the same speed model and the same
  // A* search: the corridor is forced onto its own street, the alternative
  // must avoid the slow zone. Only then is the comparison fair.
  const compareFor = (day: number, hour: number): Compare | null => {
    const key = `${day}:${hour}:${sev}`;
    if (altMemo.has(key)) return altMemo.get(key)!;
    let result: Compare | null = null;
    const A = snapOnCorridor(OUT, startAt),
      B = snapOnCorridor(OUT, endAt);
    if (g && A && B) {
      const speedOf = (e: Edge, grow: number) => {
        const c = edgeCoords(g, e);
        const mid = c[Math.floor(c.length / 2)];
        const onCorridor = toSection(e) < 12;
        // On its own street the micro stops and, at quiet hours, cruises
        // for passengers; off it (alternative) it runs without stops and
        // hurries, capped by the legal limit.
        const base = onCorridor
          ? usualSpeed({ free: CORRIDOR_FREE, p: mid, main: 1, day, hour, corridor: true })
          : detourSpeed({ roadKmh: e.speed, p: mid, day, hour, main: e.speed >= 25 ? 1 : 0.55 }).speed;
        const hit = onCorridor ? incident(project(OUT, mid).at, grow) : toZone(e) < 150 ? 1 - 0.1 * grow : 1;
        return base * hit;
      };
      const run = (grow: number, allow: (e: Edge) => boolean) => {
        const r = route(g, A.snap, B.snap, {
          algorithm: 'astar',
          startForward: A.forward,
          penalty: (e) => (allow(e) ? e.speed / speedOf(e, grow) : Infinity),
        });
        if (!r.found) return null;
        const full = r.edges.reduce((sum, e) => sum + e.length, 0) || 1;
        const minutes = (r.edges.reduce((sum, e) => sum + e.length / (speedOf(e, grow) / 3.6), 0) * (r.meters / full)) / 60;
        return { r, minutes };
      };
      const limits = (r: { edges: Edge[] }) => {
        let school = false,
          top = 0;
        for (const e of r.edges) {
          const c = edgeCoords(g, e);
          const d = detourSpeed({ roadKmh: e.speed, p: c[Math.floor(c.length / 2)], day, hour, main: 1 });
          school ||= d.school;
          top = Math.max(top, d.limit);
        }
        return { school, top };
      };
      const onSection = (e: Edge) => toSection(e) < 12;
      const corridorNow = run(1, onSection),
        corridorUsual = run(0, onSection);
      const alt = run(1, (e) => toSection(e) <= 220 && toZone(e) >= 12);
      if (corridorNow && corridorUsual)
        result = {
          corridor: corridorNow.minutes,
          usual: corridorUsual.minutes,
          alt: alt
            ? {
                path: alt.r.path,
                minutes: alt.minutes,
                streets: [...new Set(alt.r.edges.map((e) => e.name).filter(Boolean))].slice(0, 5),
                extraM: alt.r.meters - corridorNow.r.meters,
                kmh: alt.r.meters / 1000 / (alt.minutes / 60),
                ...limits(alt.r),
              }
            : null,
        };
    }
    altMemo.set(key, result);
    return result;
  };
  const traffic: Scenario = {
    id: 'trafico',
    title: 'Tráfico: tramos lentos',
    slide: 'Lámina 17',
    duration: 38,
    bounds: bounds([...slice(OUT, startAt - 300, endAt + 300), ...zone]),
    captions: [
      [0, 'Cada tramo de 100 m tiene su velocidad habitual por día y hora, aprendida del GPS de semanas anteriores.'],
      [6, 'Hoy, junto al Mercado Túpac Amaru, los micros van mucho más lento que lo habitual para esta hora.'],
      [14, 'Tres unidades lo confirman. Se compara con lo habitual del mismo día y hora, no con la noche.'],
      [21, 'Antes de alertar, se revisa si hay obras, ferias o incidentes registrados.'],
      [26, 'Puriy calcula una alternativa a una o dos cuadras, con el mismo modelo de velocidades, y la compara.'],
      [33, 'Solo la propone si ahorra tiempo. Cambiar el recorrido oficial requiere aprobación municipal.'],
    ],
    frame(t, input) {
      const { day, hour } = input;
      sev = input.severity;
      const grow = t < 5 ? 0 : ease(phase(t, 5, 14));
      const f: DemoFeature[] = [];
      let worst = { usual: 0, recent: 0 };
      for (const s of segs) {
        const usual = usualAt(s.mid, day, hour);
        const recent = usual * incident((s.from + s.to) / 2, grow);
        if (Math.abs((s.from + s.to) / 2 - marketAt) < 50) worst = { usual, recent };
        const color = TRAFFIC[level(recent / CORRIDOR_FREE)];
        f.push(...ln(slice(OUT, s.from, s.to), { kind: 'route', color, width: 7, opacity: 0.95 }));
      }
      const confirmations = [0, 1, 2].map((i) => {
        let m = marketAt - 1600 + i * 550;
        for (let k = 0; k < t * 10; k++) m += 7 * (usualAt(along(OUT, m).at, day, hour) / CORRIDOR_FREE) * incident(m, grow);
        m = Math.min(m, OUT.total);
        f.push(micro(OUT, m, { label: `${c.code}-0${i + 1}` }));
        return Math.abs(m - marketAt) < 700 && t > 10;
      });
      const cmp = compareFor(day, hour);
      const alt = t >= 26 && cmp ? cmp.alt : null;
      const corridorMin = cmp?.corridor ?? corridorMinutes(day, hour, 1);
      const saving = alt ? corridorMin - alt.minutes : 0;
      if (alt && saving >= 0.5) {
        const al = line(alt.path);
        const p = ease(phase(t, 26, 30));
        f.push(...ln(slice(al, 0, al.total * p), { kind: 'route', color: TRAFFIC.alt, width: 5, opacity: 1 }));
        if (p >= 1) {
          f.push(...flow(al, t, TRAFFIC.alt));
          f.push(pt(along(al, al.total / 2).at, { kind: 'badge', color: TRAFFIC.alt, label: `Alternativa −${num1(saving)} min` }));
        }
      }
      if (t >= 14) f.push(pt(along(OUT, marketAt).at, { kind: 'event', icon: 'alerta', label: `${Math.round(worst.recent)} km/h` }));
      f.push(...places(affected, t >= 6));
      const decided = t >= 30 && cmp?.alt;
      return {
        features: f,
        caption: decided
          ? saving >= 0.5
            ? `La alternativa ahorra ${num1(saving)} min aun con ${Math.round(Math.max(0, alt!.extraM))} m más. Es una sugerencia: el recorrido oficial requiere aprobación.`
            : `Aquí no conviene desviar: por calles secundarias tardaría ${num1(-saving)} min más. Puriy no la propone.`
          : captionAt(this.captions, t),
        hud: {
          day,
          hour,
          severity: sev,
          usual: Math.round(worst.usual),
          recent: Math.round(worst.recent),
          ratio: Math.round((worst.recent / Math.max(1, worst.usual)) * 100),
          confirmed: confirmations.filter(Boolean).length,
          checks: t >= 21,
          affected: t >= 6 ? [...new Set(affected.map((d) => d.name))].slice(0, 6) : [],
          heat: marketHeat,
          usualMin: cmp?.usual ?? corridorMinutes(day, hour, 0),
          corridorMin,
          alt: alt ? { minutes: alt.minutes, streets: alt.streets, extraM: alt.extraM, saving, kmh: alt.kmh, school: alt.school, top: alt.top } : null,
          altShown: t >= 26,
        },
      };
    },
  };
  scenarios.push(traffic);

  // Traffic lights: today's fixed plan, a one-way "green wave" and a plan
  // optimized Synchro-style (signal-timing.ts: saturation flow, splits, cycle
  // sweep, offsets with platoon dispersion, performance index). The micro is
  // simulated second by second under each plan; the index covers all traffic
  // in both directions. Crossings are real corridor intersections when the
  // street graph is loaded; volumes, widths and plans are illustrative.
  {
    const V = 25 / 3.6; // micro cruising speed between lights, m/s
    const start = Math.max(0, marketAt - 900);
    const endAt2 = Math.min(OUT.total, start + 1300);
    const targets = [220, 520, 780, 1080].map((d) => start + d);
    const found: { at: number; name: string; oneway: boolean }[] = [];
    if (g) {
      const nodes = nodesOnLine(g, OUT).filter((n) => n.at > start + 60 && n.at < endAt2 - 60);
      for (const target of targets) {
        let best: (typeof found)[number] | null = null;
        for (const n of nodes) {
          if (Math.abs(n.at - target) > 140 || found.some((f) => Math.abs(f.at - n.at) < 150)) continue;
          if (best && Math.abs(best.at - target) <= Math.abs(n.at - target)) continue;
          const own = snapToEdge(g, along(OUT, Math.max(0, n.at - 15)).at, 'drive', 30)?.edge;
          const cross = g.out.walk[n.node].map(([e]) => g.edges[e]).find((e) => e.drive && e.name && e.name !== own?.name);
          if (cross) best = { at: n.at, name: cross.name, oneway: !!own?.oneway };
        }
        if (best) found.push(best);
      }
    }
    const lights =
      found.length === targets.length
        ? found.sort((a, b) => a.at - b.at)
        : targets.map((at, i) => ({ at, name: `Cruce ${i + 1}`, oneway: false }));
    const lightsAt = lights.map((l) => l.at);
    const twoWay = lights.some((l) => !l.oneway);
    // Illustrative counts (veh/h) for the analysis hour, scaled by demand.
    // Main street: two lanes, 15 % heavy vehicles and 40 micros/h stopping
    // at the corner. Cross streets: one lane with parking. Flat (altiplano).
    const CROSS_VOL = [300, 240, 320, 200];
    const sitesFor = (demand: number): Site[] =>
      lights.map((l, i) => {
        const main = { lanes: 2, laneWidth: 3.3, heavy: 0.15, grade: 0, storage: 150, left: 0.1, right: 0.1, parking: null, busStops: 40 };
        const cross = { lanes: 1, laneWidth: 3, heavy: 0.08, grade: 0, storage: 90, left: 0.15, right: 0.15, parking: 20, busStops: 0 };
        return {
          name: l.name,
          at: l.at - start,
          ida: { ...main, volume: 850 * demand },
          vuelta: { ...main, volume: l.oneway ? 0 : 700 * demand },
          cross: { ...cross, volume: CROSS_VOL[i] * demand },
          crossOpp: { ...cross, volume: CROSS_VOL[i] * 0.8 * demand },
          mainWidth: 14,
          crossWidth: 8,
          mainKmh: 40,
          crossKmh: 30,
        };
      });
    type Mode = 'actual' | 'onda' | 'optimo';
    // Micro trace per simulated second: position, stops and seconds stopped.
    // Under every plan the micro reaches S1 2 s after its green starts, at the
    // head of the platoon, so plans differ only in what happens downstream.
    const trace = (plan: Plan) => {
      const t0 = plan.sites[0].offset + 2 - (lightsAt[0] - start) / V;
      const m = [start],
        stops = [0],
        stopped = [0];
      let pos = start,
        n = 0,
        wait = 0,
        waiting = false;
      for (let time = 0; time < 900 && pos < endAt2; time += 0.25) {
        const next = lightsAt.findIndex((x) => x >= pos - 0.1);
        const ahead = next >= 0 ? lightsAt[next] - pos : Infinity;
        if (ahead < 6 && signalState(plan, next, time + t0).phase !== 'green') {
          wait += 0.25;
          if (!waiting) n++;
          waiting = true;
        } else {
          waiting = false;
          pos = Math.min(endAt2, pos + V * 0.25);
        }
        if ((time + 0.25) % 1 === 0) {
          m.push(pos);
          stops.push(n);
          stopped.push(wait);
        }
      }
      return { m, stops, stopped, total: m.length - 1, t0 };
    };
    const analyze = (demand: number) => {
      const sites = sitesFor(demand);
      // Today (assumed): fixed time, every light switches at the same moment.
      const actual = fixedPlan(sites, 60, 0.5, sites.map(() => 0));
      const onda = fixedPlan(sites, 60, 0.5, sites.map((s) => s.at / V - 2));
      const best = optimize(sites);
      const plans: Record<Mode, Plan> = { actual, onda, optimo: best?.plan ?? onda };
      const rows = (['actual', 'onda', 'optimo'] as const).map((mode) => {
        const ev = mode === 'optimo' && best ? best.result : evaluate(sites, plans[mode]);
        return { mode, cycle: plans[mode].cycle, pi: ev.pi, delay: ev.delay, stops: ev.stops, sites: ev.sites, micro: trace(plans[mode]) };
      });
      return { plans, rows, scan: best?.scan ?? [], natural: best?.natural ?? [] };
    };
    // The optimizer takes a few hundred ms: run it once per demand level.
    const cache = new Map<number, ReturnType<typeof analyze>>();
    const get = (demand: number) => {
      if (!cache.has(demand)) cache.set(demand, analyze(demand));
      return cache.get(demand)!;
    };
    const SIM = 12; // 1 s of demo = 12 s simulated
    const SEGMENTS: [Mode, number][] = [['actual', 0], ['onda', 20], ['optimo', 40]];
    const sigStretch = slice(OUT, start - 100, endAt2 + 100);
    scenarios.push({
      id: 'semaforos',
      title: 'Semáforos: ciclo, reparto y desfase',
      slide: 'Propuesta · ampliación',
      duration: 66,
      bounds: bounds(sigStretch),
      captions: [
        [0, 'Hoy (supuesto): cuatro semáforos de tiempo fijo, ciclo de 60 s repartido a medias; todos cambian a la vez.'],
        [5, 'Sin coordinación, el micro frena en los rojos que encuentra: pierde tiempo, combustible y regularidad.'],
        [20, 'Onda verde simple: cada semáforo se adelanta lo que tarda el micro en llegar desde el anterior.'],
        [
          27,
          twoWay
            ? 'Favorece al sentido de ida; la vuelta y las calles transversales pueden salir perdiendo.'
            : 'Solo mira al micro: el ciclo y el reparto siguen sin considerar cuántos esperan en las transversales.',
        ],
        [40, 'Plan optimizado: con aforos por movimiento calcula saturación, verdes mínimos y despeje de cada cruce.'],
        [47, `Prueba ciclos de 50 a 120 s y, en cada uno, todos los desfases${twoWay ? ', en ambos sentidos' : ''}.`],
        [54, 'Elige el plan de menor índice de desempeño: demora + detenciones + colas que no caben en la cuadra.'],
        [60, 'Aforos ilustrativos: antes de reprogramar hay que aforar cada cruce y validar con la municipalidad.'],
      ],
      frame(t, input) {
        const a = get(input.demand ?? 1);
        const [mode, from] = [...SEGMENTS].reverse().find(([, s]) => t >= s) ?? SEGMENTS[0];
        const plan = a.plans[mode];
        const row = a.rows.find((r) => r.mode === mode)!;
        const T = Math.max(0, (t - from - 1) * SIM);
        const k = Math.min(row.micro.total, Math.floor(T));
        const f: DemoFeature[] = [...ln(sigStretch, { kind: 'route', color: COLOR, width: 5, opacity: 0.55 })];
        lightsAt.forEach((m, i) => {
          const s = signalState(plan, i, T + row.micro.t0);
          f.push(pt(along(OUT, m).at, { kind: 'signal', phase: s.phase, label: `S${i + 1} · ${Math.ceil(s.remaining)} s` }));
        });
        f.push(micro(OUT, row.micro.m[k], { label: { actual: 'Hoy', onda: 'Onda verde', optimo: 'Optimizado' }[mode] }));
        return {
          features: f,
          caption: captionAt(this.captions, t),
          hud: {
            mode,
            twoWay,
            clock: `Reloj ${Math.floor(T)} s · ciclo ${plan.cycle} s · ×${SIM}`,
            now: T + row.micro.t0,
            cycle: plan.cycle,
            demand: input.demand ?? 1,
            stops: row.micro.stops[k],
            stopped: Math.round(row.micro.stopped[k]),
            elapsed: k,
            rows: a.rows.map((r) => ({
              mode: r.mode,
              cycle: r.cycle,
              pi: r.pi,
              delay: r.delay,
              micro: r.micro.total,
              microStops: r.micro.stops[r.micro.total],
            })),
            scan: a.scan,
            chosen: a.plans.optimo.cycle,
            sites: lights.map((l, i) => ({
              ...plan.sites[i],
              ...row.sites[i],
              name: l.name,
              oneway: l.oneway,
              natural: a.natural[i] ?? null,
            })),
          },
        };
      },
    });
  }

  // 6. Fleet needed for a headway. Slide 15. Interactive.
  scenarios.push({
    id: 'flota',
    title: 'Flota y frecuencia',
    slide: 'Lámina 15',
    duration: 60,
    loop: true,
    bounds: ALL,
    captions: [
      [0, 'Mueve el intervalo y la velocidad: la flota necesaria se recalcula al instante.'],
      [20, 'Ciclo = ida + vuelta a la velocidad comercial + regulación en terminal.'],
      [40, 'Si el operador no tiene esa flota activa, la frecuencia prometida no se cumple.'],
    ],
    frame(t, input) {
      const km = LOOP.total / 1000;
      const r = fleet(km, input.speed, input.layover, input.headway);
      const f: DemoFeature[] = [...base(0.5)];
      const spacing = LOOP.total / r.vehicles;
      const mps = (input.speed / 3.6) * 25;
      for (let i = 0; i < r.vehicles; i++) f.push(micro(LOOP, (i * spacing + t * mps) % LOOP.total));
      f.push(...stops([OUT.coords[0], OUT.coords[OUT.coords.length - 1]]));
      return { features: f, caption: captionAt(this.captions, t), hud: { km, ...r, ...input, example: fleet(13, 15, 10, 8) } };
    },
  });

  // 7. Walking coverage around boarding points. Slide 16.
  scenarios.push({
    id: 'cobertura',
    title: 'Cobertura a 400 m',
    slide: 'Lámina 16',
    duration: 20,
    bounds: ALL,
    captions: [
      [0, 'Cada abordaje atiende a quien vive cerca. Se usa un umbral de 400 m.'],
      [7, 'Las manzanas del Censo 2017 dentro del umbral suman la población cubierta.'],
      [13, 'También se cuentan colegios, mercados y salud al alcance del corredor.'],
    ],
    frame(t, input) {
      const radius = 400 * ease(phase(t, 1, 7));
      const f: DemoFeature[] = [...base(0.8)];
      if (radius > 5) for (const s of STOPS) f.push(poly(circle(s, radius, 28), { kind: 'fill', color: COLOR, opacity: 0.08 }));
      let people = 0,
        blocks = 0;
      const counted = phase(t, 7, 12);
      for (const b of input.manzanas || []) {
        const inside = counted > 0 && STOPS.some((s) => meters(s, b.at) <= 400);
        if (inside) {
          people += b.people;
          blocks++;
        }
        f.push(pt(b.at, { kind: 'block', inside, r: Math.min(5, 1.5 + Math.sqrt(b.people) / 5) }));
      }
      f.push(...stops(STOPS));
      const near = t >= 13 ? nearCorridor(400) : [];
      f.push(...places(near));
      const byCategory: Record<string, number> = {};
      for (const p of near) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
      return {
        features: f,
        caption: captionAt(this.captions, t),
        hud: { radius: Math.round(radius), people: Math.round(people * clamp01(counted * 1.2)), blocks, loading: !input.manzanas, byCategory },
      };
    },
  });

  // 8. Temporary closure and detour, computed on the street graph. Slide 18.
  // Shortest distance (less fuel) around the closure, staying within two
  // blocks of it and continuing in the bus's direction.
  const closeFrom = marketAt - 300,
    closeTo = marketAt + 300;
  const closed = slice(OUT, closeFrom, closeTo);
  let detour: Coord[] = baked.detour.geometry as Coord[];
  let detourStreets: string[] = baked.detour.streets.slice(1);
  // Sunday 10:00 (fair day). Without the fair the micro would run the stretch
  // at its usual commercial speed with stops; on the detour it has no stops
  // and hurries within the legal limit.
  const FAIR_DAY = 6,
    FAIR_HOUR = 10;
  let detourMin = 0;
  let closedLine = line(baked.detour.closed as Coord[]);
  let detourFrom = project(OUT, detour[0]).at,
    detourTo = project(OUT, detour[detour.length - 1]).at;
  if (g) {
    const A = snapOnCorridor(OUT, closeFrom - 30),
      B = snapOnCorridor(OUT, closeTo + 30);
    const dense = densify(closed, 15);
    const toClosed = nearLine(dense);
    const r = A && B
      ? route(g, A.snap, B.snap, {
          algorithm: 'astar',
          weight: 'distance',
          startForward: A.forward,
          // Closed only if the whole edge lies on the closed street (cross
          // streets touching it stay open); search limited to ~2 blocks.
          penalty: (e) => (toClosed(e) < 15 ? Infinity : toClosed(e) > 300 ? Infinity : 1),
        })
      : null;
    if (r?.found) {
      detour = r.path;
      detourStreets = [...new Set(r.edges.map((e) => e.name).filter(Boolean))].slice(0, 5);
      const full = r.edges.reduce((sum, e) => sum + e.length, 0) || 1;
      detourMin =
        (r.edges.reduce((sum, e) => {
          const c = edgeCoords(g, e);
          const v = detourSpeed({ roadKmh: e.speed, p: c[Math.floor(c.length / 2)], day: FAIR_DAY, hour: FAIR_HOUR, main: e.speed >= 25 ? 1 : 0.55 }).speed;
          return sum + e.length / (v / 3.6);
        }, 0) * (r.meters / full)) / 60;
      closedLine = line(closed);
      detourFrom = closeFrom - 30;
      detourTo = closeTo + 30;
    }
  }
  const DETOUR = line(detour);
  if (!detourMin) detourMin = (DETOUR.total / 1000 / 25) * 60;
  // The same stretch if open: usual corridor speed (with stops) at that time.
  const openMin = (() => {
    let sum = 0;
    for (let m = detourFrom; m < detourTo; m += 50)
      sum += 50 / (usualSpeed({ free: CORRIDOR_FREE, p: along(OUT, m).at, main: 1, day: 2, hour: FAIR_HOUR, corridor: true }) / 3.6);
    return sum / 60;
  })();
  const detourExtra = detourMin - openMin;
  const closedStops = STOPS.filter((s) => {
    const p = project(OUT, s).at;
    return p > detourFrom + 20 && p < detourTo - 20;
  });
  scenarios.push({
    id: 'desvio',
    title: 'Feria dominical y desvío',
    slide: 'Lámina 18',
    duration: 26,
    bounds: bounds([...closedLine.coords, ...detour]),
    captions: [
      [0, 'Domingo: una feria ocupa la calle junto al Mercado Túpac Amaru.'],
      [4, 'Puriy marca el tramo cerrado y los abordajes que quedan sin servicio.'],
      [9, 'Busca en la red vial el desvío más rápido que no use el tramo cerrado y respete los sentidos.'],
      [17, 'El micro sigue el desvío y retoma el recorrido habitual.'],
    ],
    frame(t) {
      const f: DemoFeature[] = [...base(0.3)];
      const closeP = ease(phase(t, 3, 6));
      if (closeP > 0) {
        f.push(...ln(slice(closedLine, 0, closedLine.total * closeP), { kind: 'closure' }));
        f.push(pt(along(closedLine, closedLine.total / 2).at, { kind: 'event', icon: 'feria', label: 'Feria dominical' }));
        if (closeP >= 1)
          for (const m of [0, closedLine.total]) f.push(pt(along(closedLine, m).at, { kind: 'event', icon: 'barrera', label: '' }));
      }
      const draw = ease(phase(t, 9, 15));
      if (draw > 0) f.push(...ln(slice(DETOUR, 0, DETOUR.total * draw), { kind: 'route', color: TRAFFIC.slow, width: 6, opacity: 1 }));
      if (draw >= 1) {
        f.push(...flow(DETOUR, t, TRAFFIC.slow));
        f.push(pt(along(DETOUR, DETOUR.total / 2).at, { kind: 'badge', color: TRAFFIC.slow, label: `Desvío ${detourExtra >= 0 ? '+' : '−'}${num1(Math.abs(detourExtra))} min` }));
      }
      for (const s of STOPS) {
        const p = project(OUT, s).at;
        if (p < detourFrom - 900 || p > detourTo + 900) continue;
        const off = t >= 4 && closedStops.includes(s);
        f.push(pt(s, { kind: 'stop', color: off ? TRAFFIC.jam : COLOR, off }));
      }
      const approach = 500;
      const total = approach + DETOUR.total + 500;
      const m = total * phase(t, 16, 25);
      if (t >= 16) {
        if (m < approach) f.push(micro(OUT, detourFrom - approach + m));
        else if (m < approach + DETOUR.total) {
          const p = along(DETOUR, m - approach);
          f.push(pt(p.at, { kind: 'micro', bearing: p.bearing, opacity: 1 }));
        } else f.push(micro(OUT, detourTo + (m - approach - DETOUR.total)));
      }
      f.push(...places([market], true));
      const closedM = closedLine.total,
        extra = DETOUR.total - (detourTo - detourFrom);
      return {
        features: f,
        caption: captionAt(this.captions, t),
        oneway: t >= 9 && t < 16,
        hud: {
          closedM,
          detourM: DETOUR.total,
          extraM: extra,
          extraMin: Math.round(detourExtra * 10) / 10,
          detourKmh: DETOUR.total / 1000 / (detourMin / 60),
          detourMin,
          openMin,
          stopsOff: t >= 4 ? closedStops.length : 0,
          streets: detourStreets,
          shown: t >= 9,
        },
      };
    },
  });
  // Future prototype: adaptive control of the four signals of one block,
  // simulated vehicle by vehicle next to a fixed-time plan with the same
  // arrivals (adaptive-signals.ts). The simulation only moves forward; going
  // back in time or changing the inputs starts it again from zero.
  {
    const SPEED = 2; // simulated seconds per demo second
    let lab: { key: string; j: LabSim; a: LabSim; f: LabSim } | null = null;
    scenarios.push({
      id: 'adaptativo',
      title: 'Semáforos adaptativos: con y sin Jev',
      slide: 'Prototipo · a futuro',
      duration: 90,
      bounds: ALL,
      stage: 'lab',
      captions: [
        [0, 'Prototipo a futuro: la misma manzana y los mismos vehículos, con Jev (izquierda) y sin Jev (derecha).'],
        [7, 'Con Jev: cada segundo se envía el estado del cruce en JSON y una pregunta de opción: extender o cambiar.'],
        [20, 'Jev devuelve la opción con su probabilidad en menos de medio segundo; si duda, decide la regla.'],
        [34, 'Sin Jev: una regla fija corta el verde cuando la calle se vacía o la otra acumula más espera.'],
        [48, 'Ambos pasan por la misma capa de seguridad: verde mínimo, ámbar, todo rojo y verde máximo.'],
        [62, 'Frente al tiempo fijo, ambos esperan menos; cuál de los dos gana depende de la demanda.'],
        [76, 'Aquí Jev está simulado: medir el modelo real requiere clave de acceso, detectores y validación municipal.'],
      ],
      frame(t, input) {
        const demand = input.labDemand ?? 'normal',
          priority = !!input.labPriority;
        const key = `${demand}-${priority}`;
        const T = Math.max(0, t) * SPEED;
        if (!lab || lab.key !== key || lab.a.time > T + 0.3) {
          const list = arrivals(demand);
          lab = {
            key,
            j: createSim('jev', list, priority),
            a: createSim('adaptive', list, priority),
            f: createSim('fixed', list, priority),
          };
        }
        for (const sim of [lab.j, lab.a, lab.f]) sim.step(T);
        return {
          features: [],
          caption: captionAt(this.captions, t),
          hud: {
            clock: `Reloj ${Math.floor(T)} s · ×${SPEED}`,
            jev: lab.j.snapshot(),
            adaptive: lab.a.snapshot(),
            fixed: lab.f.snapshot(),
          },
        };
      },
    });
  }

  return scenarios;
}
