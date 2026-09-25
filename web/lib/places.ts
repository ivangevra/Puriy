import type { Network, Point } from './mobility';
export type Place = Point & {
  id: string;
  name: string;
  detail: string;
  source: 'local' | 'osm';
  category?: string;
};
export const normalizePlace = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function localPlaces(network: Network, query: string): Place[] {
  const words = normalizePlace(query).split(/\s+/);
  return network.stops
    .filter((s) => words.every((w) => normalizePlace(s.name).includes(w)))
    .slice(0, 6)
    .map((s) => ({
      ...s,
      detail:
        s.kind === 'demo'
          ? 'Juliaca'
          : 'Punto de la red · Juliaca',
      source: 'local',
    }));
}
const BASE =
  (import.meta.env as ImportMetaEnv & { VITE_GEOCODER_URL?: string })
    .VITE_GEOCODER_URL || 'https://photon.komoot.io';
const cache = new Map<string, Place[]>();
export async function searchPlaces(
  query: string,
  signal: AbortSignal,
): Promise<Place[]> {
  const key = normalizePlace(query);
  if (cache.has(key)) return cache.get(key)!;
  const url = new URL(`${BASE.replace(/\/$/, '')}/api/`);
  url.search = new URLSearchParams({
    q: query.trim(),
    limit: '6',
    lat: '-15.49',
    lon: '-70.13',
    bbox: '-70.25,-15.62,-70.02,-15.36',
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
  if (!response.ok)
    throw new Error('No se pudo consultar el buscador de calles.');
  const data = (await response.json()) as {
    features?: {
      geometry?: { coordinates?: number[] };
      properties?: Record<string, unknown>;
    }[];
  };
  if (!Array.isArray(data.features))
    throw new Error('Respuesta de búsqueda inválida.');
  const results: Place[] = [];
  for (const f of data.features) {
    const c = f.geometry?.coordinates,
      p = f.properties;
    if (
      !c ||
      !p ||
      !Number.isFinite(c[0]) ||
      !Number.isFinite(c[1]) ||
      c[0] < -70.25 ||
      c[0] > -70.02 ||
      c[1] < -15.62 ||
      c[1] > -15.36
    )
      continue;
    const field = (k: string) =>
      typeof p[k] === 'string' ? String(p[k]).slice(0, 200) : '';
    const name =
      field('name') ||
      [field('street'), field('housenumber')].filter(Boolean).join(' ');
    if (!name) continue;
    results.push({
      id: `osm-${String(p.osm_type)}-${String(p.osm_id)}-${c.join(',')}`,
      name,
      detail: [
        field('street') !== name ? field('street') : '',
        field('district'),
        field('city') || 'Juliaca',
      ]
        .filter(Boolean)
        .join(' · '),
      lon: c[0],
      lat: c[1],
      source: 'osm',
    });
  }
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(key, results.slice(0, 6));
  return results.slice(0, 6);
}
