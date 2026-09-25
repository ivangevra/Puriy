import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clearance,
  evaluate,
  fixedPlan,
  hcmDelay,
  optimize,
  saturation,
  signalState,
  splitsFor,
  type Approach,
  type Site,
} from '../lib/signal-timing';

const turns = { left: 0.1, right: 0.1, parking: null, busStops: 0 };
const main = (volume: number): Approach => ({ volume, lanes: 2, laneWidth: 3.3, heavy: 0.15, grade: 0, storage: 150, ...turns });
const cross = (volume: number): Approach => ({ volume, lanes: 1, laneWidth: 3, heavy: 0.08, grade: 0, storage: 90, ...turns });
const site = (at: number, crossVolume = 300): Site => ({
  name: `S${at}`,
  at,
  ida: main(850),
  vuelta: main(700),
  cross: cross(crossVolume),
  crossOpp: cross(crossVolume * 0.8),
  mainWidth: 14,
  crossWidth: 8,
  mainKmh: 40,
  crossKmh: 30,
});
const corridor = [site(0, 380), site(300, 300), site(560, 420), site(860, 260)];

describe('tiempos de semáforo', () => {
  it('ajusta el flujo de saturación por ancho, pesados y pendiente', () => {
    const ideal = { ...main(0), lanes: 1, laneWidth: 3.6, heavy: 0, left: 0, right: 0 };
    expect(saturation(ideal, { ...DEFAULT_SETTINGS, area: 1 })).toBe(1900);
    expect(saturation(ideal)).toBeCloseTo(1900 * 0.9);
    expect(saturation(main(0))).toBeLessThan(2 * 1900);
    expect(saturation({ ...main(0), grade: 4 })).toBeLessThan(saturation(main(0)));
    // Micros que paran en la esquina, estacionamiento y giros bloqueados por el flujo opuesto.
    expect(saturation({ ...main(0), busStops: 60 })).toBeLessThan(saturation(main(0)));
    expect(saturation({ ...main(0), parking: 20 })).toBeLessThan(saturation(main(0)));
    expect(saturation(main(0), DEFAULT_SETTINGS, 900)).toBeLessThan(saturation(main(0), DEFAULT_SETTINGS, 100));
  });

  it('calcula amarillo y todo rojo con la fórmula cinemática', () => {
    expect(clearance(40, 8)).toEqual({ yellow: 3, allRed: 2 });
    expect(clearance(60, 20).yellow).toBeGreaterThan(3);
  });

  it('reparte el verde para igualar el grado de saturación y respeta al peatón', () => {
    const sp = splitsFor(site(0, 380), 80)!;
    expect(sp.green + sp.yellow + sp.allRed + sp.crossGreen + sp.crossYellow + sp.crossAllRed).toBe(80);
    expect(sp.crossGreen).toBeGreaterThanOrEqual(Math.ceil(7 + 14 / 1.0));
    const s = DEFAULT_SETTINGS;
    const xMain = hcmDelay(850 / s.phf, saturation(main(0), s, 700 / s.phf / 2), sp.green, 80).X;
    const xCross = hcmDelay(380 / s.phf, saturation(cross(0), s, (380 * 0.8) / s.phf), sp.crossGreen, 80).X;
    // El ajuste local baja la demora sin pasar a ninguna calle de v/c 0,90.
    expect(Math.max(xMain, xCross)).toBeLessThanOrEqual(0.9);
    expect(splitsFor(site(0), 30)).toBeNull();
  });

  it('la luz recorre verde, ámbar y rojo desde su desfase', () => {
    const plan = fixedPlan([site(0)], 60, 0.5, [10]);
    const p = plan.sites[0];
    expect(signalState(plan, 0, 10)).toEqual({ phase: 'green', remaining: p.green });
    expect(signalState(plan, 0, 10 + p.green).phase).toBe('amber');
    expect(signalState(plan, 0, 10 + p.green + p.yellow).phase).toBe('red');
    expect(signalState(plan, 0, 70).phase).toBe('green');
  });

  it('el plan optimizado mejora al actual y no es peor que la onda verde de un sentido', () => {
    const best = optimize(corridor)!;
    const speed = 25 / 3.6;
    const actual = evaluate(corridor, fixedPlan(corridor, 60, 0.5, [0, 37, 12, 48]));
    const wave = evaluate(corridor, fixedPlan(corridor, 60, 0.5, corridor.map((c) => c.at / speed)));
    expect(best.result.pi).toBeLessThanOrEqual(wave.pi * 1.03);
    expect(best.result.pi).toBeLessThan(actual.pi);
    expect(best.scan.filter((c) => c.pi !== null).length).toBeGreaterThan(5);
    expect(best.natural.every((c) => c === null || c >= 50)).toBe(true);
  });

  it('más demanda pide un ciclo igual o más largo', () => {
    const grow = (k: number) =>
      corridor.map((c) => ({ ...c, ida: main(850 * k), vuelta: main(700 * k), cross: cross(c.cross.volume * k) }));
    expect(optimize(grow(1.4))!.plan.cycle).toBeGreaterThanOrEqual(optimize(grow(1))!.plan.cycle);
  });
});
