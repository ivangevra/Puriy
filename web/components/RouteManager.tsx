'use client';
import { useState } from 'react';
import { Pencil, Trash2, Undo2, Save, Map } from 'lucide-react';
import { isRoutePublic, type Network, type Route } from '../lib/mobility';
export default function RouteManager({
  network,
  onChange,
  onDraw,
}: {
  network: Network;
  onChange: (n: Network) => void | Promise<void>;
  onDraw: (r: Route) => void;
}) {
  const [editing, setEditing] = useState<Route | null>(null),
    [removed, setRemoved] = useState<Route | null>(null),
    [error, setError] = useState('');
  const commit = async (n: Network) => {
    try {
      await onChange(n);
      setError('');
      return true;
    } catch(e) {
      setError((e as Error).message || 'No se pudo guardar el cambio.');
      return false;
    }
  };
  return (
    <section className="route-manager">
      <h2>Administrar rutas</h2>
      <p className="small-note">
        Cambios en este navegador. Eliminar quita la ruta del mapa y del
        planificador local.
      </p>
      {network.routes.map((r) => (
        <div className="managed-route" key={r.id}>
          <span>
            <strong>
              {r.code} · {r.name}
            </strong>
            <small>
              {r.status === 'demo' ? 'Demostración' : 'Registro de la red'}
            </small>
          </span>
          <button
            className="icon-button"
            aria-label={`Editar ruta ${r.code}`}
            onClick={() => setEditing({ ...r })}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`Eliminar ruta ${r.code}`}
            onClick={async () => {
              if (
                await commit({
                  ...network,
                  routes: network.routes.filter((v) => v.id !== r.id),
                })
              ) {
                setRemoved(r);
                if (editing?.id === r.id) setEditing(null);
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {!network.routes.length && (
        <p className="small-note">
          No quedan rutas en tu red local. Puedes crear recorridos desde
          Dibujar.
        </p>
      )}
      {removed && (
        <button
          className="secondary"
          onClick={async () => {
            if (
              await commit({
                ...network,
                routes: [
                  ...network.routes.filter((r) => r.id !== removed.id),
                  removed,
                ],
              })
            )
              setRemoved(null);
          }}
        >
          <Undo2 size={15} />
          Deshacer eliminación de {removed.code}
        </button>
      )}
      {editing && (
        <form
          className="form-stack route-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await commit({
                ...network,
                routes: network.routes.map((r) =>
                  r.id === editing.id ? editing : r,
                ),
              })
            )
              setEditing(null);
          }}
        >
          <h3>Editar {editing.code}</h3>
          <label>
            Nombre de la ruta
            <input
              required
              maxLength={120}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Código de ruta
            <input
              required
              maxLength={12}
              value={editing.code}
              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
            />
          </label>
          <label>
            Color del recorrido
            <input
              type="color"
              value={editing.color}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
          </label>
          <label>
            Empresa u operador
            <input
              value={editing.operator}
              maxLength={160}
              onChange={(e) =>
                setEditing({ ...editing, operator: e.target.value })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={isRoutePublic(editing)}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  passengerVisible: e.target.checked,
                })
              }
            />
            Visible para pasajeros
          </label>
          <p className="small-note">
            Distinguida como «Red» y disponible para quienes viajan. Si la
            quitas, solo aparece en el panel de administración.
          </p>
          <button className="primary">
            <Save size={16} />
            Guardar cambios de ruta
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onDraw(editing)}
          >
            <Map size={16} />
            Editar trazado como propuesta
          </button>
          <p className="small-note">
            El trazado abre una copia en Dibujar, donde puedes corregirla y
            publicarla en tu mapa.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(null)}
          >
            Cancelar edición
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
