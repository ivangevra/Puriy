// Speed model for the traffic demo. It mimics what Puriy would learn from GPS:
// the usual commercial speed of each 100 m stretch for every day and hour,
// so "slow" always means slower than usual for that same day and hour.
//
// Values are illustrative (no GPS history exists yet) but follow the patterns
// the PDU describes: morning school/work peak, midday market peak, evening
// return, heavier markets on Saturday, Sunday fairs, and micros cruising slowly
// to pick up passengers when demand is low.
import { DESTINATIONS } from './destinations';
import { meters } from './demo-geo';

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 05:00–23:00

const bump = (h: number, center: number, width: number, height: number) =>
  height * Math.exp(-((h - center) ** 2) / (2 * width * width));

/** General traffic intensity (0 free, 1 heaviest) by day and hour. */
export function intensity(day: number, hour: number) {
  if (day <= 4)
    return Math.min(1, 0.12 + bump(hour, 7.3, 0.9, 0.88) + bump(hour, 13, 0.9, 0.62) + bump(hour, 18.2, 1.1, 0.75));
  if (day === 5) return Math.min(1, 0.1 + bump(hour, 11.5, 2, 0.8) + bump(hour, 18.5, 1.2, 0.45));
  return Math.min(1, 0.08 + bump(hour, 11, 2.2, 0.4) + bump(hour, 17.5, 1.3, 0.3));
}

/** Micros cruise slowly looking for passengers when demand is low. */
export function cruising(day: number, hour: number) {
  const quiet = (hour >= 9.5 && hour < 11.5) || (hour >= 14.5 && hour < 16.5);
  return day <= 5 && quiet ? 0.82 : 1;
}

const COMMERCE = DESTINATIONS.filter((d) => d.category === 'mercado' || d.category === 'comercio');
const MARKETS = COMMERCE.filter((d) => d.category === 'mercado');
/** 0–1: how close a point is to markets and shopping (they concentrate traffic). */
export function hotspot(p: number[]) {
  let best = Infinity;
  for (const d of COMMERCE) best = Math.min(best, meters(p, [d.lon, d.lat]));
  return Math.max(0, 1 - best / 450);
}
/** Sunday fairs occupy streets next to markets. */
function fair(day: number, hour: number, p: number[]) {
  if (day !== 6 || hour < 7 || hour > 15) return 0;
  let best = Infinity;
  for (const d of MARKETS) best = Math.min(best, meters(p, [d.lon, d.lat]));
  return Math.max(0, 1 - best / 350);
}

/** Free-flow commercial speed of a micro by road class (graph speed, km/h). */
export const freeSpeed = (roadKmh: number) => Math.min(32, roadKmh * 0.85);

/**
 * Usual speed (km/h) on a stretch for a day and hour.
 * `main`: 1 for avenues and the corridor, ~0.5 for quieter side streets.
 */
export function usualSpeed(opts: { free: number; p: number[]; main: number; day: number; hour: number; corridor?: boolean }) {
  const { free, p, main, day, hour } = opts;
  const h = hotspot(p);
  const load = intensity(day, hour) * (0.18 + 0.5 * h) * main + fair(day, hour, p) * 0.45;
  const ratio = Math.max(0.3, 1 - load);
  return free * ratio * (opts.corridor ? cruising(day, hour) : 1);
}

export type Level = 'ok' | 'slow' | 'jam';
export const level = (ratio: number): Level => (ratio >= 0.8 ? 'ok' : ratio >= 0.55 ? 'slow' : 'jam');

const SCHOOLS = DESTINATIONS.filter((d) => d.category === 'colegio' || d.category === 'inicial');
/** Within ~60 m of a school: school-zone limit applies. */
export function nearSchool(p: number[]) {
  return SCHOOLS.some((d) => Math.abs(d.lat - p[1]) < 0.001 && meters(p, [d.lon, d.lat]) < 60);
}
/** Urban limits (Reglamento Nacional de Tránsito): 60 km/h avenues, 40 streets, 30 school zones. */
export function legalLimit(roadKmh: number, school: boolean) {
  return school ? 30 : roadKmh >= 30 ? 60 : 40;
}
/**
 * Micro on a detour or alternative: it makes no stops and drivers hurry to
 * recover the time lost in the jam (≈1.5× the typical car speed of the
 * street), but never above the legal limit; general traffic still applies.
 */
export function detourSpeed(opts: { roadKmh: number; p: number[]; day: number; hour: number; main: number }) {
  const school = nearSchool(opts.p);
  const limit = legalLimit(opts.roadKmh, school);
  const hurry = Math.min(limit, opts.roadKmh * 1.5);
  const traffic = usualSpeed({ free: 1, p: opts.p, main: opts.main, day: opts.day, hour: opts.hour });
  return { speed: hurry * traffic, limit, school };
}
