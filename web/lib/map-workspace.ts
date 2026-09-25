import {
  draftGeometry,
  parseDraft,
  withServiceDefaults,
  type RouteDraft,
} from './route-drafts';
import type { Network, Point } from './mobility';
export const PUBLISHED_KEY = 'juliaca-published-map-v1';
export const SIGNALS_KEY = 'juliaca-signals-v1';
export type PublishedRoute = { draft: RouteDraft; publishedAt: string };
export function publicationError(d: RouteDraft) {
  try {
    parseDraft(d);
  } catch (e) {
    return (e as Error).message;
  }
  if (!d.name.trim()) return 'Añade un nombre al recorrido.';
  if (
    draftGeometry(d, 'outbound').length < 2 &&
    draftGeometry(d, 'inbound').length < 2
  )
    return 'Completa al menos un sentido antes de publicarlo en el mapa.';
  if (
    (['outbound', 'inbound'] as const).some(
      (k) => d[k].length > 0 && draftGeometry(d, k).length < 2,
    )
  )
    return 'Hay un sentido incompleto o pendiente de ajuste. Complétalo o elimina sus puntos.';
  return '';
}
export function readPublications(value: unknown): PublishedRoute[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    try {
      const draft = parseDraft(item.draft);
      return typeof item.publishedAt === 'string'
        ? [{ draft, publishedAt: item.publishedAt }]
        : [];
    } catch {
      return [];
    }
  });
}
/** Published geometry remains a proposal. The local planner derives explicitly proposed access points; control vertices are not official stops. */
export function mapWorkspaceNetwork(
  network: Network,
  items: PublishedRoute[],
): Network {
  return {
    ...network,
    routes: [
      ...network.routes,
      ...items.map(({ draft }) => {
        const d = withServiceDefaults(draft);
        return {
          id: `published:${d.id}`,
          code: d.code || 'PROP',
          name: d.name,
          color: d.color,
          operator: d.service?.operator || 'Propuesta local',
          service: d.service,
          status: 'proposal',
          source: d.source,
          verified_at: null,
          geometry: draftGeometry(d, 'outbound'),
          inbound_geometry: draftGeometry(d, 'inbound'),
          stops: [],
          inbound: [],
          fare: d.service?.fare ?? 0,
          start: d.service?.start || '',
          end: d.service?.end || '',
          frequency: [d.service?.headway || 0, d.service?.headway || 0],
          observation_period: null,
          fleet_coverage: null,
        };
      }),
    ],
  };
}
export const signalStatuses = {
  unknown: 'Sin verificar',
  operational: 'Operativo observado',
  outage: 'Avería reportada',
  planned: 'Propuesto',
};
export type SignalPoint = Point & {
  id: string;
  name: string;
  approach: string;
  status: keyof typeof signalStatuses;
  red: number | null;
  amber: number | null;
  green: number | null;
  pedestrian: boolean;
  source: string;
  observedAt: string;
  notes: string;
  updatedAt: string;
};
export const newSignal = (): SignalPoint => ({
  id: crypto.randomUUID(),
  name: '',
  approach: '',
  lat: -15.49,
  lon: -70.13,
  status: 'unknown',
  red: null,
  amber: null,
  green: null,
  pedestrian: false,
  source: '',
  observedAt: '',
  notes: '',
  updatedAt: new Date().toISOString(),
});
export function validateSignal(s: SignalPoint) {
  if (
    !s ||
    typeof s.id !== 'string' ||
    !s.id ||
    typeof s.name !== 'string' ||
    !s.name.trim() ||
    s.name.length > 160
  )
    throw new Error('Escribe el nombre del cruce (máximo 160 caracteres).');
  if (
    !Number.isFinite(s.lat) ||
    !Number.isFinite(s.lon) ||
    Math.abs(s.lat) > 90 ||
    Math.abs(s.lon) > 180
  )
    throw new Error('Marca una ubicación válida.');
  if (!Object.hasOwn(signalStatuses, s.status))
    throw new Error('Estado del semáforo inválido.');
  for (const k of ['red', 'amber', 'green'] as const)
    if (s[k] !== null && (!Number.isInteger(s[k]) || s[k]! < 0 || s[k]! > 600))
      throw new Error(
        'Cada duración debe estar entre 0 y 600 segundos, o vacía si no se conoce.',
      );
  for (const k of [
    'approach',
    'source',
    'notes',
    'observedAt',
    'updatedAt',
  ] as const)
    if (typeof s[k] !== 'string' || s[k].length > 2000)
      throw new Error('Información del semáforo inválida.');
  if (typeof s.pedestrian !== 'boolean')
    throw new Error('Cruce peatonal inválido.');
  if (s.status !== 'unknown' && (!s.source.trim() || !s.observedAt))
    throw new Error(
      'Indica fuente y fecha para registrar un estado observado o propuesto.',
    );
  return s;
}
export function readSignals(value: unknown): SignalPoint[] {
  return Array.isArray(value)
    ? value.slice(0, 1000).flatMap((s) => {
        try {
          return [validateSignal(s)];
        } catch {
          return [];
        }
      })
    : [];
}
