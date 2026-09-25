'use client';
import { Download, Save } from 'lucide-react';
import { downloadJSON } from '../lib/api';
import { dayNames, type Evaluation, type Study } from '../lib/lab-types';
import type { frequencyAlternatives } from '../lib/lab-engine';
const number = (n: number | null, places = 0) =>
  n === null
    ? 'Sin dato'
    : n.toLocaleString('es-PE', { maximumFractionDigits: places });
export default function LabResults({
  result,
  options,
  busy,
  onSave,
  onChange,
}: {
  result: Evaluation;
  options: ReturnType<typeof frequencyAlternatives>;
  busy: boolean;
  onSave: () => void;
  onChange: (s: Partial<Study>) => void;
}) {
  const { base, proposed, baseFleet: a, proposedFleet: b } = result;
  const opportunities = base.evaluatedPlaces > 0;
  const metrics: [string, string, string][] = [
    [
      'Población conocida cerca de un abordaje',
      number(base.covered),
      number(proposed.covered),
    ],
    [
      `Población que alcanza un destino en ${result.study.thresholdMinutes} min`,
      opportunities ? number(base.reachable) : 'Sin destinos',
      opportunities ? number(proposed.reachable) : 'Sin destinos',
    ],
    [
      'Población sin conexión a destinos evaluados',
      opportunities ? number(base.disconnected) : 'Sin destinos',
      opportunities ? number(proposed.disconnected) : 'Sin destinos',
    ],
    [
      'Tiempo mediano al destino más cercano · min',
      number(base.median, 1),
      number(proposed.median, 1),
    ],
    [
      'Tiempo P90 al destino más cercano · min',
      number(base.p90, 1),
      number(proposed.p90, 1),
    ],
    ['Longitud de ida + vuelta · km', number(a.km, 2), number(b.km, 2)],
    ['Ciclo estimado · min', number(a.cycle, 1), number(b.cycle, 1)],
    [
      'Intervalo solicitado → sostenible · min',
      `${number(a.requestedHeadway, 1)} → ${number(a.effectiveHeadway, 1)}`,
      `${number(b.requestedHeadway, 1)} → ${number(b.effectiveHeadway, 1)}`,
    ],
    [
      'Unidades requeridas para el intervalo solicitado',
      number(a.vehiclesRequired),
      number(b.vehiclesRequired),
    ],
    [
      'Unidades en uso / disponibles',
      `${a.vehiclesUsed} / ${a.available}`,
      `${b.vehiclesUsed} / ${b.available}`,
    ],
    [
      'Plazas ofertadas por hora y sentido',
      number(a.capacityPerHour),
      number(b.capacityPerHour),
    ],
    [
      'Vehículo-km por hora',
      number(a.vehicleKmPerHour, 1),
      number(b.vehicleKmPerHour, 1),
    ],
    [
      'Coste por hora · S/',
      result.study.costPerKm || result.study.costPerHour
        ? number(a.costPerHour, 2)
        : 'Sin costes',
      result.study.costPerKm || result.study.costPerHour
        ? number(b.costPerHour, 2)
        : 'Sin costes',
    ],
  ];
  return (
    <section className="surface lab-results">
      <div className="surface-head">
        <div>
          <h2>Qué cambia con la propuesta</h2>
          <p className="muted">
            {dayNames[result.study.day]} · {result.study.hour} · misma flota
            disponible
          </p>
        </div>
        <button className="secondary" disabled={busy} onClick={onSave}>
          <Save size={16} />
          Guardar estudio
        </button>
      </div>
      <div className="lab-verdict" aria-live="polite">
        <strong>
          {b.vehiclesUsed === 0
            ? 'Servicio suspendido en el escenario'
            : b.overload
              ? 'La carga introducida excede la oferta'
              : !b.targetFeasible
                ? 'El intervalo solicitado necesita más flota'
                : 'Intervalo compatible con la flota del escenario'}
        </strong>
        <p>
          {number(result.gained)} habitantes conocidos ganan proximidad;{' '}
          {number(result.lost)} la pierden.{' '}
          {opportunities
            ? `${number(result.improved)} mejoran su acceso al destino más cercano; ${number(result.worsened)} empeoran.`
            : 'Completa destinos para evaluar tiempos de acceso.'}
        </p>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <caption>
            Comparación exploratoria · población conocida total{' '}
            {number(base.population)} · {number(base.unknownBlocks)} manzanas
            sin población asociada
          </caption>
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Base</th>
              <th>Propuesta</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, x, y]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{x}</td>
                <td>{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-note">
        Mediana y P90 ponderados por habitantes conocidos con conexión; la
        población desconectada se muestra por separado. Son tiempos potenciales
        hacia el destino seleccionado más cercano, no tiempos observados de
        pasajeros. Tarifa directa supuesta: S/ {number(result.study.fare, 2)} en
        ambos escenarios.
      </p>
      {!!options.length && (
        <>
          <h3>Alternativas de despacho con la misma flota</h3>
          <p className="small-note">
            Búsqueda entre intervalos discretos. La capacidad solo se contrasta
            si registraste carga crítica; no hay una predicción de demanda.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Intervalo</th>
                  <th>Unidades</th>
                  <th>Plazas/h</th>
                  <th>Evaluación</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <tr key={o.headway}>
                    <td>{o.headway} min</td>
                    <td>{o.vehiclesRequired}</td>
                    <td>{number(o.capacityPerHour)}</td>
                    <td>
                      {o.feasible
                        ? 'Compatible con los límites'
                        : o.overload
                          ? 'Carga excedida'
                          : 'Flota insuficiente / suspensión'}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={!o.feasible}
                        onClick={() => onChange({ proposedHeadway: o.headway })}
                      >
                        Usar intervalo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <details>
        <summary>Ganadores y pérdidas por zona</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Distrito · zona</th>
                <th>Población conocida</th>
                <th>Cerca · base</th>
                <th>Cerca · propuesta</th>
                <th>Pierden proximidad</th>
              </tr>
            </thead>
            <tbody>
              {result.zones.map((z) => (
                <tr key={z.name}>
                  <th scope="row">{z.name}</th>
                  <td>{number(z.known)}</td>
                  <td>{number(z.base)}</td>
                  <td>{number(z.proposed)}</td>
                  <td>{number(z.lost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Supuestos, fuentes y límites del resultado</summary>
        <ul className="lab-limitations">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p>
          Afectaciones aplicadas: {result.appliedEvents.join('; ') || 'ninguna'}
          .
        </p>
        <p className="small-note">
          Motor {result.version} · referencia {result.fingerprint} ·{' '}
          {new Date(result.calculatedAt).toLocaleString('es-PE')} ·{' '}
          {result.study.source}
        </p>
      </details>
      <button
        className="text-button"
        onClick={() =>
          downloadJSON('juliaca-resultados-por-manzana.json', result)
        }
      >
        <Download size={16} />
        Exportar resultados por manzana
      </button>
    </section>
  );
}
