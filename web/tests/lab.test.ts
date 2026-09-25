import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  evaluateStudy,
  operatingFleet,
  frequencyAlternatives,
  walkingPointFingerprint,
} from '../lib/lab-engine';
import {
  freshLab,
  parseCensus,
  validateLab,
  validateStudy,
  validateWalking,
  catalog,
} from '../lib/lab-data';
import { defaultStudy, type EvaluationInput } from '../lib/lab-types';
import { DEMO_NETWORK, type Network } from '../lib/mobility';

function input(): EvaluationInput {
  const a = { id: 'a', name: 'A', lon: -70.14, lat: -15.49, kind: 'observed' },
    b = { id: 'b', name: 'B', lon: -70.12, lat: -15.49, kind: 'observed' },
    c = { id: 'c', name: 'C', lon: -70.1, lat: -15.49, kind: 'observed' };
  const route = {
    ...DEMO_NETWORK.routes[0],
    id: 'r',
    geometry: [
      [a.lon, a.lat],
      [b.lon, b.lat],
      [c.lon, c.lat],
    ],
    inbound_geometry: [
      [c.lon, c.lat],
      [b.lon, b.lat],
      [a.lon, a.lat],
    ],
    stops: ['a', 'b', 'c'],
    inbound: ['c', 'b', 'a'],
  };
  const network: Network = { routes: [route], stops: [a, b, c] };
  const state = freshLab();
  state.places = [
    {
      ...state.places[0],
      id: 'market',
      groupId: 'market',
      point: c,
      validation: 'reviewed',
      days: [1],
      open: '06:00',
      close: '20:00',
    },
  ];
  return {
    network,
    state,
    study: { ...defaultStudy('r'), walkMeters: 400 },
    census: {
      version: 'test',
      duplicates: 0,
      conflicts: 0,
      blocks: [
        { ...a, id: 'A', district: 'Juliaca', zone: '001', population: 100 },
        { ...b, id: 'B', district: 'Juliaca', zone: '002', population: 50 },
        {
          ...c,
          id: 'C',
          district: 'San Miguel',
          zone: '001',
          population: null,
        },
      ],
    },
  };
}
describe('flota y servicio', () => {
  it('una vuelta más larga exige vehículos o aumenta intervalo', () => {
    const s = { ...defaultStudy(), fleet: 9, speedKmh: 12, layoverMinutes: 0 };
    expect(operatingFleet(18, s, 10).vehiclesRequired).toBe(9);
    const longer = operatingFleet(22, s, 10);
    expect(longer.vehiclesRequired).toBe(11);
    expect(longer.effectiveHeadway).toBeCloseTo(110 / 9);
    expect(longer.vehiclesUsed).toBe(9);
    expect(longer.targetFeasible).toBe(false);
  });
  it('reserva, carga y costes no crean flota ficticia', () => {
    const s = {
      ...defaultStudy(),
      fleet: 5,
      reserve: 1,
      capacity: 16,
      speedKmh: 12,
      layoverMinutes: 0,
      peakLoadPerHour: 200,
      costPerKm: 2,
      costPerHour: 10,
    };
    const f = operatingFleet(12, s, 5);
    expect(f.effectiveHeadway).toBe(15);
    expect(f.available).toBe(4);
    expect(f.capacityPerHour).toBe(64);
    expect(f.overload).toBe(true);
    expect(f.costPerHour).toBe(136);
  });
  it('descarta alternativas de frecuencia inviables', () => {
    const data = input();
    data.study.fleet = 1;
    data.study.peakLoadPerHour = 1000;
    expect(frequencyAlternatives(data).every((o) => !o.feasible)).toBe(true);
  });
});
describe('acceso, evidencia y equidad', () => {
  it('cuenta personas únicas y conserva población desconocida', () => {
    const r = evaluateStudy(input());
    expect(r.base.population).toBe(150);
    expect(r.base.covered).toBe(150);
    expect(r.base.unknownBlocks).toBe(1);
    expect(r.base.reachable).toBe(150);
    expect(r.gained).toBe(0);
  });
  it('una parada retirada expone población que pierde cobertura', () => {
    const data = input();
    data.study.removedStops = ['b'];
    const r = evaluateStudy(data);
    expect(r.lost).toBe(50);
    expect(r.proposed.covered).toBe(100);
    expect(r.zones.find((z) => z.name.includes('002'))?.lost).toBe(50);
  });
  it('no duplica oportunidades de varias entradas del mismo complejo', () => {
    const data = input();
    data.state.places.push({ ...data.state.places[0], id: 'entrance-2' });
    expect(evaluateStudy(data).base.evaluatedPlaces).toBe(1);
  });
  it('un destino pendiente o cerrado no produce accesibilidad ficticia', () => {
    const data = input();
    data.state.places[0].validation = 'pending';
    expect(evaluateStudy(data).base.evaluatedPlaces).toBe(0);
    data.state.places[0].validation = 'reviewed';
    data.state.places[0].close = '06:59';
    expect(evaluateStudy(data).base.evaluatedPlaces).toBe(0);
  });
  it('respeta cierre del destino al llegar, incluida la caminata inicial', () => {
    const data = input();
    data.state.places[0].close = '07:14';
    data.study.baseHeadway = 1;
    data.study.fleet = 100;
    data.study.speedKmh = 30;
    data.census.blocks[0].lat -= 0.003;
    const r = evaluateStudy(data);
    expect(r.blocks[0].baseMinutes).toBeNull();
    expect(r.blocks[1].baseMinutes).not.toBeNull();
  });
  it('caminos dirigidos ausentes nunca caen en distancias rectas', () => {
    const data = input();
    data.study.accessMode = 'paths';
    data.state.walking = {
      source: 'Prueba con barrera',
      date: '2026-09-18',
      pointFingerprint: walkingPointFingerprint(data),
      links: [
        { from: 'block:A', to: 'stop:a', meters: 100 },
        { from: 'stop:c', to: 'place:market', meters: 20 },
      ],
    };
    const r = evaluateStudy(data);
    expect(r.base.covered).toBe(100);
    expect(r.base.reachable).toBe(100);
    expect(r.blocks[1].baseMinutes).toBeNull();
    data.state.places[0].point!.lat -= 0.001;
    expect(() => evaluateStudy(data)).toThrow('ubicaciones cambiaron');
  });
  it('requiere caminos si el método es peatonal', () => {
    const data = input();
    data.study.accessMode = 'paths';
    expect(() => evaluateStudy(data)).toThrow('Importa conexiones');
  });
  it('dirección incorrecta o paradero fuera de traza bloquean el resultado', () => {
    const data = input();
    data.network.routes[0].inbound = ['a', 'b', 'c'];
    expect(() => evaluateStudy(data)).toThrow('no siguen');
    data.network.routes[0].inbound = ['c', 'b', 'a'];
    data.network.stops[0].lat -= 0.1;
    expect(() => evaluateStudy(data)).toThrow('120 m');
  });
  it('borrador sin abordajes o vuelta no inventa servicio', () => {
    const data = input();
    data.network.routes[0].stops = [];
    expect(() => evaluateStudy(data)).toThrow('dos abordajes');
    data.network.routes[0].inbound_geometry = [];
    expect(() => evaluateStudy(data)).toThrow('ida y vuelta');
  });
  it('calendario solo aplica ruta, día, ventana y revisión correspondientes', () => {
    const data = input();
    const event = {
      ...data.state.events[0],
      routeId: 'r',
      days: [1],
      start: '07:00',
      end: '08:00',
      extraCycleMinutes: 20,
      validation: 'reviewed' as const,
      evidence: 'assumption' as const,
    };
    data.state.events = [event];
    const applied = evaluateStudy(data);
    expect(applied.appliedEvents).toHaveLength(1);
    data.study.hour = '08:00';
    const outside = evaluateStudy(data);
    expect(outside.appliedEvents).toHaveLength(0);
    expect(applied.baseFleet.cycle - outside.baseFleet.cycle).toBeCloseTo(20);
    data.study.hour = '07:00';
    data.state.events[0].validation = 'pending';
    expect(evaluateStudy(data).appliedEvents).toHaveLength(0);
  });
  it('suspensión reporta desconexiones y cero operación', () => {
    const data = input();
    data.state.events = [
      {
        ...data.state.events[0],
        routeId: 'r',
        days: [1],
        start: '06:00',
        end: '09:00',
        suspended: true,
        validation: 'reviewed',
        evidence: 'assumption',
      },
    ];
    const r = evaluateStudy(data);
    expect(r.base.covered).toBe(0);
    expect(r.base.disconnected).toBe(150);
    expect(r.baseFleet.vehiclesUsed).toBe(0);
    expect(r.baseFleet.costPerHour).toBe(0);
  });
  it('un nuevo identificador de variante no evade una afectación de la base', () => {
    const data = input();
    data.network.routes.push({ ...data.network.routes[0], id: 'variant' });
    data.study.alternativeId = 'variant';
    data.state.events = [
      {
        ...data.state.events[0],
        routeId: 'r',
        days: [1],
        start: '06:00',
        end: '09:00',
        extraCycleMinutes: 20,
        validation: 'reviewed',
        evidence: 'assumption',
      },
    ];
    const r = evaluateStudy(data);
    expect(r.proposedFleet.cycle).toBe(r.baseFleet.cycle);
  });
  it('huella reproducible y cambio de fuente invalidan la referencia', () => {
    const data = input();
    const a = evaluateStudy(data);
    expect(evaluateStudy(data).fingerprint).toBe(a.fingerprint);
    data.study.source = 'Nuevo levantamiento';
    expect(evaluateStudy(data).fingerprint).not.toBe(a.fingerprint);
  });
});
describe('datos reales y validación', () => {
  it('importa la cartografía real y preserva totales verificados', () => {
    const json = JSON.parse(
      readFileSync(
        new URL('../public/data/manzanas-puntos.geojson', import.meta.url),
        'utf8',
      ),
    );
    const data = parseCensus(json, 'test');
    expect(data.blocks.length).toBe(6929);
    expect(data.blocks.filter((b) => b.population === null)).toHaveLength(3728);
    expect(data.blocks.reduce((s, b) => s + (b.population ?? 0), 0)).toBe(
      246911,
    );
  });
  it('la red semilla se puede evaluar sin modificaciones', () => {
    const data = input();
    data.network = structuredClone(DEMO_NETWORK);
    data.study = { ...defaultStudy(DEMO_NETWORK.routes[0].id) };
    expect(() => evaluateStudy(data)).not.toThrow();
  });
  it('catálogo mantiene las discrepancias, no reemplaza el dato impreso', () => {
    expect(catalog.lines).toHaveLength(40);
    expect(catalog.lines.reduce((n, r) => n + r.combis + r.microbuses, 0)).toBe(
      1969,
    );
    expect(catalog.reportedFleet).toBe(1963);
    expect(catalog.places.every((p) => p.point === null)).toBe(true);
    expect(validateLab(freshLab())).toBeTruthy();
  });
  it('deduplica y conserva conflictos como desconocidos', () => {
    const f = {
      properties: { d: 'J', z: '001', m: '001', p: 10 },
      geometry: { type: 'Point', coordinates: [-70.13, -15.49] },
    };
    const data = parseCensus(
      {
        type: 'FeatureCollection',
        features: [f, f, { ...f, properties: { ...f.properties, p: 20 } }],
      },
      'test',
    );
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].population).toBeNull();
    expect(data.duplicates).toBe(2);
  });
  it('no acepta faltantes como cero, IDs duplicados o reservas imposibles', () => {
    expect(() =>
      parseCensus(
        {
          type: 'FeatureCollection',
          features: [
            {
              properties: { d: 'J', z: '1', m: '1' },
              geometry: { type: 'Point', coordinates: [0, 0] },
            },
          ],
        },
        'test',
      ),
    ).toThrow();
    const state = freshLab();
    state.places.push({ ...state.places[0] });
    expect(() => validateLab(state)).toThrow('repetidos');
    expect(() => validateStudy({ ...defaultStudy('r'), reserve: 9 })).toThrow();
    expect(() =>
      validateWalking({
        source: 'x',
        date: '2026-09-18',
        pointFingerprint: 'test',
        links: [
          { from: 'a', to: 'b', meters: 1 },
          { from: 'a', to: 'b', meters: 2 },
        ],
      }),
    ).toThrow('duplicadas');
  });
  it('rechaza una ficha con indicadores incompletos sin romper la interfaz', () => {
    const data = input(),
      result = evaluateStudy(data);
    const { blocks: _, hotspots: __, ...summary } = result;
    const state = freshLab();
    state.studies = [
      {
        id: 'test',
        name: 'Prueba',
        createdAt: result.calculatedAt,
        status: 'draft',
        study: result.study,
        result: summary,
      },
    ];
    expect(() => validateLab(state)).not.toThrow();
    const raw = JSON.parse(JSON.stringify(state));
    raw.studies[0].result.base.covered = 'no es un número';
    expect(() => validateLab(raw)).toThrow('población');
  });
});
