import { distance, type Point, type Network, type Route } from './mobility';
import { validateLab, validateStudy } from './lab-data';
import {
  ENGINE_VERSION,
  type Study,
  type FleetResult,
  type EvaluationInput,
  type Evaluation,
  type CoverageResult,
  type CensusBlock,
  type LabState,
} from './lab-types';

const pos = (p: number[]): Point => ({ lon: p[0], lat: p[1] });
export function geometryKm(coords: number[][]) {
  return (
    coords
      .slice(1)
      .reduce((sum, p, i) => sum + distance(pos(coords[i]), pos(p)), 0) / 1000
  );
}
/** Chain distance is kept independently in each direction. */
export function projectOnRoute(coords: number[][], p: Point) {
  let chain = 0,
    best = { meters: Infinity, along: 0, index: 0, point: p };
  const cos = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1],
      b = coords[i],
      dx = (b[0] - a[0]) * cos,
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.lon - a[0]) * cos * dx + (p.lat - a[1]) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const q = { lon: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) };
    const length = distance(pos(a), pos(b)),
      meters = distance(p, q);
    if (meters < best.meters)
      best = { meters, along: chain + t * length, index: i - 1, point: q };
    chain += length;
  }
  return best;
}
export function operatingFleet(
  km: number,
  study: Study,
  requestedHeadway: number,
  extraMinutes = 0,
  suspended = false,
): FleetResult {
  const available = study.fleet - study.reserve;
  // Average commercial speed already includes intermediate stops. Only terminal regulation is added.
  const cycle =
    (km / study.speedKmh) * 60 + study.layoverMinutes + extraMinutes;
  const minimum = cycle / available;
  const effectiveHeadway = Math.max(requestedHeadway, minimum);
  const vehiclesRequired = Math.ceil(cycle / requestedHeadway - 1e-9);
  const vehiclesUsed = suspended
    ? 0
    : Math.min(available, Math.ceil(cycle / effectiveHeadway - 1e-9));
  const capacityPerHour = suspended
    ? 0
    : (60 / effectiveHeadway) * study.capacity;
  const vehicleKmPerHour = suspended ? 0 : (km * 60) / effectiveHeadway;
  return {
    km,
    cycle,
    requestedHeadway,
    effectiveHeadway,
    vehiclesRequired,
    vehiclesUsed,
    available,
    targetFeasible: !suspended && vehiclesRequired <= available,
    capacityPerHour,
    overload:
      study.peakLoadPerHour === null
        ? null
        : study.peakLoadPerHour > capacityPerHour,
    vehicleKmPerHour,
    costPerHour:
      vehicleKmPerHour * study.costPerKm + vehiclesUsed * study.costPerHour,
  };
}
type AccessStop = Point & {
  id: string;
  name: string;
  along: number;
  direction: 0 | 1;
};
export function routeBoarding(
  network: Network,
  state: LabState,
  route: Route,
): AccessStop[][] {
  return ([0, 1] as const).map((direction) => {
    const coords = direction ? route.inbound_geometry : route.geometry;
    const ids = direction ? route.inbound : route.stops;
    const existing = ids.map((id) => {
      const stop = network.stops.find((s) => s.id === id);
      if (!stop) throw new Error(`El abordaje ${id} no existe en la red.`);
      return stop;
    });
    const additional = state.boarding.filter(
      (s) => s.routeId === route.id && s.direction === direction,
    );
    const projected = [...existing, ...additional].map((s) => {
      const p = projectOnRoute(coords, s);
      if (p.meters > 120)
        throw new Error(
          `«${s.name}» queda a más de 120 m del trazado de ${route.code}. Corrige el abordaje antes de comparar.`,
        );
      return { ...s, along: p.along, direction };
    });
    // Existing line order is authoritative. Reject mismatched direction instead of silently reversing it.
    if (
      projected
        .slice(0, existing.length)
        .some((s, i, a) => i > 0 && s.along < a[i - 1].along - 20)
    )
      throw new Error(
        `Los abordajes de ${route.code} no siguen el sentido ${direction ? 'vuelta' : 'ida'}. Revisa el trazado y el orden.`,
      );
    return projected.sort((a, b) => a.along - b.along);
  });
}
function weightedQuantile(
  items: { minutes: number; weight: number }[],
  q: number,
) {
  const sorted = items
    .filter((i) => i.weight > 0)
    .sort((a, b) => a.minutes - b.minutes);
  const target = sorted.reduce((n, i) => n + i.weight, 0) * q;
  if (!sorted.length) return null;
  let sum = 0;
  for (const item of sorted) {
    sum += item.weight;
    if (sum >= target) return item.minutes;
  }
  return sorted.at(-1)!.minutes;
}
/** Reproducibility identifier, not a cryptographic signature. */
export function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function eventEffect(
  state: LabState,
  study: Study,
  routeId: string,
  inheritedRouteId?: string,
) {
  const events = study.applyEvents
    ? state.events.filter(
        (e) =>
          e.validation === 'reviewed' &&
          (e.routeId === routeId || e.routeId === inheritedRouteId) &&
          e.days.includes(study.day) &&
          e.start !== null &&
          e.end !== null &&
          e.start <= study.hour &&
          study.hour < e.end,
      )
    : [];
  return {
    extra: events.reduce((n, e) => n + (e.extraCycleMinutes || 0), 0),
    suspended: events.some((e) => e.suspended),
    names: events.map(
      (e) =>
        `${e.name} (${e.evidence === 'assumption' ? 'supuesto' : 'observado/documentado'})`,
    ),
  };
}
export function walkingPointFingerprint(
  input: Pick<EvaluationInput, 'network' | 'census' | 'state'>,
) {
  return fingerprint(
    [
      ...input.census.blocks.map((b) => [`block:${b.id}`, b.lon, b.lat]),
      ...[...input.network.stops, ...input.state.boarding].map((s) => [
        `stop:${s.id}`,
        s.lon,
        s.lat,
      ]),
      ...input.state.places
        .filter((p) => p.point)
        .map((p) => [`place:${p.id}`, p.point!.lon, p.point!.lat]),
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
export function evaluateStudy(
  input: EvaluationInput,
  progress: (n: number) => void = () => {},
): Evaluation {
  const { network, census } = input,
    study = validateStudy(input.study),
    state = validateLab(input.state);
  if (study.accessMode === 'paths' && !state.walking)
    throw new Error(
      'Importa conexiones peatonales con fuente antes de calcular acceso por caminos.',
    );
  if (
    study.accessMode === 'paths' &&
    state.walking?.pointFingerprint !== walkingPointFingerprint(input)
  )
    throw new Error(
      'Las ubicaciones cambiaron desde el cálculo peatonal. Exporta los puntos actuales y actualiza sus conexiones.',
    );
  if (state.boarding.some((b) => network.stops.some((s) => s.id === b.id)))
    throw new Error(
      'Un abordaje propuesto repite el identificador de un punto de la red.',
    );
  const baseRoute = network.routes.find((r) => r.id === study.routeId),
    proposedRoute = network.routes.find((r) => r.id === study.alternativeId);
  if (!baseRoute || !proposedRoute)
    throw new Error(
      'Selecciona un recorrido base y una alternativa que existan.',
    );
  for (const r of [baseRoute, proposedRoute]) {
    if (r.geometry.length < 2 || r.inbound_geometry.length < 2)
      throw new Error(
        `Completa ida y vuelta de ${r.code} en el editor antes de evaluar flota y ciclos.`,
      );
    if (geometryKm(r.geometry) + geometryKm(r.inbound_geometry) < 0.05)
      throw new Error('El recorrido tiene longitud insuficiente.');
  }
  const baseStops = routeBoarding(network, state, baseRoute),
    allProposed = routeBoarding(network, state, proposedRoute);
  const proposedIds = new Set(allProposed.flat().map((s) => s.id));
  if (study.removedStops.some((id) => !proposedIds.has(id)))
    throw new Error(
      'Hay abordajes excluidos que ya no pertenecen a la alternativa.',
    );
  if (
    allProposed.some(
      (stops) =>
        stops.length &&
        (study.removedStops.includes(stops[0].id) ||
          study.removedStops.includes(stops.at(-1)!.id)),
    )
  )
    throw new Error('Conserva el primer y último abordaje de cada sentido.');
  const proposedStops = allProposed.map((stops) =>
    stops.filter((s) => !study.removedStops.includes(s.id)),
  );
  if ([...baseStops, ...proposedStops].some((stops) => stops.length < 2))
    throw new Error(
      'Registra al menos dos abordajes explícitos por sentido para ambos recorridos. Los vértices del trazado no se convierten en paraderos.',
    );
  const baseEvent = eventEffect(state, study, baseRoute.id),
    newEvent = eventEffect(state, study, proposedRoute.id, baseRoute.id);
  const baseFleet = operatingFleet(
    geometryKm(baseRoute.geometry) + geometryKm(baseRoute.inbound_geometry),
    study,
    study.baseHeadway,
    baseEvent.extra,
    baseEvent.suspended,
  );
  const proposedFleet = operatingFleet(
    geometryKm(proposedRoute.geometry) +
      geometryKm(proposedRoute.inbound_geometry),
    study,
    study.proposedHeadway,
    newEvent.extra,
    newEvent.suspended,
  );
  const paths = new Map(
    state.walking?.links.map((l) => [`${l.from}\n${l.to}`, l.meters]) || [],
  );
  const walk = (from: Point & { key: string }, to: Point & { key: string }) =>
    study.accessMode === 'paths'
      ? (paths.get(`${from.key}\n${to.key}`) ?? Infinity)
      : distance(from, to);
  const places = state.places.filter(
    (p) =>
      p.point &&
      p.validation === 'reviewed' &&
      p.open !== null &&
      p.close !== null &&
      p.days.includes(study.day) &&
      p.open <= study.hour &&
      study.hour < p.close,
  );
  const groups = new Set(places.map((p) => p.groupId));
  const warnings = [
    'Las afectaciones de la línea base también se aplican a su alternativa. Un desvío no se considera libre de esas afectaciones sin revisión de campo.',
    'Población asociada al Censo 2017; no es demanda de pasajeros ni población actual. Las manzanas sin dato no son cero.',
    study.accessMode === 'radius'
      ? 'Acceso por distancia en línea recta desde centroides: exploración potencial. No resuelve barreras ni cruces.'
      : 'Acceso por conexiones peatonales importadas y dirigidas. Un enlace ausente permanece desconectado; comprueba la cobertura del archivo.',
    'Tiempo al destino seleccionado más cercano: solo caminar o caminata + espera regular + viaje directo + caminata final. Sin transbordos, colas de embarque ni demanda OD.',
    'Velocidad comercial, capacidad, costes y flota son parámetros del escenario. La espera de medio intervalo supone servicio regular y llegadas aleatorias.',
    'La evaluación toma la franja de salida como instantánea; no modela cambios de restricciones durante el recorrido ni primeras/últimas salidas.',
  ];
  if (baseRoute.status === 'demo' || proposedRoute.status === 'demo')
    warnings.push(
      'Hay recorridos de demostración: los resultados no describen la operación real de Juliaca.',
    );
  if (baseRoute.status === 'proposal' || proposedRoute.status === 'proposal')
    warnings.push(
      'El trazado propuesto requiere verificar giros, ancho y transitabilidad para micros; un perfil de automóvil no acredita esas condiciones.',
    );
  if (
    state.events.some(
      (e) =>
        e.validation !== 'reviewed' &&
        (!e.days.length || e.days.includes(study.day)),
    )
  )
    warnings.push(
      'Afectaciones documentales pendientes no se aplican: falta confirmar ruta, ventana o efecto.',
    );
  if (!groups.size)
    warnings.push(
      'Sin destinos revisados y abiertos para esta franja: solo se calcula proximidad a abordajes, no tiempo de acceso a oportunidades.',
    );
  if (!baseFleet.targetFeasible || !proposedFleet.targetFeasible)
    warnings.push(
      'La flota no sostiene alguno de los intervalos solicitados. Se muestra el intervalo mínimo factible, sin crear unidades adicionales.',
    );
  if (baseFleet.overload || proposedFleet.overload)
    warnings.push(
      'La carga crítica introducida supera la oferta de plazas. No se estima espera por sobrecarga; esa alternativa no es operativamente viable con estos parámetros.',
    );
  if (study.peakLoadPerHour === null)
    warnings.push(
      'Sin carga crítica observada: se informa oferta de plazas, pero no puede verificarse la demanda atendida.',
    );
  if (!study.costPerKm && !study.costPerHour)
    warnings.push(
      'Costes sin completar: el valor cero no significa operación gratuita.',
    );
  if (census.duplicates)
    warnings.push(
      `${census.duplicates} registros repetidos deduplicados; ${census.conflicts} discrepancias conservadas sin población.`,
    );
  progress(10);
  function assess(
    stops: AccessStop[][],
    fleet: FleetResult,
    effect: ReturnType<typeof eventEffect>,
    route: Route,
  ) {
    const all = effect.suspended ? [] : stops.flat();
    const km = geometryKm(route.geometry) + geometryKm(route.inbound_geometry);
    // Spread extra cycle delay by distance only as a stated scenario assumption.
    const perMeter =
      60 / (study.speedKmh * 1000) + (km ? effect.extra / (km * 1000) : 0);
    const onward = new Map<AccessStop, { minutes: number; close: number }[]>();
    for (const direction of stops)
      for (let i = 0; i < direction.length; i++) {
        const destinations = new Map<
          string,
          { minutes: number; close: number }
        >();
        for (let j = i + 1; j < direction.length; j++) {
          const arrival = direction[j];
          for (const p of places) {
            const meters = walk(
              { ...arrival, key: `stop:${arrival.id}` },
              { ...p.point!, key: `place:${p.id}` },
            );
            if (meters > study.walkMeters) continue;
            const minutes =
              (arrival.along - direction[i].along) * perMeter +
              meters / ((study.walkSpeedKmh * 1000) / 60);
            const end =
              Number(p.close!.slice(0, 2)) * 60 + Number(p.close!.slice(3));
            if (minutes < (destinations.get(p.id)?.minutes ?? Infinity))
              destinations.set(p.id, { minutes, close: end });
          }
        }
        onward.set(direction[i], [...destinations.values()]);
      }
    const rows = census.blocks.map((block) => {
      let access = false,
        minutes = Infinity;
      const now =
        Number(study.hour.slice(0, 2)) * 60 + Number(study.hour.slice(3));
      for (const p of places) {
        const meters = walk(
          { ...block, key: `block:${block.id}` },
          { ...p.point!, key: `place:${p.id}` },
        );
        const walkMinutes = meters / ((study.walkSpeedKmh * 1000) / 60);
        const close =
          Number(p.close!.slice(0, 2)) * 60 + Number(p.close!.slice(3));
        if (meters <= study.walkMeters && now + walkMinutes < close)
          minutes = Math.min(minutes, walkMinutes);
      }
      for (const s of all) {
        const meters = walk(
          { ...block, key: `block:${block.id}` },
          { ...s, key: `stop:${s.id}` },
        );
        if (meters > study.walkMeters) continue;
        access = true;
        const accessMinutes =
          meters / ((study.walkSpeedKmh * 1000) / 60) +
          fleet.effectiveHeadway / 2;
        for (const d of onward.get(s) || []) {
          const total = accessMinutes + d.minutes;
          if (now + total < d.close) minutes = Math.min(minutes, total);
        }
      }
      return { access, minutes: Number.isFinite(minutes) ? minutes : null };
    });
    const weighted = rows.flatMap((r, i) =>
      r.minutes !== null && census.blocks[i].population !== null
        ? [{ minutes: r.minutes, weight: census.blocks[i].population! }]
        : [],
    );
    const result: CoverageResult = {
      population: 0,
      covered: 0,
      reachable: 0,
      unknownBlocks: 0,
      median: weightedQuantile(weighted, 0.5),
      p90: weightedQuantile(weighted, 0.9),
      disconnected: 0,
      evaluatedPlaces: groups.size,
    };
    census.blocks.forEach((b, i) => {
      if (b.population === null) {
        result.unknownBlocks++;
        return;
      }
      result.population += b.population;
      if (rows[i].access) result.covered += b.population;
      if (
        rows[i].minutes !== null &&
        rows[i].minutes! <= study.thresholdMinutes
      )
        result.reachable += b.population;
      if (rows[i].minutes === null) result.disconnected += b.population;
    });
    return { rows, result };
  }
  const base = assess(baseStops, baseFleet, baseEvent, baseRoute);
  progress(50);
  const proposed = assess(
    proposedStops,
    proposedFleet,
    newEvent,
    proposedRoute,
  );
  progress(85);
  const zones = new Map<string, Evaluation['zones'][number]>();
  let gained = 0,
    lost = 0,
    improved = 0,
    worsened = 0;
  const blocks = census.blocks.map((block, i) => {
    const a = base.rows[i],
      b = proposed.rows[i],
      population = block.population ?? 0;
    const name = `${block.district} · ${block.zone}`;
    const z = zones.get(name) || {
      name,
      known: 0,
      base: 0,
      proposed: 0,
      lost: 0,
    };
    z.known += population;
    if (a.access) z.base += population;
    if (b.access) z.proposed += population;
    if (!a.access && b.access) gained += population;
    if (a.access && !b.access) {
      lost += population;
      z.lost += population;
    }
    if (
      b.minutes !== null &&
      (a.minutes === null || b.minutes < a.minutes - 0.1)
    )
      improved += population;
    if (
      a.minutes !== null &&
      (b.minutes === null || b.minutes > a.minutes + 0.1)
    )
      worsened += population;
    zones.set(name, z);
    return {
      id: block.id,
      district: block.district,
      zone: block.zone,
      population: block.population,
      baseAccess: a.access,
      proposedAccess: b.access,
      baseMinutes: a.minutes,
      proposedMinutes: b.minutes,
    };
  });
  const hotspots: (CensusBlock & { population: number })[] = [];
  for (const block of census.blocks
    .filter((b, i) => b.population !== null && !base.rows[i].access)
    .sort((a, b) => b.population! - a.population!)) {
    if (hotspots.every((p) => distance(p, block) > 500))
      hotspots.push(block as CensusBlock & { population: number });
    if (hotspots.length === 12) break;
  }
  return {
    version: ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    fingerprint: fingerprint({
      version: ENGINE_VERSION,
      network,
      census,
      state: {
        places: state.places,
        events: state.events,
        boarding: state.boarding,
        walking: state.walking,
      },
      study,
    }),
    study,
    base: base.result,
    proposed: proposed.result,
    baseFleet,
    proposedFleet,
    gained,
    lost,
    improved,
    worsened,
    zones: [...zones.values()].sort(
      (a, b) => b.lost - a.lost || b.known - a.known,
    ),
    blocks,
    warnings,
    appliedEvents: [...new Set([...baseEvent.names, ...newEvent.names])],
    hotspots,
  };
}

/** Exhaustive search of a bounded, explicit set of regular headways. No AI demand forecast. */
export function frequencyAlternatives(input: EvaluationInput) {
  const baseline = evaluateStudy(input);
  const f = baseline.proposedFleet,
    study = input.study;
  const candidates = [
    ...new Set([
      Math.max(1, Math.ceil(f.cycle / f.available)),
      study.baseHeadway,
      study.proposedHeadway,
      10,
      12,
      15,
      20,
      30,
    ]),
  ]
    .filter((h) => h <= 180)
    .sort((a, b) => a - b);
  return candidates.map((headway) => {
    const fleet = operatingFleet(
      f.km,
      study,
      headway,
      f.cycle - (f.km / study.speedKmh) * 60 - study.layoverMinutes,
      f.vehiclesUsed === 0,
    );
    return {
      headway,
      ...fleet,
      feasible: fleet.targetFeasible && !fleet.overload,
    };
  });
}
