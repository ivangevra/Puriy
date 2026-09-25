'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Footprints,
  Clock,
  BusFront,
  MapPin,
  Route as RouteIcon,
  Radio,
  Gauge,
  Users,
  CircleDot,
  Construction,
  Waypoints,
  TrafficCone,
  Cpu,
  Sparkles,
  Download,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from './Theme';
import {
  BAKED,
  SEARCH,
  TRAFFIC,
  createScenarios,
  DEFAULT_ALGO,
  DEFAULT_TRIP,
  type AlgoPoints,
  type Corridor,
  type DemoInput,
  type Frame,
} from '../lib/demo-scenarios';
import { loadGraph, onewayFeatures, snapToEdge, type RoadGraph } from '../lib/road-graph';
import { DAYS, DAY_SHORT, HOURS, level } from '../lib/traffic-model';
import { DESTINATIONS } from '../lib/destinations';
import { IS_LOCAL_DEMO, request } from '../lib/api';
import { PUBLISHED_KEY, readPublications } from '../lib/map-workspace';
import { draftGeometry } from '../lib/route-drafts';
import { readLocal } from '../lib/mobility';
import { CATEGORIES, CATEGORY_ORDER, type DestinationCategory } from '../lib/destinations';
import { EVENT_GLYPHS, glyphMarkerSvg, markerSvg, onewayArrow, rasterize, signalLightSvg } from '../lib/place-icons';
import { meters, type Coord } from '../lib/demo-geo';
import { drawDemoVideo, VIDEO_HEIGHT, VIDEO_WIDTH, type DemoVideoScene, type DemoVideoSource, type DemoVideoVariant } from '../lib/demo-video';
import { JEV_MIN_CONFIDENCE, KINDS, LLM_LATENCY, SAFETY, type LabDemand, type LabSnapshot } from '../lib/adaptive-signals';
import AdaptiveStage from './AdaptiveStage';

const ICONS = {
  viaje: Footprints,
  ruta: RouteIcon,
  gps: Radio,
  trafico: Gauge,
  flota: BusFront,
  cobertura: Users,
  desvio: Construction,
  algoritmo: Waypoints,
  semaforos: TrafficCone,
  adaptativo: Cpu,
} as const;

const demoIconUrl = (name: 'footprints' | 'micro') =>
  document.querySelector<HTMLMetaElement>(`meta[name="puriy-demo-${name}"]`)?.content || `/${name}.svg`;

// Next demos to build once the corresponding data exists.
const UPCOMING: [string, string][] = [
  ['Semáforos con ciclos medidos', 'Onda verde calculada con los tiempos reales del inventario de semáforos y aforos.'],
  ['Llegada estimada (ETA)', 'Minutos hasta el próximo micro por paradero, con GPS calibrado e historial.'],
  ['Transbordos entre líneas', 'Viajes con dos micros usando RAPTOR (OpenTripPlanner) sobre el GTFS de las 40 líneas.'],
  ['Demanda por paradero y hora', 'Subidas y bajadas medidas para ajustar la frecuencia en punta y valle.'],
  ['Avisos al pasajero', 'Cierres, ferias y desvíos publicados en la app en el momento.'],
  ['Accesibilidad', 'Rutas a pie sin gradas ni veredas angostas para personas con movilidad reducida.'],
];

/** The demo corridor follows the route published from the editor (N40 by
 * default); its vuelta is used as soon as it is drawn there. */
async function liveCorridor(code = BAKED.code): Promise<Corridor | null> {
  const raw = IS_LOCAL_DEMO
    ? readLocal(PUBLISHED_KEY, [])
    : (await request<{ publications: unknown }>('/public/workspace')).publications;
  const draft = readPublications(raw)
    .map((p) => p.draft)
    .find((d) => d.code === code);
  if (!draft) return null;
  const outbound = draftGeometry(draft, 'outbound') as Coord[];
  const inbound = draftGeometry(draft, 'inbound') as Coord[];
  if (outbound.length < 2) return null;
  return {
    code: draft.code || code,
    name: draft.name,
    color: draft.color || BAKED.color,
    service: { ...BAKED.service, ...(draft.service || {}) },
    outbound,
    inbound: inbound.length > 1 ? inbound : BAKED.inbound,
    inboundSource: inbound.length > 1 ? 'editor' : 'estimada',
    source: 'Recorrido publicado desde el editor',
  };
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const styleUrl = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;

function addLayers(m: GLMap, dark: boolean) {
  const halo = dark ? '#171c23' : '#ffffff';
  m.addSource('demo', { type: 'geojson', data: EMPTY });
  m.addSource('oneway', { type: 'geojson', data: EMPTY });
  m.addSource('explore-dijkstra', { type: 'geojson', data: EMPTY });
  m.addSource('explore-astar', { type: 'geojson', data: EMPTY });
  m.addLayer({
    id: 'oneway-arrows', type: 'symbol', source: 'oneway', minzoom: 14,
    layout: {
      visibility: 'none',
      'symbol-placement': 'line-center',
      'icon-image': 'oneway-arrow',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.55, 18, 0.95],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': false,
      'icon-padding': 2,
    },
  });
  for (const [id, color] of [['dijkstra', SEARCH.dijkstra], ['astar', SEARCH.astar]] as const) {
    m.addLayer({
      id: `explore-${id}-glow`, type: 'line', source: `explore-${id}`, filter: ['<', ['get', 'order'], 0],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 6, 'line-opacity': 0.18, 'line-blur': 3 },
    });
    m.addLayer({
      id: `explore-${id}`, type: 'line', source: `explore-${id}`, filter: ['<', ['get', 'order'], 0],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.85 },
    });
  }
  const kind = (k: string | string[]) =>
    (Array.isArray(k) ? ['in', ['get', 'kind'], ['literal', k]] : ['==', ['get', 'kind'], k]) as never;
  m.addLayer({ id: 'd-fill', type: 'fill', source: 'demo', filter: kind('fill'), paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } });
  m.addLayer({
    id: 'd-block', type: 'circle', source: 'demo', filter: kind('block'),
    paint: {
      'circle-radius': ['get', 'r'],
      'circle-color': ['case', ['get', 'inside'], '#275cba', dark ? '#4a5462' : '#b8c0ca'],
      'circle-opacity': ['case', ['get', 'inside'], 0.75, 0.45],
    },
  });
  m.addLayer({ id: 'd-casing', type: 'line', source: 'demo', filter: kind(['route', 'route-dash', 'closure']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-width': ['+', ['coalesce', ['get', 'width'], 8], 3], 'line-opacity': ['coalesce', ['get', 'opacity'], 1] } });
  m.addLayer({ id: 'd-route', type: 'line', source: 'demo', filter: kind('route'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'd-route-dash', type: 'line', source: 'demo', filter: kind('route-dash'), layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [2, 1.4] } });
  // Closure: solid red band with white "barrier tape" stripes on top.
  m.addLayer({ id: 'd-closure', type: 'line', source: 'demo', filter: kind('closure'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': TRAFFIC.jam, 'line-width': 9, 'line-opacity': 0.9 } });
  m.addLayer({ id: 'd-closure-tape', type: 'line', source: 'demo', filter: kind('closure'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [1.2, 1.2] } });
  m.addLayer({ id: 'd-walk', type: 'line', source: 'demo', filter: kind('walk'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#a8cdf5' : '#285c94', 'line-width': 2.5, 'line-opacity': 0.55, 'line-dasharray': [1.5, 2] } });
  m.addLayer({
    id: 'd-walk-icons', type: 'symbol', source: 'demo', filter: kind('walk'),
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 38,
      'icon-image': 'demo-walk',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.55, 17, 0.9],
      'icon-rotation-alignment': 'map',
      'icon-keep-upright': false,
      'icon-allow-overlap': true,
    },
  });
  m.addLayer({ id: 'd-ping', type: 'circle', source: 'demo', filter: kind('ping'), paint: { 'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-opacity': ['get', 'opacity'] } });
  m.addLayer({
    id: 'd-stop', type: 'circle', source: 'demo', filter: kind('stop'),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 6],
      'circle-color': ['case', ['boolean', ['get', 'off'], false], TRAFFIC.jam, halo],
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2,
    },
  });
  m.addLayer({
    id: 'd-place', type: 'symbol', source: 'demo', filter: kind('place'),
    layout: {
      'icon-image': ['concat', 'place-', ['get', 'category']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 16, 0.85],
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11.5,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: { 'text-color': dark ? '#e6ebf1' : '#20252c', 'text-halo-color': halo, 'text-halo-width': 1.6 },
  });
  m.addLayer({ id: 'd-pin', type: 'circle', source: 'demo', filter: kind('pin'), paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': halo, 'circle-stroke-width': 3 } });
  m.addLayer({
    id: 'd-pin-label', type: 'symbol', source: 'demo', filter: kind('pin'),
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
    paint: { 'text-color': dark ? '#e6ebf1' : '#20252c', 'text-halo-color': halo, 'text-halo-width': 1.6 },
  });
  m.addLayer({
    id: 'd-micro', type: 'symbol', source: 'demo', filter: kind('micro'),
    layout: {
      'icon-image': 'demo-micro',
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 16, 0.9],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['coalesce', ['get', 'label'], ''],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10.5,
      'text-offset': [0, 1.9],
      'text-allow-overlap': true,
      'text-optional': true,
    },
    paint: {
      'icon-opacity': ['get', 'opacity'],
      'text-opacity': ['get', 'opacity'],
      'text-color': dark ? '#e6ebf1' : '#20252c',
      'text-halo-color': halo,
      'text-halo-width': 1.5,
    },
  });
  m.addLayer({
    id: 'd-signal', type: 'symbol', source: 'demo', filter: kind('signal'),
    layout: {
      'icon-image': ['concat', 'signal-', ['get', 'phase']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.7],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: { 'text-color': dark ? '#e6ebf1' : '#20252c', 'text-halo-color': halo, 'text-halo-width': 1.6 },
  });
  m.addLayer({ id: 'd-person', type: 'circle', source: 'demo', filter: kind('person'), paint: { 'circle-radius': 7, 'circle-color': '#20252c', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
  // Flow: small dots moving along alternatives and detours.
  m.addLayer({ id: 'd-flow', type: 'circle', source: 'demo', filter: kind('flow'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 16, 4], 'circle-color': halo, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } });
  m.addLayer({
    id: 'd-event', type: 'symbol', source: 'demo', filter: kind('event'),
    layout: {
      'icon-image': ['concat', 'event-', ['get', 'icon']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 16, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11.5,
      'text-offset': [0, 1.7],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': dark ? '#f1c7c4' : '#9b2c27', 'text-halo-color': halo, 'text-halo-width': 1.8 },
  });
  // Badge: white text on a thick halo of the route color reads as a pill.
  m.addLayer({
    id: 'd-badge', type: 'symbol', source: 'demo', filter: kind('badge'),
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12.5,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 6, 'text-halo-blur': 0 },
  });
}

async function addImages(m: GLMap, dark: boolean) {
  await Promise.all(
    CATEGORY_ORDER.map(async (c: DestinationCategory) => {
      const icon = await rasterize(markerSvg(c, CATEGORIES[c].color, dark));
      if (!m.hasImage(`place-${c}`)) m.addImage(`place-${c}`, icon, { pixelRatio: 2 });
    }),
  );
  if (!m.hasImage('oneway-arrow')) m.addImage('oneway-arrow', onewayArrow(dark), { pixelRatio: 2 });
  await Promise.all(
    (['red', 'amber', 'green'] as const).map(async (p) => {
      const icon = await rasterize(signalLightSvg(p, dark));
      if (!m.hasImage(`signal-${p}`)) m.addImage(`signal-${p}`, icon, { pixelRatio: 2 });
    }),
  );
  const eventColors = { barrera: TRAFFIC.jam, feria: '#c4622d', alerta: TRAFFIC.slow } as const;
  await Promise.all(
    (Object.keys(EVENT_GLYPHS) as (keyof typeof EVENT_GLYPHS)[]).map(async (k) => {
      const icon = await rasterize(glyphMarkerSvg(EVENT_GLYPHS[k], eventColors[k], dark));
      if (!m.hasImage(`event-${k}`)) m.addImage(`event-${k}`, icon, { pixelRatio: 2 });
    }),
  );
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      // The sprite's toes point to -x; flip so they point along the walk (+x).
      ctx.translate(48, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, 48, 48);
      if (!m.hasImage('demo-walk')) m.addImage('demo-walk', ctx.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = demoIconUrl('footprints');
  });
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 112;
      c.getContext('2d')!.drawImage(img, 0, 0, 96, 112);
      if (!m.hasImage('demo-micro'))
        m.addImage('demo-micro', c.getContext('2d')!.getImageData(0, 0, 96, 112), { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = demoIconUrl('micro');
  });
}

export default function Demos({ showThemeToggle = false }: { showThemeToggle?: boolean }) {
  const { theme, setPreference } = useTheme();
  const [index, setIndex] = useState(0),
    [t, setT] = useState(0),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [full, setFull] = useState(false),
    [mapReady, setMapReady] = useState(false),
    [headway, setHeadway] = useState(8),
    [kmh, setKmh] = useState(15),
    [manzanas, setManzanas] = useState<DemoInput['manzanas']>(),
    [corridor, setCorridor] = useState<Corridor>(BAKED),
    [graph, setGraph] = useState<RoadGraph | null>(null),
    [graphError, setGraphError] = useState(false),
    [day, setDay] = useState(0),
    [hour, setHour] = useState(7),
    [severity, setSeverity] = useState(0.8),
    [demand, setDemand] = useState(1),
    [labDemand, setLabDemand] = useState<LabDemand>('normal'),
    [labPriority, setLabPriority] = useState(false),
    [algoPoints, setAlgoPoints] = useState<AlgoPoints>(DEFAULT_ALGO),
    [tripPoints, setTripPoints] = useState<AlgoPoints>(DEFAULT_TRIP),
    [algoWeight, setAlgoWeight] = useState<'time' | 'distance'>('time'),
    [pick, setPick] = useState<'from' | 'to' | null>(null),
    [videoVariant, setVideoVariant] = useState<DemoVideoVariant>('clean'),
    [exportState, setExportState] = useState<'idle' | 'recording' | 'saving'>('idle'),
    [exportError, setExportError] = useState('');
  useEffect(() => {
    liveCorridor().then((c) => c && setCorridor(c)).catch(() => {});
    loadGraph().then(setGraph).catch(() => setGraphError(true));
  }, []);
  const SCENARIOS = useMemo(
    () => createScenarios(corridor, graph, algoPoints, tripPoints, algoWeight),
    [corridor, graph, algoPoints, tripPoints, algoWeight],
  );
  const scenario = SCENARIOS[Math.min(index, SCENARIOS.length - 1)];
  useEffect(() => {
    scenarioIdRef.current = scenario.id;
    setPick(null);
  }, [scenario.id]);
  const root = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null),
    map = useRef<GLMap | null>(null),
    loaded = useRef(false),
    recorderRef = useRef<MediaRecorder | null>(null),
    recordingStreamRef = useRef<MediaStream | null>(null),
    discardRecordingRef = useRef(false),
    stopVideoFramesRef = useRef<() => void>(() => {}),
    videoSceneRef = useRef<DemoVideoScene | null>(null);
  const input: DemoInput = useMemo(
    () => ({ day, hour, severity, headway, speed: kmh, layover: 10, manzanas, demand, labDemand, labPriority }),
    [day, hour, severity, headway, kmh, manzanas, demand, labDemand, labPriority],
  );
  // Algorithm demo: click the map to move the origin or destination; the
  // searches run again at once and the animation restarts.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const scenarioIdRef = useRef('');
  const labelFor = (p: [number, number]) => {
    const place = DESTINATIONS.filter((d) => d.category !== 'inicial')
      .map((d) => ({ d, m: Math.hypot((d.lon - p[0]) * 107000, (d.lat - p[1]) * 110540) }))
      .sort((a, b) => a.m - b.m)[0];
    if (place && place.m < 120) return place.d.name;
    const street = graph ? snapToEdge(graph, p, 'drive', 200)?.edge.name : '';
    return street || 'Punto elegido';
  };
  const labelRef = useRef(labelFor);
  labelRef.current = labelFor;
  const frame: Frame = useMemo(() => scenario.frame(t, input), [scenario, t, input]);
  videoSceneRef.current = {
    id: scenario.id,
    title: scenario.title,
    caption: frame.caption,
    code: corridor.code,
    index,
    count: SCENARIOS.length,
    time: t,
    duration: scenario.duration,
    speed,
  };

  // Clock: advances only while playing; loops or stops at the end.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(),
      id = 0;
    const tick = (now: number) => {
      // The video is recorded at the chosen speed too.
      const dt = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      setT((v) => {
        const next = v + dt;
        if (next < scenario.duration) return next;
        if (scenario.loop && exportState !== 'recording') return next % scenario.duration;
        setPlaying(false);
        return scenario.duration;
      });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, scenario, exportState]);

  const cancelExport = () => {
    discardRecordingRef.current = true;
    setPlaying(false);
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const startExport = () => {
    const currentMap = map.current;
    const labCanvases = root.current?.querySelectorAll<HTMLCanvasElement>('.lab-panel canvas');
    const source: DemoVideoSource | null = scenario.stage === 'lab'
      ? labCanvases?.length === 2 ? { kind: 'lab', canvases: [labCanvases[0], labCanvases[1]] } : null
      : currentMap && mapReady ? { kind: 'map', canvas: currentMap.getCanvas() } : null;
    const format = typeof MediaRecorder === 'undefined' ? undefined : [
      { mime: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
      { mime: 'video/mp4', extension: 'mp4' },
      { mime: 'video/webm;codecs=vp9', extension: 'webm' },
      { mime: 'video/webm;codecs=vp8', extension: 'webm' },
      { mime: 'video/webm', extension: 'webm' },
    ].find(({ mime }) => MediaRecorder.isTypeSupported(mime));
    if (!source) {
      setExportError('La demostración todavía no está lista para grabar. Inténtalo de nuevo en unos segundos.');
      return;
    }
    if (!format || !HTMLCanvasElement.prototype.captureStream) {
      setExportError('Este navegador no permite grabar video. Abre la demostración en una versión reciente de Chrome, Edge o Safari.');
      return;
    }
    try {
      const videoCanvas = document.createElement('canvas');
      videoCanvas.width = VIDEO_WIDTH;
      videoCanvas.height = VIDEO_HEIGHT;
      const ctx = videoCanvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('No se pudo preparar el video');
      videoSceneRef.current = {
        id: scenario.id,
        title: scenario.title,
        caption: scenario.frame(0, input).caption,
        code: corridor.code,
        index,
        count: SCENARIOS.length,
        time: 0,
        duration: scenario.duration,
        speed,
      };
      const renderVideoFrame = () => {
        const scene = videoSceneRef.current;
        if (scene) drawDemoVideo(ctx, source, scene, videoVariant);
      };
      if (source.kind === 'map') currentMap?.on('render', renderVideoFrame);
      let repaintId = 0;
      const repaint = () => {
        if (source.kind === 'map') currentMap?.triggerRepaint();
        else renderVideoFrame();
        repaintId = requestAnimationFrame(repaint);
      };
      stopVideoFramesRef.current = () => {
        cancelAnimationFrame(repaintId);
        if (source.kind === 'map') currentMap?.off('render', renderVideoFrame);
        stopVideoFramesRef.current = () => {};
      };
      renderVideoFrame();
      repaintId = requestAnimationFrame(repaint);
      const stream = videoCanvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      const filename = `puriy-demo-${scenario.id}-${videoVariant === 'clean' ? 'solo-video' : 'con-explicacion'}${speed === 1 ? '' : `-x${speed}`}.${format.extension}`;
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      discardRecordingRef.current = false;
      setExportError('');
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        setExportError('No se pudo grabar el video. Inténtalo de nuevo.');
        setPlaying(false);
        if (recorder.state === 'recording') recorder.stop();
      };
      recorder.onstop = () => {
        stopVideoFramesRef.current();
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setExportState('idle');
        if (discardRecordingRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || format.mime });
        if (!blob.size) {
          setExportError('La grabación quedó vacía. Inténtalo de nuevo.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
      recorder.start(1000);
      setT(0);
      setPlaying(true);
      setExportState('recording');
    } catch {
      stopVideoFramesRef.current();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setExportError('No se pudo iniciar la grabación. Inténtalo de nuevo.');
    }
  };

  useEffect(() => {
    if (exportState !== 'recording' || t < scenario.duration) return;
    const timeout = window.setTimeout(() => {
      setExportState('saving');
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [exportState, scenario.duration, t]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    stopVideoFramesRef.current();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state === 'recording') recorder.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    let disposed = false;
    const dark = theme === 'dark';
    void import('maplibre-gl').then(({ Map }) => {
      if (disposed || !container.current) return;
      const m = new Map({
        container: container.current,
        style: styleUrl(dark),
        center: [-70.135, -15.491],
        zoom: 12.5,
        dragRotate: false,
        maxPitch: 0,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.on('click', (e) => {
        const target = pickRef.current;
        if (!target) return;
        const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const label = labelRef.current(p);
        const update = (a: AlgoPoints) => (target === 'from' ? { ...a, from: p, fromLabel: label } : { ...a, to: p, toLabel: label });
        if (scenarioIdRef.current === 'viaje') setTripPoints(update);
        else setAlgoPoints(update);
        setPick(null);
        setT(0);
        setPlaying(true);
      });
      m.on('style.load', () => {
        // Hide the basemap's own (misaligned) one-way arrows; ours replace them.
        for (const id of ['road_oneway', 'road_oneway_opposite'])
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
        void addImages(m, dark).then(() => {
          if (disposed) return;
          if (!m.getSource('demo')) addLayers(m, dark);
          loaded.current = true;
          setMapReady(true);
        });
      });
    });
    return () => {
      disposed = true;
      loaded.current = false;
      setMapReady(false);
      map.current?.remove();
      map.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    void (m.getSource('demo') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: frame.features,
    } as never);
    for (const id of ['dijkstra', 'astar'] as const) {
      const upTo = frame.explore?.[id] ?? 0;
      for (const layer of [`explore-${id}`, `explore-${id}-glow`])
        m.setFilter(layer, ['<', ['get', 'order'], upTo]);
      const fade = id === 'dijkstra' ? frame.explore?.fadeDijkstra : frame.explore?.fadeAstar;
      m.setPaintProperty(`explore-${id}`, 'line-opacity', fade ? 0.13 : 0.85);
      m.setPaintProperty(`explore-${id}-glow`, 'line-opacity', fade ? 0 : 0.18);
    }
    m.setLayoutProperty('oneway-arrows', 'visibility', frame.oneway ? 'visible' : 'none');
  }, [frame, mapReady]);

  // Static layers: explored edges of the search demo and one-way streets.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    for (const id of ['dijkstra', 'astar'] as const)
      void (m.getSource(`explore-${id}`) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: scenario.explored?.[id] || [],
      } as never);
  }, [scenario, mapReady]);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !graph) return;
    void (m.getSource('oneway') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: onewayFeatures(graph),
    } as never);
  }, [graph, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    const narrow = (container.current?.clientWidth || 800) < 640;
    m.fitBounds(scenario.bounds, {
      padding: narrow ? 40 : { top: 70, bottom: 150, left: 60, right: 60 },
      duration: 900,
      maxZoom: 16,
    });
  }, [scenario, mapReady, full]);
  // Scenario-driven close-ups (e.g. to read one-way arrows), then back.
  const focusKey = frame.focus ? JSON.stringify(frame.focus) : '';
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    m.fitBounds(frame.focus || scenario.bounds, { padding: { top: 70, bottom: 150, left: 60, right: 60 }, duration: 1200, maxZoom: 16.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, mapReady]);

  // Census blocks for the coverage demo, only near the corridor.
  useEffect(() => {
    if (scenario.id !== 'cobertura' || manzanas) return;
    const abort = new AbortController();
    fetch('/data/manzanas-puntos.geojson', { signal: abort.signal })
      .then((r) => r.json() as Promise<{ features: { geometry: { coordinates: Coord }; properties: { p: number } }[] }>)
      .then((data) =>
        setManzanas(
          data.features
            .filter((f) => corridor.outbound.some((s) => meters(s, f.geometry.coordinates) <= 650))
            .map((f) => ({ at: f.geometry.coordinates, people: Number(f.properties.p) || 0 })),
        ),
      )
      .catch(() => {});
    return () => abort.abort();
  }, [scenario.id, manzanas, corridor]);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    if (container.current) container.current.style.cursor = pick ? 'crosshair' : '';
  }, [pick]);
  const go = (next: number) => {
    if (exportState !== 'idle') return;
    setIndex((next + SCENARIOS.length) % SCENARIOS.length);
    setT(0);
    setPlaying(true);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exportState !== 'idle') {
        if (e.key === 'Escape') cancelExport();
        return;
      }
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        if (t >= scenario.duration) setT(0);
        setPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'f') toggleFull();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const Icon = ICONS[scenario.id as keyof typeof ICONS] || CircleDot;
  return (
    <div className="demos" ref={root} data-full={full} data-recording={exportState !== 'idle'}>
      <aside className="demos-side">
        <header className="demos-head">
          <div className="demos-head-top">
            <span>Demostraciones para la exposición</span>
            {showThemeToggle && (
              <button
                type="button"
                className="demos-theme-toggle"
                aria-label={theme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
                disabled={exportState !== 'idle'}
                onClick={() => setPreference(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                <span>{theme === 'light' ? 'Oscuro' : 'Claro'}</span>
              </button>
            )}
          </div>
          <h1>Puriy en acción</h1>
        </header>
        <div className="demos-export">
          <fieldset className="demos-export-options" disabled={exportState !== 'idle'}>
            <legend>Descargar esta demo</legend>
            <label htmlFor="demo-video-clean" data-selected={videoVariant === 'clean'}>
              <input id="demo-video-clean" type="radio" name="demo-video-variant" value="clean" checked={videoVariant === 'clean'} onChange={() => setVideoVariant('clean')} />
              <span>Solo video<small>Animación sin panel de explicación.</small></span>
            </label>
            <label htmlFor="demo-video-explained" data-selected={videoVariant === 'explained'}>
              <input id="demo-video-explained" type="radio" name="demo-video-variant" value="explained" checked={videoVariant === 'explained'} onChange={() => setVideoVariant('explained')} />
              <span>Con explicación<small>Incluye el propósito y el texto de cada paso.</small></span>
            </label>
          </fieldset>
          <button
            type="button"
            onClick={exportState === 'recording' ? cancelExport : startExport}
            disabled={(!mapReady && scenario.stage !== 'lab') || exportState === 'saving'}
            aria-label={exportState === 'recording' ? 'Cancelar grabación' : `Descargar ${scenario.title}: ${videoVariant === 'clean' ? 'solo video' : 'con explicación'}`}
          >
            {exportState === 'recording' ? <X size={17} /> : <Download size={17} />}
            <span>{exportState === 'recording' ? 'Cancelar grabación' : exportState === 'saving' ? 'Preparando video…' : 'Descargar video'}</span>
          </button>
          {exportState === 'recording' ? (
            <output className="demos-export-progress">
              <span>Grabando {Math.min(Math.floor(t), scenario.duration)} de {scenario.duration} s · la descarga comenzará al terminar.</span>
              <progress max={scenario.duration} value={Math.min(t, scenario.duration)} />
            </output>
          ) : <p>Se guardará en MP4 o WebM, según lo permita tu navegador, a la velocidad elegida abajo ({num(speed, speed % 1 ? 1 : 0)}×; toca el botón de velocidad para 2× o 4×). Sin audio.</p>}
          {exportError && <p className="demos-export-error" role="alert">{exportError}</p>}
        </div>
        <nav className="demos-list" aria-label="Demostraciones">
          {SCENARIOS.map((s, i) => {
            const I = ICONS[s.id as keyof typeof ICONS] || CircleDot;
            return (
              <button
                key={s.id}
                type="button"
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
                disabled={exportState !== 'idle'}
              >
                <span className="demos-num">{i + 1}</span>
                <I size={16} />
                <span>
                  <strong>{s.title}</strong>
                  <small>{s.slide}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <section className="demos-detail" aria-live="polite" inert={exportState !== 'idle'}>
          <div className="demos-detail-title">
            <Icon size={18} />
            <h2>{scenario.title}</h2>
          </div>
          <Hud
            id={scenario.id}
            code={corridor.code}
            hud={frame.hud}
            headway={headway}
            kmh={kmh}
            onHeadway={setHeadway}
            onKmh={setKmh}
            ctl={{
              day, hour, severity, pick, algoWeight, demand, labDemand, labPriority,
              setLabDemand: (v) => { setLabDemand(v); setT(0); setPlaying(true); },
              setLabPriority: (v) => { setLabPriority(v); setT(0); setPlaying(true); },
              // New demand: jump to the optimized plan, the part that changes.
              setDemand: (v) => { setDemand(v); setT(40); setPlaying(true); },
              setAlgoWeight: (v) => { setAlgoWeight(v); setT(0); setPlaying(true); },
              setDay: (v) => { setDay(v); setT(0); setPlaying(true); },
              setHour: (v) => { setHour(v); setT(0); setPlaying(true); },
              setSeverity: (v) => { setSeverity(v); setT(0); setPlaying(true); },
              setPick,
              reset: () => {
                if (scenario.id === 'viaje') setTripPoints(DEFAULT_TRIP);
                else setAlgoPoints(DEFAULT_ALGO);
                setT(0);
                setPlaying(true);
              },
            }}
          />
        </section>
        <section className="demos-upcoming" aria-label="Próximas demos">
          <div className="demos-detail-title"><Sparkles size={16} /><h2>Próximas demos</h2></div>
          <ul>
            {UPCOMING.map(([title, text]) => (
              <li key={title}><strong>{title}</strong><span>{text}</span></li>
            ))}
          </ul>
        </section>
        <p className="demos-note">
          {corridor.source} ({corridor.code}); vuelta {corridor.inboundSource === 'editor' ? 'dibujada en el editor' : 'estimada'}.
          Red vial y sentidos: OpenStreetMap{graphError ? ' (no se pudo cargar: sin caminatas por calles ni algoritmos)' : graph ? '' : ' (cargando…)'}.
          Tiempos, GPS y tráfico son simulados para explicar el método; no son mediciones de Juliaca.
        </p>
      </aside>
      <div className="demos-stage">
        <div ref={container} className="demos-map" style={{ position: 'absolute', inset: 0 }} />
        {scenario.stage === 'lab' && <AdaptiveStage hud={frame.hud} dark={theme === 'dark'} onSeek={(v) => { setT(v); setPlaying(true); }} />}
        <div className="demos-badge">SIMULACIÓN · {corridor.code}</div>
        {'clock' in frame.hud && <div className="demos-clock"><Clock size={14} />{String(frame.hud.clock)}</div>}
        {pick && <div className="demos-pick">Haz clic en el mapa para colocar el {pick === 'from' ? 'origen' : 'destino'}</div>}
        <div className="demos-caption" key={frame.caption}>{frame.caption}</div>
        <div className="demos-controls" role="group" aria-label="Controles de la demostración">
          <button type="button" aria-label="Demostración anterior" disabled={exportState !== 'idle'} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button>
          <button
            type="button"
            className="demos-play"
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            disabled={exportState !== 'idle'}
            onClick={() => {
              if (t >= scenario.duration) setT(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" aria-label="Reiniciar" disabled={exportState !== 'idle'} onClick={() => { setT(0); setPlaying(true); }}><RotateCcw size={16} /></button>
          <input
            type="range"
            min={0}
            max={scenario.duration}
            step={0.1}
            value={t}
            aria-label="Momento de la demostración"
            disabled={exportState !== 'idle'}
            onChange={(e) => { setT(Number(e.target.value)); setPlaying(false); }}
          />
          <button type="button" className="demos-speed" aria-label="Velocidad" disabled={exportState !== 'idle'} onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 0.5 : 1)}>{speed}×</button>
          <button type="button" aria-label="Demostración siguiente" disabled={exportState !== 'idle'} onClick={() => go(index + 1)}><ChevronRight size={18} /></button>
          <button type="button" aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'} disabled={exportState !== 'idle'} onClick={toggleFull}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        </div>
      </div>
    </div>
  );
}

const num = (v: unknown, d = 0) =>
  Number(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });

function Hud({
  id,
  code,
  hud,
  headway,
  kmh,
  onHeadway,
  onKmh,
  ctl,
}: {
  id: string;
  code: string;
  hud: Record<string, unknown>;
  headway: number;
  kmh: number;
  onHeadway: (v: number) => void;
  onKmh: (v: number) => void;
  ctl: {
    day: number;
    hour: number;
    severity: number;
    pick: 'from' | 'to' | null;
    algoWeight: 'time' | 'distance';
    demand: number;
    setDemand: (v: number) => void;
    labDemand: LabDemand;
    labPriority: boolean;
    setLabDemand: (v: LabDemand) => void;
    setLabPriority: (v: boolean) => void;
    setAlgoWeight: (v: 'time' | 'distance') => void;
    setDay: (v: number) => void;
    setHour: (v: number) => void;
    setSeverity: (v: number) => void;
    setPick: (v: 'from' | 'to' | null) => void;
    reset: () => void;
  };
}) {
  const points = (
    <>
      <div className="hud-points">
        <button type="button" aria-pressed={ctl.pick === 'from'} onClick={() => ctl.setPick(ctl.pick === 'from' ? null : 'from')}>
          <i style={{ background: '#2f9e6b' }} />
          <span><small>Origen</small>{String(hud.from)}</span>
        </button>
        <button type="button" aria-pressed={ctl.pick === 'to'} onClick={() => ctl.setPick(ctl.pick === 'to' ? null : 'to')}>
          <i style={{ background: id === 'viaje' ? '#c4622d' : '#c9423d' }} />
          <span><small>Destino</small>{String(hud.to)}</span>
        </button>
        <button type="button" className="text-button" onClick={ctl.reset}>Restablecer</button>
      </div>
      <p className="hud-text">Pulsa Origen o Destino y haz clic en el mapa: se recalcula al instante.</p>
    </>
  );
  if (id === 'viaje') {
    const segments = hud.segments as readonly (readonly [string, number, number])[];
    const total = Number(hud.total);
    const icons = [Footprints, Clock, BusFront, MapPin];
    if (hud.noTrip)
      return (
        <div className="hud">
          {points}
          <div className="hud-alert"><strong>Sin conexión con el {code}</strong>Ninguna esquina del recorrido queda a menos de 1,5 km a pie de ambos puntos en el sentido correcto.</div>
        </div>
      );
    return (
      <div className="hud">
        {points}
        <div className="hud-bar" aria-label="Tiempo total por etapa">
          {segments.map(([label, min, p], i) => (
            <span key={i} data-kind={label} style={{ flexGrow: min }}>
              <i style={{ width: `${p * 100}%` }} />
            </span>
          ))}
        </div>
        <ul className="hud-steps">
          {segments.map(([label, min, p], i) => {
            const I = icons[i];
            return (
              <li key={i} data-active={p > 0 && p < 1} data-done={p >= 1}>
                <I size={15} />
                <span>{label}</span>
                <strong>{min} min</strong>
              </li>
            );
          })}
        </ul>
        <div className="hud-kpis">
          <div><span>Tiempo total</span><strong>{total} min</strong></div>
          <div><span>Pasaje</span><strong>S/ {num(hud.fare, 2)}</strong></div>
          <div><span>A bordo</span><strong>{num(hud.rideKm, 1)} km</strong></div>
        </div>
        <p className="hud-text">
          {hud.onStreets
            ? `El micro para en esquinas: se eligió la mejor entre ${num(hud.compared)} combinaciones de subida y bajada (${String(hud.dir)}), con Dijkstra peatonal desde el origen y el destino. Caminata total: ${num(hud.walkM)} m por calles.`
            : 'Cargando la red vial para trazar la caminata por calles…'}
        </p>
        {Boolean(hud.faster) && (
          <p className="hud-text">
            <b>Opción más rápida:</b> caminando {num((hud.faster as { walkMore: number }).walkMore)} m más ahorras {String((hud.faster as { save: number }).save)} min (el recorrido da un rodeo). Puriy prioriza caminar menos, como OpenTripPlanner.
          </p>
        )}
      </div>
    );
  }
  if (id === 'algoritmo') {
    const dj = hud.dj as { settled: number; shown: number; ms: number; streets: number };
    const as = hud.as as { settled: number; shown: number; ms: number; streets: number };
    const stage = String(hud.phase);
    return (
      <div className="hud">
        {points}
        <div className="hud-seg" role="group" aria-label="Qué optimiza el algoritmo">
          <button type="button" aria-pressed={ctl.algoWeight === 'time'} onClick={() => ctl.setAlgoWeight('time')}>Menor tiempo</button>
          <button type="button" aria-pressed={ctl.algoWeight === 'distance'} onClick={() => ctl.setAlgoWeight('distance')}>Menor distancia</button>
        </div>
        <p className="hud-text">
          {ctl.algoWeight === 'time'
            ? 'Cada tramo pesa su tiempo: distancia ÷ velocidad típica de la vía (avenida 35–40 km/h, jirón 20–25). Prefiere avenidas aunque sean algo más largas.'
            : 'Cada tramo pesa sus metros: la ruta más corta que respeta los sentidos, aunque vaya por calles lentas.'}{' '}
          Sale por {String(hud.startStreet)} y llega por {String(hud.endStreet)}: el algoritmo prueba todas las calles de acceso a menos de 90 m del lugar.
        </p>
        {!hud.found && <div className="hud-alert"><strong>Sin ruta</strong>No hay conexión respetando los sentidos entre esos puntos. Muévelos a otra calle.</div>}
        <div className="hud-algos">
          <div data-active={stage === 'dijkstra'}>
            <span><i style={{ background: SEARCH.dijkstra }} />Dijkstra</span>
            <strong>{num(dj.shown)}</strong>
            <small>intersecciones · {num(dj.ms, 1)} ms</small>
          </div>
          <div data-active={stage === 'astar'}>
            <span><i style={{ background: SEARCH.astar }} />A*</span>
            <strong>{num(as.shown)}</strong>
            <small>intersecciones · {num(as.ms, 1)} ms</small>
          </div>
        </div>
        <div className="hud-legend">
          <span><i style={{ background: SEARCH.dijkstra }} />Revisado por Dijkstra</span>
          <span><i style={{ background: SEARCH.astar }} />Revisado por A*</span>
          <span><i style={{ background: SEARCH.path }} />Ruta elegida</span>
        </div>
        <p className="hud-text">Ambos solo recorren cada calle en su sentido permitido (flechas) y usan el mismo peso de tiempo que el resto de Puriy: editor, caminatas, tráfico y desvíos.</p>
        <div className="hud-kpis">
          <div><span>Ruta legal</span><strong>{num(Number(hud.legalM) / 1000, 1)} km</strong></div>
          <div><span>Tiempo</span><strong>{num(hud.legalMin, 0)} min</strong></div>
          <div><span>En contra</span><strong data-bad>{stage === 'oneway' || stage === 'eleccion' ? `${num(Number(hud.illegalM) / 1000, 1)} km` : '—'}</strong></div>
        </div>
        {stage === 'dijkstra' && (
          <ol className="hud-steps-text">
            <li>Parte del origen con costo 0; todo lo demás, infinito.</li>
            <li>Toma la intersección pendiente más cercana en tiempo y la da por resuelta.</li>
            <li>Revisa cada calle que sale de ella: si llegar por ahí es más rápido, actualiza el vecino.</li>
            <li>Repite hasta resolver el destino. Garantiza la ruta óptima.</li>
          </ol>
        )}
        {stage === 'astar' && (
          <ol className="hud-steps-text">
            <li>Igual que Dijkstra, pero ordena por <b>costo recorrido + estimación restante</b>.</li>
            <li>La estimación es la línea recta al destino a la velocidad máxima: nunca exagera, por eso el resultado sigue siendo óptimo.</li>
            <li>Revisó {num(as.streets)} tramos frente a {num(dj.streets)} de Dijkstra.</li>
          </ol>
        )}
        {stage === 'oneway' && (
          <p className="hud-text">
            {(hud.wrongWay as string[]).length > 0
              ? `La ruta roja entra en contra por ${(hud.wrongWay as string[]).join(', ')}. Un micro no puede tomarla; Puriy solo recorre cada calle en su sentido.`
              : 'Puriy solo recorre cada calle en su sentido de circulación.'}
          </p>
        )}
        {stage === 'eleccion' && (
          <ul className="hud-checklist">
            <li><b>Calles de Juliaca (13 mil intersecciones):</b> A* con montículo binario, 1–3 ms. Es lo que usa Puriy en el editor, caminatas, desvíos y tráfico.</li>
            <li><b>Región o país (millones):</b> Contraction Hierarchies (OSRM, GraphHopper) precalcula atajos; aquí no hace falta.</li>
            <li><b>Viaje en micro con transbordos y horarios:</b> RAPTOR, el de OpenTripPlanner, sobre el GTFS cuando esté validado.</li>
            <li><b>Algoritmos nuevos (C-HD, 2025–26):</b> mejora teórica con constantes enormes; sin ventaja práctica en una ciudad.</li>
          </ul>
        )}
      </div>
    );
  }
  if (id === 'ruta')
    return (
      <div className="hud">
        <div className="hud-kpis">
          <div><span>Ida</span><strong>{num(hud.outKm, 1)} km</strong></div>
          <div><span>Vuelta</span><strong>{num(hud.inKm, 1)} km</strong></div>
          <div><span>Abordajes</span><strong>{String(hud.stops)}</strong></div>
        </div>
        <p className="hud-text">
          {hud.inboundSource === 'editor'
            ? 'Vuelta tomada del recorrido dibujado en el editor.'
            : `Vuelta estimada. Dibuja la vuelta del ${code} en Editor y frecuencias y publícala: esta demo la usará.`}
        </p>
        <p className="hud-label">Calles de la ida</p>
        <ol className="hud-list">{(hud.streets as string[]).map((s) => <li key={s}>{s}</li>)}</ol>
        {(hud.landmarks as string[]).length > 0 && (
          <>
            <p className="hud-label">Destinos junto al corredor</p>
            <ul className="hud-list">{(hud.landmarks as string[]).map((s) => <li key={s}>{s}</li>)}</ul>
          </>
        )}
      </div>
    );
  if (id === 'gps') {
    const rows = hud.rows as { id: string; age: number; state: string }[];
    return (
      <div className="hud">
        <table className="hud-table">
          <thead><tr><th>Unidad</th><th>Último dato</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-state={r.state}>
                <td>{r.id}</td>
                <td>hace {r.age} s</td>
                <td><span className="hud-state">{r.state}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {Boolean(hud.bunched) && (
          <div className="hud-alert">
            <strong>Micros agrupados</strong>
            {(hud.pair as string[])[0]} va a {num(hud.gapMin, 1)} min de {(hud.pair as string[])[1]}; el intervalo previsto es {num(hud.headway, 0)} min.
          </div>
        )}
      </div>
    );
  }
  if (id === 'trafico') {
    const heat = hud.heat as number[][];
    const alt = hud.alt as { minutes: number; streets: string[]; extraM: number; saving: number; kmh: number; school: boolean; top: number } | null;
    const good = !!alt && alt.saving >= 0.5;
    return (
      <div className="hud">
        <div className="hud-days" role="group" aria-label="Día">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" aria-pressed={ctl.day === i} title={DAYS[i]} onClick={() => ctl.setDay(i)}>{d}</button>
          ))}
        </div>
        <label className="hud-slider">
          <span>{DAYS[ctl.day]} · <strong>{String(ctl.hour).padStart(2, '0')}:00</strong></span>
          <input type="range" min={5} max={23} value={ctl.hour} onChange={(e) => ctl.setHour(Number(e.target.value))} />
        </label>
        <div className="hud-heat" aria-label="Velocidad habitual junto al mercado por día y hora">
          {heat.map((row, d) => (
            <div key={d}>
              <span>{DAY_SHORT[d]}</span>
              {row.map((r, h) => (
                <i
                  key={h}
                  data-level={level(r)}
                  data-on={d === ctl.day && HOURS[h] === ctl.hour}
                  title={`${DAYS[d]} ${HOURS[h]}:00 · ${Math.round(r * 100)} % de la velocidad libre`}
                  onClick={() => { ctl.setDay(d); ctl.setHour(HOURS[h]); }}
                />
              ))}
            </div>
          ))}
          <div className="hud-heat-axis"><span />{HOURS.filter((h) => h % 3 === 0).map((h) => <small key={h}>{h}</small>)}</div>
        </div>
        <p className="hud-text">Velocidad habitual del tramo junto al mercado (100 m), por día y hora. Toca una celda para simular ese momento.</p>
        <div className="hud-seg" role="group" aria-label="Intensidad del incidente de hoy">
          {([[0.45, 'Moderado'], [0.65, 'Fuerte'], [0.8, 'Casi detenido']] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={ctl.severity === v} onClick={() => ctl.setSeverity(v)}>{l}</button>
          ))}
        </div>
        <div className="hud-speed">
          <div><span>Habitual</span><strong>{String(hud.usual)} km/h</strong></div>
          <div><span>Hoy</span><strong data-bad={Number(hud.ratio) < 60}>{String(hud.recent)} km/h</strong></div>
          <div><span>Respecto a lo habitual</span><strong data-bad={Number(hud.ratio) < 60}>{String(hud.ratio)} %</strong></div>
        </div>
        {(hud.affected as string[]).length > 0 && (
          <p className="hud-text"><b>Zona:</b> {(hud.affected as string[]).join(' · ')}. Mercados y comercio concentran carga, descarga y peatones.</p>
        )}
        <p className="hud-text">{String(hud.confirmed)} de 3 unidades confirmaron el tramo lento.</p>
        {Boolean(hud.altShown) && (
          <div className="hud-compare3">
            <div><span>Normal a esta hora</span><strong>{num(hud.usualMin, 1)} min</strong></div>
            <div data-bad><span>Hoy por el corredor</span><strong>{num(hud.corridorMin, 1)} min</strong></div>
            <div data-good={good} data-worse={!!alt && !good}><span>Alternativa</span><strong>{alt ? `${num(alt.minutes, 1)} min` : '—'}</strong></div>
            <p className="hud-text">
              {!alt
                ? 'No hay alternativa a menos de 220 m que respete los sentidos.'
                : good
                  ? `Ahorra ${num(alt.saving, 1)} min por ${alt.streets.join(', ')} (${num(Math.max(0, alt.extraM))} m más). En la alternativa el micro no para y va a ${num(alt.kmh)} km/h de media, sin superar ${alt.school ? '30 km/h en zona escolar ni ' : ''}${alt.top} km/h.`
                  : `No conviene: las calles cercanas (${alt.streets.slice(0, 3).join(', ')}) son más lentas y más largas; tardaría ${num(-alt.saving, 1)} min más. Puriy no la propone.`}
            </p>
          </div>
        )}
        <div className="hud-legend">
          <span><i style={{ background: TRAFFIC.ok }} />Fluido</span>
          <span><i style={{ background: TRAFFIC.slow }} />Lento</span>
          <span><i style={{ background: TRAFFIC.jam }} />Muy lento</span>
        </div>
      </div>
    );
  }
  if (id === 'semaforos') {
    type Row = { mode: string; cycle: number; pi: number; delay: number; micro: number; microStops: number };
    type SiteRow = { name: string; oneway: boolean; natural: number | null; green: number; yellow: number; allRed: number; crossGreen: number; offset: number; xMain: number; xCross: number; blocked: boolean };
    const PLAN = { actual: 'Hoy (supuesto)', onda: 'Onda verde simple', optimo: 'Optimizado' } as Record<string, string>;
    const rows = hud.rows as Row[];
    const sites = hud.sites as SiteRow[];
    const scan = hud.scan as { cycle: number; pi: number | null; over: boolean }[];
    const maxPi = Math.max(1, ...scan.map((c) => c.pi ?? 0));
    const optimo = hud.mode === 'optimo';
    return (
      <div className="hud">
        <div className="hud-seg" role="group" aria-label="Demanda analizada">
          {([[1, 'Demanda actual'], [1.2, '+20 %'], [1.4, '+40 %']] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={ctl.demand === v} onClick={() => ctl.setDemand(v)}>{l}</button>
          ))}
        </div>
        <p className="hud-text">Análisis a futuro: multiplica los aforos supuestos y vuelve a calcular el plan óptimo.</p>
        <table className="hud-table">
          <thead><tr><th>Plan</th><th>Ciclo</th><th>Demora</th><th>PI</th><th>Micro</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mode} data-on={r.mode === hud.mode}>
                <td>{PLAN[r.mode]}</td>
                <td>{r.cycle} s</td>
                <td>{num(r.delay, 1)} s</td>
                <td>{num(r.pi, 1)}</td>
                <td>{r.micro} s</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hud-text">
          Demora media por vehículo de toda la red ({hud.twoWay ? 'ambos sentidos' : 'calle principal'} y transversales). PI en veh·h por hora: el menor gana. Micro: viaje de 1,3 km a 25 km/h, con {rows.map((r) => r.microStops).join(', ')} paradas en rojo; no cuenta paraderos.
        </p>
        <div className="hud-kpis">
          <div><span>Detenciones</span><strong>{String(hud.stops)}</strong></div>
          <div><span>Parado</span><strong>{String(hud.stopped)} s</strong></div>
          <div><span>Tiempo</span><strong>{String(hud.elapsed)} s</strong></div>
        </div>
        {optimo && scan.length > 0 && (
          <>
            <p className="hud-label">Barrido de ciclos · índice de desempeño</p>
            <div className="hud-scan" role="img" aria-label={`El menor índice se obtiene con un ciclo de ${String(hud.chosen)} s`}>
              {scan.map((c) => (
                <span
                  key={c.cycle}
                  data-on={c.cycle === hud.chosen}
                  data-over={c.over}
                  style={{ height: c.pi === null ? '4%' : `${(c.pi / maxPi) * 100}%` }}
                  title={c.pi === null ? `${c.cycle} s: no caben los verdes mínimos` : `${c.cycle} s: PI ${num(c.pi, 1)}${c.over ? ', algún movimiento supera su capacidad' : ''}`}
                />
              ))}
            </div>
            <div className="hud-scan-axis"><small>{scan[0].cycle} s</small><small>Elegido: {String(hud.chosen)} s</small><small>{scan[scan.length - 1].cycle} s</small></div>
          </>
        )}
        <p className="hud-label">Plan por cruce · {PLAN[String(hud.mode)]}</p>
        <table className="hud-table">
          <thead><tr><th>Cruce</th><th>Verde</th><th>Desfase</th><th>v/c</th></tr></thead>
          <tbody>
            {sites.map((s, i) => {
              const x = Math.max(s.xMain, s.xCross);
              return (
                <tr key={i}>
                  <td>S{i + 1} · {s.name.replace(/^Jirón /, 'Jr. ').replace(/^Avenida /, 'Av. ')}</td>
                  <td>{s.green}/{s.crossGreen} s</td>
                  <td>{s.offset} s</td>
                  <td data-bad={x > 0.9 || s.blocked}>{num(x, 2)}{s.blocked ? ' · cola' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hud-label">Ciclo de cada semáforo · calle principal</p>
        <div className="hud-rings" aria-label="Verde, ámbar y rojo de la calle principal en un ciclo, desde el reloj maestro">
          {sites.map((s, i) => {
            const C = Number(hud.cycle);
            // Main-street head: green, amber, then red (all-red and the cross
            // street's split), starting at the offset and wrapping at C.
            const parts: [string, number, number][] = [
              ['green', 0, s.green],
              ['amber', s.green, s.green + s.yellow],
              ['red', s.green + s.yellow, C],
            ];
            const spans = parts.flatMap(([kind, a, b]) => {
              const from = (a + s.offset) % C,
                to = from + (b - a);
              return to <= C ? [[kind, from, to]] : [[kind, from, C], [kind, 0, to - C]];
            }) as [string, number, number][];
            return (
              <div key={i}>
                <span>S{i + 1}</span>
                <div>
                  {spans.map(([kind, a, b], k) => (
                    <i key={k} data-kind={kind} style={{ left: `${(a / C) * 100}%`, width: `${((b - a) / C) * 100}%` }} />
                  ))}
                  <b style={{ left: `${((((Number(hud.now) % C) + C) % C) / C) * 100}%` }} />
                </div>
              </div>
            );
          })}
          <div className="hud-scan-axis"><small>0 s</small><small>Desfase = dónde empieza el verde</small><small>{String(hud.cycle)} s</small></div>
        </div>
        <p className="hud-text">
          {!hud.twoWay && 'La calle principal es de un sentido en OpenStreetMap: solo se evalúa la ida. '}
          Verde de la calle principal / transversal; amarillo {sites[0]?.yellow} s y todo rojo {sites[0]?.allRed} s por fórmula cinemática.
          {sites.some((s) => s.natural !== null) && ` Ciclo natural por cruce (v/c ≤ 0,90): ${sites.map((s) => (s.natural === null ? 'saturado' : `${s.natural} s`)).join(', ')}.`}
        </p>
        {optimo && (
          <ol className="hud-steps-text">
            <li><b>Saturación:</b> s = 1900 × carriles × ancho × pesados × pendiente × estacionamiento × micros que paran × zona × giros (HCM); y = volumen ÷ PHF 0,90 ÷ s.</li>
            <li><b>Reparto:</b> g = (C − L) × y ÷ Σy, sin bajar del verde peatonal (7 s + cruce ÷ 1,0 m/s); luego ajuste de a 1 s sin pasar ninguna calle de v/c 0,90.</li>
            <li><b>Ciclo:</b> barrido de 50 a 120 s cada 5 s; todos los cruces comparten el ciclo para no romper la progresión. Un ciclo con algún movimiento sobre su capacidad (barra rayada) no se elige si hay otro que lo evita; si varios quedan a menos de 3 % del mejor índice, gana el más corto.</li>
            <li><b>Desfases:</b> el pelotón sale de un cruce, se dispersa por la cuadra (Robertson) y llega al siguiente; se prueba cada segundo{hud.twoWay ? ', en ida y vuelta' : ''}.</li>
            <li><b>Índice:</b> PI = (demora + 10 s × detenciones) ÷ 3600 + castigo por cola que no cabe en la cuadra.</li>
          </ol>
        )}
        <p className="hud-text">
          Aforos, anchos y planes son supuestos para explicar el método, no mediciones de Juliaca. No modela giros protegidos (doble anillo), adelanto o retraso de giros ni medio ciclo. A futuro: aforos reales por movimiento y prioridad por pasajeros, no solo por vehículos.
        </p>
      </div>
    );
  }
  if (id === 'adaptativo') {
    const j = hud.jev as LabSnapshot,
      a = hud.adaptive as LabSnapshot,
      f = hud.fixed as LabSnapshot;
    const q = j.lastQuery;
    const rows: [string, (m: LabSnapshot['metrics']) => string][] = [
      ['Espera media por vehículo', (m) => `${num(m.avgWait, 1)} s`],
      ['Espera media por pasajero', (m) => `${num(m.personWait, 1)} s`],
      ['Peor espera', (m) => `${num(m.worstWait, 0)} s`],
      ['Salida por minuto', (m) => num(m.perMin, 0)],
      ['Vehículos que salieron', (m) => num(m.cleared)],
      ['En cola ahora', (m) => num(m.queue)],
      ['Cambios por verde máximo', (m) => num(m.forced)],
      ['Decisiones que tomó la regla', (m) => (m.queries ? `${num(m.fallbacks)} de ${num(m.queries)}` : '—')],
    ];
    return (
      <div className="hud">
        <div className="hud-seg" role="group" aria-label="Demanda simulada">
          {([['normal', 'Normal'], ['punta', 'Hora punta'], ['oleada', 'Salida de colegio']] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={ctl.labDemand === v} onClick={() => ctl.setLabDemand(v)}>{l}</button>
          ))}
        </div>
        <div className="hud-seg" role="group" aria-label="Qué cuentan los controles adaptativos">
          <button type="button" aria-pressed={!ctl.labPriority} onClick={() => ctl.setLabPriority(false)}>Cada vehículo igual</button>
          <button type="button" aria-pressed={ctl.labPriority} onClick={() => ctl.setLabPriority(true)}>Prioridad por pasajeros</button>
        </div>
        <table className="hud-table">
          <thead><tr><th>Indicador</th><th>Con Jev</th><th>Sin Jev</th><th>Fijo</th></tr></thead>
          <tbody>
            {rows.map(([label, fmt]) => (
              <tr key={label}><td>{label}</td><td>{fmt(j.metrics)}</td><td>{fmt(a.metrics)}</td><td>{fmt(f.metrics)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="hud-label">Última consulta a Jev (simulada)</p>
        {q ? (
          <div className="lab-query">
            <span>Estado enviado · cruce {q.node}, {q.t} s</span>
            <pre>{JSON.stringify(q.state, null, 1)}</pre>
            <span>Pregunta: {q.question.type} entre {q.question.options.join(' / ')}</span>
            <strong data-fallback={q.fallback}>
              Respuesta: {q.answer} · {num(q.probability * 100, 0)} %{q.fallback ? ' · confianza baja, decide la regla' : ''}
            </strong>
          </div>
        ) : (
          <p className="hud-text">Jev responde cuando se cumple el verde mínimo.</p>
        )}
        <p className="hud-label">Decisiones con Jev</p>
        <ol className="lab-log" aria-live="off">
          {j.log.slice(0, 6).map((e, i) => (
            <li key={`${e.t}-${e.node}-${i}`} data-forced={e.forced} data-fallback={e.fallback}><time>{e.t} s</time><b>{e.node}</b>{e.text}</li>
          ))}
        </ol>
        <p className="hud-label">Decisiones sin Jev (reglas)</p>
        <ol className="lab-log" aria-live="off">
          {a.log.slice(0, 4).map((e, i) => (
            <li key={`${e.t}-${e.node}-${i}`} data-forced={e.forced}><time>{e.t} s</time><b>{e.node}</b>{e.text}</li>
          ))}
        </ol>
        <p className="hud-text">
          <b>Qué cambia con Jev:</b> la regla es una fórmula fija; Jev recibe el estado completo (detenidos, pasajeros, espera más larga, quién llega en 10 s, si la cuadra de salida está llena) y responde una opción con su probabilidad en 70–500 ms. Si la probabilidad baja de {num(JEV_MIN_CONFIDENCE * 100, 0)} %, decide la regla. En esta simulación la política que responde es local: a veces gana la regla y a veces no. En un experimento público, Jev real quedó apenas por delante de una regla de presión máxima (24,2 s frente a 25,1 s de espera media).
        </p>
        <p className="hud-text">
          <b>Por qué no un chat:</b> un modelo de lenguaje general (ChatGPT, Claude u otro) redacta su respuesta en texto y, con consultas grandes, tarda segundos; el semáforo necesita decidir cada segundo. Jev solo elige entre opciones y TypeSafe anuncia que es de 200 a 400 veces más rápido y barato. Es un dato del proveedor que Puriy no ha medido; los {LLM_LATENCY} s del paso 2 son ilustrativos.
        </p>
        <p className="hud-label">Capa de seguridad</p>
        <ul className="hud-steps-text">
          <li>Verde mínimo {SAFETY.minGreen} s, ámbar {SAFETY.amber} s y todo rojo {SAFETY.allRed} s en cada cambio; nunca dos verdes en conflicto.</li>
          <li>Verde máximo {SAFETY.maxGreen} s: ninguna calle espera sin límite.</li>
          <li>Si fallan los detectores, el cruce vuelve al plan fijo.</li>
        </ul>
        <p className="hud-text">
          <b>Cómo leer el dibujo:</b> autos, micros (blancos y largos, con franja del color de la ruta), mototaxis (toldo de color) y motos. Las luces de freno encendidas marcan a los detenidos. Personas por vehículo, ilustrativas: auto {num(KINDS.auto.people, 1)}, micro {KINDS.micro.people}, mototaxi {KINDS.mototaxi.people}, moto {num(KINDS.moto.people, 1)}.
        </p>
        <p className="hud-text">
          Cada vehículo acelera, sigue al de adelante (modelo IDM), frena ante el rojo y no entra al cruce si no cabe al otro lado. Solo movimientos de frente, un carril por sentido. Demanda, mezcla de vehículos y resultados son ilustrativos. Usar Jev real requiere clave de acceso de TypeSafe AI guardada en el servidor, detectores o cámaras en cada acceso, un controlador que acepte órdenes y validación municipal.
        </p>
      </div>
    );
  }
  if (id === 'flota') {
    const ex = hud.example as { running: number; cycle: number; vehicles: number };
    return (
      <div className="hud">
        <label className="hud-slider">
          <span>Intervalo entre micros <strong>{headway} min</strong></span>
          <input type="range" min={3} max={20} value={headway} onChange={(e) => onHeadway(Number(e.target.value))} />
        </label>
        <label className="hud-slider">
          <span>Velocidad comercial <strong>{kmh} km/h</strong></span>
          <input type="range" min={8} max={25} value={kmh} onChange={(e) => onKmh(Number(e.target.value))} />
        </label>
        <div className="hud-formula">
          <span>{num(hud.km, 1)} km ÷ {kmh} km/h = <b>{num(hud.running, 0)} min</b></span>
          <span>+ 10 min regulación = <b>{num(hud.cycle, 0)} min</b> de ciclo</span>
          <span>{num(hud.cycle, 0)} ÷ {headway} min, redondeado hacia arriba</span>
        </div>
        <div className="hud-big"><strong>{String(hud.vehicles)}</strong><span>micros necesarios</span></div>
        <p className="hud-text">
          Ejemplo de la propuesta: 13 km a 15 km/h = {num(ex.running, 0)} + 10 = {num(ex.cycle, 0)} min; cada 8 min exige {ex.vehicles} vehículos.
        </p>
      </div>
    );
  }
  if (id === 'cobertura') {
    const cats = hud.byCategory as Record<string, number>;
    return (
      <div className="hud">
        <div className="hud-kpis">
          <div><span>Radio</span><strong>{String(hud.radius)} m</strong></div>
          <div><span>Habitantes</span><strong>{hud.loading ? '…' : num(hud.people)}</strong></div>
          <div><span>Manzanas</span><strong>{hud.loading ? '…' : String(hud.blocks)}</strong></div>
        </div>
        {Object.keys(cats).length > 0 && (
          <ul className="hud-cats">
            {Object.entries(cats).map(([c, n]) => (
              <li key={c}><i style={{ background: CATEGORIES[c as DestinationCategory].color }} />{CATEGORIES[c as DestinationCategory].label}<strong>{n}</strong></li>
            ))}
          </ul>
        )}
        <p className="hud-text">Círculo en línea recta como aproximación; el piloto debe medir el camino peatonal real. Población: Censo 2017 (INEI).</p>
      </div>
    );
  }
  if (id === 'desvio')
    return (
      <div className="hud">
        <div className="hud-kpis">
          <div><span>Tramo cerrado</span><strong>{num(hud.closedM)} m</strong></div>
          <div><span>Desvío</span><strong>{hud.shown ? `${num(hud.detourM)} m` : '—'}</strong></div>
          <div><span>Diferencia</span><strong>{hud.shown ? `${Number(hud.extraMin) >= 0 ? '+' : '−'}${num(Math.abs(Number(hud.extraMin)), 1)} min` : '—'}</strong></div>
        </div>
        <p className="hud-text">{String(hud.stopsOff)} abordaje(s) sin servicio mientras dure la feria.</p>
        {Boolean(hud.shown) && (
          <>
            <p className="hud-text">
              Por el tramo abierto: {num(hud.openMin, 1)} min con paradas. Por el desvío: {num(hud.detourMin, 1)} min; más largo, pero sin paradas y a {num(hud.detourKmh)} km/h de media, dentro del límite (40 km/h en jirones, 30 en zona escolar).
            </p>
            <p className="hud-label">Calles del desvío</p>
            <ol className="hud-list">{(hud.streets as string[]).map((st) => <li key={st}>{st}</li>)}</ol>
          </>
        )}
      </div>
    );
  return null;
}
