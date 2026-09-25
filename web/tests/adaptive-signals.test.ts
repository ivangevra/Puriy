import { describe, it, expect } from 'vitest';
import { JEV_LATENCY, JEV_MIN_CONFIDENCE, LLM_LATENCY, SAFETY, arrivals, createSim, miniCrossing } from '../lib/adaptive-signals';

describe('semáforos adaptativos (prototipo)', () => {
  it('ambos controles reciben las mismas llegadas y el resultado es reproducible', () => {
    expect(arrivals('normal')).toEqual(arrivals('normal'));
    const run = () => {
      const s = createSim('adaptive', arrivals('normal'), false);
      s.step(120);
      return s.snapshot().metrics;
    };
    expect(run()).toEqual(run());
  });

  it('la capa de seguridad se cumple: verde mínimo, ámbar y todo rojo completos', () => {
    for (const demand of ['normal', 'punta', 'oleada'] as const)
      for (const control of ['adaptive', 'jev'] as const) {
        const s = createSim(control, arrivals(demand), true);
        let prev = s.snapshot().signals;
        for (let t = 0.2; t <= 200; t += 0.2) {
          s.step(t);
          const now = s.snapshot().signals;
          now.forEach((sg, i) => {
            const was = prev[i];
            // Un verde solo termina pasando a ámbar, y tras respetar el mínimo
            // (la instantánea es de 0,2 s antes del cambio).
            if (was.stage === 'green' && sg.stage !== 'green') {
              expect(sg.stage).toBe('amber');
              expect(was.t + 0.2).toBeGreaterThanOrEqual(SAFETY.minGreen - 1e-6);
            }
            if (was.stage === 'amber' && sg.stage !== 'amber') expect(was.t).toBeGreaterThanOrEqual(SAFETY.amber - 0.2);
            if (was.stage === 'allRed' && sg.stage === 'green') {
              expect(was.t).toBeGreaterThanOrEqual(SAFETY.allRed - 0.2);
              expect(sg.phase).not.toBe(was.phase);
            }
            // El verde puede pasar del máximo solo si nadie espera en la otra calle.
          });
          prev = now;
        }
      }
  });

  it('con Jev simulado cada consulta es una opción válida y la duda pasa a la regla', () => {
    const s = createSim('jev', arrivals('oleada'), false);
    s.step(150);
    const snap = s.snapshot();
    const q = snap.lastQuery!;
    expect(q.question.type).toBe('Choice');
    expect(q.question.options).toContain(q.answer);
    expect(q.probability).toBeGreaterThanOrEqual(0.5);
    expect(q.fallback).toBe(q.probability < JEV_MIN_CONFIDENCE);
    expect(snap.metrics.queries).toBeGreaterThan(0);
    expect(snap.log.filter((e) => e.fallback).length).toBeLessThanOrEqual(snap.metrics.fallbacks);
  });

  it('con demanda variable los controles adaptativos esperan menos que el tiempo fijo', () => {
    for (const demand of ['normal', 'oleada'] as const) {
      const list = arrivals(demand);
      const fixed = createSim('fixed', list, false);
      fixed.step(180);
      for (const control of ['adaptive', 'jev'] as const) {
        const s = createSim(control, list, false);
        s.step(180);
        expect(s.snapshot().metrics.avgWait).toBeLessThan(fixed.snapshot().metrics.avgWait);
      }
    }
  });

  it('explicación: mirar la calle espera menos que el reloj, y responder rápido menos que responder lento', () => {
    const quick = miniCrossing({ kind: 'ask', latency: JEV_LATENCY }, 16);
    expect(quick.waitSum).toBeLessThan(miniCrossing({ kind: 'fixed', period: 10 }, 16).waitSum / 2);
    const fast = miniCrossing({ kind: 'ask', latency: JEV_LATENCY }, 20);
    const slow = miniCrossing({ kind: 'ask', latency: LLM_LATENCY }, 20);
    expect(fast.waitSum).toBeLessThan(slow.waitSum / 2);
    expect(fast.decisions).toBeGreaterThan(slow.decisions * 3);
    // Mientras espera una respuesta no vuelve a preguntar.
    const s = miniCrossing({ kind: 'ask', latency: LLM_LATENCY }, 4);
    expect(s.queries).toHaveLength(1);
    expect(s.thinking).toBeCloseTo(2, 1);
  });
});
