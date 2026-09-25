'use client';
import { useState } from 'react';
import { Save, Download } from 'lucide-react';
import { downloadJSON } from '../lib/api';
import type { Network } from '../lib/mobility';
import type { LabObservation, LabState } from '../lib/lab-types';

export default function LabFieldwork({
  state,
  network,
  commit,
  busy,
  onUse,
}: {
  state: LabState;
  network: Network;
  commit: (s: LabState) => Promise<boolean>;
  busy: boolean;
  onUse: (o: LabObservation) => void;
}) {
  const [draft, setDraft] = useState({
    routeId: network.routes[0]?.id || '',
    date: '',
    phase: 'before' as 'before' | 'after',
    minutes: 30,
    vehicles: 0,
    boardings: 0,
    cycleMinutes: '',
    headways: '',
    source: '',
    notes: '',
  });
  return (
    <div className="lab-input-layout">
      <section className="surface">
        <h2>Medir para mejorar</h2>
        <p className="muted">
          Conteos agregados del piloto. Cada registro conserva fecha, muestra y
          fuente.
        </p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const observation: LabObservation = {
              ...draft,
              id: crypto.randomUUID(),
              date: draft.date + '-05:00',
              cycleMinutes: draft.cycleMinutes
                ? Number(draft.cycleMinutes)
                : null,
              headways: draft.headways.trim()
                ? draft.headways.split(/[,;\s]+/).map(Number)
                : [],
            };
            if (
              await commit({
                ...state,
                observations: [observation, ...state.observations],
              })
            )
              setDraft({ ...draft, headways: '', notes: '' });
          }}
        >
          <label>
            Recorrido observado
            <select
              value={draft.routeId}
              onChange={(e) => setDraft({ ...draft, routeId: e.target.value })}
            >
              {network.routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="lab-fields">
            <label>
              Fecha y hora · Lima
              <input
                type="datetime-local"
                required
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Etapa
              <select
                value={draft.phase}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    phase: e.target.value as 'before' | 'after',
                  })
                }
              >
                <option value="before">Antes del piloto</option>
                <option value="after">Después del piloto</option>
              </select>
            </label>
          </div>
          <div className="lab-fields">
            {(
              [
                ['minutes', 'Duración del conteo (min)', 1, 1440],
                ['vehicles', 'Vehículos observados', 0, 100000],
                ['boardings', 'Ascensos observados', 0, 100000],
              ] as const
            ).map(([k, label, min, max]) => (
              <label key={k}>
                {label}
                <input
                  type="number"
                  required
                  min={min}
                  max={max}
                  value={draft[k]}
                  onChange={(e) =>
                    setDraft({ ...draft, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <label>
              Ciclo completo medido (min)
              <input
                type="number"
                min={1}
                max={1000}
                step="any"
                value={draft.cycleMinutes}
                onChange={(e) =>
                  setDraft({ ...draft, cycleMinutes: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Intervalos entre unidades (min)
            <input
              placeholder="Ejemplo de formato: 8, 12, 10"
              value={draft.headways}
              onChange={(e) => setDraft({ ...draft, headways: e.target.value })}
            />
          </label>
          <label>
            Fuente / equipo y punto de conteo
            <input
              required
              minLength={3}
              maxLength={2000}
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            />
          </label>
          <label>
            Condiciones y notas
            <textarea
              maxLength={2000}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Sentido, lluvia, feria, cambios de operación, muestra…"
            />
          </label>
          <button className="primary" disabled={busy}>
            <Save size={16} />
            Guardar observación
          </button>
        </form>
        <p className="small-note">
          Sin nombres, DNI ni domicilios. Los ascensos de una muestra no son
          demanda horaria representativa ni carga del tramo crítico.
        </p>
      </section>
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>Bitácora del piloto</h2>
            <p className="muted">
              Compara días y ventanas equivalentes; no atribuyas todo cambio al
              piloto.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              downloadJSON('juliaca-observaciones.json', state.observations)
            }
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
        {!state.observations.length ? (
          <div className="empty-state">
            <h3>Empieza con una muestra verificable</h3>
            <p>
              Registra ambos sentidos en dos días ordinarios y un día de feria.
              Reserva observaciones independientes para validar las propuestas.
            </p>
          </div>
        ) : (
          state.observations.map((o) => {
            const mean = o.headways.length
              ? o.headways.reduce((a, b) => a + b, 0) / o.headways.length
              : null;
            const cv = mean
              ? Math.sqrt(
                  o.headways.reduce((n, h) => n + (h - mean) ** 2, 0) /
                    o.headways.length,
                ) / mean
              : null;
            return (
              <article key={o.id} className="lab-observation">
                <div>
                  <strong>
                    {network.routes.find((r) => r.id === o.routeId)?.code ||
                      o.routeId}{' '}
                    · {o.phase === 'before' ? 'Antes' : 'Después'}
                  </strong>
                  <span>
                    {new Date(o.date).toLocaleString('es-PE', {
                      timeZone: 'America/Lima',
                    })}
                  </span>
                </div>
                <p>
                  {o.vehicles} vehículos · {o.boardings} ascensos · muestra de{' '}
                  {o.minutes} min
                </p>
                <p>
                  {mean === null
                    ? 'Sin intervalos registrados'
                    : `Intervalo medio ${mean.toFixed(1)} min · variabilidad CV ${cv!.toFixed(2)} · ${o.headways.length} intervalos`}
                  {o.cycleMinutes ? ` · ciclo ${o.cycleMinutes} min` : ''}
                </p>
                <small>
                  {o.source}. {o.notes}
                </small>
                {mean !== null && (
                  <button className="text-button" onClick={() => onUse(o)}>
                    Usar intervalo como referencia del escenario
                  </button>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
