import { describe, expect, it } from 'vitest';
import { along, fleet, line, slice } from '../lib/demo-geo';
import corridor from '../lib/demo-corridor.json';

describe('geometría de demos', () => {
  it('reproduce el ejemplo de flota de la propuesta', () => {
    // 13 km ida y vuelta a 15 km/h + 10 min de regulación, cada 8 min.
    const f = fleet(13, 15, 10, 8);
    expect(Math.round(f.running)).toBe(52);
    expect(Math.round(f.cycle)).toBe(62);
    expect(f.vehicles).toBe(8);
  });
  it('recorre el corredor sobre su geometría', () => {
    const l = line(corridor.outbound);
    expect(Math.abs(l.total - corridor.outboundMeters)).toBeLessThan(l.total * 0.02);
    expect(along(l, 0).at).toEqual(corridor.outbound[0]);
    const part = slice(l, 1000, 2000);
    expect(part.length).toBeGreaterThan(1);
  });
});
