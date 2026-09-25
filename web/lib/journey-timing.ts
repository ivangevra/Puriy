import { distance, type Journey, type Network } from './mobility';
export function estimateJourney(j: Journey, net: Network): Journey {
  const legs = j.legs.map((l) => {
    const route = net.routes.find((r) => r.id === l.route_id);
    if (route?.status !== 'proposal') return l;
    const coords = l.coordinates || [];
    const meters = coords
      .slice(1)
      .reduce(
        (v, p, i) =>
          v +
          distance(
            { lon: coords[i][0], lat: coords[i][1] },
            { lon: p[0], lat: p[1] },
          ),
        0,
      );
    return {
      ...l,
      minutes: Math.ceil(
        meters / (((route.service?.speedKmh || 15) * 1000) / 60),
      ),
      wait: route.service?.headway ? route.service.headway / 2 : null,
      fare: route.service?.fare ?? 0,
    };
  });
  const walk = j.walking
    ? j.walking.reduce((v, w) => v + Math.ceil(w.meters / 70), 0)
    : Math.ceil(j.walk_meters / 70);
  const ride = legs.reduce((v, l) => v + l.minutes, 0),
    wait = legs.some((l) => l.wait === null)
      ? null
      : legs.reduce((v, l) => v + l.wait!, 0);
  const total = wait === null ? null : Math.ceil(walk + ride + wait);
  return {
    ...j,
    legs,
    minutes: total ?? walk + ride,
    fare: legs.reduce((v, l) => v + l.fare, 0),
    time_estimated: true,
    timing: { walk, ride, wait, total },
  };
}
