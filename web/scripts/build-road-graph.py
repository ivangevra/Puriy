"""Genera public/data/red-vial.json: grafo de calles de Juliaca con sentidos.

Fuente: OpenStreetMap (Overpass, ODbL). Conserva el sentido de circulación
(`oneway`, rotondas) para que las rutas en auto/micro no vayan en contra, y
marca qué tramos son caminables. Los nodos son intersecciones y extremos; cada
arista guarda su geometría intermedia.

Formato compacto:
  nodes: [lon*1e6, lat*1e6, ...]
  edges: [u, v, metros, flags, km/h, nombreIdx, [lon*1e6, lat*1e6, ...intermedios]]
  flags: 1 = auto/micro, 2 = peatón, 4 = solo u->v (un sentido)
Uso (desde web/): python scripts/build-road-graph.py [roads.json]
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BBOX = '-15.545,-70.19,-15.44,-70.08'
QUERY = f"""[out:json][timeout:120];
way["highway"]({BBOX});(._;>;);out skel qt;
way["highway"]({BBOX});out tags;"""
MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
DRIVE = {
    'motorway': 60, 'trunk': 40, 'primary': 35, 'secondary': 30, 'tertiary': 25,
    'unclassified': 20, 'residential': 20, 'living_street': 10, 'service': 10,
    'motorway_link': 40, 'trunk_link': 30, 'primary_link': 30, 'secondary_link': 25,
    'tertiary_link': 20,
}
WALK_ONLY = {'footway', 'path', 'steps', 'pedestrian', 'track', 'cycleway'}


def fetch() -> dict:
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, body, {'User-Agent': 'Puriy/0.1'})
            with urllib.request.urlopen(req, timeout=180) as res:
                return json.load(res)
        except Exception as error:  # noqa: BLE001 - next mirror
            print(f'{url}: {error}', file=sys.stderr)
    raise SystemExit('Ningún servidor Overpass respondió.')


def meters(a, b) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((b[0] - a[0]) * 111320 * math.cos(lat), (b[1] - a[1]) * 110540)


def main() -> None:
    raw = json.loads(Path(sys.argv[1]).read_text('utf-8')) if len(sys.argv) > 1 else fetch()
    coords, ways, tags = {}, {}, {}
    for e in raw['elements']:
        if e['type'] == 'node':
            coords[e['id']] = (e['lon'], e['lat'])
        elif e['type'] == 'way':
            if 'nodes' in e:
                ways[e['id']] = e['nodes']
            if 'tags' in e:
                tags[e['id']] = e['tags']
    usable = {}
    for wid, nds in ways.items():
        t = tags.get(wid, {})
        hw = t.get('highway')
        drive = hw in DRIVE and t.get('access') not in ('no', 'private')
        walk = (hw in WALK_ONLY or hw in DRIVE) and hw != 'motorway' and t.get('foot') != 'no'
        if (drive or walk) and len(nds) > 1 and all(n in coords for n in nds):
            usable[wid] = (nds, t, drive, walk)
    use = {}
    for nds, *_ in usable.values():
        for n in nds:
            use[n] = use.get(n, 0) + 1
        use[nds[0]] += 1
        use[nds[-1]] += 1
    index, nodes, names, name_idx, edges = {}, [], [], {}, []

    def node(n):
        if n not in index:
            index[n] = len(index)
            lon, lat = coords[n]
            nodes.extend((round(lon * 1e6), round(lat * 1e6)))
        return index[n]

    oneway_count = 0
    for nds, t, drive, walk in usable.values():
        ow = t.get('oneway')
        direction = 1 if ow in ('yes', 'true', '1') or t.get('junction') in ('roundabout', 'circular') else -1 if ow == '-1' else 0
        if direction == -1:
            nds = list(reversed(nds))
        if direction and drive:
            oneway_count += 1
        name = t.get('name') or t.get('ref') or ''
        if name not in name_idx:
            name_idx[name] = len(names)
            names.append(name)
        speed = DRIVE.get(t.get('highway'), 5)
        start = 0
        for i in range(1, len(nds)):
            if use[nds[i]] > 1 or i == len(nds) - 1:
                seg = nds[start:i + 1]
                length = sum(meters(coords[a], coords[b]) for a, b in zip(seg, seg[1:]))
                mid = [c for n in seg[1:-1] for c in (round(coords[n][0] * 1e6), round(coords[n][1] * 1e6))]
                flags = (1 if drive else 0) | (2 if walk else 0) | (4 if direction and drive else 0)
                edges.append([node(seg[0]), node(seg[-1]), round(length, 1), flags, speed, name_idx[name], mid])
                start = i
    out = Path(__file__).resolve().parents[1] / 'public' / 'data' / 'red-vial.json'
    out.write_text(json.dumps({
        'source': 'OpenStreetMap (ODbL) vía Overpass. Sentidos según etiquetas oneway/junction; verificar en campo.',
        'generated': date.today().isoformat(),
        'nodes': nodes,
        'names': names,
        'edges': edges,
    }, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    print(f'{len(index)} nodos, {len(edges)} tramos, {oneway_count} vías de un sentido -> {out} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
