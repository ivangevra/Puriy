import { roadKey, type RoadResult, type RoadAlignment } from './road-routing';
import { distance, type Network } from './mobility';
export type Coordinate = [number, number];
export type RouteDraft = {
  passengerVisible?: boolean;
  service?: import('./mobility').ServiceConfig;
  routingMode?: 'roads' | 'manual';
  roadAlignment?: RoadAlignment;
  roads?: Partial<Record<'outbound' | 'inbound', RoadResult>>;
  version: 1;
  id: string;
  name: string;
  code: string;
  color: string;
  outbound: Coordinate[];
  inbound: Coordinate[];
  source: string;
  observedAt: string;
  boarding: string;
  risks: string;
  notes: string;
  checks: string[];
  updatedAt: string;
};
export const DRAFT_KEY = 'juliaca-route-workbench-v1';
export const DEFAULT_SERVICE: import('./mobility').ServiceConfig = {
  start: '05:00',
  end: '23:00',
};
export function withServiceDefaults(d: RouteDraft): RouteDraft {
  const service: import('./mobility').ServiceConfig = { ...DEFAULT_SERVICE };
  if (d.service) {
    if (d.service.headway !== undefined) service.headway = d.service.headway;
    if (d.service.speedKmh !== undefined)
      service.speedKmh = d.service.speedKmh;
    if (d.service.fare !== undefined) service.fare = d.service.fare;
    if (d.service.operator) service.operator = d.service.operator;
    if (d.service.model) service.model = d.service.model;
    if (d.service.start) service.start = d.service.start;
    if (d.service.end) service.end = d.service.end;
  }
  return { ...d, service };
}
export function newDraft(): RouteDraft {
  return {
    routingMode: 'roads',
    service: { ...DEFAULT_SERVICE },
    version: 1,
    id: crypto.randomUUID(),
    name: '',
    code: '',
    color: '#357cb7',
    outbound: [],
    inbound: [],
    source: '',
    observedAt: '',
    boarding: '',
    risks: '',
    notes: '',
    checks: [],
    updatedAt: new Date().toISOString(),
  };
}
export function parseDraft(value: unknown): RouteDraft {
  const d = value as RouteDraft;
  if (
    !d ||
    d.version !== 1 ||
    typeof d.id !== 'string' ||
    !d.id ||
    !/^#[a-f0-9]{6}$/i.test(d.color)
  )
    throw new Error('No es un borrador de rutas válido (versión 1).');
  for (const key of [
    'name',
    'code',
    'source',
    'observedAt',
    'boarding',
    'risks',
    'notes',
    'updatedAt',
  ] as const)
    if (typeof d[key] !== 'string' || d[key].length > 4000)
      throw new Error('El borrador contiene campos inválidos.');
  for (const key of ['outbound', 'inbound'] as const)
    if (
      !Array.isArray(d[key]) ||
      d[key].length > 1000 ||
      d[key].some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every(Number.isFinite) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90,
      )
    )
      throw new Error(
        'Coordenadas inválidas o más de 1000 vértices por sentido.',
      );
  if (!Array.isArray(d.checks) || d.checks.some((v) => typeof v !== 'string'))
    throw new Error('Lista de revisión inválida.');
  if (
    d.routingMode !== undefined &&
    !['roads', 'manual'].includes(d.routingMode)
  )
    throw new Error('Modo de trazado inválido.');
  if (
    d.passengerVisible !== undefined &&
    typeof d.passengerVisible !== 'boolean'
  )
    throw new Error('Visibilidad inválida.');
  if (d.service !== undefined) {
    if (!d.service || typeof d.service !== 'object')
      throw new Error('Configuración de servicio inválida.');
    for (const [key, min, max] of [
      ['headway', 1, 180],
      ['speedKmh', 3, 60],
      ['fare', 0, 100],
    ] as const) {
      const value = d.service[key];
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < min || value > max)
      )
        throw new Error(`Valor de ${key} inválido.`);
    }
    for (const key of ['operator', 'model', 'start', 'end'] as const)
      if (
        d.service[key] !== undefined &&
        (typeof d.service[key] !== 'string' || d.service[key]!.length > 120)
      )
        throw new Error('Detalle de servicio inválido.');
    for (const key of ['start', 'end'] as const)
      if (d.service[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.service[key]!))
        throw new Error('Horario inválido.');
    if (
      Boolean(d.service.start) !== Boolean(d.service.end) ||
      (d.service.start && d.service.end && d.service.start >= d.service.end)
    )
      throw new Error('Indica inicio y fin del servicio en el mismo día.');
  }
  if (d.roads !== undefined) {
    if (typeof d.roads !== 'object' || d.roads === null)
      throw new Error('Geometría de calles inválida.');
    for (const r of Object.values(d.roads)) {
      if (
        r?.segments !== undefined &&
        (!Array.isArray(r.segments) ||
          r.segments.length > 80 ||
          r.segments.some(
            (s) =>
              !s ||
              !Number.isInteger(s.from) ||
              !Number.isInteger(s.to) ||
              s.from < 0 ||
              s.to !== s.from + 1 ||
              typeof s.streets !== 'string' ||
              s.streets.length > 600 ||
              !Number.isFinite(s.distance) ||
              s.distance < 0 ||
              typeof s.review !== 'boolean' ||
              (s.bearing !== null &&
                (!Number.isFinite(s.bearing) ||
                  s.bearing < 0 ||
                  s.bearing > 360)),
          ))
      )
        throw new Error('Información de calles inválida.');
      if (
        !r ||
        typeof r.key !== 'string' ||
        typeof r.provider !== 'string' ||
        typeof r.calculatedAt !== 'string' ||
        !Array.isArray(r.geometry) ||
        r.geometry.length > 50000 ||
        r.geometry.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90,
        )
      )
        throw new Error('Geometría de calles inválida.');
    }
  }
  if (
    d.roadAlignment !== undefined &&
    !['direction', 'nearest'].includes(d.roadAlignment)
  )
    throw new Error('Ajuste de calzada inválido.');
  return { ...d, routingMode: d.routingMode || 'roads' };
}
export function draftGeometry(
  d: RouteDraft,
  key: 'outbound' | 'inbound',
): Coordinate[] {
  if (d.routingMode === 'manual') return d[key];
  const result = d.roads?.[key];
  // Any router version is shown while its control points are unchanged; the
  // editor recalculates older versions with the current street graph.
  return result?.key === roadKey(d[key]) ||
    result?.key?.endsWith(`:${JSON.stringify(d[key])}`)
    ? result.geometry
    : [];
}
export const draftReady = (d: RouteDraft) =>
  (['outbound', 'inbound'] as const).every(
    (k) => draftGeometry(d, k).length >= 2,
  );
export const pathKm = (points: Coordinate[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        distance(
          { lon: p[0], lat: p[1] },
          { lon: points[i][0], lat: points[i][1] },
        ),
      0,
    ) / 1000;
export function draftWarnings(d: RouteDraft) {
  return [
    ...(d.outbound.length < 2
      ? ['La ida necesita al menos dos vértices.']
      : []),
    ...(d.inbound.length < 2
      ? ['La vuelta necesita al menos dos vértices.']
      : []),
    ...(!d.source.trim() ? ['Falta registrar la fuente del recorrido.'] : []),
    ...(!d.observedAt ? ['Falta la fecha del levantamiento o documento.'] : []),
    ...(d.routingMode === 'manual' &&
    [d.outbound, d.inbound].some((points) =>
      points
        .slice(1)
        .some(
          (p, i) =>
            distance(
              { lon: p[0], lat: p[1] },
              { lon: points[i][0], lat: points[i][1] },
            ) > 1500,
        ),
    )
      ? ['Hay segmentos mayores de 1,5 km: revisa curvas y calles intermedias.']
      : []),
  ];
}
export function draftNetwork(
  d: RouteDraft,
  active: 'outbound' | 'inbound',
): Network {
  const stops = d[active].map((p, i) => ({
    id: `vertex-${i}`,
    name: `Vértice ${i + 1}`,
    lon: p[0],
    lat: p[1],
    kind: 'draft',
  }));
  return {
    stops,
    routes: [
      {
        id: d.id,
        code: d.code || 'NUEVA',
        name: d.name || 'Borrador de recorrido',
        color: d.color,
        operator: d.service?.operator || 'Propuesta local',
        fare: d.service?.fare ?? 0,
        frequency: [d.service?.headway || 0, d.service?.headway || 0],
        start: d.service?.start || '05:00',
        end: d.service?.end || '23:00',
        status: 'proposal',
        verified_at: null,
        source: d.source,
        geometry: draftGeometry(d, 'outbound'),
        inbound_geometry: draftGeometry(d, 'inbound'),
        stops: active === 'outbound' ? stops.map((s) => s.id) : [],
        inbound: active === 'inbound' ? stops.map((s) => s.id) : [],
        observation_period: null,
        fleet_coverage: null,
      },
    ],
  };
}
export function exportDraft(d: RouteDraft) {
  if (!draftReady(d))
    throw new Error('Completa el cálculo de ambos sentidos antes de exportar.');
  return {
    type: 'FeatureCollection',
    features: (
      [
        ['outbound', 'Ida'],
        ['inbound', 'Vuelta'],
      ] as const
    )
      .filter(([key]) => d[key].length >= 2)
      .map(([key, label]) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: draftGeometry(d, key) },
        properties: {
          routing_mode: d.routingMode || 'roads',
          routing_provider: d.roads?.[key]?.provider || null,
          draft_id: d.id,
          code: d.code,
          name: d.name,
          direction: key,
          direction_label: label,
          status: 'draft',
          verified: false,
          source: d.source,
          observed_at: d.observedAt || null,
          color: d.color,
          boarding: d.boarding,
          risks: d.risks,
          notes: d.notes,
          warning:
            d.routingMode === 'manual'
              ? 'Trazado libre sin ajuste a calles. No es un servicio publicado.'
              : 'Recorrido calculado con perfil de automóvil. Requiere revisión de restricciones para micros y validación de campo. No es un servicio publicado.',
        },
      })),
  };
}
