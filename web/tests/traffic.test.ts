import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGraph, type RawGraph } from '../lib/road-graph';
import { BAKED, createScenarios } from '../lib/demo-scenarios';
import { intensity, usualSpeed } from '../lib/traffic-model';

const g = parseGraph(JSON.parse(readFileSync('public/data/red-vial.json', 'utf-8')) as RawGraph);
const traffic = createScenarios(BAKED, g).find((s) => s.id === 'trafico')!;
const hud = (day: number, hour: number, severity: number) =>
  traffic.frame(34, { day, hour, severity, headway: 8, speed: 15, layover: 10 }).hud as {
    usualMin: number;
    corridorMin: number;
    alt: { minutes: number; saving: number } | null;
  };

describe('modelo de tráfico', () => {
  it('la hora punta es más lenta que la noche y que el mediodía del domingo', () => {
    expect(intensity(0, 7)).toBeGreaterThan(intensity(0, 22));
    const p = [-70.125, -15.49];
    expect(usualSpeed({ free: 28, p, main: 1, day: 0, hour: 7 })).toBeLessThan(usualSpeed({ free: 28, p, main: 1, day: 0, hour: 22 }));
  });
  it('el incidente alarga el corredor y el ahorro es la diferencia real', () => {
    for (const [day, hour, sev] of [[0, 7, 0.8], [5, 11, 0.8], [2, 22, 0.45]]) {
      const h = hud(day, hour, sev);
      expect(h.corridorMin).toBeGreaterThan(h.usualMin);
      if (h.alt) expect(h.alt.saving).toBeCloseTo(h.corridorMin - h.alt.minutes, 5);
    }
  });
  it('un incidente leve de noche no justifica desviar', () => {
    const h = hud(2, 22, 0.45);
    expect(!h.alt || h.alt.saving < 0.5).toBe(true);
  });
});
