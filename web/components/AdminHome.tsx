'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleCheck,
  Circle,
  Server,
  PencilRuler,
  ChartNoAxesCombined,
  Flag,
} from 'lucide-react';
import type { Network, Position } from '../lib/mobility';
import {
  publicationError,
  type PublishedRoute,
  type SignalPoint,
} from '../lib/map-workspace';
import { API_BASE, IS_LOCAL_DEMO, listRecords, request } from '../lib/api';
import { DESTINATIONS } from '../lib/destinations';
import type { AdminTool } from './AdminPanel';

type Health = { status: string; mode: string; otp_configured: boolean; gps_configured: boolean };

export default function AdminHome({
  network,
  publications,
  signals,
  positions,
  pendingReports,
  onTool,
}: {
  network: Network;
  publications: PublishedRoute[];
  signals: SignalPoint[];
  positions: Position[];
  pendingReports: number;
  onTool: (tool: AdminTool) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null),
    [healthError, setHealthError] = useState(false),
    [observations, setObservations] = useState(0),
    [scenarios, setScenarios] = useState(0);
  useEffect(() => {
    if (!IS_LOCAL_DEMO)
      request<Health>('/health')
        .then(setHealth)
        .catch(() => setHealthError(true));
    listRecords('observations').then((r) => setObservations(r.length)).catch(() => {});
    listRecords('scenarios').then((r) => setScenarios(r.length)).catch(() => {});
  }, []);
  const visible = publications.filter(
    (p) => p.draft.passengerVisible && !publicationError(p.draft),
  ).length;
  const withIssues = publications.filter((p) => publicationError(p.draft)).length;
  const verified = network.routes.filter((r) => r.verified_at).length;

  const stats: [string, number | string, string, AdminTool][] = [
    ['Recorridos publicados', publications.length, `${visible} visibles para pasajeros`, 'publications'],
    ['Por completar', withIssues, 'con datos faltantes para mostrarse', 'editor'],
    ['Reportes pendientes', pendingReports, 'enviados por pasajeros', 'reports'],
    ['Semáforos', signals.length, 'inventariados en el mapa', 'signals'],
    ['Lugares concurridos', DESTINATIONS.length, 'colegios, mercados, salud y comercio', 'places'],
    ['Rutas verificadas', `${verified}/${network.routes.length}`, 'en la red importada', 'routes'],
  ];
  // Steps from the pilot plan (propuesta Puriy, láminas 20–22).
  const steps: [boolean, string, string, AdminTool][] = [
    [publications.length > 0, 'Trazar el primer corredor', 'Recorrido de ida y vuelta con fuente y fecha.', 'editor'],
    [visible > 0, 'Publicarlo para pasajeros', 'Abordajes, horario, intervalo y tarifa completos.', 'publications'],
    [signals.length > 0, 'Inventariar semáforos del corredor', 'Ubicación y ciclo observado en campo.', 'signals'],
    [observations > 0, 'Medir la situación actual', 'Espera, ascensos y tiempos en dos semanas comparables.', 'analytics'],
    [scenarios > 0, 'Comparar una alternativa', 'Acceso, flota, tiempo y costo en el laboratorio.', 'lab'],
    [positions.length > 0, 'Conectar GPS de un operador', 'Posiciones reales antes de ofrecer seguimiento.', 'gps'],
  ];
  const done = steps.filter((s) => s[0]).length;

  return (
    <div className="admin-home">
      <div className="admin-status-row">
        <div className="admin-status-card" data-state={IS_LOCAL_DEMO ? 'warn' : healthError ? 'error' : health ? 'ok' : 'loading'}>
          <Server size={18} />
          <div>
            <strong>
              {IS_LOCAL_DEMO
                ? 'Sin servidor: datos solo en este navegador'
                : healthError
                  ? 'La API no responde'
                  : health
                    ? `API conectada · modo ${health.mode === 'demo' ? 'demostración' : 'real'}`
                    : 'Comprobando la API…'}
            </strong>
            <span>
              {IS_LOCAL_DEMO
                ? 'Inicia con npm run dev para usar cuentas y publicar.'
                : `${API_BASE} · OTP ${health?.otp_configured ? 'configurado' : 'sin configurar'} · GPS ${health?.gps_configured ? 'configurado' : 'sin proveedor'}`}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-stats">
        {stats.map(([label, value, note, target]) => (
          <button key={label} type="button" className="admin-stat" onClick={() => onTool(target)}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>

      <div className="admin-home-grid">
        <section className="admin-card">
          <header>
            <h2>Camino al piloto</h2>
            <span className="pill">{done}/{steps.length}</span>
          </header>
          <div className="admin-progress" aria-hidden="true">
            <i style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ol className="admin-steps">
            {steps.map(([ok, title, detail, target]) => (
              <li key={title} data-done={ok}>
                {ok ? <CircleCheck size={18} /> : <Circle size={18} />}
                <div>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
                {!ok && (
                  <button type="button" className="text-button" onClick={() => onTool(target)}>
                    Abrir <ArrowRight size={14} />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="admin-card">
          <header>
            <h2>Acciones rápidas</h2>
          </header>
          <div className="admin-actions">
            <button type="button" onClick={() => onTool('editor')}>
              <PencilRuler size={18} />
              <span>
                <strong>Dibujar o editar un recorrido</strong>
                <small>Trazo, paradas, frecuencia y tarifa</small>
              </span>
            </button>
            <button type="button" onClick={() => onTool('lab')}>
              <ChartNoAxesCombined size={18} />
              <span>
                <strong>Evaluar una propuesta</strong>
                <small>Cobertura por manzana, flota y costo</small>
              </span>
            </button>
            <button type="button" onClick={() => onTool('reports')}>
              <Flag size={18} />
              <span>
                <strong>Revisar reportes</strong>
                <small>{pendingReports ? `${pendingReports} esperan revisión` : 'Sin pendientes'}</small>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
