import { newDraft, type Coordinate, type RouteDraft } from './route-drafts';
import { routeOnRoads } from './road-routing';
import { projectOnRoute } from './lab-engine';
import type { Point, Route } from './mobility';

/** A bounded detour candidate for review; driving geometry is never a bus authorization. */
export async function detourCandidate(
  route: Route,
  target: Point,
  name: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<RouteDraft> {
  const draft = newDraft();
  draft.name = `Alternativa ${route.code} · ${name}`.slice(0, 150);
  draft.code = `${route.code}-P`.slice(0, 12);
  draft.source = `Hipótesis de desvío desde ${route.code}. Destino: ${name}. Perfil de automóvil; pendiente de revisión para micros.`;
  draft.notes =
    'Se conservan cabeceras y hasta 12 referencias del recorrido original. Verificar cambios intermedios, giros, ancho y abordajes antes del piloto.';
  draft.service = route.service;
  for (const direction of ['outbound', 'inbound'] as const) {
    const geometry =
      direction === 'outbound' ? route.geometry : route.inbound_geometry;
    if (geometry.length < 2)
      throw new Error('La ruta base necesita ida y vuelta.');
    const projection = projectOnRoute(geometry, target);
    if (projection.meters > 2500)
      throw new Error(
        'El destino está a más de 2,5 km del recorrido. Este generador evalúa desvíos acotados; diseña una conexión nueva en el editor.',
      );
    const indices = [
      ...new Set([
        0,
        geometry.length - 1,
        ...Array.from({ length: 10 }, (_, i) =>
          Math.round(((geometry.length - 1) * i) / 9),
        ),
        projection.index,
        projection.index + 1,
      ]),
    ].sort((a, b) => a - b);
    const controls: Coordinate[] = [];
    for (const index of indices) {
      controls.push([geometry[index][0], geometry[index][1]]);
      if (index === projection.index) controls.push([target.lon, target.lat]);
    }
    const unique = controls.filter(
      (p, i) =>
        i === 0 || p[0] !== controls[i - 1][0] || p[1] !== controls[i - 1][1],
    );
    progress(
      `Calculando ${direction === 'outbound' ? 'ida' : 'vuelta'} sobre calles…`,
    );
    const result = await routeOnRoads(unique, signal);
    signal.throwIfAborted();
    draft[direction] = unique;
    draft.roads = { ...draft.roads, [direction]: result };
  }
  return draft;
}
