import data from './places-juliaca.json';
import { normalizePlace, type Place } from './places';

// Destinos concurrentes de Juliaca (colegios, mercados, salud, comercio,
// terminales). Coordenadas de OpenStreetMap; `pdu` marca los lugares citados
// en el diagnóstico PDU 2026-2035. Regenerar con scripts/build-places.py.
export type DestinationCategory =
  | 'mercado'
  | 'comercio'
  | 'colegio'
  | 'inicial'
  | 'superior'
  | 'salud'
  | 'terminal'
  | 'servicio'
  | 'recreacion';
export type Destination = {
  id: string;
  name: string;
  category: DestinationCategory;
  lon: number;
  lat: number;
  pdu?: boolean;
};

export const DESTINATIONS = data.places as Destination[];
export const DESTINATIONS_SOURCE = data.source;
export const DESTINATIONS_DATE = data.generated;

export const CATEGORIES: Record<
  DestinationCategory,
  { label: string; one: string; color: string; minZoom: number }
> = {
  mercado: { label: 'Mercados', one: 'Mercado', color: '#c4622d', minZoom: 11 },
  comercio: { label: 'Centros comerciales', one: 'Centro comercial', color: '#b0457a', minZoom: 11 },
  salud: { label: 'Salud', one: 'Salud', color: '#c9423d', minZoom: 11 },
  superior: { label: 'Universidades', one: 'Educación superior', color: '#6a52b8', minZoom: 11 },
  terminal: { label: 'Terminales', one: 'Terminal', color: '#1f7a6d', minZoom: 11 },
  colegio: { label: 'Colegios', one: 'Colegio', color: '#275cba', minZoom: 13 },
  inicial: { label: 'Educación inicial', one: 'Educación inicial', color: '#2f8fb0', minZoom: 14 },
  servicio: { label: 'Servicios públicos', one: 'Servicio público', color: '#5b6573', minZoom: 12 },
  recreacion: { label: 'Estadios', one: 'Estadio', color: '#3b8a4c', minZoom: 12 },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as DestinationCategory[];
export const DEFAULT_LAYERS: DestinationCategory[] = [
  'mercado',
  'comercio',
  'salud',
  'superior',
  'terminal',
  'colegio',
];

const folded = DESTINATIONS.map((d) => normalizePlace(d.name));

export function countByCategory() {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<
    DestinationCategory,
    number
  >;
  for (const d of DESTINATIONS) counts[d.category]++;
  return counts;
}

export function toPlace(d: Destination): Place {
  return {
    id: d.id,
    name: d.name,
    detail: `${CATEGORIES[d.category].one} · Juliaca`,
    lon: d.lon,
    lat: d.lat,
    source: 'local',
    category: d.category,
  };
}

// Suggestions before typing: the most visited places cited by the PDU.
export const POPULAR_DESTINATIONS: Place[] = [
  'Real Plaza Juliaca',
  'Mercado Túpac Amaru',
  'Mercado San José',
  'Hospital Regional de Juliaca Carlos Monge Medrano',
  'Terminal Terrestre Micaela Bastidas',
  'Universidad Nacional de Juliaca',
]
  .map((name) => DESTINATIONS.find((d) => d.name === name))
  .filter((d): d is Destination => !!d)
  .map(toPlace);

// Offline search: every query word must appear; PDU-cited and non-school
// places rank first because they concentrate more trips.
export function searchDestinations(query: string, limit = 6): Place[] {
  const words = normalizePlace(query).split(/\s+/).filter(Boolean);
  if (!words.length || words.join('').length < 2) return [];
  const rank = (d: Destination) =>
    (d.pdu ? 0 : 2) + (d.category === 'inicial' ? 2 : d.category === 'colegio' ? 1 : 0);
  return DESTINATIONS.filter((_, i) => words.every((w) => folded[i].includes(w)))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(toPlace);
}

export function destinationsGeoJSON(active: readonly DestinationCategory[]) {
  const on = new Set(active);
  return {
    type: 'FeatureCollection' as const,
    features: DESTINATIONS.filter((d) => on.has(d.category)).map((d) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
      properties: {
        id: d.id,
        name: d.name,
        category: d.category,
        label: CATEGORIES[d.category].one,
        color: CATEGORIES[d.category].color,
        minzoom: CATEGORIES[d.category].minZoom,
        pdu: !!d.pdu,
      },
    })),
  };
}
