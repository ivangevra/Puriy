'use client';
import { useState } from 'react';
import { MapPin, Plus, Save } from 'lucide-react';
import TransitMap from './TransitMap';
import PlaceSearch from './PlaceSearch';
import type { Network } from '../lib/mobility';
import {
  categoryNames,
  dayNames,
  type LabPlace,
  type LabEvent,
  type LabState,
  type Evidence,
  type Validation,
} from '../lib/lab-types';

export function DayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <fieldset className="lab-days">
      <legend>Días aplicables</legend>
      {dayNames.map((name, i) => (
        <label key={name}>
          <input
            type="checkbox"
            checked={value.includes(i)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, i].sort((a, b) => a - b)
                  : value.filter((d) => d !== i),
              )
            }
          />
          {name.slice(0, 3)}
        </label>
      ))}
    </fieldset>
  );
}
function EvidenceFields({
  value,
  onChange,
}: {
  value: {
    source: string;
    evidence: Evidence;
    validation: Validation;
    notes: string;
  };
  onChange: (v: Partial<typeof value>) => void;
}) {
  return (
    <>
      <label>
        Fuente y fecha de verificación
        <input
          required
          maxLength={2000}
          value={value.source}
          onChange={(e) => onChange({ source: e.target.value })}
        />
      </label>
      <div className="lab-fields">
        <label>
          Tipo de evidencia
          <select
            value={value.evidence}
            onChange={(e) => onChange({ evidence: e.target.value as Evidence })}
          >
            <option value="documental">Documento</option>
            <option value="observed">Observación de campo</option>
            <option value="assumption">Supuesto del escenario</option>
          </select>
        </label>
        <label>
          Validación
          <select
            aria-label="Validación"
            value={value.validation}
            onChange={(e) =>
              onChange({ validation: e.target.value as Validation })
            }
          >
            <option value="pending">Pendiente</option>
            <option value="reviewed">Revisado para el estudio</option>
            <option value="conflict">En conflicto</option>
          </select>
        </label>
      </div>
      <label>
        Notas
        <textarea
          maxLength={2000}
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
    </>
  );
}
export function LabDestinations({
  state,
  network,
  commit,
  busy,
}: {
  state: LabState;
  network: Network;
  commit: (s: LabState) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<LabPlace | null>(null),
    [pick, setPick] = useState(false),
    [search, setSearch] = useState('');
  const patch = (p: Partial<LabPlace>) =>
    setEditing((v) => (v ? { ...v, ...p } : v));
  return (
    <div className="lab-input-layout">
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>Destinos y oportunidades</h2>
            <p className="muted">
              Registra entradas y horarios. No se inventan afluencias.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                name: '',
                category: 'education',
                groupId: crypto.randomUUID(),
                point: null,
                source: '',
                page: null,
                evidence: 'observed',
                validation: 'pending',
                notes: '',
                open: null,
                close: null,
                days: [],
              })
            }
          >
            <Plus size={16} />
            Añadir destino
          </button>
        </div>
        <p className="small-note">
          Un complejo y sus establecimientos comparten el mismo grupo. El
          cálculo cuenta oportunidades únicas; no multiplica visitantes de Real
          Plaza, Plaza Vea y su entorno.
        </p>
        <div className="lab-record-list">
          {state.places.map((p) => (
            <button
              className={
                editing?.id === p.id ? 'lab-record active' : 'lab-record'
              }
              key={p.id}
              onClick={() => {
                setEditing(structuredClone(p));
                setSearch('');
                setPick(false);
              }}
            >
              <span>
                <strong>{p.name}</strong>
                <small>
                  {categoryNames[p.category]}
                  {p.page ? ` · PDU p. ${p.page}` : ''}
                </small>
              </span>
              <span className="pill">
                {!p.point
                  ? 'Sin ubicación'
                  : p.validation === 'reviewed' && p.open
                    ? 'Listo para estudio'
                    : 'Por revisar'}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="surface">
        {editing ? (
          <>
            <h2>{editing.name || 'Nuevo destino'}</h2>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await commit({
                    ...state,
                    places: [
                      ...state.places.filter((p) => p.id !== editing.id),
                      editing,
                    ],
                  })
                )
                  setEditing(null);
              }}
            >
              <label>
                Nombre del destino
                <input
                  required
                  maxLength={160}
                  value={editing.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <div className="lab-fields">
                <label>
                  Categoría
                  <select
                    value={editing.category}
                    onChange={(e) =>
                      patch({
                        category: e.target.value as LabPlace['category'],
                      })
                    }
                  >
                    {Object.entries(categoryNames).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Grupo / complejo
                  <input
                    required
                    maxLength={160}
                    value={editing.groupId}
                    onChange={(e) => patch({ groupId: e.target.value })}
                  />
                </label>
              </div>
              <PlaceSearch
                id="lab-place-search"
                label="Buscar una entrada"
                value={search}
                placeholder="Nombre, calle o establecimiento"
                network={network}
                onChange={setSearch}
                onSelect={(p) => {
                  setSearch(p.name);
                  patch({
                    point: { lat: p.lat, lon: p.lon },
                    validation: 'pending',
                  });
                  setPick(false);
                }}
              />
              <div className="lab-fields">
                <label>
                  Latitud de entrada
                  <input
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={editing.point?.lat ?? ''}
                    onChange={(e) =>
                      patch({
                        point: e.target.value
                          ? {
                              lat: Number(e.target.value),
                              lon: editing.point?.lon ?? -70.13,
                            }
                          : null,
                        validation: 'pending',
                      })
                    }
                  />
                </label>
                <label>
                  Longitud de entrada
                  <input
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={editing.point?.lon ?? ''}
                    onChange={(e) =>
                      patch({
                        point: e.target.value
                          ? {
                              lon: Number(e.target.value),
                              lat: editing.point?.lat ?? -15.49,
                            }
                          : null,
                        validation: 'pending',
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="secondary"
                aria-pressed={pick}
                onClick={() => setPick(!pick)}
              >
                <MapPin size={16} />
                {pick ? 'Cancelar selección' : 'Ubicar entrada en el mapa'}
              </button>
              <div className="lab-location-map">
                <TransitMap
                  network={network}
                  selected={null}
                  origin={editing.point}
                  destination={null}
                  journey={null}
                  positions={[]}
                  onSelect={() => {}}
                  pickMode={pick ? 'origin' : null}
                  onPick={(p) => {
                    patch({ point: p, validation: 'pending' });
                    setPick(false);
                  }}
                />
              </div>
              <div className="lab-fields">
                <label>
                  Abre
                  <input
                    type="time"
                    value={editing.open ?? ''}
                    onChange={(e) => patch({ open: e.target.value || null })}
                  />
                </label>
                <label>
                  Cierra
                  <input
                    type="time"
                    value={editing.close ?? ''}
                    onChange={(e) => patch({ close: e.target.value || null })}
                  />
                </label>
              </div>
              <DayPicker
                value={editing.days}
                onChange={(days) => patch({ days })}
              />
              <EvidenceFields value={editing} onChange={patch} />
              <p className="small-note">
                Un resultado de búsqueda necesita revisión de la entrada. Sin
                ubicación, horario o validación no participa del cálculo de
                acceso a oportunidades.
              </p>
              <div className="inline-actions">
                <button className="primary" disabled={busy}>
                  <Save size={16} />
                  Guardar destino
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <MapPin size={30} />
            <h3>Ubica las entradas que importan</h3>
            <p>
              Selecciona un destino del PDU o añade un colegio, establecimiento
              de salud o terminal con su fuente.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export function LabCalendar({
  state,
  network,
  commit,
  busy,
}: {
  state: LabState;
  network: Network;
  commit: (s: LabState) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<LabEvent | null>(null);
  const patch = (p: Partial<LabEvent>) =>
    setEditing((v) => (v ? { ...v, ...p } : v));
  return (
    <div className="lab-input-layout">
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>Calendario y afectaciones</h2>
            <p className="muted">
              El PDU identifica días; el efecto sobre cada línea necesita
              revisión.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                name: '',
                source: '',
                page: null,
                days: [],
                start: null,
                end: null,
                routeId: null,
                extraCycleMinutes: null,
                suspended: false,
                evidence: 'assumption',
                validation: 'pending',
                notes: '',
              })
            }
          >
            <Plus size={16} />
            Añadir afectación
          </button>
        </div>
        <div className="lab-record-list">
          {state.events.map((e) => (
            <button
              className={
                editing?.id === e.id ? 'lab-record active' : 'lab-record'
              }
              key={e.id}
              onClick={() => setEditing(structuredClone(e))}
            >
              <span>
                <strong>{e.name}</strong>
                <small>
                  {e.days.map((d) => dayNames[d].slice(0, 3)).join(' · ') ||
                    'Fecha pendiente'}
                  {e.page ? ` · PDU p. ${e.page}` : ''}
                </small>
              </span>
              <span className="pill">
                {e.validation === 'reviewed'
                  ? 'Aplicable al estudio'
                  : 'No aplicada'}
              </span>
            </button>
          ))}
        </div>
        <p className="small-note">
          Este módulo aplica minutos adicionales al ciclo completo o suspende
          una línea durante la ventana definida. No interpreta ocupación parcial
          de una calle como cierre ni genera desvíos automáticos por segmentos.
        </p>
      </section>
      <section className="surface">
        {editing ? (
          <>
            <h2>{editing.name || 'Nueva afectación'}</h2>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await commit({
                    ...state,
                    events: [
                      ...state.events.filter((r) => r.id !== editing.id),
                      editing,
                    ],
                  })
                )
                  setEditing(null);
              }}
            >
              <label>
                Nombre
                <input
                  required
                  maxLength={160}
                  value={editing.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                Recorrido afectado
                <select
                  value={editing.routeId ?? ''}
                  onChange={(e) =>
                    patch({
                      routeId: e.target.value || null,
                      validation: 'pending',
                    })
                  }
                >
                  <option value="">Pendiente de vincular</option>
                  {network.routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <DayPicker
                value={editing.days}
                onChange={(days) => patch({ days })}
              />
              <div className="lab-fields">
                <label>
                  Desde
                  <input
                    type="time"
                    value={editing.start ?? ''}
                    onChange={(e) => patch({ start: e.target.value || null })}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="time"
                    value={editing.end ?? ''}
                    onChange={(e) => patch({ end: e.target.value || null })}
                  />
                </label>
              </div>
              <label>
                Minutos adicionales por ciclo completo
                <input
                  type="number"
                  min={0}
                  max={300}
                  step="any"
                  value={editing.extraCycleMinutes ?? ''}
                  onChange={(e) =>
                    patch({
                      extraCycleMinutes:
                        e.target.value === '' ? null : Number(e.target.value),
                      evidence: 'assumption',
                      validation: 'pending',
                    })
                  }
                />
              </label>
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={editing.suspended}
                  onChange={(e) =>
                    patch({
                      suspended: e.target.checked,
                      evidence: 'assumption',
                      validation: 'pending',
                    })
                  }
                />
                Simular suspensión completa de esta línea
              </label>
              <EvidenceFields value={editing} onChange={patch} />
              <p className="small-note">
                Las modificaciones de efecto se marcan como supuesto. Usa
                «Observación de campo» solo con medición y fuente. Los
                pendientes no alteran resultados.
              </p>
              <div className="inline-actions">
                <button className="primary" disabled={busy}>
                  <Save size={16} />
                  Guardar afectación
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <h3>Un lunes puede requerir otra operación</h3>
            <p>
              Completa una afectación con línea, horario y efecto. La
              comparación usará el mismo día para la base y su alternativa.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
