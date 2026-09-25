// Cálculo de tiempos de semáforos al estilo de Synchro: modelo macroscópico y
// determinístico (pelotones de vehículos, no vehículo por vehículo).
//
// 1. Entradas por acceso: volumen, factor de hora punta (PHF), carriles,
//    ancho, pesados, pendiente, giros, estacionamiento y micros que paran en
//    la esquina. Flujo de saturación HCM:
//    s = 1900 × N × f_ancho × f_pesados × f_pendiente × f_estac. × f_bus ×
//        f_zona × f_der. × f_izq.; y = v / s.
// 2. Repartos: g = (C − L) × y / Σy (grado de saturación parejo), con verdes
//    mínimos peatonales y amarillo/todo rojo cinemáticos (ITE); luego un
//    ajuste local segundo a segundo que baja la demora sin llevar ningún
//    movimiento por encima de v/c 0,90.
// 3. Ciclo: barrido de ciclos (por ejemplo 50–120 s cada 5 s). Ciclo natural
//    de cada cruce = el menor con v/c ≤ 0,90 en todos sus movimientos.
// 4. Desfases: la calle principal se simula como perfil de flujo cíclico por
//    segundo; entre cruces el pelotón se dispersa (modelo de Robertson) y se
//    busca el desfase que menos penaliza en ambos sentidos.
// 5. Índice de desempeño: PI = (demora + K1 × detenciones) / 3600 + K2 × cola
//    que excede el espacio disponible, en veh·h/h. Gana el plan de menor PI.
//
// No modela giros protegidos con doble anillo NEMA, adelanto o retraso de
// giros ni medio ciclo: los cruces que evalúa son de dos fases.

export type Approach = {
  /** Vehículos por hora en la hora de análisis. */
  volume: number;
  lanes: number;
  /** Ancho de carril en metros. */
  laneWidth: number;
  /** Proporción de vehículos pesados (micros, combis, camiones), 0–1. */
  heavy: number;
  /** Pendiente en %. */
  grade: number;
  /** Proporción que gira a la izquierda y a la derecha, 0–1. */
  left: number;
  right: number;
  /** Maniobras de estacionamiento por hora junto al cruce; null si no se estaciona. */
  parking: number | null;
  /** Micros por hora que se detienen a menos de 75 m de la línea de pare. */
  busStops: number;
  /** Metros disponibles para la cola antes de bloquear el cruce anterior. */
  storage: number;
};

export type Site = {
  name: string;
  /** Metros a lo largo del corredor. */
  at: number;
  /** Calle principal en el sentido del recorrido y en el contrario. */
  ida: Approach;
  vuelta: Approach;
  /** Los dos accesos de la calle transversal. */
  cross: Approach;
  crossOpp: Approach;
  /** Ancho de la calle principal y de la transversal (cruce peatonal y despeje). */
  mainWidth: number;
  crossWidth: number;
  /** Velocidad de aproximación para calcular el amarillo. */
  mainKmh: number;
  crossKmh: number;
};

export type Settings = {
  phf: number;
  baseSat: number;
  /** Factor por tipo de zona: 0,90 en centro comercial (HCM). */
  area: number;
  /** Velocidad de caminata para el verde peatonal, m/s. */
  walkSpeed: number;
  cycles: number[];
  xTarget: number;
  /** Velocidad de los pelotones entre cruces. */
  platoonKmh: number;
  /** Segundos de demora equivalentes a una detención. */
  k1: number;
  /** veh·h/h de castigo por cada vehículo de cola que no cabe. */
  k2: number;
};

export const DEFAULT_SETTINGS: Settings = {
  phf: 0.9,
  baseSat: 1900,
  area: 0.9,
  walkSpeed: 1.0,
  cycles: Array.from({ length: 15 }, (_, i) => 50 + i * 5),
  xTarget: 0.9,
  platoonKmh: 25,
  k1: 10,
  k2: 1,
};

export type SitePlan = {
  green: number;
  yellow: number;
  allRed: number;
  crossGreen: number;
  crossYellow: number;
  crossAllRed: number;
  /** Segundo del reloj maestro en que empieza el verde de la calle principal. */
  offset: number;
};
export type Plan = { cycle: number; sites: SitePlan[] };

export type SiteResult = {
  name: string;
  /** Grado de saturación v/c de la principal y de la transversal (peor acceso). */
  xMain: number;
  xCross: number;
  /** Demora media en s/veh. */
  delayMain: number;
  delayCross: number;
  /** Cola al percentil 95 en metros y si excede el espacio disponible. */
  queueMain: number;
  queueCross: number;
  blocked: boolean;
};
export type Evaluation = {
  pi: number;
  /** Demora media ponderada (s/veh) y detenciones por hora de toda la red. */
  delay: number;
  stops: number;
  sites: SiteResult[];
};

const VEH_M = 7; // metros por vehículo en cola
const flow = (a: Approach, s: Settings) => a.volume / s.phf;

/** Equivalente de giro a la izquierda permitido según el flujo opuesto por
 * carril (método de planeamiento del HCM 2000). */
const leftEquivalent = (opposing: number) =>
  opposing < 200 ? 1.1 : opposing < 600 ? 2 : opposing < 800 ? 3 : opposing < 1000 ? 4 : 5;

/** Flujo de saturación ajustado (veh/h) según HCM. `opposing` es el flujo
 * por carril del acceso de enfrente, que los giros a la izquierda esperan. */
export function saturation(a: Approach, s: Settings = DEFAULT_SETTINGS, opposing = 0) {
  const N = a.lanes;
  const fw = 1 + (a.laneWidth - 3.6) / 9;
  const fhv = 1 / (1 + a.heavy); // equivalente de pesados E_T = 2
  const fg = 1 - a.grade / 200;
  const fp = a.parking === null ? 1 : Math.max(0.05, (N - 0.1 - (18 * a.parking) / 3600) / N);
  const fbb = Math.max(0.05, (N - (14.4 * a.busStops) / 3600) / N);
  const frt = 1 - 0.15 * a.right;
  const flt = 1 / (1 + a.left * (leftEquivalent(opposing) - 1));
  return s.baseSat * N * fw * fhv * fg * fp * fbb * s.area * frt * flt;
}

/** Amarillo y todo rojo (ITE), en segundos enteros. `width` es la calle que
 * el vehículo debe despejar. */
export function clearance(kmh: number, width: number, grade = 0) {
  const v = kmh / 3.6;
  return {
    yellow: Math.max(3, Math.ceil(1 + v / (2 * 3.05 + 2 * 9.81 * (grade / 100)))),
    allRed: Math.max(1, Math.ceil((width + 6) / v)),
  };
}

/** Verde mínimo para que un peatón cruce: 7 s de paso + ancho ÷ velocidad
 * de caminata (1,0 m/s por defecto, pensando en personas mayores). */
export const pedestrianGreen = (width: number, walkSpeed = 1) => Math.ceil(7 + width / walkSpeed);

/** Demora HCM de un movimiento aislado (uniforme + incremental), s/veh. */
export function hcmDelay(v: number, sat: number, g: number, C: number) {
  const cap = (sat * g) / C;
  const X = v / cap;
  const T = 0.25;
  const d1 = (0.5 * C * (1 - g / C) ** 2) / (1 - Math.min(1, X) * (g / C));
  const d2 = 900 * T * (X - 1 + Math.sqrt((X - 1) ** 2 + (8 * 0.5 * X) / (cap * T)));
  // Fracción de vehículos que se detiene y cola máxima (fin del rojo + descarga).
  const y = Math.min(0.99, v / sat);
  const stopRate = X >= 1 ? 1 : Math.min(1, (1 - g / C) / (1 - y));
  const queue = (v * (C - g)) / 3600 / (1 - y);
  return { X, d1, d2, delay: d1 + d2, stopRate, queue };
}

const q95 = (q: number) => q + 1.65 * Math.sqrt(Math.max(0, q));

/** Los accesos de cada fase con su flujo y su saturación; el de enfrente
 * da el flujo opuesto para los giros a la izquierda. */
function movements(site: Site, s: Settings) {
  const pair = (a: Approach, b: Approach) =>
    [
      [a, b],
      [b, a],
    ].map(([x, o]) => ({ a: x, v: flow(x, s), sat: saturation(x, s, flow(o, s) / o.lanes) }));
  return { main: pair(site.ida, site.vuelta), cross: pair(site.cross, site.crossOpp) };
}

function phases(site: Site, s: Settings) {
  const mainClear = clearance(site.mainKmh, site.crossWidth);
  const crossClear = clearance(site.crossKmh, site.mainWidth);
  const m = movements(site, s);
  const yMain = Math.max(...m.main.map((x) => x.v / x.sat));
  const yCross = Math.max(...m.cross.map((x) => x.v / x.sat));
  return {
    m,
    mainClear,
    crossClear,
    yMain,
    yCross,
    // Tiempo perdido por fase: 2 s de arranque + amarillo + todo rojo − 2 s
    // de amarillo aprovechado = amarillo + todo rojo.
    lost: mainClear.yellow + mainClear.allRed + crossClear.yellow + crossClear.allRed,
    // Los peatones cruzan la transversal durante el verde principal y la
    // principal durante el verde transversal.
    minMain: Math.max(10, pedestrianGreen(site.crossWidth, s.walkSpeed)),
    minCross: Math.max(8, pedestrianGreen(site.mainWidth, s.walkSpeed)),
  };
}

/** Costo aislado de un reparto (demora + detenciones, veh·s/h) y su peor v/c. */
function isolated(p: ReturnType<typeof phases>, s: Settings, C: number, g: number, gc: number) {
  let cost = 0,
    x = 0;
  for (const [list, green] of [
    [p.m.main, g],
    [p.m.cross, gc],
  ] as const)
    for (const { v, sat } of list) {
      if (v <= 0) continue;
      const h = hcmDelay(v, sat, green, C);
      cost += v * (h.delay + s.k1 * h.stopRate);
      x = Math.max(x, h.X);
    }
  return { cost, x };
}

/** Reparto de verdes para un ciclo, o null si no caben los mínimos. */
export function splitsFor(site: Site, C: number, s: Settings = DEFAULT_SETTINGS) {
  const p = phases(site, s);
  const avail = C - p.lost;
  if (avail < p.minMain + p.minCross) return null;
  const Y = p.yMain + p.yCross || 1;
  let g = Math.round(avail * (p.yMain / Y));
  g = Math.min(avail - p.minCross, Math.max(p.minMain, g));
  // Ajuste local: mueve el verde de a 1 s mientras baje la demora, sin
  // llevar ningún movimiento sobre v/c 0,90 (o sobre el del reparto parejo,
  // si ya lo superaba): no se castiga a una calle para acortar la otra.
  const xLimit = Math.max(s.xTarget, isolated(p, s, C, g, avail - g).x);
  for (let improved = true; improved; ) {
    improved = false;
    for (const step of [1, -1]) {
      const next = g + step;
      if (next < p.minMain || avail - next < p.minCross) continue;
      const cand = isolated(p, s, C, next, avail - next);
      if (cand.x <= xLimit && cand.cost < isolated(p, s, C, g, avail - g).cost) {
        g = next;
        improved = true;
      }
    }
  }
  return {
    green: g,
    ...p.mainClear,
    crossGreen: avail - g,
    crossYellow: p.crossClear.yellow,
    crossAllRed: p.crossClear.allRed,
  };
}

/** Plan con ciclo y reparto dados (por ejemplo, el de hoy o una onda verde). */
export function fixedPlan(sites: Site[], cycle: number, mainShare: number, offsets: number[], s = DEFAULT_SETTINGS): Plan {
  return {
    cycle,
    sites: sites.map((site, i) => {
      const p = phases(site, s);
      const green = Math.round((cycle - p.lost) * mainShare);
      return {
        green,
        ...p.mainClear,
        crossGreen: cycle - p.lost - green,
        crossYellow: p.crossClear.yellow,
        crossAllRed: p.crossClear.allRed,
        offset: ((Math.round(offsets[i] ?? 0) % cycle) + cycle) % cycle,
      };
    }),
  };
}

/** Estado de la luz de la calle principal en el segundo `time` del reloj maestro. */
export function signalState(plan: Plan, i: number, time: number) {
  const p = plan.sites[i];
  const t = (((time - p.offset) % plan.cycle) + plan.cycle) % plan.cycle;
  if (t < p.green) return { phase: 'green' as const, remaining: p.green - t };
  if (t < p.green + p.yellow) return { phase: 'amber' as const, remaining: p.green + p.yellow - t };
  return { phase: 'red' as const, remaining: plan.cycle - t };
}

/** Atiende un perfil cíclico de llegadas (veh/s) con el verde dado. */
function serve(arrivals: Float64Array, C: number, start: number, g: number, sat: number) {
  const cap = sat / 3600;
  const out = new Float64Array(C);
  let q = 0,
    delay = 0,
    stops = 0,
    maxQ = 0;
  // Tres ciclos de calentamiento; se mide el cuarto.
  for (let k = 0; k < 4; k++) {
    delay = stops = maxQ = 0;
    for (let t = 0; t < C; t++) {
      const green = (((t - start) % C) + C) % C < g;
      if (!green || q > 1e-6) stops += arrivals[t];
      q += arrivals[t];
      maxQ = Math.max(maxQ, q);
      const served = green ? Math.min(q, cap) : 0;
      q -= served;
      out[t] = served;
      delay += q;
    }
  }
  return { out, delay, stops, maxQ };
}

/** Dispersión de pelotones de Robertson entre dos cruces. */
function disperse(dep: Float64Array, C: number, travel: number) {
  const lag = Math.round(0.8 * travel);
  const F = 1 / (1 + 0.35 * 0.8 * travel);
  const out = new Float64Array(C);
  let prev = dep.reduce((a, b) => a + b, 0) / C;
  for (let pass = 0; pass < 3; pass++)
    for (let t = 0; t < C; t++) {
      prev = F * dep[(((t - lag) % C) + C) % C] + (1 - F) * prev;
      out[t] = prev;
    }
  return out;
}

/** Evalúa un plan en toda la red y devuelve su índice de desempeño. */
export function evaluate(sites: Site[], plan: Plan, s: Settings = DEFAULT_SETTINGS): Evaluation {
  const C = plan.cycle;
  const speed = s.platoonKmh / 3.6;
  let vehDelay = 0,
    vehicles = 0,
    stopsH = 0,
    excess = 0;
  const rows: SiteResult[] = sites.map((site) => ({
    name: site.name,
    xMain: 0,
    xCross: 0,
    delayMain: 0,
    delayCross: 0,
    queueMain: 0,
    queueCross: 0,
    blocked: false,
  }));
  const mainVeh = sites.map(() => 0);
  const moves = sites.map((site) => movements(site, s));
  for (const [k, dir] of (['ida', 'vuelta'] as const).entries()) {
    const order = sites.map((_, i) => i);
    if (dir === 'vuelta') order.reverse();
    let dep: Float64Array | null = null,
      prevAt = 0;
    for (const i of order) {
      const site = sites[i],
        a = site[dir],
        p = plan.sites[i];
      const v = flow(a, s);
      if (v <= 0) {
        dep = null;
        continue;
      }
      const perCycle = (v * C) / 3600;
      let arrivals: Float64Array;
      if (dep) {
        arrivals = disperse(dep, C, Math.abs(site.at - prevAt) / speed);
        const sum = arrivals.reduce((x, y) => x + y, 0) || 1;
        arrivals = arrivals.map((x) => (x * perCycle) / sum);
      } else arrivals = new Float64Array(C).fill(v / 3600);
      const sat = moves[i].main[k].sat;
      const r = serve(arrivals, C, p.offset, p.green, sat);
      const h = hcmDelay(v, sat, p.green, C);
      const d = r.delay / perCycle + h.d2;
      const queue = (q95(r.maxQ) * VEH_M) / a.lanes;
      const storage = dep ? Math.abs(site.at - prevAt) : a.storage;
      const row = rows[i];
      row.xMain = Math.max(row.xMain, h.X);
      row.delayMain += v * d;
      mainVeh[i] += v;
      row.queueMain = Math.max(row.queueMain, queue);
      if (queue > storage) {
        row.blocked = true;
        excess += ((queue - storage) / VEH_M) * a.lanes;
      }
      vehDelay += v * d;
      vehicles += v;
      stopsH += (r.stops * 3600) / C;
      dep = r.out;
      prevAt = site.at;
    }
  }
  sites.forEach((site, i) => {
    const row = rows[i],
      p = plan.sites[i];
    row.delayMain = mainVeh[i] ? row.delayMain / mainVeh[i] : 0;
    let crossVeh = 0;
    for (const { a, v, sat } of moves[i].cross) {
      if (v <= 0) continue;
      const h = hcmDelay(v, sat, p.crossGreen, C);
      const queue = (q95(h.queue) * VEH_M) / a.lanes;
      row.xCross = Math.max(row.xCross, h.X);
      row.delayCross += v * h.delay;
      crossVeh += v;
      row.queueCross = Math.max(row.queueCross, queue);
      if (queue > a.storage) {
        row.blocked = true;
        excess += ((queue - a.storage) / VEH_M) * a.lanes;
      }
      vehDelay += v * h.delay;
      vehicles += v;
      stopsH += v * h.stopRate;
    }
    row.delayCross = crossVeh ? row.delayCross / crossVeh : 0;
  });
  return {
    pi: (vehDelay + s.k1 * stopsH) / 3600 + s.k2 * excess,
    delay: vehicles ? vehDelay / vehicles : 0,
    stops: stopsH,
    sites: rows,
  };
}

/** Ciclo natural de un cruce: el menor del barrido en que cada fase recibe el
 * verde que necesita para v/c ≤ xTarget (g = y × C / xTarget) sin bajar de su
 * mínimo peatonal. Sin mínimos equivale a C = L × Xc / (Xc − Σy). */
export function naturalCycle(site: Site, s: Settings = DEFAULT_SETTINGS) {
  const p = phases(site, s);
  return (
    s.cycles.find(
      (C) =>
        C - p.lost >=
        Math.max(p.minMain, (p.yMain * C) / s.xTarget) + Math.max(p.minCross, (p.yCross * C) / s.xTarget),
    ) ?? null
  );
}

/** Barrido de ciclos: repartos, desfases y PI para cada uno; devuelve el
 * plan elegido y la curva completa para explicarla, o null si en ningún ciclo
 * caben los verdes mínimos. Un ciclo que deja algún movimiento sobre su
 * capacidad (v/c > 1) solo se elige si ningún otro lo evita. La curva del PI
 * suele ser plana cerca del mínimo: entre los ciclos a menos de `tie` del
 * mejor PI se elige el más corto, que acorta la espera de peatones y colas. */
export function optimize(sites: Site[], s: Settings = DEFAULT_SETTINGS, tie = 0.03) {
  const scan: { cycle: number; pi: number | null; over: boolean }[] = [];
  const options: { plan: Plan; result: Evaluation; over: boolean }[] = [];
  for (const C of s.cycles) {
    const splits = sites.map((site) => splitsFor(site, C, s));
    if (splits.some((sp) => !sp)) {
      scan.push({ cycle: C, pi: null, over: false });
      continue;
    }
    const plan: Plan = { cycle: C, sites: splits.map((sp) => ({ ...sp!, offset: 0 })) };
    let current = evaluate(sites, plan, s);
    // El primer cruce es la referencia; los demás prueban cada segundo del ciclo.
    for (let pass = 0; pass < 2; pass++)
      for (let j = 1; j < sites.length; j++) {
        let bestOffset = plan.sites[j].offset;
        for (let o = 0; o < C; o++) {
          plan.sites[j].offset = o;
          const r = evaluate(sites, plan, s);
          if (r.pi < current.pi - 1e-9) {
            current = r;
            bestOffset = o;
          }
        }
        plan.sites[j].offset = bestOffset;
      }
    const over = current.sites.some((x) => Math.max(x.xMain, x.xCross) > 1);
    scan.push({ cycle: C, pi: current.pi, over });
    options.push({ plan, result: current, over });
  }
  const pool = options.some((o) => !o.over) ? options.filter((o) => !o.over) : options;
  if (!pool.length) return null;
  const min = Math.min(...pool.map((o) => o.result.pi));
  const best = pool.find((o) => o.result.pi <= min * (1 + tie))!;
  return { plan: best.plan, result: best.result, scan, natural: sites.map((site) => naturalCycle(site, s)) };
}
