'use client';
import { advanceVehicle } from '../lib/vehicle-simulation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layers,
  LocateFixed,
  Minus,
  Plus,
  MapPin,
  Play,
  Pause,
  Navigation,
  RefreshCw,
  Landmark,
  X,
} from 'lucide-react';
import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';
import type { Map as RasterMap, GeoJSON as RasterLayer } from 'leaflet';
import {
  mapData,
  mapBounds,
  type MapDataProps,
  type MapDirection,
} from '../lib/map-data';
import type { Point } from '../lib/mobility';
import type { Place } from '../lib/places';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  DEFAULT_LAYERS,
  DESTINATIONS_SOURCE,
  countByCategory,
  destinationsGeoJSON,
  type DestinationCategory,
} from '../lib/destinations';
import { glyphSvg, markerSvg, onewayArrow, rasterize } from '../lib/place-icons';
import { loadGraph, onewayFeatures } from '../lib/road-graph';
import { useTheme } from './Theme';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';

type Props = MapDataProps & {
  onSelect: (id: string) => void;
  onPick: (point: Point) => void;
  pickMode: string | null;
  onDirection?: (d: MapDirection) => void;
  editing?: boolean;
  allowSimulation?: boolean;
  onSignal?: (id: string) => void;
  /** Shows the layer of concurrent destinations (schools, markets, malls…). */
  places?: boolean;
  onPlace?: (place: Place) => void;
};
type PlaceProps = {
  id: string;
  name: string;
  label: string;
  category: string;
  pdu?: boolean;
  lon: number;
  lat: number;
};
const PLACE_COUNTS = countByCategory();
const PLACE_LAYERS_KEY = 'puriy-place-layers';
function readPlaceLayers(): DestinationCategory[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PLACE_LAYERS_KEY) || 'null');
    if (Array.isArray(saved))
      return saved.filter((c): c is DestinationCategory => c in CATEGORIES);
  } catch {}
  return DEFAULT_LAYERS;
}
type Renderer = 'loading' | 'vector' | 'raster' | 'error';

export default function TransitMap(props: Props) {
  const { theme } = useTheme();
  const [localDirection, setLocalDirection] = useState<MapDirection>('both');
  const direction = props.direction || localDirection;
  const changeDirection = (d: MapDirection) => {
    setLocalDirection(d);
    props.onDirection?.(d);
  };
  const mapTheme = useRef('light');
  const styleReady = useRef(false);
  const fitted = useRef<string | null | undefined>(undefined);
  const [styleRevision, setStyleRevision] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [microSprite, setMicroSprite] = useState<ImageData | null>(null);
  const [walkSprite, setWalkSprite] = useState<ImageData | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = document.createElement('img');
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      // The sprite's toes point to -x; line symbols follow +x, so flip it.
      ctx.translate(48, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      setWalkSprite(ctx.getImageData(0, 0, 48, 48));
    };
    img.src = '/footprints.svg';
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const img = document.createElement('img');
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 112;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      setMicroSprite(ctx.getImageData(0, 0, 96, 112));
    };
    img.src = '/micro.svg';
    return () => {
      cancelled = true;
    };
  }, []);
  const [mapZoom, setMapZoom] = useState(12);
  const container = useRef<HTMLDivElement>(null),
    gl = useRef<GLMap | null>(null),
    raster = useRef<RasterMap | null>(null),
    rasterLayer = useRef<RasterLayer | null>(null),
    latest = useRef(props);
  latest.current = props;
  const [renderer, setRenderer] = useState<Renderer>('loading'),
    [attempt, setAttempt] = useState(0),
    [baseReady, setBaseReady] = useState(false),
    [simulation, setSimulation] = useState(false),
    [tick, setTick] = useState(0);
  const [simulationMeters, setSimulationMeters] = useState(0);
  const [placeLayers, setPlaceLayers] =
    useState<DestinationCategory[]>(DEFAULT_LAYERS);
  const [placesOpen, setPlacesOpen] = useState(false);
  // One-way arrows appear by themselves when zooming into streets; the street
  // graph (≈1 MB) is fetched only the first time the map gets that close.
  const [oneway, setOneway] = useState(false);
  const [onewayData, setOnewayData] = useState<ReturnType<typeof onewayFeatures> | null>(null);
  useEffect(() => {
    if (!oneway || onewayData) return;
    loadGraph()
      .then((g) => setOnewayData(onewayFeatures(g)))
      .catch(() => {});
  }, [oneway, onewayData]);
  useEffect(() => setPlaceLayers(readPlaceLayers()), []);
  const toggleCategory = (c: DestinationCategory) =>
    setPlaceLayers((layers) => {
      const next = layers.includes(c)
        ? layers.filter((l) => l !== c)
        : [...layers, c];
      try {
        localStorage.setItem(PLACE_LAYERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const placeData = useMemo(
    () => destinationsGeoJSON(props.places ? placeLayers : []),
    [props.places, placeLayers],
  );
  const placeCard = (p: PlaceProps) => {
    const category = p.category as DestinationCategory;
    const box = document.createElement('div');
    box.className = 'place-popup';
    box.style.setProperty('--place-color', CATEGORIES[category]?.color || '#275cba');
    const head = document.createElement('div');
    head.className = 'place-popup-head';
    const badge = document.createElement('span');
    badge.className = 'place-popup-icon';
    badge.innerHTML = glyphSvg(category, 16);
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = p.name;
    const meta = document.createElement('span');
    meta.textContent = p.label;
    text.appendChild(title);
    text.appendChild(meta);
    head.appendChild(badge);
    head.appendChild(text);
    box.appendChild(head);
    if (p.pdu) {
      const tag = document.createElement('small');
      tag.className = 'place-popup-tag';
      tag.textContent = 'Citado en el diagnóstico PDU';
      box.appendChild(tag);
    }
    if (latest.current.onPlace) {
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = 'Ir aquí';
      go.onclick = () =>
        latest.current.onPlace?.({
          id: p.id,
          name: p.name,
          detail: p.label,
          lon: p.lon,
          lat: p.lat,
          source: 'local',
          category: p.category,
        });
      box.appendChild(go);
    }
    return box;
  };
  const placeLayer = useRef<RasterLayer | null>(null);
  useEffect(() => {
    setSimulationMeters(0);
  }, [props.selected, direction, props.network]);
  useEffect(() => {
    if (!props.allowSimulation) setSimulation(false);
  }, [props.allowSimulation]);
  const data = useMemo(
    () =>
      mapData(
        { ...props, direction, simulationMeters },
        simulation,
        tick,
        mapZoom,
        renderer === 'raster' ? 256 : 512,
        clock,
      ),
    [
      direction,
      props.network,
      props.selected,
      props.origin,
      props.destination,
      props.journey,
      props.coverage,
      props.positions,
      props.signals,
      props.analysisPoints,
      simulation,
      simulationMeters,
      tick,
      clock,
      mapZoom,
      renderer,
    ],
  );
  const ready = renderer === 'vector' || renderer === 'raster';

  useEffect(() => {
    let disposed = false,
      usingFallback = false,
      timeout: ReturnType<typeof setTimeout>,
      resize: ResizeObserver | undefined;
    setRenderer('loading');
    setBaseReady(false);
    styleReady.current = false;
    const fallback = async () => {
      if (disposed || usingFallback) return;
      usingFallback = true;
      clearTimeout(timeout);
      gl.current?.remove();
      gl.current = null;
      setBaseReady(false);
      try {
        const L = await import('leaflet');
        if (disposed || !container.current) return;
        const m = L.map(container.current, {
          zoomControl: false,
          attributionControl: true,
          minZoom: 9,
          maxZoom: 18,
          preferCanvas: false,
        }).setView([-15.491, -70.135], 12);
        raster.current = m;
        m.on('zoomend', () => setMapZoom(m.getZoom()));
        const tiles = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        ).addTo(m);
        tiles.on('load', () => {
          if (!disposed) setBaseReady(true);
        });
        tiles.on('tileerror', () => {
          if (!disposed) setBaseReady(false);
        });
        m.on('click', (e) => {
          if (latest.current.pickMode)
            latest.current.onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
        });
        setRenderer('raster');
      } catch {
        if (!disposed) setRenderer('error');
      }
    };
    import('maplibre-gl')
      .then(({ Map, Popup }) => {
        if (disposed || !container.current) return;
        mapTheme.current =
          document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        const m = new Map({
          container: container.current,
          style: `https://tiles.openfreemap.org/styles/${mapTheme.current === 'dark' ? 'dark' : 'positron'}`,
          center: [-70.135, -15.491],
          zoom: 12,
          minZoom: 9,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          maxZoom: 18,
          attributionControl: { compact: true },
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        m.touchZoomRotate.disableRotation();
        gl.current = m;
        m.on('style.load', () => {
          if (!disposed && !usingFallback) {
            clearTimeout(timeout);
            styleReady.current = true;
            // The stock dark basemap is very dim. Keep streets and labels readable.
            if (mapTheme.current === 'dark')
              for (const layer of m.getStyle().layers) {
                if (layer.type === 'background')
                  m.setPaintProperty(layer.id, 'background-color', '#171c23');
                if (layer.type === 'symbol' && layer.layout?.['text-field']) {
                  m.setPaintProperty(layer.id, 'text-color', '#aab4c2');
                  m.setPaintProperty(layer.id, 'text-halo-color', '#171c23');
                }
                if (layer.type === 'line' && layer.id.startsWith('highway_'))
                  m.setPaintProperty(
                    layer.id,
                    'line-color',
                    layer.id.includes('casing')
                      ? '#46505e'
                      : layer.id.includes('minor')
                        ? '#303945'
                        : '#394350',
                  );
                if (layer.id === 'water' && layer.type === 'fill')
                  m.setPaintProperty(layer.id, 'fill-color', '#263b48');
                if (layer.id === 'landuse_residential' && layer.type === 'fill')
                  m.setPaintProperty(layer.id, 'fill-color', '#1b222b');
              }
            // The dark basemap ships its own one-way arrows, rotated 90° from
            // the street; Puriy draws its own from the street graph.
            for (const id of ['road_oneway', 'road_oneway_opposite'])
              if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
            // OpenFreeMap draws towns/cities with a solid `circle_11_black`
            // marker under the label. Remove that dot; keep the place name.
            for (const layer of m.getStyle().layers) {
              if (
                layer.type === 'symbol' &&
                layer.id.startsWith('label_') &&
                layer.layout &&
                JSON.stringify(layer.layout['icon-image'] ?? '').includes(
                  'circle_',
                )
              )
                try {
                  m.setLayoutProperty(layer.id, 'icon-image', '');
                  m.setLayoutProperty(layer.id, 'icon-optional', true);
                } catch {}
            }
            setRenderer('vector');
            setStyleRevision((v) => v + 1);
            m.resize();
          }
        });
        m.on('idle', () => {
          if (!disposed && !usingFallback) setBaseReady(true);
        });
        m.on('error', (e) => {
          if (
            !disposed &&
            !usingFallback &&
            (!m.isStyleLoaded() || e.error?.message?.includes('WebGL'))
          )
            void fallback();
        });
        m.getCanvas().addEventListener(
          'webglcontextlost',
          () => void fallback(),
          { once: true },
        );
        m.on('click', (e) => {
          if (latest.current.pickMode) {
            latest.current.onPick({ lon: e.lngLat.lng, lat: e.lngLat.lat });
            return;
          }
          const placeHits = m.getLayer('place-points')
            ? m.queryRenderedFeatures(
                [
                  [e.point.x - 5, e.point.y - 5],
                  [e.point.x + 5, e.point.y + 5],
                ],
                { layers: ['place-points'] },
              )
            : [];
          const zoom = m.getZoom();
          const f = placeHits.find((h) => zoom >= Number(h.properties?.minzoom));
          if (f) {
            const [lon, lat] = (f.geometry as unknown as { coordinates: number[] })
              .coordinates;
            new Popup({
              closeOnClick: true,
              closeButton: false,
              offset: 14,
              className: 'place-popup-host',
              maxWidth: '260px',
            })
              .setLngLat([lon, lat])
              .setDOMContent(
                placeCard({
                  ...(f.properties as PlaceProps),
                  pdu: f.properties?.pdu === true || f.properties?.pdu === 'true',
                  lon,
                  lat,
                }),
              )
              .addTo(m);
            return;
          }
          if (m.getLayer('analysis-points')) {
            const point = m.queryRenderedFeatures(e.point, {layers:['analysis-points']})[0];
            if (point?.properties?.name) {
              new Popup({closeOnClick:true}).setLngLat(e.lngLat).setText(String(point.properties.name)).addTo(m);
              return;
            }
          }
          if (m.getLayer('signals')) {
            const signal = m.queryRenderedFeatures(e.point, {
              layers: ['signals'],
            })[0];
            if (signal) {
              latest.current.onSignal?.(String(signal.properties.id));
              return;
            }
          }
          if (m.getLayer('routes')) {
            const hit = m.queryRenderedFeatures(
              [
                [e.point.x - 6, e.point.y - 6],
                [e.point.x + 6, e.point.y + 6],
              ],
              { layers: ['routes', 'routes-inbound'] },
            );
            if (hit[0]) latest.current.onSelect(String(hit[0].properties?.id));
          }
        });
      })
      .catch(() => void fallback());
    timeout = setTimeout(() => void fallback(), 12000);
    resize = new ResizeObserver(() => {
      gl.current?.resize();
      raster.current?.invalidateSize({ pan: false });
    });
    if (container.current) resize.observe(container.current);
    const restore = () => {
      if (document.visibilityState === 'visible') {
        gl.current?.resize();
        raster.current?.invalidateSize({ pan: false });
      }
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      resize?.disconnect();
      document.removeEventListener('visibilitychange', restore);
      gl.current?.remove();
      gl.current = null;
      raster.current?.remove();
      raster.current = null;
      rasterLayer.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const m = gl.current;
    if (renderer === 'vector' && m && mapTheme.current !== theme) {
      mapTheme.current = theme;
      styleReady.current = false;
      setBaseReady(false);
      m.setStyle(
        `https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'positron'}`,
      );
    }
  }, [theme, renderer]);

  useEffect(() => {
    if (!simulation && !props.signals?.length) return;
    let previous=Date.now();
    const timer = setInterval(
      () => {
        const now=Date.now(), elapsed=(now-previous)/1000; previous=now;
        setClock(now);
        if (simulation) {
          const state = latest.current;
          const route =
            state.network.routes.find((r) => r.id === state.selected) ||
            state.network.routes[0];
          const d =
            state.journey?.legs.find((l) => l.route_id === route?.id)
              ?.direction ?? (direction === 'inbound' ? 1 : 0);
          const geometry = d ? route?.inbound_geometry : route?.geometry;
          if (geometry)
            setSimulationMeters((v) =>
              advanceVehicle(
                geometry,
                v,
                elapsed,
                route.service?.speedKmh || 15,
                state.signals || [],
                Date.now(),
              ),
            );
          setTick((v) => v + 1);
        }
      },
      simulation ? 100 : 1000,
    );
    return () => clearInterval(timer);
  }, [simulation, props.signals?.length, direction]);

  useEffect(() => {
    const m = gl.current;
    // style.load permits adding layers even while base tiles are still loading.
    if (renderer === 'vector' && m && styleReady.current) {
      for (const route of props.network.routes) {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d')!;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(12, 20);
        ctx.lineTo(12, 5);
        ctx.moveTo(6, 11);
        ctx.lineTo(12, 5);
        ctx.lineTo(18, 11);
        ctx.strokeStyle = theme === 'dark' ? '#171c23' : '#fff';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = route.color;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        const icon = ctx.getImageData(0, 0, 24, 24);
        const id = `direction-${route.id}`;
        if (m.hasImage(id)) m.updateImage(id, icon);
        else m.addImage(id, icon, { pixelRatio: 2 });
      }
      if (!m.hasImage('boarding-icon')) {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(2, 2);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(1, 1, 22, 22, 7);
        ctx.fill();
        ctx.fillStyle = '#2860a7';
        ctx.beginPath();
        ctx.roundRect(3, 3, 18, 18, 5);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.roundRect(7, 6, 10, 11, 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(7, 12);
        ctx.lineTo(17, 12);
        ctx.moveTo(9, 17);
        ctx.lineTo(9, 19);
        ctx.moveTo(15, 17);
        ctx.lineTo(15, 19);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(9, 14, 1.5, 1.5);
        ctx.fillRect(13.5, 14, 1.5, 1.5);
        m.addImage('boarding-icon', ctx.getImageData(0, 0, 48, 48), {
          pixelRatio: 2,
        });
      }
      if (microSprite && !m.hasImage('micro-svg'))
        m.addImage('micro-svg', microSprite, { pixelRatio: 2 });
      if (walkSprite && !m.hasImage('walk-svg'))
        m.addImage('walk-svg', walkSprite, { pixelRatio: 2 });
      for (const phase of ['red', 'amber', 'green', 'off'])
        if (!m.hasImage(`signal-${phase}`)) {
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 64;
          const ctx = canvas.getContext('2d')!;
          ctx.scale(2, 2);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.roundRect(3, 1, 18, 29, 6);
          ctx.fill();
          ctx.fillStyle = '#29333f';
          ctx.beginPath();
          ctx.roundRect(5, 3, 14, 25, 4);
          ctx.fill();
          for (const [index, y] of [8, 15, 22].entries()) {
            ctx.fillStyle =
              phase === ['red', 'amber', 'green'][index]
                ? ['#ff4c57', '#ffc442', '#37df91'][index]
                : '#475361';
            ctx.beginPath();
            ctx.arc(12, y, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          m.addImage(`signal-${phase}`, ctx.getImageData(0, 0, 48, 64), {
            pixelRatio: 2,
          });
        }
      if (m.getSource('network'))
        (m.getSource('network') as GeoJSONSource).setData(data);
      else {
        m.addSource('network', { type: 'geojson', data });
        m.addLayer({
          id: 'coverage',
          type: 'fill',
          source: 'network',
          filter: ['in', 'kind', 'coverage', 'gps-accuracy'],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'kind'], 'gps-accuracy'],
              '#3478da',
              '#188569',
            ],
            'fill-opacity': 0.12,
          },
        });
        m.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'network',
          filter: ['==', 'kind', 'route'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': theme === 'dark' ? '#101418' : '#ffffff',
            'line-width': ['+', ['get', 'width'], 3],
            'line-offset': 4,
            'line-opacity': ['get', 'opacity'],
          },
        });
        m.addLayer({
          id: 'routes',
          type: 'line',
          source: 'network',
          filter: ['all', ['==', 'kind', 'route'], ['==', 'direction', 0]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-offset': 4,
            'line-opacity': ['get', 'opacity'],
          },
        });
        m.addLayer({
          id: 'routes-inbound',
          type: 'line',
          source: 'network',
          filter: ['all', ['==', 'kind', 'route'], ['==', 'direction', 1]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-opacity': ['get', 'opacity'],
            'line-dasharray': [5, 1.5],
            'line-offset': 4,
          },
        });
        m.addLayer({
          id: 'direction-arrows',
          type: 'symbol',
          source: 'network',
          filter: ['all', ['==', 'kind', 'route'], ['>', 'opacity', 0.5]],
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 168,
            'icon-image': ['concat', 'direction-', ['get', 'id']],
            'icon-size': 1.8,
            'icon-rotate': 90,
            'icon-keep-upright': false,
            'icon-offset': [4 / 1.8, 0],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-padding': 2,
          },
        });
        m.addLayer({
          id: 'walk',
          type: 'line',
          source: 'network',
          filter: ['==', 'kind', 'walk'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': theme === 'dark' ? '#a8cdf5' : '#285c94',
            'line-width': 2,
            'line-opacity': 0.65,
            'line-dasharray': [2, 3],
          },
        });
        m.addLayer({
          id: 'walking-icons',
          type: 'symbol',
          source: 'network',
          filter: ['==', 'kind', 'walk'],
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 76,
            'icon-keep-upright': false,
            'icon-image': 'walk-svg',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              11,
              0.6,
              16,
              0.85,
            ],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
          },
        });
        m.addLayer({
          id: 'suggested-access',
          type: 'circle',
          source: 'network',
          filter: ['all', ['==', 'kind', 'boarding'], ['==', 'proposed', true]],
          paint: {
            'circle-radius': 5,
            'circle-color': '#fff',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#285c94',
          },
        });
        m.addLayer({
          id: 'boarding-target',
          type: 'symbol',
          source: 'network',
          filter: ['all', ['==', 'kind', 'boarding'], ['!=', 'proposed', true]],
          layout: {
            'icon-image': 'boarding-icon',
            'icon-size': 1.1,
            'icon-allow-overlap': true,
          },
        });
        m.addLayer({
          id: 'stops',
          type: 'circle',
          source: 'network',
          filter: ['==', 'kind', 'stop'],
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': 4,
            'circle-stroke-color': '#55716b',
            'circle-stroke-width': 1.5,
          },
        });
        m.addLayer({id:'analysis-points',type:'circle',source:'network',filter:['==','kind','analysis'],paint:{'circle-color':['get','color'],'circle-radius':['get','radius'],'circle-opacity':0.8,'circle-stroke-color':'#ffffff','circle-stroke-width':0.5}});
        m.addLayer({
          id: 'boarding-icons',
          type: 'symbol',
          source: 'network',
          minzoom: 14,
          filter: ['==', 'kind', 'stop'],
          layout: {
            'icon-image': 'boarding-icon',
            'icon-size': 0.85,
            'icon-padding': 8,
            'icon-allow-overlap': false,
          },
        });
        m.addLayer({
          id: 'endpoints',
          type: 'circle',
          source: 'network',
          filter: ['in', 'kind', 'origin', 'destination'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 8,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
          },
        });
        m.addLayer({
          id: 'signals',
          type: 'symbol',
          source: 'network',
          filter: ['==', 'kind', 'signal'],
          layout: {
            'icon-image': ['concat', 'signal-', ['get', 'phase']],
            'icon-allow-overlap': true,
            'icon-size': 1,
          },
        });
        m.addLayer({
          id: 'vehicles',
          type: 'symbol',
          source: 'network',
          filter: ['==', 'kind', 'vehicle'],
          layout: {
            'icon-image': 'micro-svg',
            'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
            'icon-rotation-alignment': 'map',
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
      }
      if (m.getLayer('boarding-icons'))
        m.setLayoutProperty(
          'boarding-icons',
          'visibility',
          props.editing ? 'none' : 'visible',
        );
    }
    let cancelled = false;
    if (renderer === 'raster' && raster.current)
      void import('leaflet').then((L) => {
        if (cancelled || !raster.current) return;
        rasterLayer.current?.remove();
        const ordered = {
          ...data,
          features: [...data.features].sort(
            (a, b) =>
              (a.properties?.kind === 'coverage' ? -1 : 1) -
              (b.properties?.kind === 'coverage' ? -1 : 1),
          ),
        };
        rasterLayer.current = L.geoJSON(ordered, {
          style: (feature) => {
            const p = feature?.properties;
            return p?.kind === 'arrow'
              ? {
                  color: p.color,
                  fillColor: p.color,
                  fillOpacity: 1,
                  weight: 1,
                }
              : p?.kind === 'coverage' || p?.kind === 'gps-accuracy'
                ? { color: '#188569', fillOpacity: 0.08, weight: 0 }
                : p?.kind === 'walk'
                  ? {
                      color: theme === 'dark' ? '#c8d1dc' : '#344455',
                      weight: 2,
                      opacity: 0.65,
                      dashArray: '4 6',
                    }
                  : {
                      color: p?.color,
                      weight: p?.width || 3,
                      dashArray: p?.direction === 1 ? '7 7' : undefined,
                      opacity: p?.opacity ?? 1,
                    };
          },
          pointToLayer: (feature, latlng) => {
            const p = feature.properties;
            if (p.kind === 'walk-marker') {
              const img = document.createElement('img');
              img.src = '/footprints.svg';
              img.alt = 'Tramo a pie';
              img.style.transform = `rotate(${(p.bearing || 0) + 90}deg)`;
              return L.marker(latlng, {
                icon: L.divIcon({
                  html: img,
                  className: 'walking-map-marker',
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                }),
              });
            }
            if (p.kind === 'signal') {
              const el = document.createElement('span');
              el.className = 'signal-map-marker';
              el.dataset.phase = p.phase;
              for (let i = 0; i < 3; i++) {
                const lamp = document.createElement('i');
                el.appendChild(lamp);
              }
              return L.marker(latlng, {
                icon: L.divIcon({
                  html: el,
                  className: 'signal-marker-host',
                  iconSize: [24, 32],
                  iconAnchor: [12, 16],
                }),
              });
            }
            if (p.kind === 'vehicle') {
              const img = document.createElement('img');
              img.src = '/micro.svg';
              img.style.transform = `rotate(${p.bearing || 0}deg)`;
              img.alt = p.name;
              img.width = 38;
              img.height = 45;
              return L.marker(latlng, {
                icon: L.divIcon({
                  html: img,
                  className: 'micro-map-marker',
                  iconSize: [38, 45],
                  iconAnchor: [19, 22],
                }),
              });
            }
            if (p.kind === 'arrow') {
              const el = document.createElement('div');
              el.className = 'direction-marker';
              el.style.transform = `rotate(${p.bearing}deg)`;
              const svg = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg',
              );
              svg.setAttribute('viewBox', '0 0 24 24');
              svg.setAttribute('width', '22');
              svg.setAttribute('height', '22');
              for (const [color, width] of [
                [theme === 'dark' ? '#171c23' : '#fff', '7'],
                [p.color, '3.5'],
              ]) {
                const path = document.createElementNS(
                  'http://www.w3.org/2000/svg',
                  'path',
                );
                path.setAttribute('d', 'M12 20 L12 5 M6 11 L12 5 L18 11');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', width);
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                svg.appendChild(path);
              }
              el.appendChild(svg);
              return L.marker(latlng, {
                interactive: false,
                icon: L.divIcon({
                  html: el,
                  className: 'direction-marker-host',
                  iconSize: [22, 22],
                  iconAnchor: [11, 11],
                }),
              });
            }
            return L.circleMarker(latlng, {
              radius: p.kind === 'analysis' ? p.radius : p.kind === 'stop' ? 4 : p.kind === 'vehicle' ? 10 : 8,
              fillColor: p.color,
              color: p.kind === 'stop' ? '#55716b' : '#ffffff',
              weight: p.kind === 'analysis' ? 0.5 : p.kind === 'stop' ? 1.5 : 3,
              fillOpacity: 1,
            });
          },
          onEachFeature: (feature, layer) => {
            const p = feature.properties;
            if (p?.kind === 'signal')
              layer.on('click', () => latest.current.onSignal?.(p.id));
            if (p?.kind === 'route')
              layer.on('click', () => {
                if (!latest.current.pickMode) latest.current.onSelect(p.id);
              });
            if (p?.name) {
              const label = document.createElement('span');
              label.textContent = p.name;
              layer.bindTooltip(label);
            }
          },
        }).addTo(raster.current);
      });
    return () => {
      cancelled = true;
    };
  }, [renderer, data, styleRevision, theme, microSprite, walkSprite]);

  useEffect(() => {
    const m = gl.current;
    if (renderer !== 'vector' || !m || !styleReady.current) return;
    const dark = theme === 'dark';
    const data = { type: 'FeatureCollection' as const, features: oneway && onewayData ? onewayData : [] };
    const source = m.getSource('oneway') as GeoJSONSource | undefined;
    if (source) {
      void source.setData(data);
      return;
    }
    if (!m.hasImage('oneway-arrow')) m.addImage('oneway-arrow', onewayArrow(dark), { pixelRatio: 2 });
    m.addSource('oneway', { type: 'geojson', data });
    const below = m.getLayer('coverage') ? 'coverage' : undefined;
    m.addLayer({
      id: 'oneway-arrows', type: 'symbol', source: 'oneway', minzoom: 15,
      layout: {
        // One arrow at the middle of each block keeps it aligned with the street.
        'symbol-placement': 'line-center',
        'icon-image': 'oneway-arrow',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.62, 18, 0.95],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': false,
        'icon-padding': 2,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.4, 0.9] },
    }, below);
  }, [renderer, oneway, onewayData, styleRevision, theme]);
  useEffect(() => {
    const m = gl.current;
    if (renderer !== 'vector' || !m || oneway) return;
    const check = () => {
      if (m.getZoom() >= 14.5) setOneway(true);
    };
    check();
    m.on('zoomend', check);
    return () => {
      m.off('zoomend', check);
    };
  }, [renderer, oneway]);

  useEffect(() => {
    const m = gl.current;
    let cancelled = false;
    if (renderer === 'vector' && m && styleReady.current) {
      const dark = theme === 'dark';
      // Icons are theme-dependent (halo) and vanish on style reloads.
      void Promise.all(
        CATEGORY_ORDER.map(async (c) => {
          const id = `place-${c}`;
          const icon = await rasterize(markerSvg(c, CATEGORIES[c].color, dark));
          if (cancelled || gl.current !== m) return;
          if (m.hasImage(id)) m.updateImage(id, icon);
          else m.addImage(id, icon, { pixelRatio: 2 });
        }),
      ).then(() => {
        if (cancelled || gl.current !== m || !styleReady.current) return;
        const source = m.getSource('places') as GeoJSONSource | undefined;
        if (source) {
          void source.setData(placeData);
          m.setPaintProperty('place-labels', 'text-halo-color', dark ? '#171c23' : '#ffffff');
          return;
        }
        m.addSource('places', { type: 'geojson', data: placeData });
        const below = m.getLayer('coverage') ? 'coverage' : undefined;
        // Schools only appear when zoomed in. `zoom` must be the top-level
        // step input, so per-category visibility is an opacity step.
        const shown = (z: number) => ['case', ['<=', ['get', 'minzoom'], z], 1, 0];
        const visibleAtZoom = [
          'step', ['zoom'], shown(11), 12, shown(12), 13, shown(13), 14, 1,
        ] as unknown as number;
        m.addLayer(
          {
            id: 'place-points',
            type: 'symbol',
            source: 'places',
            layout: {
              'icon-image': ['concat', 'place-', ['get', 'category']],
              'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                11, ['case', ['get', 'pdu'], 0.62, 0.48],
                16, ['case', ['get', 'pdu'], 0.95,
                  ['in', ['get', 'category'], ['literal', ['colegio', 'inicial']]], 0.62, 0.8],
              ],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'symbol-sort-key': ['case', ['get', 'pdu'], 0, 1],
            },
            paint: { 'icon-opacity': visibleAtZoom },
          },
          below,
        );
        m.addLayer(
          {
            id: 'place-labels',
            type: 'symbol',
            source: 'places',
            minzoom: 14,
            filter: ['any', ['get', 'pdu'], ['>=', ['zoom'], 16]],
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 11,
              'text-offset': [0, 1.35],
              'text-anchor': 'top',
              'text-max-width': 9,
              'text-optional': true,
            },
            paint: {
              'text-color': dark ? '#c9d1db' : '#3d4550',
              'text-halo-color': dark ? '#171c23' : '#ffffff',
              'text-halo-width': 1.4,
            },
          },
          below,
        );
      });
    }
    if (renderer === 'raster' && raster.current)
      void import('leaflet').then((L) => {
        if (cancelled || !raster.current) return;
        placeLayer.current?.remove();
        const dark = theme === 'dark';
        placeLayer.current = L.geoJSON(placeData, {
          filter: (f) => mapZoom >= (f.properties?.minzoom ?? 11),
          pointToLayer: (f, latlng) => {
            const size = f.properties.pdu ? 30 : 24;
            return L.marker(latlng, {
              icon: L.divIcon({
                html: markerSvg(f.properties.category, f.properties.color, dark),
                className: 'place-map-marker',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              }),
            });
          },
          onEachFeature: (f, layer) => {
            const [lon, lat] = (f.geometry as unknown as { coordinates: number[] })
              .coordinates;
            layer.bindPopup(() => placeCard({ ...f.properties, lon, lat }), {
              className: 'place-popup-host',
              closeButton: false,
            });
          },
        }).addTo(raster.current);
        placeLayer.current.bringToBack();
      });
    return () => {
      cancelled = true;
    };
  }, [renderer, placeData, styleRevision, theme, mapZoom]);

  useEffect(() => {
    const p = props.origin;
    if (!ready || !p?.locatedAt) return;
    gl.current?.easeTo({
      center: [p.lon, p.lat],
      zoom: Math.max(14, gl.current.getZoom()),
      duration: 500,
    });
    raster.current?.setView(
      [p.lat, p.lon],
      Math.max(14, raster.current.getZoom()),
    );
  }, [ready, props.origin?.locatedAt]);

  const fit = () => {
    const bounds = mapBounds(latest.current),
      height = container.current?.clientHeight || 400;
    const padding = {
      top: height < 400 ? 65 : 95,
      bottom: height < 400 ? 65 : 95,
      left: 35,
      right: 50,
    };
    gl.current?.fitBounds(bounds, { padding, maxZoom: 14, duration: 0 });
    raster.current?.fitBounds(
      [
        [bounds[0][1], bounds[0][0]],
        [bounds[1][1], bounds[1][0]],
      ],
      {
        paddingTopLeft: [padding.left, padding.top],
        paddingBottomRight: [padding.right, padding.bottom],
        maxZoom: 14,
        animate: false,
      },
    );
  };
  useEffect(() => {
    if (ready && (!props.editing || fitted.current !== props.selected)) {
      fit();
      fitted.current = props.selected;
    }
  }, [ready, props.selected, props.network, props.journey, props.editing]);
  useEffect(() => {
    if (!ready) return;
    const observer = new ResizeObserver(() => fit());
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <section
      className={`transit-map ${props.pickMode ? 'picking' : ''}`}
      data-theme={theme}
      data-direction={direction}
      data-map-ready={ready}
      data-base-ready={baseReady}
      data-renderer={renderer}
      aria-label="Mapa interactivo de Juliaca"
    >
      <div
        ref={container}
        className="map-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {(props.coverage || props.network.routes.length > 0 || props.places) && (
        <div className="map-top-right">
          {(props.coverage || props.network.routes.length > 0) && (
            <span className="map-chip">
              <Layers size={15} />
              {props.coverage ? 'Acceso a 650 m' : 'Red de rutas'}
            </span>
          )}
          {props.places && (
            <button
              type="button"
              className="map-chip map-places-toggle"
              aria-expanded={placesOpen}
              aria-controls="map-places-panel"
              onClick={() => setPlacesOpen(!placesOpen)}
            >
              <Landmark size={15} />
              Lugares
              {placeLayers.length > 0 && (
                <span className="map-chip-count">{placeLayers.length}</span>
              )}
            </button>
          )}
          {props.places && placesOpen && (
            <div
              id="map-places-panel"
              className="map-places-panel"
              role="group"
              aria-label="Lugares concurridos en el mapa"
            >
              <div className="map-places-head">
                <strong>Lugares concurridos</strong>
                <button
                  type="button"
                  aria-label="Cerrar lugares"
                  onClick={() => setPlacesOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              {CATEGORY_ORDER.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={placeLayers.includes(c)}
                    onChange={() => toggleCategory(c)}
                  />
                  <i
                    className="place-glyph"
                    style={{ background: CATEGORIES[c].color }}
                    dangerouslySetInnerHTML={{ __html: glyphSvg(c, 12, '#fff') }}
                  />
                  <span>{CATEGORIES[c].label}</span>
                  <small>{PLACE_COUNTS[c]}</small>
                </label>
              ))}
              <p>
                Colegios aparecen al acercar el mapa. Al acercarte más se muestran las flechas de sentido de las calles. Fuente:{' '}
                {DESTINATIONS_SOURCE}. Verificar en campo antes de usar en
                análisis.
              </p>
            </div>
          )}
        </div>
      )}
      {!props.editing && !props.journey && props.network.routes.length > 0 && (
        <div
          className="map-directions"
          role="group"
          aria-label="Sentidos en el mapa"
        >
          {(['both', 'outbound', 'inbound'] as const).map((d) => (
            <button
              key={d}
              aria-label={
                d === 'both'
                  ? 'Ver ambos sentidos en el mapa'
                  : d === 'outbound'
                    ? 'Ver ida en el mapa'
                    : 'Ver vuelta en el mapa'
              }
              aria-pressed={direction === d}
              onClick={() => changeDirection(d)}
            >
              {d === 'both' ? (
                'Ambos'
              ) : d === 'outbound' ? (
                <>
                  <i />
                  Ida
                </>
              ) : (
                <>
                  <i className="dashed" />
                  Vuelta
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {props.allowSimulation && !!props.signals?.length && (
        <div className="signal-simulation-label">
          Semáforos · ciclo simulado según configuración
        </div>
      )}
      {props.pickMode && (
        <div className="map-pick">
          <MapPin size={17} />
          {props.pickMode === 'signal'
            ? 'Haz clic en la ubicación del semáforo'
            : props.editing
              ? 'Haz clic para añadir o mover un vértice'
              : `Toca el mapa para elegir tu ${props.pickMode === 'origin' ? 'origen' : 'destino'}`}
        </div>
      )}
      {renderer === 'error' && (
        <div className="map-notice" role="alert">
          No se pudo cargar el mapa.
          <button
            className="secondary"
            onClick={() => setAttempt((v) => v + 1)}
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      )}
      {renderer === 'loading' && (
        <div className="map-loading" role="status">
          Cargando el mapa de Juliaca…
        </div>
      )}
      {renderer === 'raster' && !baseReady && (
        <div className="map-notice" role="status">
          Cargando calles. Si estás sin conexión, puedes consultar las fichas.
        </div>
      )}
      <div className="map-controls">
        <button
          disabled={!ready}
          aria-label="Acercar mapa"
          title="Acercar mapa"
          onClick={() => {
            gl.current?.zoomIn();
            raster.current?.zoomIn();
          }}
        >
          <Plus size={19} />
        </button>
        <button
          disabled={!ready}
          aria-label="Alejar mapa"
          title="Alejar mapa"
          onClick={() => {
            gl.current?.zoomOut();
            raster.current?.zoomOut();
          }}
        >
          <Minus size={19} />
        </button>
        <button
          disabled={!ready}
          aria-label="Centrar en Juliaca"
          title="Encuadrar las rutas"
          onClick={fit}
        >
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="map-bottom">
        <div className="map-legend">
          {props.network.routes.map((r) => (
            <button
              key={r.id}
              className={props.selected === r.id ? 'active' : ''}
              aria-pressed={props.selected === r.id}
              onClick={() => props.onSelect(r.id)}
            >
              <i style={{ background: r.color }} />
              {r.code}
            </button>
          ))}
        </div>
      </div>
      {props.allowSimulation &&
        !props.editing &&
        props.network.routes.length > 0 && (
          <button
            className="simulation simulation-prominent"
            aria-pressed={simulation}
            onClick={() => setSimulation(!simulation)}
          >
            <span
              className="t-icon-swap"
              data-state={simulation ? 'b' : 'a'}
              aria-hidden="true"
            >
              <Play size={14} className="t-icon" data-icon="a" />
              <Pause size={14} className="t-icon" data-icon="b" />
            </span>{' '}
            {simulation ? 'Pausar simulación' : 'Simular un micro'}
          </button>
        )}
      {simulation && (
        <div className="simulation-label">SIMULACIÓN · sin GPS real</div>
      )}
    </section>
  );
}
