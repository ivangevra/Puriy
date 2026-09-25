import { distance, type Point } from './mobility';
import { signalCycle } from './signal-cycle';
import type { SignalPoint } from './map-workspace';
const pt = (p: number[]): Point => ({ lon: p[0], lat: p[1] });
export function routeLengths(coords: number[][]) {
  return coords.slice(1).map((p, i) => distance(pt(coords[i]), pt(p)));
}
export function advanceVehicle(
  coords: number[][],
  meters: number,
  seconds: number,
  speedKmh: number,
  signals: SignalPoint[],
  now: number,
) {
  const lengths = routeLengths(coords),
    total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let next = Math.min(
    total,
    meters +
      (Math.max(0, Math.min(seconds, 1)) *
        Math.max(3, Math.min(speedKmh, 60))) /
        3.6,
  );
  for (const signal of signals) {
    const phase = signalCycle(signal, now).phase;
    if (phase !== 'red' && phase !== 'amber') continue;
    let accumulated = 0,
      best = Infinity,
      position = 0;
    lengths.forEach((len, i) => {
      const a = coords[i],
        b = coords[i + 1],
        cos = Math.cos((signal.lat * Math.PI) / 180),
        dx = (b[0] - a[0]) * cos,
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((signal.lon - a[0]) * cos * dx + (signal.lat - a[1]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const gap = distance(pt(p), signal);
      if (gap < best) {
        best = gap;
        position = accumulated + t * len;
      }
      accumulated += len;
    });
    const line = Math.max(0, position - 6);
    if (best <= 18 && line >= meters - 0.25 && next >= line) next = line;
  }
  return next;
}
export function vehicleAt(coords: number[][], meters: number) {
  const lengths = routeLengths(coords);
  let rest = meters;
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] || i === lengths.length - 1) {
      const a = coords[i],
        b = coords[i + 1],
        t = Math.min(1, rest / (lengths[i] || 1));
      return {
        coordinates: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearing:
          (Math.atan2(
            (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
            b[1] - a[1],
          ) *
            180) /
          Math.PI,
      };
    }
    rest -= lengths[i];
  }
  return null;
}
