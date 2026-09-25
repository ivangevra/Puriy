'use client';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Route as RouteIcon,
  PencilRuler,
  BusFront,
  ChartNoAxesCombined,
  Map as MapIcon,
  Grid3x3,
  Landmark,
  Flag,
  Radio,
  Database,
} from 'lucide-react';
import SignalIcon from './SignalIcon';

export type AdminTool =
  | 'overview'
  | 'publications'
  | 'editor'
  | 'routes'
  | 'signals'
  | 'lab'
  | 'analytics'
  | 'manzanas'
  | 'places'
  | 'reports'
  | 'gps'
  | 'data';

type Item = [AdminTool, string, typeof RouteIcon | typeof SignalIcon];
export const ADMIN_GROUPS: { title: string; items: Item[] }[] = [
  { title: '', items: [['overview', 'Resumen', LayoutDashboard]] },
  {
    title: 'Red de transporte',
    items: [
      ['publications', 'Mis recorridos', RouteIcon],
      ['editor', 'Editor y frecuencias', PencilRuler],
      ['routes', 'Red de rutas', BusFront],
      ['signals', 'Semáforos', SignalIcon],
    ],
  },
  {
    title: 'Análisis',
    items: [
      ['lab', 'Laboratorio de movilidad', ChartNoAxesCombined],
      ['analytics', 'Observatorio', MapIcon],
      ['manzanas', 'Manzanas', Grid3x3],
      ['places', 'Lugares concurridos', Landmark],
    ],
  },
  {
    title: 'Operación',
    items: [
      ['reports', 'Reportes', Flag],
      ['gps', 'GPS de operadores', Radio],
      ['data', 'Importar y exportar', Database],
    ],
  },
];
export const ADMIN_TITLES = Object.fromEntries(
  ADMIN_GROUPS.flatMap((g) => g.items.map(([id, label]) => [id, label])),
) as Record<AdminTool, string>;

export default function AdminPanel({
  tool,
  onTool,
  badges,
  children,
}: {
  tool: AdminTool;
  onTool: (tool: AdminTool) => void;
  badges?: Partial<Record<AdminTool, number>>;
  children: ReactNode;
}) {
  const group = ADMIN_GROUPS.find((g) => g.items.some(([id]) => id === tool));
  return (
    <div className="admin-shell">
      <nav
        className="admin-sidebar"
        aria-label="Herramientas de administración"
      >
        <div className="admin-sidebar-title">
          <span>Administración</span>
          <strong>Puriy Juliaca</strong>
        </div>
        {ADMIN_GROUPS.map((g) => (
          <div className="admin-nav-group" key={g.title || 'home'}>
            {g.title && <span className="admin-nav-label">{g.title}</span>}
            {g.items.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-current={tool === id ? 'page' : undefined}
                onClick={() => onTool(id)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {!!badges?.[id] && (
                  <span className="admin-nav-badge" aria-label={`${badges[id]} pendientes`}>
                    {badges[id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="admin-panel-content" aria-labelledby="admin-title">
        <header className="admin-panel-header">
          <span className="admin-crumb">
            {group?.title || 'Panel de administración'}
          </span>
          <h1 id="admin-title">
            {tool === 'overview' ? 'Panel de administración' : ADMIN_TITLES[tool]}
          </h1>
        </header>
        {children}
      </section>
    </div>
  );
}
