import { it, expect } from 'vitest';
import { newSignal } from '../lib/map-workspace';
import { signalCycle } from '../lib/signal-cycle';
import { journeySteps } from '../lib/walking-steps';
import { DEMO_NETWORK, demoPlan } from '../lib/mobility';
it('recorre rojo, verde, ámbar y reinicia sin depender de ticks acumulados', () => {
  const s = {
    ...newSignal(),
    updatedAt: '2026-09-06T10:00:00Z',
    red: 4,
    green: 3,
    amber: 2,
  };
  const t = Date.parse(s.updatedAt);
  expect(signalCycle(s, t)).toEqual({ phase: 'red', remaining: 4 });
  expect(signalCycle(s, t + 4000)).toEqual({ phase: 'green', remaining: 3 });
  expect(signalCycle(s, t + 7000)).toEqual({ phase: 'amber', remaining: 2 });
  expect(signalCycle(s, t + 9000)).toEqual({ phase: 'red', remaining: 4 });
  expect(signalCycle(s, t + 900000)).toEqual({ phase: 'red', remaining: 4 });
  expect(signalCycle({ ...s, red: 0 }, t).phase).toBe('green');
  expect(signalCycle({ ...s, status: 'outage' }, t).phase).toBe('off');
  expect(signalCycle({ ...s, amber: null }, t).phase).toBe('off');
  expect(signalCycle({ ...s, red: 0, amber: 0, green: 0 }, t).phase).toBe(
    'off',
  );
});
it('incluye acceso peatonal antes del micro y llegada después de bajar', () => {
  const plaza = DEMO_NETWORK.stops.find((s) => s.id === 'plaza')!;
  const airport = DEMO_NETWORK.stops.find((s) => s.id === 'aeropuerto')!;
  const origin = { lat: plaza.lat + 0.001, lon: plaza.lon };
  const destination = { lat: airport.lat + 0.001, lon: airport.lon };
  const journey = demoPlan(DEMO_NETWORK, origin, destination)[0];
  const steps = journeySteps(journey, origin, destination);
  expect(steps[0].kind).toBe('walk');
  expect(steps[0]).toMatchObject({ approximate: true, meters: 111 });
  expect(steps[1].kind).toBe('ride');
  expect(steps.at(-1)?.title).toBe('Camina hasta tu destino');
  expect(
    journeySteps({ ...journey, mode: 'otp' }, origin, destination)[0],
  ).toMatchObject({ meters: null, approximate: false });
});
