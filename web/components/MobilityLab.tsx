'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Upload,
  Play,
  Square,
  Route as RouteIcon,
  MapPin,
  Save,
  RefreshCw,
} from 'lucide-react';
import type { Network, Point } from '../lib/mobility';
import { readLocal } from '../lib/mobility';
import { downloadJSON, IS_LOCAL_DEMO } from '../lib/api';
import {
  DRAFT_KEY,
  draftGeometry,
  parseDraft,
  type RouteDraft,
} from '../lib/route-drafts';
import {
  parseCensus,
  studyNetwork,
  studyForRoute,
  validateLab,
  validateStudy,
  validateWalking,
} from '../lib/lab-data';
import { loadLab, saveLab } from '../lib/lab-storage';
import {
  fingerprint,
  walkingPointFingerprint,
  projectOnRoute,
  routeBoarding,
  type frequencyAlternatives,
} from '../lib/lab-engine';
import { detourCandidate } from '../lib/lab-candidates';
import {
  defaultStudy,
  dayNames,
  type CensusData,
  type Evaluation,
  type EvaluationInput,
  type LabObservation,
  type LabState,
  type Study,
} from '../lib/lab-types';
import TransitMap from './TransitMap';
import LabEvidence from './LabEvidence';
import { LabCalendar, LabDestinations } from './LabInputs';
import LabFieldwork from './LabFieldwork';
import LabResults from './LabResults';

const tabs = [
  ['compare', 'Comparar propuestas'],
  ['evidence', 'Fuentes y calidad'],
  ['places', 'Destinos'],
  ['calendar', 'Calendario'],
  ['field', 'Trabajo de campo'],
  ['saved', 'Estudios guardados'],
] as const;
const numericFields = [
  ['fleet', 'Unidades asignadas', 1, 500, 1],
  ['reserve', 'Unidades de reserva', 0, 499, 1],
  ['capacity', 'Capacidad por unidad', 1, 150, 1],
  ['speedKmh', 'Velocidad comercial (km/h)', 3, 60, 0.1],
  ['layoverMinutes', 'Regulación en cabeceras (min)', 0, 180, 0.1],
  ['baseHeadway', 'Intervalo base (min)', 1, 180, 0.1],
  ['proposedHeadway', 'Intervalo propuesto (min)', 1, 180, 0.1],
] as const;
type Options = ReturnType<typeof frequencyAlternatives>;

export default function MobilityLab({
  network,
  notify,
  onOpenDraft,
}: {
  network: Network;
  notify: (message: string) => void;
  onOpenDraft: (draft: RouteDraft) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('compare');
  const [state, setState] = useState<LabState | null>(null),
    [census, setCensus] = useState<CensusData | null>(null),
    [drafts, setDrafts] = useState<RouteDraft[]>([]);
  const [loadError, setLoadError] = useState(''),
    [error, setError] = useState(''),
    [censusError, setCensusError] = useState(''),
    [saving, setSaving] = useState(false),
    [retry, setRetry] = useState(0);
  const [study, setStudy] = useState<Study>(() =>
      defaultStudy(network.routes[0]?.id || ''),
    ),
    [result, setResult] = useState<Evaluation | null>(null),
    [options, setOptions] = useState<Options>([]);
  const [progress, setProgress] = useState<number | null>(null),
    [generation, setGeneration] = useState(''),
    [target, setTarget] = useState(''),
    [mapView, setMapView] = useState<'base' | 'proposed'>('proposed'),
    [layer, setLayer] = useState('coverage');
  const [boardingMode, setBoardingMode] = useState<0 | 1 | null>(null),
    [boardingName, setBoardingName] = useState(''),
    [newPoint, setNewPoint] = useState<Point | null>(null);
  const [boardingDirection, setBoardingDirection] = useState<0 | 1>(0);
  const worker = useRef<Worker | null>(null),
    controller = useRef<AbortController | null>(null),
    saveLock = useRef(false),
    latestInput = useRef<EvaluationInput | null>(null);
  const available = useMemo(
    () => studyNetwork(network, drafts),
    [network, drafts],
  );
  const baseRoute = available.routes.find((r) => r.id === study.routeId),
    altRoute = available.routes.find((r) => r.id === study.alternativeId);
  const busy = saving || progress !== null || !!generation;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    loadLab()
      .then((data) => {
        if (!active) return;
        setLoadError('');
        setState(data);
        const store = readLocal<{ drafts: unknown[] }>(DRAFT_KEY, {
          drafts: [],
        });
        const loaded: RouteDraft[] = [];
        for (const raw of store.drafts || []) {
          try {
            loaded.push(parseDraft(raw));
          } catch {
            setError(
              'Hay borradores inválidos; se excluyeron del estudio sin modificar sus archivos.',
            );
          }
        }
        const merged = new Map((data.candidates || []).map((d) => [d.id, d]));
        for (const d of loaded) {
          const shared = merged.get(d.id);
          if (
            !shared ||
            Date.parse(d.updatedAt) >= Date.parse(shared.updatedAt)
          )
            merged.set(d.id, d);
        }
        setDrafts([...merged.values()]);
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    fetch('/data/manzanas-puntos.geojson', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la cartografía.');
        return response.json();
      })
      .then((data) => {
        const parsed = parseCensus(data, `INEI-2017:${fingerprint(data)}`);
        if (active) {
          setCensus(parsed);
          setCensusError('');
        }
      })
      .catch((e) => {
        if (active) setCensusError(e.message);
      });
    return () => {
      active = false;
      abort.abort();
      worker.current?.terminate();
      controller.current?.abort();
    };
  }, [retry]);
  const invalidate = () => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setResult(null);
    setOptions([]);
    latestInput.current = null;
  };
  const changeStudy = (patch: Partial<Study>) => {
    controller.current?.abort();
    invalidate();
    setStudy((s) => ({ ...s, ...patch }));
    setError('');
  };
  const commit = async (
    next: LabState,
    clear = true,
    syncCandidates = true,
  ): Promise<boolean> => {
    if (!state || saveLock.current) return false;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const candidates = new Map((next.candidates || []).map((d) => [d.id, d]));
      for (const d of syncCandidates ? drafts : []) {
        const previous = candidates.get(d.id);
        if (
          previous &&
          Date.parse(d.updatedAt) > Date.parse(previous.updatedAt)
        )
          candidates.set(d.id, { ...d, passengerVisible: false });
      }
      const saved = await saveLab(
        { ...next, candidates: [...candidates.values()] },
        state.revision,
      );
      setState(saved);
      if (clear) invalidate();
      notify(
        IS_LOCAL_DEMO
          ? 'Laboratorio guardado en este navegador.'
          : 'Laboratorio guardado en el servidor.',
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  };
  const run = () => {
    if (!state || !census) return;
    invalidate();
    setError('');
    try {
      validateStudy(study);
      const input = { network: available, census, state, study };
      latestInput.current = structuredClone(input);
      const job = new Worker(new URL('../lib/lab-worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = job;
      setProgress(0);
      job.onmessage = (
        event: MessageEvent<{
          type: string;
          value: number;
          result: Evaluation;
          options: Options;
          message: string;
        }>,
      ) => {
        if (worker.current !== job) return;
        if (event.data.type === 'progress') setProgress(event.data.value);
        else {
          setProgress(null);
          job.terminate();
          worker.current = null;
          if (event.data.type === 'error') {
            setError(event.data.message);
            latestInput.current = null;
          } else {
            setResult(event.data.result);
            setOptions(event.data.options);
          }
        }
      };
      job.onerror = () => {
        if (worker.current === job) {
          setError(
            'El cálculo se interrumpió. Revisa los datos y vuelve a calcular.',
          );
          setProgress(null);
          job.terminate();
          worker.current = null;
          latestInput.current = null;
        }
      };
      job.postMessage({ input, alternatives: true });
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  };
  const points = useMemo(() => {
    const rows = new Map(result?.blocks.map((b) => [b.id, b]) || []);
    const blocks = (census?.blocks || []).map((b) => {
      const row = rows.get(b.id);
      const covered =
        mapView === 'base' ? row?.baseAccess : row?.proposedAccess;
      const color =
        b.population === null
          ? '#939da7'
          : layer === 'changes' && row
            ? row.baseAccess && !row.proposedAccess
              ? '#bb453e'
              : !row.baseAccess && row.proposedAccess
                ? '#20806d'
                : '#939da7'
            : covered
              ? '#20806d'
              : '#c58725';
      return {
        ...b,
        name: `${b.id} · ${b.population === null ? 'sin población asociada' : b.population + ' hab. 2017'}`,
        color,
        radius: 2.5,
      };
    });
    const destinations = (state?.places || []).flatMap((p) =>
      p.point
        ? [{ ...p.point, id: p.id, name: p.name, color: '#7153a1', radius: 6 }]
        : [],
    );
    return layer === 'destinations'
      ? destinations
      : [...blocks, ...destinations];
  }, [census, result, mapView, layer, state?.places]);
  const shownRoute = mapView === 'base' ? baseRoute : altRoute;
  const mapNetwork = useMemo(() => {
    const extra = (state?.boarding || []).filter(
      (b) => b.routeId === shownRoute?.id,
    );
    const routes = shownRoute
      ? [
          {
            ...shownRoute,
            stops: [
              ...shownRoute.stops,
              ...extra.filter((s) => s.direction === 0).map((s) => s.id),
            ],
            inbound: [
              ...shownRoute.inbound,
              ...extra.filter((s) => s.direction === 1).map((s) => s.id),
            ],
          },
        ]
      : [];
    return {
      routes,
      stops: [
        ...available.stops,
        ...extra.map((s) => ({ ...s, kind: 'proposal' })),
      ],
    };
  }, [shownRoute, state?.boarding, available.stops]);
  const altStops = useMemo(() => {
    if (!altRoute || !state) return [];
    try {
      return routeBoarding(available, state, altRoute);
    } catch {
      return [];
    }
  }, [available, state, altRoute]);
  const targets = [
    ...(state?.places || []).flatMap((p) =>
      p.point ? [{ id: p.id, name: p.name, point: p.point }] : [],
    ),
    ...(result?.hotspots || []).map((b) => ({
      id: b.id,
      name: `Mz ${b.id} · ${b.population} habitantes conocidos`,
      point: { lat: b.lat, lon: b.lon },
    })),
  ];
  const generate = async () => {
    const destination = targets.find((t) => t.id === target);
    if (!destination || !baseRoute || !state) return;
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    setGeneration('Preparando un desvío acotado…');
    try {
      const candidate = await detourCandidate(
        baseRoute,
        destination.point,
        destination.name,
        abort.signal,
        setGeneration,
      );
      abort.signal.throwIfAborted();
      const routeId = `draft:${candidate.id}`;
      const boarding = routeBoarding(available, state, baseRoute).flatMap(
        (stops, direction) => {
          const geometry = draftGeometry(
            candidate,
            direction ? 'inbound' : 'outbound',
          );
          const copied = stops
            .filter((s) => projectOnRoute(geometry, s).meters <= 120)
            .map((s) => ({
              id: crypto.randomUUID(),
              name: s.name,
              routeId,
              direction: direction as 0 | 1,
              lat: s.lat,
              lon: s.lon,
              source: `Abordaje candidato conservado desde ${baseRoute.code}; requiere revisión.`,
            }));
          const projected = projectOnRoute(geometry, destination.point);
          if (projected.meters <= 120)
            copied.push({
              id: crypto.randomUUID(),
              name: `Acceso propuesto · ${destination.name}`.slice(0, 160),
              routeId,
              direction: direction as 0 | 1,
              lat: projected.point.lat,
              lon: projected.point.lon,
              source:
                'Proyección propuesta sobre el trazado; verificar lado, cruce y posibilidad de detenerse.',
            });
          return copied;
        },
      );
      const store = readLocal<{ drafts: RouteDraft[] }>(DRAFT_KEY, {
        drafts: [],
      });
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          active: candidate.id,
          drafts: [candidate, ...(store.drafts || [])],
        }),
      );
      setDrafts((d) => [candidate, ...d]);
      if (
        await commit({
          ...state,
          candidates: [candidate, ...(state.candidates || [])],
          boarding: [...state.boarding, ...boarding],
        })
      ) {
        changeStudy({
          alternativeId: routeId,
          removedStops: [],
          name: `Desvío hacia ${destination.name}`.slice(0, 120),
        });
        notify(
          'Alternativa creada. Compara su flota y cobertura; revisa el trazado en el editor antes del piloto.',
        );
      }
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      setGeneration('');
      controller.current = null;
    }
  };
  const saveStudy = async () => {
    if (!state || !result) return;
    const { blocks: _, hotspots: __, ...summary } = result;
    await commit(
      {
        ...state,
        studies: [
          {
            id: crypto.randomUUID(),
            name: result.study.name,
            createdAt: result.calculatedAt,
            status: 'draft',
            study: result.study,
            result: summary,
          },
          ...state.studies,
        ],
      },
      false,
    );
  };
  const useObservation = (o: LabObservation) => {
    const interval = o.headways.reduce((a, b) => a + b, 0) / o.headways.length;
    changeStudy({
      routeId: o.routeId,
      alternativeId: o.routeId,
      removedStops: [],
      baseHeadway: Math.round(interval * 10) / 10,
      source: `Intervalo observado: ${o.source}, ${o.date}, ${o.headways.length} intervalos. Otros parámetros conservan supuestos.`,
    });
    setTab('compare');
  };
  const importFile = async (file: File | undefined, walking = false) => {
    if (!file || !state) return;
    try {
      if (file.size > 1_900_000) throw new Error('El archivo supera 1,9 MB.');
      const value = JSON.parse(await file.text());
      await commit(
        walking
          ? { ...state, walking: validateWalking(value) }
          : { ...validateLab(value), revision: state.revision },
        true,
        walking,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (loadError)
    return (
      <div className="workspace">
        <h2>No se pudo abrir el laboratorio</h2>
        <p className="form-error" role="alert">
          {loadError}
        </p>
        <p>
          Los datos guardados se conservan. Recupera tu copia o revisa la
          conexión y el acceso administrativo.
        </p>
        <button className="secondary" onClick={() => setRetry((r) => r + 1)}>
          Reintentar carga
        </button>
      </div>
    );
  if (!state)
    return <output className="workspace">Cargando fuentes y estudios…</output>;
  return (
    <div className="workspace mobility-lab">
      <div className="workspace-header">
        <div>
          <h2>Laboratorio de movilidad</h2>
          <p>
            Convierte población, actividad y recorridos en decisiones
            comparables.
          </p>
        </div>
        <div className="inline-actions">
          <button
            className="secondary"
            onClick={() => downloadJSON('juliaca-laboratorio.json', state)}
          >
            <Download size={16} />
            Respaldar
          </button>
          <label className="secondary lab-file">
            <Upload size={16} />
            Importar respaldo
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <div className="lab-context">
        <span>
          {IS_LOCAL_DEMO
            ? 'Guardado en este navegador'
            : 'Guardado privado en servidor'}{' '}
          · revisión {state.revision}
        </span>
        <span>INEI 2017 + PDU documental + parámetros de estudio</span>
      </div>
      <nav className="workspace-tabs" aria-label="Secciones del laboratorio">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="form-error lab-error" role="alert">
          {error}
          <button className="text-button" onClick={() => setError('')}>
            Cerrar aviso
          </button>
        </div>
      )}
      {censusError && (
        <div className="data-note" role="alert">
          <span>{censusError}</span>
          <button
            className="text-button"
            onClick={() => setRetry((r) => r + 1)}
          >
            <RefreshCw size={15} />
            Reintentar cartografía
          </button>
        </div>
      )}
      {tab === 'evidence' && <LabEvidence census={census} state={state} />}
      {tab === 'places' && (
        <LabDestinations
          state={state}
          network={available}
          commit={commit}
          busy={busy}
        />
      )}
      {tab === 'calendar' && (
        <LabCalendar
          state={state}
          network={available}
          commit={commit}
          busy={busy}
        />
      )}
      {tab === 'field' && (
        <LabFieldwork
          state={state}
          network={available}
          commit={commit}
          busy={busy}
          onUse={useObservation}
        />
      )}
      {tab === 'saved' && (
        <section className="surface">
          <h2>Estudios y revisión del piloto</h2>
          <p className="muted">
            Resultados guardados como instantáneas. El estado del estudio no
            publica ni autoriza una ruta.
          </p>
          {!state.studies.length ? (
            <div className="empty-state">
              <h3>Aún no hay comparaciones guardadas</h3>
              <p>
                Calcula una propuesta y guarda su ficha con los supuestos
                utilizados.
              </p>
              <button className="secondary" onClick={() => setTab('compare')}>
                Comparar una propuesta
              </button>
            </div>
          ) : (
            state.studies.map((s) => (
              <article className="lab-saved" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {new Date(s.createdAt).toLocaleString('es-PE')} ·{' '}
                    {s.result.fingerprint} · {s.result.version}
                  </small>
                  <p>
                    Proximidad: {s.result.base.covered.toLocaleString('es-PE')}{' '}
                    → {s.result.proposed.covered.toLocaleString('es-PE')}{' '}
                    habitantes conocidos. Instantánea; recalcula si cambió la
                    red.
                  </p>
                </div>
                <div className="inline-actions">
                  <label>
                    Revisión del estudio
                    <select
                      value={s.status}
                      disabled={busy}
                      onChange={(e) =>
                        void commit(
                          {
                            ...state,
                            studies: state.studies.map((r) =>
                              r.id === s.id
                                ? {
                                    ...r,
                                    status: e.target.value as typeof r.status,
                                  }
                                : r,
                            ),
                          },
                          false,
                        )
                      }
                    >
                      <option value="draft">Borrador</option>
                      <option value="review">En revisión</option>
                      <option value="pilot">Piloto propuesto</option>
                      <option value="retired">Retirado</option>
                    </select>
                  </label>
                  <button
                    className="secondary"
                    onClick={() => {
                      invalidate();
                      setStudy(s.study);
                      setTab('compare');
                    }}
                  >
                    Cargar parámetros
                  </button>
                  <button
                    className="text-button"
                    onClick={() => downloadJSON(`estudio-${s.id}.json`, s)}
                  >
                    Exportar ficha
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void commit(
                        {
                          ...state,
                          studies: state.studies.filter((r) => r.id !== s.id),
                        },
                        false,
                      )
                    }
                  >
                    Eliminar ficha
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}
      {tab === 'compare' && (
        <>
          <div className="lab-workbench">
            <section className="surface lab-parameters">
              <h3>Configurar el piloto</h3>
              <p className="small-note">
                Valores iniciales ilustrativos. Reemplázalos con flota activa y
                observaciones; no proceden de las 40 líneas del PDU.
              </p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  run();
                }}
              >
                <label>
                  Nombre del estudio
                  <input
                    required
                    maxLength={120}
                    value={study.name}
                    onChange={(e) => changeStudy({ name: e.target.value })}
                  />
                </label>
                <label>
                  Recorrido base
                  <select
                    value={study.routeId}
                    onChange={(e) => {
                      changeStudy(studyForRoute(available, e.target.value));
                      setNewPoint(null);
                    }}
                  >
                    {available.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.name}{' '}
                        {r.status === 'demo' ? '(demostración)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Recorrido propuesto
                  <select
                    value={study.alternativeId}
                    onChange={(e) => {
                      changeStudy({
                        alternativeId: e.target.value,
                        removedStops: [],
                      });
                      setNewPoint(null);
                    }}
                  >
                    {available.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="lab-fields">
                  <label>
                    Día
                    <select
                      value={study.day}
                      onChange={(e) =>
                        changeStudy({ day: Number(e.target.value) })
                      }
                    >
                      {dayNames.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Hora de estudio
                    <input
                      type="time"
                      required
                      value={study.hour}
                      onChange={(e) => changeStudy({ hour: e.target.value })}
                    />
                  </label>
                </div>
                <div className="lab-fields">
                  {numericFields.map(([key, label, min, max, step]) => (
                    <label key={key}>
                      {label}
                      <input
                        required
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={study[key]}
                        onChange={(e) =>
                          changeStudy({ [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
                <details>
                  <summary>Acceso, capacidad y costes</summary>
                  <div className="form-stack">
                    <label>
                      Método de acceso
                      <select
                        value={study.accessMode}
                        onChange={(e) =>
                          changeStudy({
                            accessMode: e.target.value as Study['accessMode'],
                          })
                        }
                      >
                        <option value="radius">
                          Proximidad en línea recta · exploratorio
                        </option>
                        <option value="paths">
                          Conexiones peatonales importadas
                        </option>
                      </select>
                    </label>
                    <div className="lab-fields">
                      {(
                        [
                          [
                            'walkMeters',
                            'Distancia máxima a pie (m)',
                            50,
                            2000,
                          ],
                          ['walkSpeedKmh', 'Velocidad a pie (km/h)', 1, 7],
                          [
                            'thresholdMinutes',
                            'Umbral hacia destinos (min)',
                            5,
                            180,
                          ],
                          ['costPerKm', 'Coste variable por km (S/)', 0, 1000],
                          [
                            'costPerHour',
                            'Coste por unidad-hora (S/)',
                            0,
                            10000,
                          ],
                          ['fare', 'Tarifa directa supuesta (S/)', 0, 100],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <label key={key}>
                          {label}
                          <input
                            type="number"
                            required
                            min={min}
                            max={max}
                            step="any"
                            value={study[key]}
                            onChange={(e) =>
                              changeStudy({ [key]: Number(e.target.value) })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Carga crítica observada (pasajeros/h/sentido)
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step="any"
                        placeholder="Sin dato"
                        value={study.peakLoadPerHour ?? ''}
                        onChange={(e) =>
                          changeStudy({
                            peakLoadPerHour:
                              e.target.value === ''
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <p className="small-note">
                      Coste por unidad-hora excluye los conceptos incluidos en
                      coste/km. Un valor cero mantiene pendiente el presupuesto.
                    </p>
                  </div>
                </details>
                <label className="lab-check">
                  <input
                    type="checkbox"
                    checked={study.applyEvents}
                    onChange={(e) =>
                      changeStudy({ applyEvents: e.target.checked })
                    }
                  />
                  Aplicar afectaciones revisadas del calendario
                </label>
                <label>
                  Fuente de los parámetros
                  <textarea
                    required
                    maxLength={2000}
                    value={study.source}
                    onChange={(e) => changeStudy({ source: e.target.value })}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !census || !available.routes.length}
                >
                  <Play size={16} />
                  {progress !== null
                    ? `Calculando ${progress}%`
                    : 'Calcular comparación'}
                </button>
                {progress !== null && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={invalidate}
                  >
                    <Square size={15} />
                    Cancelar cálculo
                  </button>
                )}
              </form>
            </section>
            <div className="lab-map-column">
              <div className="lab-map-tools">
                <div className="segmented">
                  <button
                    aria-pressed={mapView === 'base'}
                    className={mapView === 'base' ? 'active' : ''}
                    onClick={() => setMapView('base')}
                  >
                    Mapa base
                  </button>
                  <button
                    aria-pressed={mapView === 'proposed'}
                    className={mapView === 'proposed' ? 'active' : ''}
                    onClick={() => setMapView('proposed')}
                  >
                    Mapa propuesto
                  </button>
                </div>
                <label>
                  Capa
                  <select
                    value={layer}
                    onChange={(e) => setLayer(e.target.value)}
                  >
                    <option value="coverage">Población y proximidad</option>
                    <option value="changes">Ganancias y pérdidas</option>
                    <option value="destinations">Destinos ubicados</option>
                  </select>
                </label>
              </div>
              <div className="lab-map">
                <TransitMap
                  network={mapNetwork}
                  selected={shownRoute?.id || null}
                  origin={newPoint}
                  destination={null}
                  journey={null}
                  positions={[]}
                  analysisPoints={points}
                  onSelect={() => {}}
                  pickMode={boardingMode !== null ? 'origin' : null}
                  onPick={(p) => {
                    setNewPoint(p);
                    setBoardingMode(null);
                  }}
                />
              </div>
              <div className="lab-map-key">
                <span>
                  <i className="lab-key-covered" />
                  Con proximidad / gana
                </span>
                <span>
                  <i className="lab-key-uncovered" />
                  {result ? 'Sin proximidad' : 'Población sin evaluar'}
                </span>
                <span>
                  <i className="lab-key-lost" />
                  Pierde
                </span>
                <span>
                  <i className="lab-key-unknown" />
                  Sin población
                </span>
                <span>
                  <i className="lab-key-place" />
                  Destino
                </span>
              </div>
              <p className="small-note">
                {result
                  ? `Resultado ${result.fingerprint} · ${study.accessMode === 'radius' ? 'radio en línea recta, no distancia caminable' : 'conexiones peatonales importadas'}`
                  : 'Selecciona parámetros y calcula para ver cobertura. Los puntos representan centroides de manzana.'}
              </p>
              <section className="surface">
                <h3>Construir una alternativa</h3>
                <p className="muted">
                  Ensaya un desvío hacia un destino ubicado o una manzana con
                  población conocida fuera de la cobertura base.
                </p>
                <div className="form-stack">
                  <label>
                    Destino del desvío
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">
                        Selecciona un destino o calcula zonas pendientes
                      </option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline-actions">
                    <button
                      className="secondary"
                      disabled={busy || !target}
                      onClick={generate}
                    >
                      <RouteIcon size={16} />
                      {generation || 'Generar desvío candidato'}
                    </button>
                    {generation && (
                      <button
                        className="text-button"
                        onClick={() => controller.current?.abort()}
                      >
                        Cancelar generación
                      </button>
                    )}
                    {drafts.find(
                      (d) => `draft:${d.id}` === study.alternativeId,
                    ) && (
                      <button
                        className="text-button"
                        onClick={() =>
                          onOpenDraft(
                            drafts.find(
                              (d) => `draft:${d.id}` === study.alternativeId,
                            )!,
                          )
                        }
                      >
                        Revisar alternativa en el editor
                      </button>
                    )}
                  </div>
                </div>
                <p className="small-note">
                  Calcula ambos sentidos sobre calles con perfil de automóvil y
                  conserva cabeceras. No garantiza una mejora ni transitabilidad
                  para micros. La selección usa población conocida, no demanda
                  prevista.
                </p>
              </section>
              <details className="surface">
                <summary>Abordajes explícitos y conexiones peatonales</summary>
                <p className="small-note">
                  La ida y vuelta necesitan al menos dos abordajes. Añadir un
                  vértice en el editor no crea un paradero.
                </p>
                <div className="lab-fields">
                  <label>
                    Nombre del abordaje propuesto
                    <input
                      maxLength={160}
                      value={boardingName}
                      onChange={(e) => setBoardingName(e.target.value)}
                    />
                  </label>
                  <label>
                    Sentido
                    <select
                      value={boardingDirection}
                      onChange={(e) =>
                        setBoardingDirection(Number(e.target.value) as 0 | 1)
                      }
                    >
                      <option value="0">Ida</option>
                      <option value="1">Vuelta</option>
                    </select>
                  </label>
                </div>
                <div className="inline-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setMapView('proposed');
                      setBoardingMode(0);
                    }}
                  >
                    <MapPin size={16} />
                    Marcar en el mapa propuesto
                  </button>
                  {boardingMode !== null && (
                    <button
                      className="text-button"
                      onClick={() => setBoardingMode(null)}
                    >
                      Cancelar selección
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={!newPoint || !boardingName.trim() || busy}
                    onClick={async () => {
                      const direction = boardingDirection;
                      const coords = direction
                        ? altRoute?.inbound_geometry
                        : altRoute?.geometry;
                      if (!newPoint || !coords) return;
                      if (projectOnRoute(coords, newPoint).meters > 120) {
                        setError(
                          'Ubica el abordaje a menos de 120 m de su sentido de recorrido.',
                        );
                        return;
                      }
                      if (
                        await commit({
                          ...state,
                          boarding: [
                            ...state.boarding,
                            {
                              ...newPoint,
                              id: crypto.randomUUID(),
                              name: boardingName,
                              routeId: study.alternativeId,
                              direction,
                              source:
                                'Abordaje propuesto en laboratorio; requiere revisión de campo.',
                            },
                          ],
                        })
                      ) {
                        setNewPoint(null);
                        setBoardingName('');
                      }
                    }}
                  >
                    <Save size={16} />
                    Guardar abordaje
                  </button>
                </div>
                {altStops.map((stops, direction) => (
                  <fieldset className="lab-stop-list" key={direction}>
                    <legend>
                      {direction ? 'Vuelta' : 'Ida'} · incluir en la propuesta
                    </legend>
                    {stops.map((s, i) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          disabled={i === 0 || i === stops.length - 1}
                          checked={!study.removedStops.includes(s.id)}
                          onChange={(e) =>
                            changeStudy({
                              removedStops: e.target.checked
                                ? study.removedStops.filter((id) => id !== s.id)
                                : [...study.removedStops, s.id],
                            })
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <div className="inline-actions">
                  <label className="secondary lab-file">
                    <Upload size={16} />
                    Importar conexiones a pie
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={busy}
                      onChange={(e) => {
                        void importFile(e.target.files?.[0], true);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    className="text-button"
                    disabled={!census}
                    onClick={() =>
                      downloadJSON('juliaca-puntos-acceso.json', {
                        format: 'walk-links-v1',
                        instructions:
                          'Calcular caminos dirigidos block:ID → stop:ID, stop:ID → place:ID y block:ID → place:ID. No crear rectas a través de barreras. Importar {source,date,pointFingerprint,links:[{from,to,meters}]} conservando la huella de la plantilla.',
                        blocks: census?.blocks.map((b) => ({
                          id: `block:${b.id}`,
                          lon: b.lon,
                          lat: b.lat,
                        })),
                        stops: [...available.stops, ...state.boarding].map(
                          (s) => ({
                            id: `stop:${s.id}`,
                            lon: s.lon,
                            lat: s.lat,
                          }),
                        ),
                        places: state.places
                          .filter((p) => p.point)
                          .map((p) => ({ id: `place:${p.id}`, ...p.point })),
                        template: {
                          source: '',
                          date: '',
                          pointFingerprint: walkingPointFingerprint({
                            network: available,
                            census: census!,
                            state,
                          }),
                          links: [],
                        },
                      })
                    }
                  >
                    Exportar puntos para calcular caminos
                  </button>
                </div>
                <p className="small-note">
                  {state.walking
                    ? `${state.walking.links.length} conexiones · ${state.walking.source} · ${state.walking.date}`
                    : 'Sin conexiones importadas. Los enlaces ausentes se mantienen desconectados en el método peatonal.'}
                </p>
              </details>
            </div>
          </div>
          {result ? (
            <>
              <LabResults
                result={result}
                options={options}
                busy={busy}
                onSave={saveStudy}
                onChange={changeStudy}
              />
              <button
                className="secondary lab-export-study"
                onClick={() =>
                  downloadJSON(`juliaca-estudio-${result.fingerprint}.json`, {
                    format: 'juliaca-reproducible-study-v1',
                    input: latestInput.current,
                    result,
                  })
                }
              >
                <Download size={16} />
                Exportar estudio reproducible con datos de entrada
              </button>
            </>
          ) : (
            <div className="lab-next">
              <strong>
                {census
                  ? 'Listo para comparar con tus parámetros'
                  : 'Cargando población por manzana…'}
              </strong>
              <p>
                Primero prueba una frecuencia. Después compara un trazado
                alternativo o ajusta abordajes. Las pérdidas de cobertura y las
                limitaciones de datos permanecerán visibles.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
