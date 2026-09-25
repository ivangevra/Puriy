import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  POPULAR_DESTINATIONS,
  destinationsGeoJSON,
  searchDestinations,
} from '../lib/destinations';

describe('destinos concurridos', () => {
  it('quedan dentro de Juliaca y con nombre', () => {
    expect(DESTINATIONS.length).toBeGreaterThan(100);
    for (const d of DESTINATIONS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.lon).toBeGreaterThan(-70.25);
      expect(d.lon).toBeLessThan(-70.02);
      expect(d.lat).toBeGreaterThan(-15.62);
      expect(d.lat).toBeLessThan(-15.36);
    }
  });
  it('busca sin tildes y prioriza lugares del PDU', () => {
    const results = searchDestinations('mercado tupac');
    expect(results[0].name).toMatch(/Túpac Amaru/);
    expect(searchDestinations('real plaza')[0].name).toBe('Real Plaza Juliaca');
  });
  it('filtra la capa por categoría', () => {
    const markets = destinationsGeoJSON(['mercado']).features;
    expect(markets.length).toBeGreaterThan(0);
    expect(markets.every((f) => f.properties.category === 'mercado')).toBe(true);
  });
  it('ofrece sugerencias antes de escribir', () => {
    expect(POPULAR_DESTINATIONS.length).toBeGreaterThanOrEqual(4);
  });
});
