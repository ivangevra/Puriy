// Prototipo a futuro: control adaptativo de semáforos con simulación
// microscópica (vehículo por vehículo), para comparar con un plan de tiempo
// fijo con la misma demanda.
//
// Escenario: una manzana con cuatro cruces y ocho entradas; calles de doble
// sentido, un carril por sentido, solo movimientos de frente. Cada vehículo
// sigue al de adelante con el modelo IDM (Treiber) y se detiene ante el rojo.
//
// Tres controles con las mismas llegadas:
// - Reglas (sin Jev): cada segundo compara la espera en el acceso con verde y
//   en el acceso con rojo, extiende el verde mientras llegan vehículos y lo
//   corta cuando queda sin uso o la otra calle acumula más.
// - Jev (simulado): imita cómo se usaría Jev, el modelo de decisiones de
//   TypeSafe AI. Cada segundo arma el estado del cruce en JSON y una pregunta
//   `Choice` (extender o cambiar); la respuesta llega 0,4 s después con su
//   probabilidad y, si la confianza es baja, decide la regla. La política que
//   responde es local (no es el modelo real): considera además los vehículos
//   que llegarán en 10 s, la espera más larga y si la cuadra de salida está
//   llena.
// - Tiempo fijo: ciclo de 60 s.
// Capa de seguridad fija para todos: verde mínimo, ámbar, todo rojo y verde
// máximo. Demanda, vehículos y tiempos son ilustrativos.

export type Kind = 'auto' | 'micro' | 'mototaxi' | 'moto';
export const KINDS: Record<Kind, { length: number; width: number; accel: number; speed: number; people: number; color: string; label: string }> = {
  auto: { length: 4.5, width: 1.8, accel: 2.2, speed: 8.3, people: 1.5, color: '#4f8fe8', label: 'Auto' },
  micro: { length: 9, width: 2.4, accel: 1.1, speed: 7.5, people: 15, color: '#e8a33d', label: 'Micro' },
  mototaxi: { length: 3, width: 1.5, accel: 1.8, speed: 6.9, people: 2, color: '#b06fe0', label: 'Mototaxi' },
  moto: { length: 2.2, width: 0.9, accel: 3, speed: 9.7, people: 1.2, color: '#3fbf8a', label: 'Moto' },
};
const MIX: [Kind, number][] = [
  ['auto', 0.5],
  ['mototaxi', 0.22],
  ['micro', 0.12],
  ['moto', 0.16],
];

/** Metros entre cruces y largo de cada brazo exterior. */
export const BLOCK = 100;
export const ARM = 80;
const SPAN = ARM * 2 + BLOCK;
const DT = 0.2;
export const SAFETY = { minGreen: 7, maxGreen: 40, amber: 3, allRed: 2 };
/** Plan fijo para la demanda normal (repartido según la demanda de cada calle). */
export const FIXED = { EW: 31, NS: 19, cycle: 31 + 19 + 2 * (3 + 2) };

export type Axis = 'EW' | 'NS';
/** Cruces: NO, NE, SO, SE (fila de calle este-oeste × columna de calle norte-sur). */
export const NODES = ['NO', 'NE', 'SO', 'SE'];
type Path = { axis: Axis; street: 0 | 1; dir: 1 | -1; entry: string; crossings: { node: number; stop: number }[] };
const PATHS: Path[] = (['EW', 'NS'] as const).flatMap((axis) =>
  ([0, 1] as const).flatMap((street) =>
    ([1, -1] as const).map((dir) => {
      // El vehículo cruza primero la calle más cercana a su entrada.
      const order = dir === 1 ? [0, 1] : [1, 0];
      return {
        axis,
        street,
        dir,
        entry: axis === 'EW' ? `${dir === 1 ? 'Oeste' : 'Este'} ${street ? 'sur' : 'norte'}` : `${dir === 1 ? 'Norte' : 'Sur'} ${street ? 'este' : 'oeste'}`,
        crossings: order.map((other, k) => ({
          node: axis === 'EW' ? street * 2 + other : other * 2 + street,
          stop: ARM + k * BLOCK - 7,
        })),
      };
    }),
  ),
);

export type LabDemand = 'normal' | 'punta' | 'oleada';
/** Vehículos por hora por entrada; en «oleada» las entradas del norte reciben
 * una salida de colegio entre los 50 y 110 s. */
function rate(demand: LabDemand, p: Path, t: number) {
  const k = demand === 'punta' ? 1.35 : 1;
  const base = (p.axis === 'EW' ? 420 : 260) * k;
  return demand === 'oleada' && p.axis === 'NS' && p.dir === 1 && t >= 50 && t < 110 ? 900 : base;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Arrival = { t: number; path: number; kind: Kind };
/** Llegadas de Poisson (con variación en el tiempo) iguales para ambos controles. */
export function arrivals(demand: LabDemand, until = 240, seed = 7): Arrival[] {
  const r = rng(seed);
  const out: Arrival[] = [];
  PATHS.forEach((p, path) => {
    const max = 900 / 3600;
    for (let t = 0; ; ) {
      t += -Math.log(1 - r()) / max;
      if (t > until) break;
      if (r() > rate(demand, p, t) / 3600 / max) continue;
      let u = r(),
        kind: Kind = 'auto';
      for (const [k, share] of MIX) {
        if (u < share) {
          kind = k;
          break;
        }
        u -= share;
      }
      out.push({ t, path, kind });
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

type Vehicle = { id: number; path: number; kind: Kind; s: number; v: number; wait: number };
type Signal = { phase: Axis; stage: 'green' | 'amber' | 'allRed'; t: number };
export type LogEntry = { t: number; node: string; text: string; forced?: boolean; fallback?: boolean };
/** Latencia simulada de una consulta a Jev (TypeSafe informa 70–500 ms). */
export const JEV_LATENCY = 0.4;
export const JEV_MIN_CONFIDENCE = 0.6;
type AxisState = {
  vehiculos_detenidos: number;
  pasajeros: number;
  espera_max_s: number;
  llegan_10s: number;
  salida_bloqueada: boolean;
};
export type JevQuery = {
  t: number;
  node: string;
  state: Record<string, unknown>;
  question: { type: 'Choice'; options: string[] };
  answer: string;
  probability: number;
  fallback: boolean;
};

export function createSim(control: 'jev' | 'adaptive' | 'fixed', list: Arrival[], priority: boolean) {
  let time = 0,
    next = 0,
    forced = 0,
    switches = 0,
    worst = 0,
    finishedWait = 0,
    finishedPeople = 0,
    finishedPeopleWait = 0,
    finished = 0;
  const exits: number[] = [];
  const pending: (Arrival & { id: number })[][] = PATHS.map(() => []);
  const lanes: Vehicle[][] = PATHS.map(() => []);
  const signals: Signal[] = NODES.map(() => ({ phase: 'EW', stage: 'green', t: 0 }));
  const lastNote = NODES.map(() => -99);
  // Momento en que llega la respuesta de Jev que pidió cambiar (−1: ninguna).
  const jevDue = NODES.map(() => -1);
  let lastQuery: JevQuery | null = null,
    fallbacks = 0,
    queries = 0;
  const log: LogEntry[] = [];
  const series: number[] = [];
  const weight = (k: Kind) => (priority ? KINDS[k].people : 1);

  const say = (node: number, text: string, isForced = false, fallback = false) => {
    log.unshift({ t: Math.round(time), node: NODES[node], text, forced: isForced, fallback });
    if (log.length > 60) log.pop();
  };

  /** Espera acumulada (pesada) en los accesos de un eje a un cruce, y cuántos
   * vehículos se acercan en movimiento a menos de 30 m de la línea de pare. */
  const approach = (node: number, axis: Axis) => {
    let load = 0,
      coming = 0;
    PATHS.forEach((p, i) => {
      if (p.axis !== axis) return;
      const c = p.crossings.find((x) => x.node === node);
      if (!c) return;
      for (const v of lanes[i]) {
        const d = c.stop - v.s;
        if (d < 0 || d > 60) continue;
        load += weight(v.kind) * (v.v < 0.5 ? 1 + v.wait / 10 : 0.5);
        if (v.v >= 0.5 && d < 30) coming++;
      }
      load += pending[i].filter((a) => a.t <= time).length * (c === p.crossings[0] ? 1 : 0);
    });
    return { load, coming };
  };

  const name = (a: Axis) => (a === 'EW' ? 'E-O' : 'N-S');

  /** Estado de un eje en un cruce, tal como se enviaría a Jev. */
  const axisState = (node: number, axis: Axis): AxisState => {
    let veh = 0,
      people = 0,
      maxWait = 0,
      soon = 0,
      blocked = false;
    PATHS.forEach((p, i) => {
      if (p.axis !== axis) return;
      const k = p.crossings.findIndex((x) => x.node === node);
      if (k < 0) return;
      const c = p.crossings[k];
      for (const v of lanes[i]) {
        const d = c.stop - v.s;
        if (d < 0 || d > 90) continue;
        if (v.v < 0.5 && d < 60) {
          veh++;
          people += KINDS[v.kind].people;
          maxWait = Math.max(maxWait, v.wait);
        } else if (v.v >= 0.5 && d / v.v < 10) soon++;
      }
      if (k === 0)
        for (const a of pending[i]) {
          if (a.t > time) break;
          veh++;
          people += KINDS[a.kind].people;
          maxWait = Math.max(maxWait, time - a.t);
        }
      // Salida bloqueada: la cuadra siguiente ya está llena de detenidos.
      const next = p.crossings[k + 1];
      if (next) {
        const from = c.stop + 14;
        const used = lanes[i].filter((v) => v.s > from && v.s <= next.stop && v.v < 1).reduce((sum, v) => sum + KINDS[v.kind].length + 2, 0);
        if (used > (next.stop - from) * 0.75) blocked = true;
      }
    });
    return { vehiculos_detenidos: veh, pasajeros: Math.round(people), espera_max_s: Math.round(maxWait), llegan_10s: soon, salida_bloqueada: blocked };
  };

  /** Respuesta simulada a la pregunta Choice: probabilidad de cambiar. */
  const jevAnswer = (green: AxisState, red: AxisState) => {
    const load = (x: AxisState) => (priority ? x.pasajeros / 1.5 : x.vehiculos_detenidos);
    const keep = (load(green) + 1.5 * green.llegan_10s) * (green.salida_bloqueada ? 0.2 : 1);
    const change = (load(red) + 0.15 * red.espera_max_s) * (red.salida_bloqueada ? 0.3 : 1);
    // Verde vacío y alguien esperando en la otra calle: cambiar es claro.
    if (keep === 0 && change > 0) return 0.95;
    return 1 / (1 + Math.exp(-(change - keep - 1.5) / 1.5));
  };

  const decideJev = (i: number, sg: Signal) => {
    const other: Axis = sg.phase === 'EW' ? 'NS' : 'EW';
    const green = axisState(i, sg.phase),
      red = axisState(i, other);
    const options = [`extender_${name(sg.phase)}`, `cambiar_a_${name(other)}`];
    const pChange = jevAnswer(green, red);
    const change = pChange >= 0.5;
    const probability = change ? pChange : 1 - pChange;
    const fallback = probability < JEV_MIN_CONFIDENCE;
    queries++;
    lastQuery = {
      t: Math.round(time),
      node: NODES[i],
      state: { cruce: NODES[i], verde_actual: name(sg.phase), verde_s: Math.round(sg.t), [name(sg.phase)]: green, [name(other)]: red },
      question: { type: 'Choice', options },
      answer: options[change ? 1 : 0],
      probability,
      fallback,
    };
    const pct = `${Math.round(probability * 100)} %`;
    if (fallback) {
      fallbacks++;
      say(i, `confianza baja (${pct}): decide la regla`, false, true);
      return decideRules(i, sg);
    }
    if (change) {
      const why = green.salida_bloqueada
        ? 'la cuadra de salida está llena'
        : red.espera_max_s > 20
          ? `alguien espera ${red.espera_max_s} s`
          : `${red.vehiculos_detenidos} detenidos, llegan ${green.llegan_10s}`;
      say(i, `Choice: ${options[1]} (${pct}) · ${why}`);
      jevDue[i] = time + JEV_LATENCY;
    } else if (time - lastNote[i] >= 6) {
      lastNote[i] = time;
      say(i, `Choice: ${options[0]} (${pct}) · llegan ${green.llegan_10s} en 10 s`);
    }
    return false;
  };

  const decide = (i: number, sg: Signal) => {
    const other: Axis = sg.phase === 'EW' ? 'NS' : 'EW';
    if (control === 'fixed') return sg.t >= FIXED[sg.phase];
    if (sg.t < SAFETY.minGreen) return false;
    // Capa de seguridad: el verde máximo no depende del controlador.
    if (sg.t >= SAFETY.maxGreen) {
      if (approach(i, other).load > 0) {
        forced++;
        say(i, `verde máximo (${SAFETY.maxGreen} s): pasa a ${name(other)}`, true);
        return true;
      }
      return false;
    }
    return control === 'jev' ? decideJev(i, sg) : decideRules(i, sg);
  };

  function decideRules(i: number, sg: Signal) {
    const other: Axis = sg.phase === 'EW' ? 'NS' : 'EW';
    const green = approach(i, sg.phase),
      red = approach(i, other);
    if (red.load === 0) return false;
    if (green.coming === 0) {
      say(i, `${name(sg.phase)} sin vehículos: pasa a ${name(other)} tras ${Math.round(sg.t)} s`);
      return true;
    }
    if (red.load > green.load + 4) {
      say(i, `${name(other)} acumula más espera (${Math.round(red.load)} frente a ${Math.round(green.load)}): cambia`);
      return true;
    }
    if (control !== 'jev' && time - lastNote[i] >= 6) {
      lastNote[i] = time;
      say(i, `extiende verde ${name(sg.phase)}: llegan ${green.coming}`);
    }
    return false;
  }

  const stepSignals = () => {
    signals.forEach((sg, i) => {
      sg.t += DT;
      if (sg.stage === 'green') {
        // La respuesta de Jev que pidió cambiar llega con latencia.
        const answered = jevDue[i] >= 0 && time >= jevDue[i];
        if (answered) jevDue[i] = -1;
        // El controlador decide una vez por segundo.
        if (answered || (jevDue[i] < 0 && Math.abs(sg.t - Math.round(sg.t)) < DT / 2 && decide(i, sg))) {
          sg.stage = 'amber';
          sg.t = 0;
          switches++;
        }
      } else if (sg.stage === 'amber' && sg.t >= SAFETY.amber) {
        sg.stage = 'allRed';
        sg.t = 0;
      } else if (sg.stage === 'allRed' && sg.t >= SAFETY.allRed) {
        sg.phase = sg.phase === 'EW' ? 'NS' : 'EW';
        sg.stage = 'green';
        sg.t = 0;
      }
    });
  };

  const stepVehicles = () => {
    PATHS.forEach((p, pi) => {
      const lane = lanes[pi];
      for (let k = 0; k < lane.length; k++) {
        const veh = lane[k],
          spec = KINDS[veh.kind];
        let gap = Infinity,
          lead = 0;
        if (k > 0) {
          const ahead = lane[k - 1];
          gap = ahead.s - KINDS[ahead.kind].length - veh.s;
          lead = ahead.v;
        }
        // Semáforo siguiente: obstáculo detenido en la línea de pare si no
        // hay verde, salvo en ámbar cuando ya no alcanza a frenar.
        const c = p.crossings.find((x) => x.stop > veh.s - 0.1);
        if (c) {
          const sg = signals[c.node];
          const d = c.stop - veh.s;
          let go = sg.phase === p.axis && (sg.stage === 'green' || (sg.stage === 'amber' && d < (veh.v * veh.v) / (2 * 3) - 1));
          // No bloquear el cruce: con verde, espera si no cabe al otro lado.
          if (go && k > 0 && d > 0.5) {
            const ahead = lane[k - 1];
            if (ahead.v < 2 && ahead.s - KINDS[ahead.kind].length - (c.stop + 14) < spec.length + 1) go = false;
          }
          if (!go && d < gap) {
            gap = d;
            lead = 0;
          }
        }
        const b = 3,
          sStar = 2 + Math.max(0, veh.v * 1.2 + (veh.v * (veh.v - lead)) / (2 * Math.sqrt(spec.accel * b)));
        const acc = spec.accel * (1 - (veh.v / spec.speed) ** 4 - (sStar / Math.max(gap, 0.1)) ** 2);
        veh.v = Math.max(0, veh.v + Math.max(-9, acc) * DT);
        veh.s += veh.v * DT;
        if (k > 0) veh.s = Math.min(veh.s, lane[k - 1].s - KINDS[lane[k - 1].kind].length - 0.3);
        if (veh.v < 0.5) veh.wait += DT;
      }
      while (lane.length && lane[0].s > SPAN) {
        const out = lane.shift()!;
        finished++;
        finishedWait += out.wait;
        finishedPeople += KINDS[out.kind].people;
        finishedPeopleWait += out.wait * KINDS[out.kind].people;
        worst = Math.max(worst, out.wait);
        exits.push(time);
      }
      // Entra el siguiente de la fila si hay espacio en el brazo.
      const q = pending[pi];
      const last = lane[lane.length - 1];
      if (q.length && q[0].t <= time && (!last || last.s - KINDS[last.kind].length > 4)) {
        const a = q.shift()!;
        lane.push({ id: a.id, path: pi, kind: a.kind, s: 0, v: Math.min(6, last ? last.v : 6), wait: time - a.t });
      }
    });
  };

  const metrics = () => {
    let sum = finishedWait,
      count = finished,
      people = finishedPeople,
      peopleWait = finishedPeopleWait,
      queue = 0,
      w = worst;
    for (const lane of lanes)
      for (const v of lane) {
        sum += v.wait;
        count++;
        people += KINDS[v.kind].people;
        peopleWait += v.wait * KINDS[v.kind].people;
        w = Math.max(w, v.wait);
        if (v.v < 0.5) queue++;
      }
    for (const q of pending)
      for (const a of q) {
        if (a.t > time) break;
        sum += time - a.t;
        count++;
        queue++;
        w = Math.max(w, time - a.t);
      }
    return {
      avgWait: count ? sum / count : 0,
      /** Espera media por pasajero (un micro lleva unos 15). */
      personWait: people ? peopleWait / people : 0,
      worstWait: w,
      perMin: exits.filter((x) => x > time - 60).length * (60 / Math.min(60, Math.max(1, time))),
      cleared: finished,
      queue,
      forced,
      switches,
      queries,
      fallbacks,
    };
  };

  return {
    get time() {
      return time;
    },
    step(until: number) {
      while (time < until - 1e-9) {
        while (next < list.length && list[next].t <= time) {
          pending[list[next].path].push({ ...list[next], id: next });
          next++;
        }
        stepSignals();
        stepVehicles();
        time += DT;
        if (Math.floor(time) > series.length - 1) series.push(metrics().avgWait);
      }
    },
    snapshot() {
      const vehicles = lanes.flatMap((lane, pi) => {
        const p = PATHS[pi];
        return lane.map((v) => {
          const along = p.dir === 1 ? -BLOCK / 2 - ARM + v.s : BLOCK / 2 + ARM - v.s;
          const cross = (p.street ? BLOCK / 2 : -BLOCK / 2) + (p.axis === 'EW' ? 1.8 * p.dir : -1.8 * p.dir);
          return {
            id: v.id,
            kind: v.kind,
            x: p.axis === 'EW' ? along : cross,
            y: p.axis === 'EW' ? cross : along,
            axis: p.axis,
            dir: p.dir,
            stopped: v.v < 0.5,
          };
        });
      });
      return {
        vehicles,
        signals: signals.map((s) => ({ phase: s.phase, stage: s.stage, t: s.t })),
        metrics: metrics(),
        series: series.slice(),
        log: log.slice(0, 14),
        lastQuery,
      };
    },
  };
}

export type LabSim = ReturnType<typeof createSim>;
export type LabSnapshot = ReturnType<LabSim['snapshot']>;
