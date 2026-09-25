'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PencilRuler,
  Undo2,
  Redo2,
  Plus,
  Save,
  Download,
  Upload,
  Trash2,
  Move,
  MousePointer2,
  Info,
  Copy,
  ArrowRight,
} from 'lucide-react';
import TransitMap from './TransitMap';
import { routeOnGraph } from '../lib/graph-routing';
import {
  publicationError,
  type PublishedRoute,
} from '../lib/map-workspace';
import { type Network, type Point } from '../lib/mobility';
import { downloadJSON } from '../lib/api';
import {
  routeOnRoads,
  roadKey,
  ROUTING_BASE,
  compassDirection,
} from '../lib/road-routing';
import {
  DRAFT_KEY,
  newDraft,
  parseDraft,
  pathKm,
  draftWarnings,
  draftNetwork,
  draftGeometry,
  draftReady,
  exportDraft,
  withServiceDefaults,
  type RouteDraft,
  type Coordinate,
} from '../lib/route-drafts';
const checks = [
  ['street', 'Comprobar calles transitables y sentidos viales'],
  ['field', 'Recorrer ida y vuelta en campo'],
  ['stops', 'Verificar puntos de abordaje y accesibilidad'],
  ['counts', 'Levantar aforos en hora punta y valle'],
  ['trips', 'Validar viajes con pasajeros y transbordos'],
];
export default function RouteEditor({
  network,
  notify,
  publications = [],
  onPublish,
  onWithdraw,
}: {
  network: Network;
  notify: (text: string) => void;
  publications?: PublishedRoute[];
  onPublish?: (draft: RouteDraft) => void;
  onWithdraw?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<RouteDraft | null>(null),
    [library, setLibrary] = useState<RouteDraft[]>([]),
    [active, setActive] = useState<'outbound' | 'inbound'>('outbound'),
    [drawing, setDrawing] = useState(true),
    [selected, setSelected] = useState<number | null>(null),
    [past, setPast] = useState<RouteDraft[]>([]),
    [future, setFuture] = useState<RouteDraft[]>([]),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const applyRouting = useRef<(d: RouteDraft) => void>(() => {});
  const [routing, setRouting] = useState<Record<string, string>>({}),
    [retry, setRetry] = useState(0);
  const outboundKey = roadKey(draft?.outbound || []),
    inboundKey = roadKey(draft?.inbound || []);
  useEffect(() => {
    if (!draft || draft.routingMode === 'manual') {
      setRouting({});
      return;
    }
    const snapshot = draft,
      controller = new AbortController();
    setRouting({});
    const timer = setTimeout(async () => {
      for (const direction of ['outbound', 'inbound'] as const) {
        const points = snapshot[direction];
        if (
          points.length < 2 ||
          snapshot.roads?.[direction]?.key ===
            roadKey(points)
        )
          continue;
        if (controller.signal.aborted) return;
        setRouting((v) => ({ ...v, [direction]: 'Calculando por calles…' }));
        try {
          // Local street graph first (one-way aware, no U-turns at points);
          // the external service only if the graph cannot be loaded.
          const result = await routeOnGraph(points, controller.signal).catch(
            (e: Error) => {
              if (e.name === 'AbortError' || e.message.includes('punto'))
                throw e;
              return routeOnRoads(points, controller.signal);
            },
          );
          const latest = currentDraft.current;
          if (
            controller.signal.aborted ||
            !latest ||
            latest.id !== snapshot.id ||
            latest.routingMode === 'manual' ||
            roadKey(latest[direction]) !== result.key
          )
            return;
          applyRouting.current({
            ...latest,
            roads: { ...latest.roads, [direction]: result },
          });
          setRouting((v) => ({ ...v, [direction]: '' }));
        } catch (e) {
          if (!controller.signal.aborted)
            setRouting((v) => ({
              ...v,
              [direction]:
                (e as Error).name === 'TimeoutError'
                  ? 'El cálculo tardó demasiado. Reintenta.'
                  : (e as Error).message === 'Failed to fetch'
                    ? 'Sin conexión al servicio de calles. Reintenta.'
                    : (e as Error).message,
            }));
        }
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft?.id, draft?.routingMode, outboundKey, inboundKey, retry]);
  const [lat, setLat] = useState(''),
    [lon, setLon] = useState('');
  useEffect(() => {
    try {
      const store = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const items: RouteDraft[] = store?.drafts?.map(parseDraft) || [];
      setLibrary(items);
      setDraft(items.find((d) => d.id === store?.active) || newDraft());
    } catch {
      setDraft(newDraft());
      setError(
        'No se pudo recuperar el archivo local. Puedes importar una copia de respaldo.',
      );
    }
  }, []);
  const persist = (next: RouteDraft) => {
    const items = [next, ...library.filter((d) => d.id !== next.id)];
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ active: next.id, drafts: items }),
      );
      setLibrary(items);
      setSaved(true);
      setError('');
      return true;
    } catch {
      setSaved(false);
      setError(
        'No se pudo guardar en este navegador. Descarga una copia JSON antes de salir.',
      );
      return false;
    }
  };
  const change = (next: RouteDraft, history = true) => {
    if (history && draft) {
      setPast((p) => [...p.slice(-49), draft]);
      setFuture([]);
    }
    const value = { ...next, updatedAt: new Date().toISOString() };
    currentDraft.current = value;
    setDraft(value);
    persist(value);
  };
  applyRouting.current = (value) => change(value, false);
  const patch = (values: Partial<RouteDraft>) => {
    if (draft) change({ ...draft, ...values });
  };
  const open = (next: RouteDraft) => {
    if (draft && !saved && !persist(draft)) return;
    currentDraft.current = next;
    setDraft(next);
    persist(next);
    setPast([]);
    setFuture([]);
    setSelected(null);
  };
  const points = draft?.[active] || [];
  const preview = useMemo(
    () => (draft ? draftNetwork(draft, active) : null),
    [draft, active],
  );
  const warnings = draft ? draftWarnings(draft) : [];
  const normalizedDraft = draft ? withServiceDefaults(draft) : null;
  const problem = normalizedDraft ? publicationError(normalizedDraft) : '';
  const publishedCopy = publications.find((p) => p.draft.id === draft?.id);
  const pendingChanges =
    !!publishedCopy && publishedCopy.draft.updatedAt !== draft?.updatedAt;
  const pick = (p: Point) => {
    if (!draft) return;
    const point: Coordinate = [
      Number(p.lon.toFixed(6)),
      Number(p.lat.toFixed(6)),
    ];
    if (selected !== null) {
      patch({ [active]: points.map((v, i) => (i === selected ? point : v)) });
      setSelected(null);
    } else if (drawing) {
      if (points.length >= (draft.routingMode === 'manual' ? 1000 : 80)) {
        setError(
          draft.routingMode === 'manual'
            ? 'Máximo 1000 vértices por sentido.'
            : 'Máximo 80 puntos de paso para seguir calles. Marca solo los cruces necesarios.',
        );
        return;
      }
      if (points.at(-1)?.every((n, i) => n === point[i])) return;
      patch({ [active]: [...points, point] });
    }
  };
  const undo = (redo = false) => {
    const stack = redo ? future : past,
      last = stack.at(-1);
    if (!last || !draft) return;
    if (redo) {
      setFuture(stack.slice(0, -1));
      setPast((p) => [...p, draft]);
    } else {
      setPast(stack.slice(0, -1));
      setFuture((p) => [...p, draft]);
    }
    currentDraft.current = last;
    setDraft(last);
    persist(last);
    setSelected(null);
  };
  if (!draft || !preview)
    return (
      <main className="workspace">
        <p>Cargando editor…</p>
      </main>
    );
  return (
    <main className="route-editor">
      <div className="editor-heading">
        <div>
          <h1>Dibuja una mejor conexión.</h1>
          <p>
            Ida y vuelta independientes. Borradores para estudiar y verificar en
            campo.
          </p>
        </div>
        <span className="pill">
          {saved
            ? 'Guardado automático · este navegador'
            : 'Cambios sin guardar'}
        </span>
      </div>
      <div className="editor-workspace">
        <aside className="editor-panel">
          <section className="publication-controls">
            <h3>Publicación del recorrido</h3>
            <label><input type="checkbox" checked={draft.passengerVisible || false} onChange={e=>patch({passengerVisible:e.target.checked})}/> Habilitar para pasajeros: he revisado recorrido y datos del servicio</label>
            <p className="small-note">
              Publica una copia como propuesta local. Se guarda en este
              navegador; no se convierte en servicio de pasajeros. La fuente y
              los datos del servicio son opcionales: lo que falte se muestra al
              pasajero como «Por verificar». Horario por defecto 05:00–23:00.
            </p>
            <button
              className="primary"
              disabled={!!problem}
              onClick={() => normalizedDraft && onPublish?.(normalizedDraft)}
            >
              {publishedCopy
                ? 'Actualizar publicación en mi mapa'
                : draft.passengerVisible
                  ? 'Publicar para pasajeros'
                  : 'Publicar en mi mapa'}
            </button>
            {problem && (
              <p className="form-error" role="alert">
                {problem}
              </p>
            )}
            {publishedCopy && pendingChanges && (
              <p className="small-note">
                {problem
                  ? 'Hay cambios sin publicar; resuelve lo pendiente para actualizar.'
                  : 'Hay cambios sin publicar. Pulsa «Actualizar publicación en mi mapa» para aplicarlos.'}
              </p>
            )}
            {publishedCopy && (
              <p className="small-note">
                {publicationError(publishedCopy.draft)
                  ? 'Publicación activa: aún no visible para pasajeros.'
                  : publishedCopy.draft.passengerVisible
                    ? 'Publicación activa: visible para pasajeros.'
                    : 'Publicación activa: solo administración.'}
              </p>
            )}
            {publishedCopy && (
              <button
                className="text-button"
                onClick={() => onWithdraw?.(draft.id)}
              >
                Retirar del mapa
              </button>
            )}
          </section>
          <div className="inline-actions">
            <button className="secondary" onClick={() => open(newDraft())}>
              <Plus size={16} />
              Nuevo
            </button>
            <button
              className="secondary"
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              Importar copia
            </button>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept=".json,application/json"
              aria-label="Importar borrador JSON"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 20_000_000)
                    throw new Error('El archivo supera 20 MB.');
                  open(parseDraft(JSON.parse(await file.text())));
                } catch (e) {
                  setError((e as Error).message);
                }
                e.target.value = '';
              }}
            />
          </div>
          <div className="form-stack editor-metadata">
            <label>
              Nombre del recorrido
              <input
                maxLength={120}
                value={draft.name}
                placeholder="Ej. conexión mercado–universidad"
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="editor-inline">
              <label>
                Código
                <input
                  maxLength={12}
                  value={draft.code}
                  placeholder="P01"
                  onChange={(e) => patch({ code: e.target.value })}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
            </div>
          </div>
          <details className="service-settings form-stack">
            <summary>Configurar servicio del micro</summary>
            <p className="small-note">
              Datos para estimar el viaje. Guarda con «Actualizar publicación».
              No son llegadas GPS.
            </p>
            <label>
              Empresa u operador
              <input
                maxLength={120}
                value={draft.service?.operator || ''}
                onChange={(e) =>
                  patch({
                    service: { ...draft.service, operator: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Modelo o identificación visual
              <input
                placeholder="Combi blanca tipo Hiace"
                maxLength={120}
                value={draft.service?.model || ''}
                onChange={(e) =>
                  patch({
                    service: { ...draft.service, model: e.target.value },
                  })
                }
              />
            </label>
            {(
              [
                {
                  key: 'headway',
                  label: 'Intervalo de salida (min)',
                  min: 1,
                  max: 180,
                  placeholder: '10',
                },
                {
                  key: 'speedKmh',
                  label: 'Velocidad media operativa (km/h)',
                  min: 3,
                  max: 60,
                  placeholder: '15',
                },
                {
                  key: 'fare',
                  label: 'Tarifa (S/)',
                  min: 0,
                  max: 100,
                  placeholder: '1.50',
                },
              ] as const
            ).map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.key === 'fare' ? '0.10' : '1'}
                  placeholder={field.placeholder}
                  value={draft.service?.[field.key] ?? ''}
                  onChange={(e) =>
                    patch({
                      service: {
                        ...draft.service,
                        [field.key]:
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            <p className="small-note">
              Cada 10 min implica una espera media supuesta de 5 min. La
              velocidad debe incluir demoras habituales; sin medición se usa 15
              km/h como supuesto editable.
            </p>
            <div className="editor-inline">
              {(['start', 'end'] as const).map((key) => (
                <label key={key}>
                  {key === 'start' ? 'Inicio del servicio' : 'Fin del servicio'}
                  <input
                    type="time"
                    value={draft.service?.[key] || ''}
                    onChange={(e) =>
                      patch({
                        service: { ...draft.service, [key]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="section-heading">
            <h2>Sentido que estás editando</h2>
          </div>
          <div className="segmented editor-direction">
            {(['outbound', 'inbound'] as const).map((d) => (
              <button
                key={d}
                aria-pressed={active === d}
                className={active === d ? 'active' : ''}
                onClick={() => {
                  setActive(d);
                  setSelected(null);
                }}
              >
                <i className={d === 'inbound' ? 'dashed' : ''} />
                {d === 'outbound' ? 'Ida' : 'Vuelta'}
                <span>{draft[d].length}</span>
              </button>
            ))}
          </div>
          <div className="editor-stats">
            <span>
              <strong>{pathKm(draftGeometry(draft, active)).toFixed(2)}</strong>{' '}
              km de {active === 'outbound' ? 'ida' : 'vuelta'}
            </span>
            <span>{points.length} vértices</span>
          </div>
          <details className="routing-control">
            <summary>Opciones avanzadas del trazo</summary>
            <label>
              Cómo conectar los puntos
              <select
                aria-label="Modo de trazado"
                value={draft.routingMode || 'roads'}
                onChange={(e) =>
                  patch({ routingMode: e.target.value as 'roads' | 'manual' })
                }
              >
                <option value="roads">Seguir calles</option>
                <option value="manual">Trazado libre</option>
              </select>
            </label>
            <p className="small-note">
              {draft.routingMode === 'manual'
                ? 'Une puntos directamente. Úsalo solo para estudiar una propuesta fuera de la red vial.'
                : 'Marca cruces o lugares de paso. El recorrido sigue las calles respetando sus sentidos y elige solo la calzada correcta.'}
            </p>
          </details>
          {draft.routingMode !== 'manual' && (
            <div className="routing-status" role="status">
              {(['outbound', 'inbound'] as const).map((d) => (
                <p key={d}>
                  <strong>{d === 'outbound' ? 'Ida' : 'Vuelta'}</strong>{' '}
                  {routing[d] ||
                    (draftGeometry(draft, d).length >= 2
                      ? 'Ajustada a calles'
                      : draft[d].length < 2
                        ? 'Añade al menos dos puntos'
                        : 'Pendiente de cálculo')}
                </p>
              ))}
              {Object.values(routing).some(
                (s) => s && !s.startsWith('Calculando'),
              ) && (
                <button
                  className="secondary"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  Reintentar ajuste
                </button>
              )}
            </div>
          )}
          {draft.routingMode !== 'manual' &&
            draftGeometry(draft, active).length > 1 &&
            !!draft.roads?.[active]?.segments?.length && (
              <details
                className="street-review"
                open={draft.roads[active]!.segments!.some((s) => s.review)}
              >
                <summary>
                  Calles y sentido · {active === 'outbound' ? 'ida' : 'vuelta'}
                </summary>
                <p className="small-note">
                  Orientación de salida calculada por tramo. Un rodeo puede
                  responder a un sentido único, una restricción de giro o una
                  calzada mal elegida.
                </p>
                <ol>
                  {draft.roads[active]!.segments!.map((s) => (
                    <li key={s.from}>
                      <strong>
                        Puntos {s.from + 1}–{s.to + 1}
                        {s.bearing !== null
                          ? ` · hacia el ${compassDirection(s.bearing)}`
                          : ''}
                      </strong>
                      <span>{s.streets}</span>
                      <small>
                        {Math.round(s.distance)} m
                        {s.review ? ' · Revisar rodeo o cambio de sentido' : ''}
                      </small>
                      {s.review && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(s.to);
                            setDrawing(true);
                          }}
                        >
                          Reubicar punto {s.to + 1}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          <div className="editor-tools">
            <button
              className={drawing ? 'active' : ''}
              aria-pressed={drawing}
              onClick={() => {
                setDrawing(!drawing);
                setSelected(null);
              }}
            >
              {drawing ? (
                <PencilRuler size={16} />
              ) : (
                <MousePointer2 size={16} />
              )}{' '}
              {drawing ? 'Dibujando' : 'Explorar mapa'}
            </button>
            <button
              aria-label="Deshacer trazado"
              title="Deshacer"
              disabled={!past.length}
              onClick={() => undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="Rehacer trazado"
              title="Rehacer"
              disabled={!future.length}
              onClick={() => undo(true)}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <p className="small-note">
            {selected !== null
              ? `Vértice ${selected + 1}: haz clic en su nueva ubicación. Cambia de sentido para cancelar.`
              : 'Haz clic en el mapa para añadir vértices. Arrastra el mapa para desplazarte. Los vértices no son paraderos.'}
          </p>
          <details className="coordinate-entry">
            <summary>Añadir por coordenadas</summary>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const latitude = Number(lat),
                  longitude = Number(lon);
                if (
                  !lat.trim() ||
                  !lon.trim() ||
                  !Number.isFinite(latitude) ||
                  !Number.isFinite(longitude) ||
                  Math.abs(latitude) > 90 ||
                  Math.abs(longitude) > 180
                ) {
                  setError('Introduce latitud y longitud válidas.');
                  return;
                }
                if (
                  points.length >= (draft.routingMode === 'manual' ? 1000 : 80)
                ) {
                  setError(
                    draft.routingMode === 'manual'
                      ? 'Máximo 1000 vértices por sentido.'
                      : 'Máximo 80 puntos de paso para seguir calles. Marca solo los cruces necesarios.',
                  );
                  return;
                }
                patch({ [active]: [...points, [longitude, latitude]] });
                setSelected(null);
                setLat('');
                setLon('');
              }}
            >
              <label>
                Latitud
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="-15.4900"
                />
              </label>
              <label>
                Longitud
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  placeholder="-70.1300"
                />
              </label>
              <button className="secondary">Añadir vértice</button>
            </form>
          </details>
          <details className="editor-vertices" open>
            <summary>
              Editar vértices · {active === 'outbound' ? 'ida' : 'vuelta'}
            </summary>
            {points.length ? (
              <ol>
                {points.map((p, i) => (
                  <li key={`${i}`} className={selected === i ? 'active' : ''}>
                    <button
                      title="Mover vértice"
                      aria-label={`Mover vértice ${i + 1}`}
                      onClick={() => setSelected(selected === i ? null : i)}
                    >
                      <span>{i + 1}</span>
                      <span>
                        {p[1].toFixed(5)}, {p[0].toFixed(5)}
                      </span>
                      <Move size={13} />
                    </button>
                    <button
                      aria-label={`Eliminar vértice ${i + 1}`}
                      onClick={() => {
                        patch({ [active]: points.filter((_, k) => k !== i) });
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="small-note">
                Marca el inicio y continúa siguiendo las calles.
              </p>
            )}
          </details>
          <button
            className="text-button"
            disabled={
              points.length > 0 ||
              draft[active === 'outbound' ? 'inbound' : 'outbound'].length < 2
            }
            onClick={() => {
              patch({
                [active]: [
                  ...draft[active === 'outbound' ? 'inbound' : 'outbound'],
                ]
                  .reverse()
                  .map((p) => [...p] as Coordinate),
              });
              notify(
                'Puntos de regreso copiados. En modo calles, la vuelta se calcula de forma independiente.',
              );
            }}
          >
            <Copy size={15} />
            Copiar el otro sentido al revés
          </button>
          <p className="small-note">
            Disponible si este sentido está vacío. En modo calles, el regreso se
            calcula de nuevo.
          </p>
          <details className="editor-evidence">
            <summary>Fuente y observaciones de campo</summary>
            <div className="form-stack">
              <label>
                Fuente del trazado
                <input
                  value={draft.source}
                  maxLength={1000}
                  placeholder="Documento, operador o equipo de campo"
                  onChange={(e) => patch({ source: e.target.value })}
                />
              </label>
              <label>
                Fecha de referencia
                <input
                  type="date"
                  value={draft.observedAt}
                  onChange={(e) => patch({ observedAt: e.target.value })}
                />
              </label>
              <label>
                Abordaje y accesibilidad
                <textarea
                  value={draft.boarding}
                  maxLength={2000}
                  placeholder="Veredas, espacio de espera, acceso a la unidad…"
                  onChange={(e) => patch({ boarding: e.target.value })}
                />
              </label>
              <label>
                Puntos críticos a estudiar
                <textarea
                  value={draft.risks}
                  maxLength={2000}
                  placeholder="Cruces, congestión observada, iluminación. Sin datos personales."
                  onChange={(e) => patch({ risks: e.target.value })}
                />
              </label>
              <label>
                Hipótesis de mejora
                <textarea
                  value={draft.notes}
                  maxLength={2000}
                  placeholder="Qué conexión mejora y cómo lo comprobarás"
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </label>
            </div>
          </details>
          <button
            className="primary"
            onClick={() => {
              if (!draft.name.trim()) {
                setError('Añade un nombre al recorrido.');
                return;
              }
              if (persist(draft))
                notify(
                  'Borrador guardado en este navegador. No se publicó en la red de pasajeros.',
                );
            }}
          >
            <Save size={16} />
            Guardar borrador
          </button>
          <div className="inline-actions">
            <button
              className="secondary"
              onClick={() =>
                downloadJSON(`ruta-${draft.code || 'borrador'}.json`, draft)
              }
            >
              <Download size={15} />
              Copia JSON
            </button>
            <button
              className="secondary"
              disabled={!draftReady(draft)}
              onClick={() =>
                downloadJSON(
                  `ruta-${draft.code || 'borrador'}.geojson`,
                  exportDraft(draft),
                )
              }
            >
              GeoJSON · ambos
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </aside>
        <div className="editor-map-column">
          <div className="editor-map-actions">
            <div className="segmented">
              {(['outbound', 'inbound'] as const).map((d) => (
                <button
                  key={d}
                  className={active === d ? 'active' : ''}
                  aria-pressed={active === d}
                  onClick={() => {
                    setActive(d);
                    setSelected(null);
                  }}
                >
                  {d === 'outbound' ? 'Editar ida' : 'Editar vuelta'}
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              aria-label="Deshacer desde el mapa"
              disabled={!past.length}
              onClick={() => undo()}
            >
              <Undo2 size={17} />
            </button>
          </div>
          <div className="editor-map">
            <TransitMap
              network={preview}
              selected={draft.id}
              origin={
                selected !== null && points[selected]
                  ? { lon: points[selected][0], lat: points[selected][1] }
                  : null
              }
              destination={null}
              journey={null}
              positions={[]}
              onSelect={() => {}}
              onPick={pick}
              pickMode={drawing || selected !== null ? 'drawing' : null}
              direction="both"
              editing
            />
          </div>
          <div className="editor-map-caption">
            <span>
              <i />
              Ida continua
            </span>
            <span>
              <i className="dashed" />
              Vuelta discontinua
            </span>
            <span>Sentido de circulación</span>
          </div>
        </div>
        <div className="editor-validation">
          <h2>Antes de llevarla a la calle</h2>
          <p className="small-note">
            El ajuste usa calles y un perfil de automóvil; revisa las
            restricciones para micros. La revisión registrada aquí es personal;
            no acredita autorización ni seguridad.
          </p>
          {warnings.length > 0 && (
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="check-list">
            {checks.map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={draft.checks.includes(id)}
                  onChange={(e) =>
                    patch({
                      checks: e.target.checked
                        ? [...draft.checks, id]
                        : draft.checks.filter((v) => v !== id),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <p className="routing-source small-note">
        {draft.routingMode === 'manual' ? (
          'Trazado libre pendiente de verificación.'
        ) : (
          <>
            Cálculo de calles:{' '}
            <a href={ROUTING_BASE} target="_blank" rel="noreferrer">
              OSRM / OpenStreetMap
            </a>
            . Se envían los puntos de paso al servicio. Necesita conexión y no
            acredita autorización de transporte.
          </>
        )}
      </p>
      <section className="editor-library">
        <div className="section-heading">
          <h2>Tus borradores</h2>
          <span>{library.length} en este navegador</span>
        </div>
        <div className="draft-list">
          {library.map((d) => (
            <button
              className={draft.id === d.id ? 'active' : ''}
              key={d.id}
              onClick={() => open(d)}
            >
              <span>
                <strong>{d.name || 'Borrador sin nombre'}</strong>
                <small>
                  {d.code || 'Sin código'} · Ida{' '}
                  {pathKm(draftGeometry(d, 'outbound')).toFixed(1)} km / vuelta{' '}
                  {pathKm(draftGeometry(d, 'inbound')).toFixed(1)} km
                </small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
        {network.routes.length > 0 && (
          <details>
            <summary>Partir de una ruta del piloto</summary>
            <p className="small-note">
              Se crea una copia de trabajo. Los datos de ejemplo continúan sin
              verificar.
            </p>
            <div className="inline-actions">
              {network.routes.map((r) => (
                <button
                  key={r.id}
                  className="secondary"
                  onClick={() =>
                    open({
                      ...newDraft(),
                      name: `Estudio · ${r.name}`,
                      code: r.code,
                      color: r.color,
                      outbound: r.geometry.map((p) => [p[0], p[1]]),
                      inbound: r.inbound_geometry.map((p) => [p[0], p[1]]),
                      source: `Copia de ${r.code}: ${r.source}`,
                    })
                  }
                >
                  {r.code} · {r.name}
                </button>
              ))}
            </div>
          </details>
        )}
      </section>
    </main>
  );
}
