import { distance, type Journey, type Point, type Network } from './mobility';
export type WalkingStep = {
  kind: 'walk';
  title: string;
  detail: string;
  meters: number | null;
  approximate: boolean;
};
export type RideStep = {
  kind: 'ride';
  title: string;
  detail: string;
  routeId: string;
  wait: number | null;
  minutes: number;
};
export function journeySteps(
  j: Journey,
  origin: Point | null,
  destination: Point | null,
  network?: Network,
): (WalkingStep | RideStep)[] {
  const steps: (WalkingStep | RideStep)[] = [];
  const walk = (
    a: Point | null,
    b: Point | null,
    title: string,
    detail: string,
    index: number,
  ) => {
    if (!a || !b) return;
    const path = j.walking?.[index];
    const meters = path
      ? path.meters
      : j.mode === 'demo'
        ? Math.round(distance(a, b))
        : null;
    steps.push({
      kind: 'walk',
      title:
        index === 0 && meters !== null && meters < 10
          ? 'Ya estás junto al punto de abordaje'
          : title,
      detail: path?.streets?.length
        ? `Sigue ${path.streets.join(' → ')}. Verifica los cruces y el lado de abordaje.`
        : detail,
      meters,
      approximate: !path && j.mode === 'demo',
    });
  };
  if (!j.legs.length) return steps;
  walk(
    origin,
    j.legs[0].from,
    `Camina hasta ${j.legs[0].from.name}`,
    'Punto de abordaje recomendado para este viaje. Comprueba el lado de la calle y los cruces.',
    0,
  );
  j.legs.forEach((leg, i) => {
    if (i > 0 && distance(j.legs[i - 1].to, leg.from) > 10)
      walk(
        j.legs[i - 1].to,
        leg.from,
        `Camina hasta ${leg.from.name}`,
        'Conexión a pie para el siguiente micro.',
        i,
      );
    const route = network?.routes.find((r) => r.id === leg.route_id);
    const label =
      route?.code ||
      (leg.route_id.startsWith('published:')
        ? 'micro de la propuesta local'
        : leg.route_id);
    steps.push({
      kind: 'ride',
      title: `${i ? 'Cambia al' : 'Toma el'} ${label}`,
      detail: `Sube en ${leg.from.name}. Sentido de ${leg.direction ? 'vuelta' : 'ida'}. Baja en ${leg.to.name}.${route?.service?.model ? ` Identifica el vehículo: ${route.service.model}.` : ''}`,
      routeId: leg.route_id,
      minutes: leg.minutes,
      wait: leg.wait,
    });
  });
  if (destination && ((j.walking?.at(-1)?.meters ?? distance(j.legs.at(-1)!.to, destination)) > 0))
    walk(
      j.legs.at(-1)!.to,
      destination,
      'Camina hasta tu destino',
      'Completa el último tramo desde el punto de bajada.',
      1,
    );
  return steps;
}
