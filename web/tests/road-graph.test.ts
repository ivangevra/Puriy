import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearestNode, parseGraph, shortestPath, type RawGraph } from '../lib/road-graph';

const g = parseGraph(JSON.parse(readFileSync('public/data/red-vial.json', 'utf-8')) as RawGraph);
const unaj = [-70.1489, -15.4882];
const plaza = [-70.1265, -15.4935];

describe('red vial y algoritmos', () => {
  it('Dijkstra y A* encuentran el mismo costo; A* explora menos', () => {
    const a = nearestNode(g, unaj),
      b = nearestNode(g, plaza);
    const d = shortestPath(g, a, b, { algorithm: 'dijkstra' });
    const s = shortestPath(g, a, b, { algorithm: 'astar' });
    expect(d.found).toBe(true);
    expect(Math.abs(d.seconds - s.seconds)).toBeLessThan(1);
    expect(s.settled).toBeLessThan(d.settled);
  });
  it('respeta el sentido de las vías de un solo sentido', () => {
    const e = g.edges.find((x) => x.oneway && x.drive && x.length > 60)!;
    const forward = shortestPath(g, e.u, e.v);
    const backward = shortestPath(g, e.v, e.u);
    const ignoring = shortestPath(g, e.v, e.u, { ignoreOneway: true });
    expect(forward.found).toBe(true);
    expect(backward.edges.includes(e)).toBe(false);
    expect(ignoring.meters).toBeLessThanOrEqual(backward.meters || Infinity);
  });
  it('una penalización desvía la ruta', () => {
    const a = nearestNode(g, unaj),
      b = nearestNode(g, plaza);
    const base = shortestPath(g, a, b);
    const blocked = new Set(base.edges.slice(2, 6).map((e) => e.id));
    const alt = shortestPath(g, a, b, { penalty: (e) => (blocked.has(e.id) ? Infinity : 1) });
    expect(alt.found).toBe(true);
    expect(alt.edges.some((e) => blocked.has(e.id))).toBe(false);
  });
});
