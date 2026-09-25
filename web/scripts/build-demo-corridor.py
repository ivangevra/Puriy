"""Genera lib/demo-corridor.json: corredor de demostración sobre calles reales.

Toma los puntos de control del recorrido publicado (por defecto N40) desde la
API local, los enruta por calles con OSRM (ida y vuelta) y guarda la geometría
junto con paraderos cada ~450 m. Todo lo que muestra la sección Demos es
simulado: la geometría sigue calles reales, los tiempos y el GPS no.

Uso (desde web/, con la API activa):
  python scripts/build-demo-corridor.py [codigo_ruta]
"""
import json
import math
import sys
import urllib.request
from datetime import date
from pathlib import Path

API = 'http://127.0.0.1:8001'
OSRM = 'https://router.project-osrm.org/route/v1/driving/'
CODE = sys.argv[1] if len(sys.argv) > 1 else 'N40'


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': 'Puriy/0.1'})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def meters(a, b) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    dx = (b[0] - a[0]) * 111320 * math.cos(lat)
    dy = (b[1] - a[1]) * 110540
    return math.hypot(dx, dy)


def route(points):
    coords = ';'.join(f'{p[0]:.6f},{p[1]:.6f}' for p in points)
    data = get(f'{OSRM}{coords}?overview=full&geometries=geojson&steps=true&continue_straight=true')
    r = data['routes'][0]
    streets = []
    for leg in r['legs']:
        for step in leg['steps']:
            name = step.get('name')
            if name and (not streets or streets[-1] != name):
                streets.append(name)
    geometry = [[round(x, 6), round(y, 6)] for x, y in r['geometry']['coordinates']]
    return geometry, round(r['distance']), streets


def stops(geometry, every=450):
    out, acc, nxt = [geometry[0]], 0.0, every
    for a, b in zip(geometry, geometry[1:]):
        seg = meters(a, b)
        while seg and acc + seg >= nxt:
            t = (nxt - acc) / seg
            out.append([round(a[0] + t * (b[0] - a[0]), 6), round(a[1] + t * (b[1] - a[1]), 6)])
            nxt += every
        acc += seg
    if meters(out[-1], geometry[-1]) > every / 2:
        out.append(geometry[-1])
    else:
        out[-1] = geometry[-1]
    return out


def nearest_index(geometry, point):
    return min(range(len(geometry)), key=lambda i: meters(geometry[i], point))


def detour(outbound, stop_list, first, last):
    """Closed stretch between two stops and a road detour around it.

    The detour passes through a waypoint pushed ~280 m to one side of the
    closure; the side that yields the shorter route wins.
    """
    a, b = nearest_index(outbound, stop_list[first]), nearest_index(outbound, stop_list[last])
    closed = outbound[a:b + 1]

    dx, dy = closed[-1][0] - closed[0][0], closed[-1][1] - closed[0][1]
    norm = math.hypot(dx, dy) or 1
    def overlap(geometry):
        # Share of detour vertices lying on the closed street (within 20 m).
        inner = geometry[2:-2] or geometry
        return sum(min(meters(p, q) for q in closed) < 20 for p in inner) / len(inner)

    best = None
    for off_m in (220, 320, 450):
        for side in (1, -1):
            off = off_m / 111000 * side
            # Two waypoints on a parallel street keep the bus off the closure.
            q1, q3 = closed[len(closed) // 4], closed[3 * len(closed) // 4]
            waypoints = [[q[0] - dy / norm * off, q[1] + dx / norm * off] for q in (q1, q3)]
            try:
                geometry, length, streets = route([stop_list[first], *waypoints, stop_list[last]])
            except Exception:  # noqa: BLE001 - try next candidate
                continue
            score = (round(overlap(geometry), 1), length)
            if not best or score < best[3]:
                best = (geometry, length, streets, score)
    # The detour leaves and rejoins the corridor at intersections: trim the
    # shared ends so the closure spans exactly the bypassed street.
    geometry = best[0]
    shared = [min(meters(p, q) for q in closed) < 20 for p in geometry]
    i0 = next((i for i, s in enumerate(shared) if not s), 1) - 1
    i1 = len(shared) - next((i for i, s in enumerate(reversed(shared)) if not s), 1)
    detour_geometry = geometry[max(i0, 0):i1 + 1]
    a2, b2 = nearest_index(outbound, detour_geometry[0]), nearest_index(outbound, detour_geometry[-1])
    closed = outbound[a2:b2 + 1]
    detour_m = round(sum(meters(p, q) for p, q in zip(detour_geometry, detour_geometry[1:])))
    best = (detour_geometry, detour_m, best[2], best[3])
    closed_m = round(sum(meters(p, q) for p, q in zip(closed, closed[1:])))
    return {
        'fromStop': first,
        'toStop': last,
        'closed': closed,
        'closedMeters': closed_m,
        'geometry': best[0],
        'meters': best[1],
        'streets': best[2],
    }


def main() -> None:
    pubs = get(f'{API}/api/public/workspace')['publications']
    draft = next((p['draft'] for p in pubs if p['draft'].get('code') == CODE), None)
    if not draft:
        raise SystemExit(f'No hay un recorrido publicado con código {CODE}.')
    control = draft['outbound']
    outbound, out_m, out_streets = route(control)
    inbound, in_m, in_streets = route(list(reversed(control)))
    result = {
        'source': f'Trazo del recorrido {CODE} enrutado por calles con OSRM (datos OpenStreetMap). Tiempos, GPS y tráfico son simulados.',
        'generated': date.today().isoformat(),
        'code': CODE,
        'name': draft.get('name') or CODE,
        'color': draft.get('color') or '#275cba',
        'service': draft.get('service') or {},
        'outbound': outbound,
        'inbound': inbound,
        'outboundMeters': out_m,
        'inboundMeters': in_m,
        'outboundStreets': out_streets,
        'inboundStreets': in_streets,
        'stops': stops(outbound),
        'inboundStops': stops(inbound),
    }
    # Sunday fair scenario (PDU: ocupación temporal de vías) near the market
    # stops. Adjust the stop indexes if the corridor changes.
    result['detour'] = detour(outbound, result['stops'], 11, 13)
    out = Path(__file__).resolve().parents[1] / 'lib' / 'demo-corridor.json'
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    print(f'{CODE}: ida {out_m} m, vuelta {in_m} m, {len(result["stops"])} paraderos -> {out}')
    print('Calles:', ' · '.join(out_streets[:12]))


if __name__ == '__main__':
    main()
