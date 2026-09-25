import catalog from './pdu-catalog.json';
import { draftGeometry, parseDraft, type RouteDraft } from './route-drafts';
import type { Network } from './mobility';
import {
  defaultStudy,
  type CensusData,
  type LabState,
  type Study,
  type WalkingData,
} from './lab-types';

export { catalog };
export const freshLab = (): LabState => ({
  version: 1,
  revision: 0,
  places: structuredClone(catalog.places) as LabState['places'],
  events: structuredClone(catalog.events) as LabState['events'],
  boarding: [],
  observations: [],
  studies: [],
  walking: null,
  candidates: [],
});
const fail = (message: string): never => {
  throw new Error(message);
};
const text = (v: unknown, max = 2000, required = false) =>
  typeof v === 'string' && v.length <= max && (!required || !!v.trim());
const number = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const clock = (v: unknown) =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const point = (v: unknown) =>
  !!v &&
  typeof v === 'object' &&
  number((v as { lon: number }).lon, -180, 180) &&
  number((v as { lat: number }).lat, -90, 90);
const days = (v: unknown) =>
  Array.isArray(v) &&
  v.length <= 7 &&
  new Set(v).size === v.length &&
  v.every((n) => integer(n, 0, 6));
const rows = (v: unknown, max: number, label: string) => {
  if (!Array.isArray(v) || v.length > max)
    fail(`Lista de ${label} inválida (máximo ${max}).`);
  const list = v as { id: string }[];
  if (
    list.some((r) => !r || !text(r.id, 160, true)) ||
    new Set(list.map((r) => r.id)).size !== list.length
  )
    fail(`Identificadores de ${label} inválidos o repetidos.`);
};
const evidence = (r: {
  evidence: string;
  validation: string;
  source: string;
  page: number | null;
  notes: string;
}) => {
  if (
    !['documental', 'observed', 'assumption'].includes(r.evidence) ||
    !['pending', 'reviewed', 'conflict'].includes(r.validation) ||
    !text(r.source, 2000, true) ||
    !text(r.notes) ||
    !(r.page === null || integer(r.page, 1, 10000))
  )
    fail('Fuente o estado de evidencia inválido.');
};
export function validateStudy(value: unknown): Study {
  const s = value as Study;
  if (
    !s ||
    !text(s.name, 120, true) ||
    !text(s.routeId, 160, true) ||
    !text(s.alternativeId, 160, true) ||
    !text(s.source, 2000, true) ||
    !integer(s.day, 0, 6) ||
    !clock(s.hour)
  )
    fail('Completa nombre, rutas, horario y fuente del escenario.');
  for (const [key, min, max] of [
    ['fleet', 1, 500],
    ['reserve', 0, 499],
    ['capacity', 1, 150],
    ['speedKmh', 3, 60],
    ['layoverMinutes', 0, 180],
    ['baseHeadway', 1, 180],
    ['proposedHeadway', 1, 180],
    ['walkMeters', 50, 2000],
    ['walkSpeedKmh', 1, 7],
    ['thresholdMinutes', 5, 180],
    ['costPerKm', 0, 1000],
    ['costPerHour', 0, 10000],
    ['fare', 0, 100],
  ] as const)
    if (!number(s[key], min, max)) fail(`Valor de ${key} fuera de rango.`);
  if (
    ![s.fleet, s.reserve, s.capacity].every(Number.isInteger) ||
    s.reserve >= s.fleet
  )
    fail(
      'La flota, reserva y capacidad deben ser enteros; deja al menos una unidad activa.',
    );
  if (s.peakLoadPerHour !== null && !number(s.peakLoadPerHour, 0, 100000))
    fail('Carga por hora inválida.');
  if (
    !Array.isArray(s.removedStops) ||
    s.removedStops.length > 200 ||
    s.removedStops.some((v) => !text(v, 160, true)) ||
    new Set(s.removedStops).size !== s.removedStops.length ||
    typeof s.applyEvents !== 'boolean' ||
    !['radius', 'paths'].includes(s.accessMode)
  )
    fail('Opciones del escenario inválidas.');
  return s;
}
export function validateWalking(value: unknown): WalkingData {
  const w = value as WalkingData;
  if (
    !w ||
    !text(w.source, 2000, true) ||
    !text(w.date, 40, true) ||
    !Number.isFinite(Date.parse(w.date)) ||
    !text(w.pointFingerprint, 100, true) ||
    !Array.isArray(w.links) ||
    w.links.length > 30000
  )
    fail(
      'Conexiones peatonales inválidas: indica fuente, fecha y hasta 30.000 conexiones.',
    );
  const seen = new Set<string>();
  for (const l of w.links) {
    if (
      !l ||
      !text(l.from, 200, true) ||
      !text(l.to, 200, true) ||
      !number(l.meters, 0, 100000)
    )
      fail('Conexión peatonal inválida.');
    const key = `${l.from}\n${l.to}`;
    if (seen.has(key)) fail('Hay conexiones peatonales duplicadas.');
    seen.add(key);
  }
  return w;
}
export function validateLab(value: unknown): LabState {
  const s = value as LabState;
  if (!s || s.version !== 1 || !integer(s.revision, 0, 1e9))
    fail('Archivo de laboratorio inválido (versión 1).');
  rows(s.places, 300, 'destinos');
  rows(s.events, 200, 'afectaciones');
  rows(s.boarding, 500, 'abordajes');
  rows(s.observations, 1000, 'observaciones');
  rows(s.studies, 20, 'estudios');
  for (const p of s.places) {
    evidence(p);
    if (
      !text(p.name, 160, true) ||
      !text(p.groupId, 160, true) ||
      !['commerce', 'health', 'education', 'connection', 'public'].includes(
        p.category,
      ) ||
      !(p.point === null || point(p.point)) ||
      !days(p.days)
    )
      fail('Destino inválido.');
    if (
      !(
        (p.open === null && p.close === null) ||
        (clock(p.open) && clock(p.close) && p.open! < p.close! && p.days.length)
      )
    )
      fail('Define inicio, fin y días del destino; divide horarios nocturnos.');
  }
  for (const e of s.events) {
    evidence(e);
    if (
      !text(e.name, 160, true) ||
      !days(e.days) ||
      !(e.routeId === null || text(e.routeId, 160, true)) ||
      !(e.extraCycleMinutes === null || number(e.extraCycleMinutes, 0, 300)) ||
      typeof e.suspended !== 'boolean'
    )
      fail('Afectación inválida.');
    if (
      !(
        (e.start === null && e.end === null) ||
        (clock(e.start) && clock(e.end) && e.start! < e.end!)
      )
    )
      fail(
        'Completa inicio y fin de la afectación; divide ventanas nocturnas.',
      );
    if (
      e.validation === 'reviewed' &&
      (!e.routeId ||
        !e.days.length ||
        e.start === null ||
        e.end === null ||
        (e.extraCycleMinutes === null && !e.suspended))
    )
      fail(
        'Una afectación revisada requiere ruta, días, ventana y efecto cuantificado.',
      );
  }
  for (const b of s.boarding)
    if (
      !point(b) ||
      !text(b.name, 160, true) ||
      !text(b.source, 2000, true) ||
      !text(b.routeId, 160, true) ||
      ![0, 1].includes(b.direction)
    )
      fail('Abordaje inválido.');
  for (const o of s.observations) {
    if (
      !text(o.routeId, 160, true) ||
      !text(o.date, 40, true) ||
      !Number.isFinite(Date.parse(o.date)) ||
      !['before', 'after'].includes(o.phase) ||
      !number(o.minutes, 1, 1440) ||
      !integer(o.vehicles, 0, 100000) ||
      !integer(o.boardings, 0, 100000) ||
      !(o.cycleMinutes === null || number(o.cycleMinutes, 1, 1000)) ||
      !text(o.source, 2000, true) ||
      !text(o.notes) ||
      !Array.isArray(o.headways) ||
      o.headways.length > 200 ||
      o.headways.some((h) => !number(h, 0.1, 180))
    )
      fail('Observación de campo inválida.');
  }
  for (const r of s.studies) {
    validateStudy(r.study);
    if (
      !text(r.name, 120, true) ||
      !text(r.createdAt, 40, true) ||
      !['draft', 'review', 'pilot', 'retired'].includes(r.status) ||
      !r.result ||
      !text(r.result.fingerprint, 100, true) ||
      !r.result.base ||
      !r.result.proposed ||
      !Array.isArray(r.result.warnings)
    )
      fail('Estudio guardado inválido.');
    validateStudy(r.result.study);
    const result = r.result;
    if (
      !text(result.version, 100, true) ||
      !Number.isFinite(Date.parse(result.calculatedAt)) ||
      !Number.isFinite(Date.parse(r.createdAt))
    )
      fail('Fecha o versión del estudio inválida.');
    for (const coverage of [result.base, result.proposed]) {
      for (const key of [
        'population',
        'covered',
        'reachable',
        'unknownBlocks',
        'disconnected',
        'evaluatedPlaces',
      ] as const)
        if (!integer(coverage[key], 0, 1e12))
          fail('Indicadores de población del estudio inválidos.');
      for (const key of ['median', 'p90'] as const)
        if (coverage[key] !== null && !number(coverage[key], 0, 1e9))
          fail('Tiempos del estudio inválidos.');
      if (
        coverage.covered > coverage.population ||
        coverage.reachable > coverage.population ||
        coverage.disconnected > coverage.population
      )
        fail('La cobertura del estudio excede su población.');
    }
    for (const fleet of [result.baseFleet, result.proposedFleet]) {
      if (!fleet) fail('Recursos del estudio incompletos.');
      for (const key of [
        'km',
        'cycle',
        'requestedHeadway',
        'effectiveHeadway',
        'vehiclesRequired',
        'vehiclesUsed',
        'available',
        'capacityPerHour',
        'costPerHour',
        'vehicleKmPerHour',
      ] as const)
        if (!number(fleet[key], 0, 1e12))
          fail('Recursos del estudio inválidos.');
      if (
        typeof fleet.targetFeasible !== 'boolean' ||
        !(fleet.overload === null || typeof fleet.overload === 'boolean')
      )
        fail('Viabilidad del estudio inválida.');
    }
    for (const key of ['gained', 'lost', 'improved', 'worsened'] as const)
      if (!integer(result[key], 0, 1e12))
        fail('Balance de población del estudio inválido.');
    for (const values of [result.warnings, result.appliedEvents])
      if (
        !Array.isArray(values) ||
        values.length > 400 ||
        values.some((v) => !text(v, 2000, true))
      )
        fail('Notas del resultado inválidas.');
    if (
      !Array.isArray(result.zones) ||
      result.zones.length > 2000 ||
      result.zones.some(
        (z) =>
          !z ||
          !text(z.name, 200, true) ||
          [z.known, z.base, z.proposed, z.lost].some(
            (n) => !integer(n, 0, 1e12),
          ),
      )
    )
      fail('Resultados por zona inválidos.');
  }
  if (s.walking !== null) validateWalking(s.walking);
  if (s.candidates !== undefined) {
    rows(s.candidates, 20, 'alternativas');
    for (const d of s.candidates) {
      parseDraft(d);
      if (d.passengerVisible)
        fail('Las alternativas del laboratorio no habilitan pasajeros.');
    }
  }
  return s;
}

/** Conflicting duplicates are unknown, never added or resolved by guessing. */
export function parseCensus(value: unknown, version: string): CensusData {
  const data = value as {
    type: string;
    features: {
      properties: Record<string, unknown>;
      geometry: { type: string; coordinates: number[] };
    }[];
  };
  if (
    !data ||
    data.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 100000
  )
    fail('Cartografía censal inválida.');
  const blocks = new Map<string, CensusData['blocks'][number]>();
  let duplicates = 0,
    conflicts = 0;
  for (const f of data.features) {
    const p = f.properties,
      c = f.geometry?.coordinates;
    if (
      !p ||
      !['d', 'z', 'm'].every((k) => text(p[k], 80, true)) ||
      f.geometry.type !== 'Point' ||
      !Array.isArray(c) ||
      c.length !== 2 ||
      !point({ lon: c[0], lat: c[1] }) ||
      !(p.p === null || integer(p.p, 0, 1e7))
    )
      fail(
        'Manzana inválida: se requieren distrito, zona, código, centroide y población nula o entera.',
      );
    const id = `${String(p.d)}:${String(p.z)}:${String(p.m)}`;
    const row = {
      id,
      district: String(p.d),
      zone: String(p.z),
      population: p.p as number | null,
      lon: c[0],
      lat: c[1],
    };
    const previous = blocks.get(id);
    if (previous) {
      duplicates++;
      if (
        previous.population !== row.population ||
        previous.lat !== row.lat ||
        previous.lon !== row.lon
      ) {
        previous.population = null;
        conflicts++;
      }
    } else blocks.set(id, row);
  }
  return { version, blocks: [...blocks.values()], duplicates, conflicts };
}
export function studyNetwork(network: Network, drafts: RouteDraft[]): Network {
  const ids = new Set(network.routes.map((r) => r.id));
  const routes = drafts.flatMap((raw) => {
    const d = parseDraft(raw);
    const id = `draft:${d.id}`;
    if (ids.has(id)) return [];
    ids.add(id);
    return [
      {
        id,
        code: d.code || 'BORR',
        name: d.name || 'Borrador',
        color: d.color,
        operator: d.service?.operator || 'Pendiente',
        service: d.service,
        status: 'proposal',
        source: d.source || 'Borrador',
        verified_at: null,
        geometry: draftGeometry(d, 'outbound'),
        inbound_geometry: draftGeometry(d, 'inbound'),
        stops: [],
        inbound: [],
        fare: d.service?.fare || 0,
        start: d.service?.start || '',
        end: d.service?.end || '',
        frequency: [d.service?.headway || 0, d.service?.headway || 0],
        observation_period: null,
        fleet_coverage: null,
      },
    ];
  });
  return { stops: network.stops, routes: [...network.routes, ...routes] };
}
export function studyForRoute(network: Network, routeId: string): Study {
  const r = network.routes.find((r) => r.id === routeId),
    study = defaultStudy(routeId);
  if (r?.frequency[0])
    study.baseHeadway = (r.frequency[0] + r.frequency[1]) / 2;
  if (r?.service?.speedKmh) study.speedKmh = r.service.speedKmh;
  study.fare = r?.fare || 0;
  return study;
}
