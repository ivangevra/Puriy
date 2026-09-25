import type { SignalPoint } from './map-workspace';
export const phaseNames = {
  red: 'Rojo',
  green: 'Verde',
  amber: 'Ámbar',
  off: 'Sin ciclo',
};
export function signalCycle(
  s: SignalPoint,
  now = Date.now(),
): { phase: keyof typeof phaseNames; remaining: number | null } {
  const durations = [s.red, s.green, s.amber];
  if (
    s.status === 'outage' ||
    durations.some((v) => v === null || !Number.isFinite(v) || v! < 0) ||
    !Number.isFinite(Date.parse(s.updatedAt))
  )
    return { phase: 'off', remaining: null };
  const total = durations.reduce<number>((sum, v) => sum + v!, 0);
  if (total <= 0) return { phase: 'off', remaining: null };
  let second =
    ((Math.floor((now - Date.parse(s.updatedAt)) / 1000) % total) + total) %
    total;
  for (const phase of ['red', 'green', 'amber'] as const) {
    const duration = s[phase]!;
    if (second < duration) return { phase, remaining: duration - second };
    second -= duration;
  }
  return { phase: 'off', remaining: null };
}
