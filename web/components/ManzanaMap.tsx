'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPinned, Info } from 'lucide-react';
import type { Map as GLMap, MapLayerMouseEvent } from 'maplibre-gl';
import { useTheme } from './Theme';
import 'maplibre-gl/dist/maplibre-gl.css';

type ManzanaProps = {
  d: string;
  z: string;
  m: string;
  p: number | null;
  h: number | null;
  mu: number | null;
  a: number | null;
  dn: number | null;
};
type FC = {
  type: 'FeatureCollection';
  features: { geometry: { type: string; coordinates: unknown }; properties: ManzanaProps }[];
};

const DENSITY_COLOR = [
  'step',
  ['coalesce', ['get', 'dn'], -1],
  '#adb5bd',
  0,
  '#8ce99a',
  6000,
  '#ffd43b',
  12000,
  '#ff922b',
  20000,
  '#e8590c',
  30000,
  '#c92a2a',
] as const;

const LEGEND = [
  ['#adb5bd', 'Sin dato 2017'],
  ['#8ce99a', '< 6 000 hab/km²'],
  ['#ffd43b', '6 000 – 12 000'],
  ['#ff922b', '12 000 – 20 000'],
  ['#e8590c', '20 000 – 30 000'],
  ['#c92a2a', '> 30 000 hab/km²'],
];

const fmt = (v: number | null) => (v === null ? 's/d' : new Intl.NumberFormat('es-PE').format(v));

function firstCentroid(geom: { type: string; coordinates: unknown }): [number, number] {
  if (geom.type === 'Point') {
    const c = geom.coordinates as [number, number];
    return [c[0], c[1]];
  }
  let ring: number[][] | undefined;
  if (geom.type === 'Polygon') ring = (geom.coordinates as number[][][])[0];
  else ring = (geom.coordinates as number[][][][])[0]?.[0];
  if (!ring?.length) return [-70.1332, -15.4996];
  const sum = ring.reduce((acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

function popupHTML(p: ManzanaProps) {
  return `<div style="font:13px/1.45 system-ui,sans-serif;min-width:190px">
    <strong>Mz ${p.m} · Zona ${p.z}</strong><br/>
    Distrito: ${p.d}<br/>
    Población 2017: <b>${fmt(p.p)} hab</b>${p.p !== null ? ` (${fmt(p.h)} H / ${fmt(p.mu)} M)` : ''}<br/>
    Área manzana: ${p.a !== null ? `${fmt(p.a)} m²` : 's/d'}<br/>
    Densidad: ${p.dn !== null ? `<b>${fmt(p.dn)} hab/km²</b>` : 's/d'}
  </div>`;
}

export default function ManzanaMap() {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const popupRef = useRef<{ remove: () => void } | null>(null);
  const styleReady = useRef(false);
  const filterRef = useRef({ distrito: 'Todos', modo: 'poligonos' });
  const dataRef = useRef<{ poligonos: FC | null; puntos: FC | null }>({ poligonos: null, puntos: null });
  const themeRef = useRef(theme);
  const [distrito, setDistrito] = useState('Todos');
  const [modo, setModo] = useState<'poligonos' | 'puntos'>('poligonos');
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({ n: 0, pob: 0 });
  const [status, setStatus] = useState('Cargando cartografía…');
  const [mapTheme, setMapTheme] = useState(theme);

  const applyFilter = useCallback(() => {
    const m = map.current;
    if (!m || !styleReady.current) return;
    const { distrito: d, modo: mo } = filterRef.current;
    const f = d === 'Todos' ? null : ['==', ['get', 'd'], d];
    for (const id of ['mz-fill', 'mz-line', 'mz-dot'])
      if (m.getLayer(id)) m.setFilter(id, f as never);
    for (const id of ['mz-fill', 'mz-line'])
      if (m.getLayer(id))
        m.setLayoutProperty(id, 'visibility', mo === 'poligonos' ? 'visible' : 'none');
    if (m.getLayer('mz-dot'))
      m.setLayoutProperty('mz-dot', 'visibility', mo === 'puntos' ? 'visible' : 'none');
  }, []);

  const computeStats = useCallback(() => {
    const fc = dataRef.current.poligonos;
    if (!fc) return;
    const d = filterRef.current.distrito;
    const rows = fc.features.filter((x) => d === 'Todos' || x.properties.d === d);
    const conDato = rows.filter((x) => x.properties.p !== null);
    setStats({ n: rows.length, pob: conDato.reduce((acc, x) => acc + (x.properties.p || 0), 0) });
  }, []);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    filterRef.current = { distrito, modo };
    applyFilter();
    computeStats();
  }, [distrito, modo, applyFilter, computeStats]);

  useEffect(() => {
    let disposed = false;
    Promise.all([
      fetch('/data/manzanas-poligonos.geojson').then((r) => r.json() as Promise<FC>),
      fetch('/data/manzanas-puntos.geojson').then((r) => r.json() as Promise<FC>),
    ])
      .then(([poligonos, puntos]) => {
        if (disposed) return;
        dataRef.current = { poligonos, puntos };
        setStatus('');
        applyFilter();
        computeStats();
      })
      .catch(() => {
        if (!disposed) setStatus('No se pudieron cargar los datos de manzanas.');
      });
    return () => {
      disposed = true;
    };
  }, [applyFilter, computeStats]);

  useEffect(() => {
    let disposed = false;
    import('maplibre-gl')
      .then(({ Map, Popup }) => {
        if (disposed || !container.current) return;
        const dark = themeRef.current === 'dark';
        const m = new Map({
          container: container.current,
          style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
          center: [-70.128, -15.492],
          zoom: 12,
          minZoom: 9,
          maxZoom: 18,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
        });
        m.touchZoomRotate.disableRotation();
        map.current = m;

        const onStyleLoad = () => {
          if (disposed) return;
          styleReady.current = true;
          const isDark = themeRef.current === 'dark';
          const poligonos = dataRef.current.poligonos;
          const puntos = dataRef.current.puntos;
          if (poligonos && !m.getSource('mz-poly')) {
            m.addSource('mz-poly', { type: 'geojson', data: poligonos as never });
            m.addLayer({
              id: 'mz-fill',
              type: 'fill',
              source: 'mz-poly',
              paint: { 'fill-color': DENSITY_COLOR as never, 'fill-opacity': 0.55 },
            });
            m.addLayer({
              id: 'mz-line',
              type: 'line',
              source: 'mz-poly',
              paint: {
                'line-color': isDark ? '#39424e' : '#8b95a1',
                'line-width': 0.5,
                'line-opacity': 0.65,
              },
            });
          }
          if (puntos && !m.getSource('mz-pts')) {
            m.addSource('mz-pts', { type: 'geojson', data: puntos as never });
            m.addLayer({
              id: 'mz-dot',
              type: 'circle',
              source: 'mz-pts',
              layout: { visibility: 'none' },
              paint: {
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'p'], 0],
                  0,
                  1.5,
                  50,
                  4,
                  200,
                  8,
                  500,
                  12,
                ],
                'circle-color': DENSITY_COLOR as never,
                'circle-opacity': 0.9,
                'circle-stroke-color': isDark ? '#171c23' : '#ffffff',
                'circle-stroke-width': 0.8,
              },
            });
          }
          for (const layer of ['mz-fill', 'mz-dot']) {
            m.on('click', layer, (e: MapLayerMouseEvent) => {
              const f = e.features?.[0];
              if (!f?.properties) return;
              popupRef.current?.remove();
              popupRef.current = new Popup({ closeButton: true, maxWidth: '260px' })
                .setLngLat(e.lngLat)
                .setHTML(popupHTML(f.properties as unknown as ManzanaProps))
                .addTo(m);
            });
            m.on('mouseenter', layer, () => {
              m.getCanvas().style.cursor = 'pointer';
            });
            m.on('mouseleave', layer, () => {
              m.getCanvas().style.cursor = '';
            });
          }
          applyFilter();
        };
        m.on('style.load', onStyleLoad);
        m.on('load', onStyleLoad);
        m.on('zoomend', () => {
          if (m.getLayer('mz-line'))
            m.setPaintProperty('mz-line', 'line-width', [
              'interpolate',
              ['linear'],
              ['zoom'],
              12,
              0.3,
              16,
              1,
            ]);
          if (m.getLayer('mz-fill') && m.getZoom() >= 15)
            m.setPaintProperty('mz-fill', 'fill-opacity', 0.45);
        });
      })
      .catch(() => {
        if (!disposed) setStatus('El mapa vectorial no está disponible en este navegador.');
      });
    return () => {
      disposed = true;
      styleReady.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, [applyFilter]);

  useEffect(() => {
    const m = map.current;
    if (!m || mapTheme === theme) return;
    setMapTheme(theme);
    styleReady.current = false;
    m.setStyle(`https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'positron'}`);
  }, [theme, mapTheme]);

  const search = () => {
    const m = map.current;
    const fc = dataRef.current.poligonos;
    const q = query.trim().toUpperCase();
    if (!m || !fc || !q) return;
    const matches = fc.features.filter(
      (x) =>
        (distrito === 'Todos' || x.properties.d === distrito) &&
        (x.properties.m.toUpperCase() === q ||
          `${x.properties.z}${x.properties.m}`.toUpperCase() === q ||
          x.properties.m.toUpperCase() === q.padStart(3, '0')),
    );
    if (!matches.length) {
      setStatus(
        `No se encontró la manzana «${query}» en ${distrito === 'Todos' ? 'Juliaca ni San Miguel' : distrito}.`,
      );
      return;
    }
    const hit = matches.find((x) => x.properties.p !== null) ?? matches[0];
    setStatus('');
    const [lon, lat] = firstCentroid(hit.geometry);
    m.flyTo({ center: [lon, lat], zoom: 17.2, duration: 900 });
    popupRef.current?.remove();
    void import('maplibre-gl').then(({ Popup }) => {
      popupRef.current = new Popup({ closeButton: true, maxWidth: '260px' })
        .setLngLat([lon, lat])
        .setHTML(popupHTML(hit.properties))
        .addTo(m);
    });
    if (matches.length > 1)
      setStatus(
        `Se ubicó Mz ${hit.properties.m} (zona ${hit.properties.z}, ${hit.properties.d}). ${matches.length} manzanas comparten ese código; se muestra la primera con población 2017.`,
      );
  };

  const legend = useMemo(
    () =>
      LEGEND.map(([color, label]) => (
        <span key={label} className="mz-legend-item">
          <i style={{ background: color }} />
          {label}
        </span>
      )),
    [],
  );

  return (
    <div className="mz-admin">
      <div className="mz-toolbar">
        <div className="inline-actions">
          <button
            className={modo === 'poligonos' ? 'primary' : 'secondary'}
            onClick={() => setModo('poligonos')}
          >
            Polígonos
          </button>
          <button className={modo === 'puntos' ? 'primary' : 'secondary'} onClick={() => setModo('puntos')}>
            Puntos
          </button>
        </div>
        <label className="mz-select">
          Distrito
          <select value={distrito} onChange={(e) => setDistrito(e.target.value)}>
            <option>Todos</option>
            <option>Juliaca</option>
            <option>San Miguel</option>
          </select>
        </label>
        <form
          className="mz-search"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Search size={15} />
          <input
            placeholder="Buscar manzana, ej. 001E"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar manzana por código"
          />
          <button className="secondary" type="submit">
            Ubicar
          </button>
        </form>
        <span className="pill" title="Manzanas visibles">
          <MapPinned size={13} /> {fmt(stats.n)} manzanas
        </span>
        <span className="pill green" title="Población Censo 2017 sumada">
          {fmt(stats.pob)} hab 2017
        </span>
      </div>
      <div className="transit-map mz-map" style={{ height: 540, minHeight: 420 }}>
        <div ref={container} className="map-canvas" />
      </div>
      <div className="mz-legend">{legend}</div>
      {status && (
        <output className="small-note mz-status">
          <Info size={14} /> {status}
        </output>
      )}
      <p className="small-note" style={{ marginTop: 8 }}>
        Fuente: cartografía INEI (WFS geoespacial.inei.gob.pe) y Censo 2017 (REDATAM). La densidad usa población
        2017 sobre el área actual de la manzana. Las manzanas sin población asociada tienen correspondencia pendiente de verificar; no equivalen a zonas deshabitadas.
      </p>
    </div>
  );
}
