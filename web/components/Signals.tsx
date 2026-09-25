'use client';
import SignalIcon from './SignalIcon';
import { useEffect, useState } from 'react';
import { signalCycle, phaseNames } from '../lib/signal-cycle';
import { Plus, MapPin, Save, Trash2, Download } from 'lucide-react';
import TransitMap from './TransitMap';
import { downloadJSON } from '../lib/api';
import type { Network } from '../lib/mobility';
import {
  newSignal,
  validateSignal,
  signalStatuses,
  type SignalPoint,
} from '../lib/map-workspace';
const unlocatedSignal = () => ({ ...newSignal(), lat: NaN, lon: NaN });
export default function Signals({
  network,
  signals,
  onChange,
  notify,
  initialId,
}: {
  network: Network;
  signals: SignalPoint[];
  onChange: (items: SignalPoint[]) => void;
  notify: (message: string) => void;
  initialId?: string | null;
}) {
  const [draft, setDraft] = useState<SignalPoint>(
      () => signals.find((s) => s.id === initialId) || unlocatedSignal(),
    ),
    [picking, setPicking] = useState(false),
    [located, setLocated] = useState(signals.some((s) => s.id === initialId)),
    [error, setError] = useState('');
  const patch = (v: Partial<SignalPoint>) => setDraft((d) => ({ ...d, ...v }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const savedSignal = signals.find((s) => s.id === draft.id);
  const cycle = savedSignal ? signalCycle(savedSignal, now) : null;
  const total = [draft.red, draft.amber, draft.green].every((v) => v !== null)
    ? draft.red! + draft.amber! + draft.green!
    : null;
  return (
    <main className="editor-page signals-page">
      <div className="editor-heading">
        <div>
          <h1>Semáforos y cruces</h1>
          <p>
            Ubicación, estado observado y tiempos por acceso. Inventario local,
            sin control de equipos.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setDraft(unlocatedSignal());
            setLocated(false);
            setPicking(true);
            setError('');
          }}
        >
          <Plus size={16} />
          Añadir semáforo
        </button>
      </div>
      <div className="editor-workspace">
        <aside className="editor-panel">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                if (!located)
                  throw new Error(
                    'Marca el semáforo en el mapa o introduce sus coordenadas.',
                  );
                const item = validateSignal({
                  ...draft,
                  updatedAt: new Date().toISOString(),
                });
                onChange([item, ...signals.filter((s) => s.id !== item.id)]);
                setDraft(item);
                setError('');
                notify('Semáforo guardado en este navegador.');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h2>
              {signals.some((s) => s.id === draft.id)
                ? 'Editar semáforo'
                : 'Nuevo semáforo'}
            </h2>
            <label>
              Cruce o nombre
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                required
                maxLength={160}
                placeholder="Ej. Av. Circunvalación / Jirón…"
              />
            </label>
            <label>
              Acceso y orientación
              <input
                value={draft.approach}
                onChange={(e) => patch({ approach: e.target.value })}
                maxLength={200}
                placeholder="Ej. acceso norte, hacia el centro"
              />
            </label>
            <button
              type="button"
              className="secondary"
              aria-pressed={picking}
              onClick={() => setPicking(!picking)}
            >
              <MapPin size={16} />
              {picking ? 'Cancelar ubicación' : 'Ubicar en el mapa'}
            </button>
            <div className="editor-inline">
              {(['lat', 'lon'] as const).map((k) => (
                <label key={k}>
                  {k === 'lat'
                    ? 'Latitud del semáforo'
                    : 'Longitud del semáforo'}
                  <input
                    type="number"
                    step="any"
                    required
                    min={k === 'lat' ? -90 : -180}
                    max={k === 'lat' ? 90 : 180}
                    value={Number.isFinite(draft[k]) ? draft[k] : ''}
                    onChange={(e) => {
                      patch({ [k]: e.target.valueAsNumber });
                      setLocated(true);
                    }}
                  />
                </label>
              ))}
            </div>
            <label>
              Estado registrado
              <select
                value={draft.status}
                onChange={(e) =>
                  patch({ status: e.target.value as SignalPoint['status'] })
                }
              >
                {Object.entries(signalStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="signal-timings">
              <legend>Duraciones observadas o propuestas</legend>
              <p className="small-note">
                Segundos para este acceso. Deja vacío lo desconocido.
              </p>
              <div>
                {(['red', 'amber', 'green'] as const).map((k, i) => (
                  <label key={k}>
                    {['Rojo', 'Ámbar', 'Verde'][i]}
                    <input
                      type="number"
                      min="0"
                      max="600"
                      step="1"
                      value={draft[k] ?? ''}
                      onChange={(e) =>
                        patch({
                          [k]:
                            e.target.value === ''
                              ? null
                              : e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="small-note">
                {total !== null
                  ? `Suma de fases: ${total} s. No incluye fases adicionales ni desfases.`
                  : 'Sin suma de fases disponible.'}
              </p>
            </fieldset>
            <div className="signal-cycle-readout" role="status">
              <span
                className="signal-cycle-dot"
                data-phase={cycle?.phase || 'off'}
              />
              {cycle && cycle.phase !== 'off'
                ? `Simulación guardada: ${phaseNames[cycle.phase]} · ${cycle.remaining} s`
                : 'Guarda las tres duraciones para ver el ciclo simulado.'}
            </div>
            <label className="signal-checkbox">
              <input
                type="checkbox"
                checked={draft.pedestrian}
                onChange={(e) => patch({ pedestrian: e.target.checked })}
              />
              Tiene señal peatonal
            </label>
            <label>
              Fuente del semáforo
              <input
                value={draft.source}
                onChange={(e) => patch({ source: e.target.value })}
                maxLength={1000}
                placeholder="Aforo, inspección o documento"
              />
            </label>
            <label>
              Fecha de observación
              <input
                type="date"
                value={draft.observedAt}
                onChange={(e) => patch({ observedAt: e.target.value })}
              />
            </label>
            <label>
              Observaciones
              <textarea
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                maxLength={2000}
                placeholder="Visibilidad, avería, cruce peatonal…"
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary">
              <Save size={16} />
              Guardar semáforo
            </button>
          </form>
        </aside>
        <div className="editor-map-column">
          <div className="editor-map">
            <TransitMap
              network={network}
              selected={null}
              origin={located ? draft : null}
              destination={null}
              journey={null}
              positions={[]}
              signals={signals}
              onSignal={(id) => {
                const s = signals.find((s) => s.id === id);
                if (s) {
                  setDraft(s);
                  setLocated(true);
                  setPicking(false);
                }
              }}
              onSelect={() => {}}
              onPick={(p) => {
                patch(p);
                setLocated(true);
                setPicking(false);
              }}
              pickMode={picking ? 'signal' : null}
              editing
            />
          </div>
          <div className="editor-map-caption">
            Los colores siguen un ciclo simulado con los tiempos guardados, no
            una señal del equipo físico.
          </div>
        </div>
      </div>
      <section className="editor-library">
        <div className="section-heading">
          <h2>Inventario de semáforos · {signals.length}</h2>
          <button
            className="secondary"
            disabled={!signals.length}
            onClick={() =>
              downloadJSON('semaforos-juliaca.geojson', {
                type: 'FeatureCollection',
                features: signals.map(({ lat, lon, ...properties }) => ({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [lon, lat] },
                  properties,
                })),
              })
            }
          >
            <Download size={15} />
            Exportar GeoJSON
          </button>
        </div>
        {!signals.length ? (
          <p className="small-note">
            Añade el primer cruce para empezar el levantamiento de campo.
          </p>
        ) : (
          <div className="signal-list">
            {signals.map((s) => (
              <article key={s.id}>
                <button
                  className="signal-open"
                  onClick={() => {
                    setDraft(s);
                    setLocated(true);
                    setPicking(false);
                    setError('');
                  }}
                >
                  <SignalIcon size={18} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {signalStatuses[s.status]} ·{' '}
                      {s.approach || 'Acceso por registrar'}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar semáforo ${s.name}`}
                  onClick={() => {
                    try {
                      onChange(signals.filter((v) => v.id !== s.id));
                      if (draft.id === s.id) {
                        setDraft(unlocatedSignal());
                        setLocated(false);
                      }
                      notify('Semáforo retirado del inventario local.');
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="mobility-next">
        <h2>Siguientes estudios para el desafío</h2>
        <ul>
          <li>
            <strong>Demoras en cruces:</strong> medir colas y tiempos de espera
            por acceso y franja horaria.
          </li>
          <li>
            <strong>Continuidad peatonal:</strong> registrar rampas, visibilidad
            y duración disponible para cruzar.
          </li>
          <li>
            <strong>Coordinación semafórica:</strong> comparar escenarios con
            aforos y revisión técnica antes de proponer cambios.
          </li>
          <li>
            <strong>Calidad de rutas:</strong> relacionar recorridos publicados
            con puntos de congestión observados.
          </li>
        </ul>
      </section>
    </main>
  );
}
