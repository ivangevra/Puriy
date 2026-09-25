// Geometry helpers for the presentation demos. Coordinates are [lon, lat].
export type Coord = [number, number];

export function meters(a: number[], b: number[]) {
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  return Math.hypot((b[0] - a[0]) * 111320 * Math.cos(lat), (b[1] - a[1]) * 110540);
}

export type Line = { coords: Coord[]; cum: number[]; total: number };
export function line(coords: number[][]): Line {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + meters(coords[i - 1], coords[i]));
  return { coords: coords as Coord[], cum, total: cum[cum.length - 1] };
}

function segmentAt(l: Line, m: number) {
  let lo = 0,
    hi = l.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (l.cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Point and heading (degrees, 0 = north) at a distance along the line. */
export function along(l: Line, m: number): { at: Coord; bearing: number } {
  const d = Math.max(0, Math.min(l.total, m));
  const i = segmentAt(l, d);
  const a = l.coords[i],
    b = l.coords[Math.min(i + 1, l.coords.length - 1)];
  const len = l.cum[i + 1] - l.cum[i] || 1;
  const t = (d - l.cum[i]) / len;
  return {
    at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    bearing: bearing(a, b),
  };
}

export function bearing(a: number[], b: number[]) {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  return ((Math.atan2(dx, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

/** Sub-line between two distances. */
export function slice(l: Line, from: number, to: number): Coord[] {
  const a = Math.max(0, Math.min(from, to)),
    b = Math.min(l.total, Math.max(from, to));
  if (b - a < 0.5) return [];
  const i = segmentAt(l, a),
    j = segmentAt(l, b);
  return [along(l, a).at, ...l.coords.slice(i + 1, j + 1), along(l, b).at];
}

/** Distance along the line of the closest point to `p` (true projection on
 * each segment, not just the nearest vertex). */
export function project(l: Line, p: number[]) {
  const cos = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity,
    at = 0;
  for (let i = 0; i < l.coords.length - 1; i++) {
    const a = l.coords[i],
      b = l.coords[i + 1];
    const ax = (a[0] - p[0]) * cos * 111320, ay = (a[1] - p[1]) * 110540;
    const bx = (b[0] - p[0]) * cos * 111320, by = (b[1] - p[1]) * 110540;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + dx * t, ay + dy * t);
    if (d < best) {
      best = d;
      at = l.cum[i] + (l.cum[i + 1] - l.cum[i]) * t;
    }
  }
  if (l.coords.length === 1) best = meters(l.coords[0], p);
  return { at, gap: best };
}

/** Polygon approximating a circle of `radius` meters. */
export function circle(center: number[], radius: number, steps = 40): Coord[] {
  const lat = (center[1] * Math.PI) / 180;
  const out: Coord[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push([
      center[0] + (Math.cos(a) * radius) / (111320 * Math.cos(lat)),
      center[1] + (Math.sin(a) * radius) / 110540,
    ]);
  }
  return out;
}

export function bounds(points: number[][]): [[number, number], [number, number]] {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p[0]);
    e = Math.max(e, p[0]);
    s = Math.min(s, p[1]);
    n = Math.max(n, p[1]);
  }
  return [
    [w, s],
    [e, n],
  ];
}

export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Progress of `t` inside [start, end]. */
export const phase = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));

/** Fleet needed for a headway: round trip time plus layover, divided by headway. */
export function fleet(roundTripKm: number, speedKmh: number, layoverMin: number, headwayMin: number) {
  const running = (roundTripKm / speedKmh) * 60;
  const cycle = running + layoverMin;
  return { running, cycle, vehicles: Math.ceil(cycle / headwayMin) };
}
