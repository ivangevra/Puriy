"""Genera lib/places-juliaca.json: destinos concurrentes de Juliaca.

Fuente de coordenadas: OpenStreetMap (Overpass API, licencia ODbL).
Los lugares citados en el diagnóstico del PDU Juliaca 2026-2035 (pp. 54-56,
ejes comerciales e infraestructura económica) se marcan con `pdu: true` para
priorizarlos en el trabajo de campo. OSM no es una fuente oficial: nombres y
ubicaciones deben verificarse antes de usarse en una evaluación.

Uso (desde web/):  python scripts/build-places.py [osm.json]
"""
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BBOX = '-15.56,-70.20,-15.43,-70.08'
QUERY = f"""[out:json][timeout:90];(
nwr["amenity"~"^(school|college|university|kindergarten|hospital|clinic|marketplace|bus_station|townhall|police)$"]({BBOX});
nwr["shop"~"^(mall|supermarket|department_store)$"]({BBOX});
nwr["aeroway"="aerodrome"]({BBOX});
nwr["leisure"="stadium"]({BBOX});
);out center tags;"""
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
CATEGORY = {
    'kindergarten': 'inicial',
    'school': 'colegio',
    'college': 'superior',
    'university': 'superior',
    'hospital': 'salud',
    'clinic': 'salud',
    'marketplace': 'mercado',
    'mall': 'comercio',
    'supermarket': 'comercio',
    'department_store': 'comercio',
    'bus_station': 'terminal',
    'aerodrome': 'terminal',
    'townhall': 'servicio',
    'police': 'servicio',
    'stadium': 'recreacion',
}
# Nombres citados por el PDU (diagnóstico, pp. 54-56). Se comparan sin tildes.
PDU_NAMES = [
    'tupac amaru', 'san jose', 'las mercedes', '24 de octubre', 'cerro colorado',
    'santa barbara', 'plaza peru', 'vilcapaza', 'manco capac', 'santa celedonia',
    'real plaza', 'plaza vea', 'centro comercial #2', 'campo ferial',
    'ganado', 'terminal terrestre', 'inca manco', 'aeropuerto',
    'carlos monge', 'essalud', 'universidad nacional de juliaca', 'uancv',
]


def fold(value: str) -> str:
    value = unicodedata.normalize('NFD', value)
    return re.sub(r'[̀-ͯ]', '', value).lower()


def fetch() -> dict:
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, body, {'User-Agent': 'Puriy/0.1'})
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.load(res)
        except Exception as error:  # noqa: BLE001 - next mirror
            print(f'{url}: {error}', file=sys.stderr)
    raise SystemExit('Ningún servidor Overpass respondió.')


def main() -> None:
    raw = json.loads(Path(sys.argv[1]).read_text('utf-8')) if len(sys.argv) > 1 else fetch()
    places, seen = [], set()
    for e in raw['elements']:
        t = e.get('tags', {})
        kind = t.get('amenity') or t.get('shop') or t.get('aeroway') or t.get('leisure')
        name = (t.get('name') or '').strip()
        lat = e.get('lat') or e.get('center', {}).get('lat')
        lon = e.get('lon') or e.get('center', {}).get('lon')
        if kind not in CATEGORY or not name or lat is None or lon is None:
            continue
        key = (fold(name), round(lat, 3), round(lon, 3))
        if key in seen:
            continue
        seen.add(key)
        folded = fold(name)
        places.append({
            'id': f"osm-{e['type'][0]}{e['id']}",
            'name': name[:120],
            'category': CATEGORY[kind],
            'lon': round(lon, 6),
            'lat': round(lat, 6),
            **({'pdu': True} if CATEGORY[kind] not in ('inicial', 'colegio') and any(n in folded for n in PDU_NAMES) else {}),
        })
    places.sort(key=lambda p: (p['category'], p['name']))
    out = Path(__file__).resolve().parents[1] / 'lib' / 'places-juliaca.json'
    out.write_text(json.dumps({
        'source': 'OpenStreetMap (ODbL) vía Overpass; marcas PDU: diagnóstico PDU Juliaca 2026-2035',
        'generated': date.today().isoformat(),
        'places': places,
    }, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    print(f'{len(places)} lugares en {out}')


if __name__ == '__main__':
    main()
