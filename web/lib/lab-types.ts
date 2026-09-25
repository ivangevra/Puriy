import type { Point, Network } from './mobility';
import type { RouteDraft } from './route-drafts';

export type Evidence = 'documental' | 'observed' | 'assumption';
export type Validation = 'pending' | 'reviewed' | 'conflict';
export type PlaceCategory =
  | 'commerce'
  | 'health'
  | 'education'
  | 'connection'
  | 'public';
export type LabPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  groupId: string;
  point: Point | null;
  source: string;
  page: number | null;
  evidence: Evidence;
  validation: Validation;
  notes: string;
  open: string | null;
  close: string | null;
  days: number[];
};
/** A route-wide scenario assumption, never an inferred street closure. */
export type LabEvent = {
  id: string;
  name: string;
  source: string;
  page: number | null;
  days: number[];
  start: string | null;
  end: string | null;
  routeId: string | null;
  extraCycleMinutes: number | null;
  suspended: boolean;
  evidence: Evidence;
  validation: Validation;
  notes: string;
};
export type Boarding = Point & {
  id: string;
  name: string;
  routeId: string;
  direction: 0 | 1;
  source: string;
};
export type LabObservation = {
  id: string;
  routeId: string;
  date: string;
  phase: 'before' | 'after';
  minutes: number;
  vehicles: number;
  boardings: number;
  cycleMinutes: number | null;
  headways: number[];
  source: string;
  notes: string;
};
export type Study = {
  name: string;
  routeId: string;
  alternativeId: string;
  day: number;
  hour: string;
  fleet: number;
  reserve: number;
  capacity: number;
  speedKmh: number;
  layoverMinutes: number;
  baseHeadway: number;
  proposedHeadway: number;
  walkMeters: number;
  walkSpeedKmh: number;
  thresholdMinutes: number;
  peakLoadPerHour: number | null;
  costPerKm: number;
  costPerHour: number;
  fare: number;
  removedStops: string[];
  source: string;
  applyEvents: boolean;
  accessMode: 'radius' | 'paths';
};
/** Explicit pedestrian connections. No automatic straight-line fallback in paths mode. */
export type WalkLink = { from: string; to: string; meters: number };
export type WalkingData = {
  source: string;
  date: string;
  pointFingerprint: string;
  links: WalkLink[];
};
export type CensusBlock = Point & {
  id: string;
  district: string;
  zone: string;
  population: number | null;
};
export type CensusData = {
  version: string;
  blocks: CensusBlock[];
  duplicates: number;
  conflicts: number;
};
export type FleetResult = {
  km: number;
  cycle: number;
  requestedHeadway: number;
  effectiveHeadway: number;
  vehiclesRequired: number;
  vehiclesUsed: number;
  available: number;
  targetFeasible: boolean;
  capacityPerHour: number;
  overload: boolean | null;
  costPerHour: number;
  vehicleKmPerHour: number;
};
export type BlockResult = {
  id: string;
  district: string;
  zone: string;
  population: number | null;
  baseAccess: boolean;
  proposedAccess: boolean;
  baseMinutes: number | null;
  proposedMinutes: number | null;
};
export type CoverageResult = {
  population: number;
  covered: number;
  reachable: number;
  unknownBlocks: number;
  median: number | null;
  p90: number | null;
  disconnected: number;
  evaluatedPlaces: number;
};
export type Evaluation = {
  version: string;
  calculatedAt: string;
  fingerprint: string;
  study: Study;
  base: CoverageResult;
  proposed: CoverageResult;
  baseFleet: FleetResult;
  proposedFleet: FleetResult;
  gained: number;
  lost: number;
  improved: number;
  worsened: number;
  zones: {
    name: string;
    known: number;
    base: number;
    proposed: number;
    lost: number;
  }[];
  blocks: BlockResult[];
  warnings: string[];
  appliedEvents: string[];
  hotspots: (CensusBlock & { population: number })[];
};
export type SavedStudy = {
  id: string;
  name: string;
  createdAt: string;
  status: 'draft' | 'review' | 'pilot' | 'retired';
  study: Study;
  result: Omit<Evaluation, 'blocks' | 'hotspots'>;
};
export type LabState = {
  version: 1;
  revision: number;
  places: LabPlace[];
  events: LabEvent[];
  boarding: Boarding[];
  observations: LabObservation[];
  studies: SavedStudy[];
  walking: WalkingData | null;
  candidates?: RouteDraft[];
};
export type EvaluationInput = {
  network: Network;
  census: CensusData;
  state: LabState;
  study: Study;
};
export const LAB_KEY = 'juliaca-mobility-lab-v1';
export const ENGINE_VERSION = 'access-fleet-1.0.0';
export const dayNames = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
export const categoryNames: Record<PlaceCategory, string> = {
  commerce: 'Comercio',
  health: 'Salud',
  education: 'Educación',
  connection: 'Conexión',
  public: 'Espacio público',
};
export const defaultStudy = (routeId = ''): Study => ({
  name: 'Comparación del piloto',
  routeId,
  alternativeId: routeId,
  day: 1,
  hour: '07:00',
  fleet: 9,
  reserve: 0,
  capacity: 16,
  speedKmh: 15,
  layoverMinutes: 10,
  baseHeadway: 10,
  proposedHeadway: 8,
  walkMeters: 400,
  walkSpeedKmh: 4,
  thresholdMinutes: 45,
  peakLoadPerHour: null,
  costPerKm: 0,
  costPerHour: 0,
  fare: 0,
  removedStops: [],
  source: 'Supuestos de trabajo: reemplazar con observaciones del operador',
  applyEvents: true,
  accessMode: 'radius',
});
