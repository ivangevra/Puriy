'use client';
import { Fragment, useState, useEffect, useRef } from 'react';
import PlaceSearch from './PlaceSearch';
import Footprints from './WalkIcon';
import { journeySteps } from '../lib/walking-steps';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowLeft,
  BusFront,
  Clock,
  Heart,
  LocateFixed,
  MapPin,
  Search,
  Share2,
  ChevronRight,
  Info,
  Flag,
  Check,
  Coins,
} from 'lucide-react';
import {
  type Network,
  type Route,
  type Point,
  type Journey,
  stopById,
  money,
  routeKm,
  writeLocal,
} from '../lib/mobility';
import { getPlan, saveRecord } from '../lib/api';
type Props = {
  onManage?: () => void;
  onBrowseRoutes?: () => void;
  publicView?: boolean;
  mapDirection: 'both' | 'outbound' | 'inbound';
  onDirection: (d: 'both' | 'outbound' | 'inbound') => void;
  network: Network;
  planningNetwork?: Network;
  view: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  origin: Point | null;
  destination: Point | null;
  setOrigin: (p: Point | null) => void;
  setDestination: (p: Point | null) => void;
  originName: string;
  destinationName: string;
  setOriginName: (s: string) => void;
  setDestinationName: (s: string) => void;
  setPickMode: (s: string | null) => void;
  journey: Journey | null;
  setJourney: (j: Journey | null) => void;
  favorites: string[];
  setFavorites: (ids: string[]) => void;
  notify: (s: string) => void;
};
export function RouteBadge({ route }: { route: Route }) {
  const rgb = route.color
    .match(/[a-f0-9]{2}/gi)
    ?.map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    rgb?.length === 3 ? rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 : 0;
  return (
    <span
      className="route-badge"
      style={{
        background: route.color,
        color: luminance > 0.179 ? '#15191e' : '#ffffff',
      }}
    >
      <BusFront size={14} />
      {route.code}
    </span>
  );
}

function FavoriteButton({
  route,
  saved,
  onToggle,
  detail = false,
}: {
  route: Route;
  saved: boolean;
  onToggle: (route: Route) => boolean;
  detail?: boolean;
}) {
  const [celebrate, setCelebrate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className={detail ? 'icon-button favorite-detail' : 'save-route'}
      aria-label={saved ? `Quitar ${route.code} de guardadas` : `Guardar ${route.code}`}
      aria-pressed={saved}
      data-celebrate={celebrate ? 'true' : undefined}
      onClick={() => {
        const stored = onToggle(route);
        if (!saved && stored) {
          setCelebrate(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCelebrate(false), 550);
        }
      }}
    >
      <span className="t-icon-swap" data-state={saved ? 'b' : 'a'} aria-hidden="true">
        <span className="t-icon" data-icon="a"><Heart size={detail ? 20 : 17} /></span>
        <span className="t-icon" data-icon="b"><Heart size={detail ? 20 : 17} fill="currentColor" /></span>
      </span>
    </button>
  );
}

export default function Travel(p: Props) {
  const [options, setOptions] = useState<Journey[] | null>(null),
    [searching, setSearching] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [hour, setHour] = useState('10:00'),
    [preference, setPreference] = useState('nearest'),
    [report, setReport] = useState(false),
    [reportText, setReportText] = useState(''),
    [category, setCategory] = useState('route'),
    [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false),
    [gpsNote, setGpsNote] = useState('');
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current++;
    setOptions(null);
    setSearching(false);
    p.setJourney(null);
  }, [p.origin, p.destination, p.planningNetwork, preference, hour]);
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    [],
  );
  const direction = p.mapDirection === 'inbound' ? 1 : 0;
  const setDirection = (d: number) => p.onDirection(d ? 'inbound' : 'outbound');
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half');
  const [sheetDrag, setSheetDrag] = useState<number | null>(null);
  const sheetHeights = () => {
    const box =
      panelRef.current?.parentElement?.clientHeight ||
      (typeof innerHeight === 'number' ? innerHeight : 800);
    return {
      peek: 96,
      half: Math.round(box * 0.52),
      full: Math.round(box * 0.88),
    };
  };
  const snapSheet = (height: number) => {
    const limits = sheetHeights();
    setSheet(
      (['peek', 'half', 'full'] as const).reduce((best, key) =>
        Math.abs(limits[key] - height) < Math.abs(limits[best] - height)
          ? key
          : best,
      ),
    );
  };
  const cycleSheet = () =>
    setSheet((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const box = panelRef.current;
    if (!box) return;
    drag.current = { y: e.clientY, h: box.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const delta = drag.current.y - e.clientY;
    if (Math.abs(delta) > 6) drag.current.moved = true;
    const limits = sheetHeights();
    setSheetDrag(
      Math.min(limits.full, Math.max(limits.peek, drag.current.h + delta)),
    );
  };
  const endDrag = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved && sheetDrag !== null) {
      suppressClick.current = true;
      snapSheet(sheetDrag);
    }
    setSheetDrag(null);
  };
  useEffect(() => {
    if (p.journey || p.selected) setSheet((s) => (s === 'peek' ? 'half' : s));
  }, [p.journey, p.selected]);
  useEffect(() => {
    const panel = panelRef.current,
      layout = panel?.parentElement;
    if (!panel || !layout) return;
    const sync = () =>
      layout.style.setProperty(
        '--sheet-h',
        `${panel.getBoundingClientRect().height}px`,
      );
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      layout.style.removeProperty('--sheet-h');
    };
  }, []);
  const selected = p.network.routes.find((r) => r.id === p.selected);
  const favorite = (r: Route) => {
    const next = p.favorites.includes(r.id)
      ? p.favorites.filter((id) => id !== r.id)
      : [...p.favorites, r.id];
    try {
      writeLocal('juliaca-favorites', next);
      writeLocal(
        'juliaca-saved-routes',
        p.network.routes.filter((r) => next.includes(r.id)),
      );
      p.setFavorites(next);
      return true;
    } catch {
      p.notify('No se pudo guardar en este dispositivo.');
      return false;
    }
  };
  const selectPlace = (name: string, kind: 'origin' | 'destination') => {
    const stop = p.network.stops.find((s) => s.name === name);
    if (kind === 'origin') {
      p.setOriginName(name);
      p.setOrigin(stop || null);
    } else {
      p.setDestinationName(name);
      p.setDestination(stop || null);
    }
    setOptions(null);
    p.setJourney(null);
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setError(
        'Tu navegador no ofrece ubicación. Escribe el origen o márcalo en el mapa.',
      );
      return;
    }
    setLocating(true);
    setError('');
    setGpsNote('Buscando ubicación precisa…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        p.setOrigin({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          locatedAt: Date.now(),
        });
        p.setOriginName('Mi ubicación');
        setLocating(false);
        p.setJourney(null);
        setGpsNote(
          `Precisión aproximada: ±${Math.round(pos.coords.accuracy)} m.${pos.coords.accuracy > 100 ? ' Señal imprecisa: corrige el origen en el mapa si hace falta.' : ''}${pos.coords.latitude < -15.62 || pos.coords.latitude > -15.36 || pos.coords.longitude < -70.25 || pos.coords.longitude > -70.02 ? ' Estás fuera del área de Juliaca.' : ''}`,
        );
        setError('');
        setOptions(null);
      },
      (e) => {
        setLocating(false);
        setGpsNote('');
        setError(
          e.code === 1
            ? 'Permiso de ubicación denegado. Habilítalo en tu navegador o marca el origen en el mapa.'
            : e.code === 3
              ? 'La ubicación tardó demasiado. Reintenta con mejor señal o marca el origen.'
              : 'Ubicación no disponible. Marca el origen en el mapa.',
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  const search = async () => {
    if (!p.origin || !p.destination) {
      setError(
        'Selecciona un lugar de la lista o marca los puntos en el mapa.',
      );
      return;
    }
    const version = ++requestVersion.current;
    setOptions(null);
    p.setJourney(null);
    setError('');
    setSearching(true);
    p.onSelect(null);
    try {
      const result = await getPlan(
        p.planningNetwork || p.network,
        p.origin,
        p.destination,
        hour,
        preference,
        (partial) => {
          if (version !== requestVersion.current) return;
          setOptions(partial);
          p.setJourney(partial[0]);
          p.onSelect(partial[0].legs[0].route_id);
        },
      );
      if (version !== requestVersion.current) return;
      setOptions(result);
      p.setJourney(result[0] || null);
      if (result[0]) p.onSelect(result[0].legs[0].route_id);
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setSearching(false);
    }
  };
  const share = async () => {
    if (!selected && !p.journey) return;
    const text = p.journey
      ? `Itinerario ${p.journey.mode === 'demo' ? 'de demostración ' : ''}en Juliaca: ${p.journey.legs.map((l) => `${l.route_id}, de ${l.from.name} a ${l.to.name}`).join('; ')}. ${p.journey.minutes} min estimados.`
      : `${selected!.code} · ${selected!.name}${selected!.status === 'demo' ? ' · Demostración' : ''}`;
    const url = new URL(location.origin);
    url.searchParams.set('ruta', selected?.id || p.journey!.legs[0].route_id);
    try {
      if (navigator.share)
        await navigator.share({
          title: 'Juliaca se mueve',
          text,
          url: url.toString(),
        });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        p.notify('Enlace copiado. Tu ubicación no se incluye.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        p.notify('No se pudo compartir. Inténtalo otra vez.');
    }
  };
  const shown = p.network.routes.filter(
    (r) =>
      (p.view !== 'favorites' || p.favorites.includes(r.id)) &&
      `${r.code} ${r.name} ${r.stops.map((id) => stopById(p.network, id).name).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const frequent = ['aeropuerto', 'tupac', 'universidad'].filter((id) =>
    p.network.stops.some((s) => s.id === id),
  );
  const detail = selected && options === null;
  return (
    <aside
      className="travel-panel"
      ref={panelRef}
      data-sheet={sheet}
      data-dragging={sheetDrag !== null ? 'true' : undefined}
      style={sheetDrag !== null ? { height: sheetDrag } : undefined}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={
          sheet === 'peek'
            ? 'Mostrar opciones'
            : sheet === 'full'
              ? 'Ver el mapa'
              : 'Expandir opciones'
        }
        aria-expanded={sheet !== 'peek'}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          cycleSheet();
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <span className="sheet-label">
          {sheet === 'peek'
            ? 'Ver opciones'
            : sheet === 'full'
              ? 'Ver el mapa'
              : 'Opciones'}
        </span>
      </button>
      <div className="panel-content" key={detail ? selected.id : p.view}>
        {detail ? (
          <>
            <button
              className="back-button"
              onClick={() => {
                p.onSelect(null);
                setReport(false);
              }}
            >
              <ArrowLeft size={16} />
              Todas las rutas
            </button>
            <div className="detail-heading">
              <RouteBadge route={selected} />
              <FavoriteButton
                route={selected}
                saved={p.favorites.includes(selected.id)}
                onToggle={favorite}
                detail
              />
            </div>
            <h1 className="route-title">{selected.name}</h1>
            <p className="muted">{selected.operator}</p>
            <div className="detail-facts">
              <div>
                <Clock size={17} />
                <span>
                  Cada{' '}
                  <strong>
                    {selected.frequency[0]
                      ? `${selected.frequency.join('–')} min`
                      : 'Por verificar'}
                  </strong>
                </span>
              </div>
              <div>
                <Coins size={17} />
                <span>
                  Tarifa{' '}
                  <strong>
                    {selected.service?.fare !== undefined
                      ? money(selected.fare)
                      : 'Por verificar'}
                  </strong>
                </span>
              </div>
              <div>
                <BusFront size={17} />
                <span>
                  Servicio{' '}
                  <strong>
                    {selected.start && selected.end
                      ? `${selected.start}–${selected.end}`
                      : 'Por verificar'}
                  </strong>
                </span>
              </div>
              <div>
                <Footprints size={17} />
                <span>
                  Recorrido <strong>{routeKm(selected).toFixed(1)} km</strong>
                </span>
              </div>
            </div>
            <div className="data-note">
              <Info size={16} />
              <span>
                {selected.status === 'demo'
                  ? 'Datos de ejemplo. Recorrido, tarifa y frecuencia sin verificar.'
                  : 'Fuente: ' + selected.source}
                <small>
                  {selected.verified_at
                    ? `Verificado: ${selected.verified_at}`
                    : 'Pendiente de verificación en campo'}
                </small>
              </span>
            </div>
            <div className="section-heading">
              <h2>Puntos de {direction ? 'vuelta' : 'ida'}</h2>
              <span>
                {(direction ? selected.inbound : selected.stops).length} puntos
              </span>
            </div>
            <div className="segmented">
              <button
                className={p.mapDirection === 'both' ? 'active' : ''}
                onClick={() => p.onDirection('both')}
              >
                Ambos en mapa
              </button>
              <button
                className={p.mapDirection === 'outbound' ? 'active' : ''}
                onClick={() => setDirection(0)}
              >
                Ida
              </button>
              <button
                className={direction ? 'active' : ''}
                onClick={() => setDirection(1)}
              >
                Vuelta
              </button>
            </div>
            <div className="direction-summary">
              {(p.mapDirection === 'both' ? [0, 1] : [direction]).map((d) => {
                const ids = d ? selected.inbound : selected.stops;
                return (
                  <p key={d}>
                    <strong>{d ? 'Vuelta' : 'Ida'}</strong>
                    <span>
                      {ids.length
                        ? stopById(p.network, ids[0]).name
                        : 'Sin inicio'}{' '}
                      <ArrowRight size={12} />{' '}
                      {ids.length
                        ? stopById(p.network, ids.at(-1)!).name
                        : 'Sin final'}
                    </span>
                  </p>
                );
              })}
            </div>
            <ol className="stop-timeline">
              {(direction ? selected.inbound : selected.stops).map(
                (id, i, ids) => (
                  <li key={id}>
                    <i style={{ borderColor: selected.color }} />
                    <div>
                      <strong>{stopById(p.network, id).name}</strong>
                      <small>
                        {i === 0
                          ? 'Inicio del recorrido'
                          : i === ids.length - 1
                            ? 'Fin del recorrido'
                            : stopById(p.network, id).kind === 'official'
                              ? 'Paradero oficial'
                              : stopById(p.network, id).kind === 'demo'
                                ? 'Referencia de demostración'
                                : 'Punto habitual de abordaje'}
                      </small>
                    </div>
                  </li>
                ),
              )}
            </ol>
            <div className="detail-actions">
              <button className="secondary" onClick={share}>
                <Share2 size={16} />
                Compartir ruta
              </button>
              <button
                className="text-button"
                onClick={() => setReport(!report)}
              >
                <Flag size={16} />
                Reportar un cambio
              </button>
            </div>
            {report && (
              <form
                className="report-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    await saveRecord('reports', {
                      route_id: selected.id,
                      category,
                      description: reportText,
                    });
                    setReport(false);
                    setReportText('');
                    p.notify(
                      'Reporte registrado para revisión. No se publica automáticamente.',
                    );
                  } catch (e) {
                    p.notify((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <h3>Cuéntanos qué ocurrió</h3>
                <label>
                  Tipo de reporte
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="route">Cambio de recorrido</option>
                    <option value="fare">Tarifa</option>
                    <option value="incident">Incidente</option>
                    <option value="service">Problema de servicio</option>
                  </select>
                </label>
                <label>
                  Descripción
                  <textarea
                    minLength={10}
                    maxLength={2000}
                    required
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Describe el hecho sin incluir datos personales."
                  />
                </label>
                <button className="primary" disabled={saving}>
                  {saving ? 'Enviando…' : 'Enviar a revisión'}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            {p.view === 'travel' ? (
              <>
                <div className="travel-intro">
                  <h1>¿A dónde quieres ir?</h1>
                  <p>Elige tu destino. Encuentra tu conexión.</p>
                </div>
                <form
                  className="trip-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    search();
                  }}
                >
                  <div className="location-fields">
                    <div className="location-field">
                      <span className="origin-dot" />
                      <PlaceSearch
                        id="origin"
                        label="Desde"
                        value={p.originName}
                        placeholder="Tu punto de partida"
                        network={p.network}
                        onChange={(value) => selectPlace(value, 'origin')}
                        onSelect={(place) => {
                          p.setOrigin(place);
                          p.setOriginName(place.name);
                          setOptions(null);
                          p.setJourney(null);
                          setError('');
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        title="Usar mi ubicación"
                        aria-label="Usar mi ubicación"
                        onClick={locate}
                        disabled={locating}
                      >
                        <LocateFixed size={19} />
                      </button>
                    </div>
                    <div className="field-separator" />
                    <div className="location-field">
                      <MapPin size={19} />
                      <PlaceSearch
                        id="destination"
                        label="Hasta"
                        value={p.destinationName}
                        placeholder="Busca tu destino"
                        network={p.network}
                        onChange={(value) => selectPlace(value, 'destination')}
                        onSelect={(place) => {
                          p.setDestination(place);
                          p.setDestinationName(place.name);
                          setOptions(null);
                          p.setJourney(null);
                          setError('');
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        title="Intercambiar origen y destino"
                        aria-label="Intercambiar origen y destino"
                        onClick={() => {
                          const o = p.origin,
                            n = p.originName;
                          p.setOrigin(p.destination);
                          p.setOriginName(p.destinationName);
                          p.setDestination(o);
                          p.setDestinationName(n);
                          setOptions(null);
                          p.setJourney(null);
                        }}
                      >
                        <ArrowDownUp size={18} />
                      </button>
                    </div>
                  </div>
                  {gpsNote && (
                    <p className="gps-status" role="status">
                      {gpsNote}
                    </p>
                  )}
                  <div className="map-pick-actions">
                    <button
                      type="button"
                      onClick={() => p.setPickMode('origin')}
                    >
                      Marcar origen
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => p.setPickMode('destination')}
                    >
                      Marcar destino en mapa
                    </button>
                  </div>
                  <div className="time-preference">
                    <label>
                      <Clock size={15} />
                      <span className="sr-only">Hora de salida en Perú</span>
                      <input
                        type="time"
                        value={hour}
                        onChange={(e) => {
                          setHour(e.target.value);
                          setOptions(null);
                        }}
                        required
                      />
                    </label>
                    <label>
                      <span className="sr-only">Preferencia de viaje</span>
                      <select
                        value={preference}
                        onChange={(e) => {
                          setPreference(e.target.value);
                          setOptions(null);
                        }}
                      >
                        <option value="nearest">Abordaje más cercano</option>
                        <option value="fastest">Menor tiempo</option>
                        <option value="walk">Caminar menos</option>
                        <option value="transfers">Menos transbordos</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="primary search-button"
                    disabled={searching}
                  >
                    <Search size={18} />
                    {searching
                      ? options?.length
                        ? 'Completando alternativas…'
                        : 'Calculando caminos…'
                      : 'Buscar mi ruta'}
                    <ArrowRight size={18} />
                  </button>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                </form>
                {options === null && frequent.length > 0 && (
                  <>
                    <div className="section-heading">
                      <h2>Destinos frecuentes</h2>
                    </div>
                    <div className="destinations">
                      {frequent.map((id) => {
                        const s = stopById(p.network, id);
                        return (
                          <button
                            key={id}
                            onClick={() => selectPlace(s.name, 'destination')}
                          >
                            <MapPin size={16} />
                            <span>{s.name}</span>
                            <ChevronRight size={16} />
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {options === null && !searching && (
                  <div className="trip-prompt">
                    <span className="trip-prompt-icon" aria-hidden="true">
                      <MapPin size={20} />
                    </span>
                    <h2>Tu viaje empieza con dos puntos</h2>
                    <p>
                      Indica desde dónde sales y a dónde vas. Después verás los
                      recorridos que te acercan a tu destino.
                    </p>
                    {p.onBrowseRoutes && (
                      <button type="button" onClick={p.onBrowseRoutes}>
                        Explorar todas las rutas <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <h1>
                  {p.view === 'favorites'
                    ? 'Tus rutas guardadas'
                    : 'Explora las rutas'}
                </h1>
                <p className="muted">
                  {p.view === 'favorites'
                    ? 'A mano, incluso cuando pierdes conexión.'
                    : 'Encuentra recorridos y puntos de conexión.'}
                </p>
                {p.view === 'routes' && p.onManage && (
                  <button className="secondary" onClick={p.onManage}>
                    Administrar rutas · editar y eliminar
                  </button>
                )}
                <label className="catalog-search">
                  <Search size={17} />
                  <span className="sr-only">Buscar rutas</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ruta, zona o lugar…"
                  />
                </label>
              </>
            )}
            {options !== null && p.view === 'travel' ? (
              <>
                <div className="section-heading">
                  <h2>
                    {options.length
                      ? 'Opciones para tu viaje'
                      : 'Sin rutas disponibles'}
                  </h2>
                  {options.length > 0 && <span>{options.length} opciones</span>}
                </div>
                {options.length === 0 ? (
                  <div className="empty-state">
                    <BusFront size={30} />
                    <h3>No encontramos una conexión</h3>
                    <p>
                      Prueba otro horario o un punto más cercano a la red. La
                      cobertura disponible es limitada.
                    </p>
                  </div>
                ) : (
                  <>
                    {!p.publicView && (
                      <p className="small-note">
                        {preference === 'nearest'
                          ? 'De menor a mayor caminata hasta el abordaje.'
                          : 'Opciones según tu preferencia.'}{' '}
                        Caminatas por calles y caminos de OpenStreetMap.
                        Servicios de ejemplo y propuestas sin verificar.
                      </p>
                    )}
                    <details className="journey-method">
                      <summary>Cómo se calcula el viaje</summary>
                      <p className="small-note">
                        Cálculo peatonal:{' '}
                        <a
                          href="https://routing.openstreetmap.de/about.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          FOSSGIS / OSRM
                        </a>{' '}
                        ·{' '}
                        <a
                          href="https://www.openstreetmap.org/fixthemap"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Corregir el mapa
                        </a>
                        . Los puntos del viaje se envían al servicio para
                        calcular el camino.
                      </p>
                    </details>
                    {options.map((j, i) => (
                      <button
                        disabled={searching}
                        aria-pressed={p.journey?.id === j.id}
                        key={j.id}
                        className={`journey-card ${p.journey?.id === j.id ? 'selected' : ''}`}
                        onClick={() => {
                          p.setJourney(j);
                          p.onSelect(j.legs[0].route_id);
                        }}
                      >
                        <div className="journey-top">
                          <span>
                            {i === 0
                              ? searching
                                ? 'Primera opción disponible'
                                : 'Opción recomendada'
                              : `Alternativa ${i + 1}`}
                          </span>
                          <strong
                            className={
                              j.service_unknown && !j.time_estimated
                                ? 'unverified-time'
                                : undefined
                            }
                          >
                            {j.time_estimated
                              ? (j.timing?.total ?? `${j.minutes}+`)
                              : j.service_unknown
                                ? 'Por verificar'
                                : j.minutes}
                            {(!j.service_unknown || j.time_estimated) && (
                              <small> min aprox.</small>
                            )}
                          </strong>
                        </div>
                        <div className="journey-lines">
                          <Footprints size={17} />
                          <ChevronRight size={14} />
                          {j.legs.map((l, index) => (
                            <Fragment key={`${l.route_id}-${index}`}>
                              <RouteBadge
                                key={l.route_id}
                                route={(
                                  p.planningNetwork || p.network
                                ).routes.find((r) => r.id === l.route_id)!}
                              />
                              <ChevronRight size={14} />
                            </Fragment>
                          ))}
                          <Footprints size={17} />
                        </div>
                        <div className="journey-boarding">
                          <MapPin size={15} />
                          <span>
                            Sube en <strong>{j.legs[0]?.from.name}</strong>
                          </span>
                        </div>
                        <p className="boarding-distance">
                          {j.timing && (
                            <span>
                              {j.timing.walk} min a pie · {j.timing.ride} min en
                              micro ·{' '}
                              {j.timing.wait === null
                                ? 'espera sin dato'
                                : `${j.timing.wait} min de espera media`}
                              <br />
                            </span>
                          )}
                          {j.boarding_meters !== undefined &&
                            `${j.boarding_meters} m hasta el abordaje`}
                          {j.service_unknown &&
                            !p.publicView &&
                            ' · Propuesta local'}
                        </p>
                        <p>
                          <Footprints size={14} />
                          {j.transfers
                            ? `${j.transfers} transbordo`
                            : 'Sin transbordos'}
                          <span>·</span>
                          {j.walk_meters} m a pie<span>·</span>
                          {j.service_unknown &&
                          (p.planningNetwork || p.network).routes.find(
                            (r) => r.id === j.legs[0].route_id,
                          )?.service?.fare === undefined
                            ? 'Tarifa por verificar'
                            : money(j.fare)}
                        </p>
                      </button>
                    ))}
                    {p.journey && (
                      <div className="itinerary">
                        <h3>Tu viaje, paso a paso</h3>
                        <p className="small-note">
                          Desde tu origen hasta el punto de abordaje de la ruta
                          elegida. «Abordaje más cercano» compara el camino
                          hasta donde subir.
                        </p>
                        <p className="small-note">
                          Estimación: caminata a 70 m/min; micro según velocidad
                          configurada (15 km/h si falta). La espera media supone
                          llegadas regulares: intervalo ÷ 2. No incluye tráfico
                          en vivo. «+» indica que falta sumar la espera.
                        </p>
                        <ol className="journey-step-list">
                          {journeySteps(
                            p.journey,
                            p.origin,
                            p.destination,
                            p.planningNetwork || p.network,
                          ).map((step, i) => (
                            <li key={i} className={`journey-step ${step.kind}`}>
                              <span className="journey-step-number">
                                {i + 1}
                              </span>
                              <div>
                                <div className="journey-step-heading">
                                  {step.kind === 'walk' ? (
                                    <Footprints size={20} />
                                  ) : (
                                    <BusFront size={20} />
                                  )}
                                  <strong>{step.title}</strong>
                                </div>
                                <p>{step.detail}</p>
                                {step.kind === 'walk' ? (
                                  <>
                                    {step.meters !== null && (
                                      <span className="walking-distance">
                                        {step.meters} m · aprox.{' '}
                                        {Math.ceil(step.meters / 70)} min a pie
                                      </span>
                                    )}
                                    <small>
                                      {step.approximate
                                        ? 'Distancia en línea recta de demostración; no indica calles ni cruces transitables.'
                                        : 'Sigue el tramo peatonal del itinerario en el mapa.'}
                                    </small>
                                  </>
                                ) : (
                                  <small>
                                    Trayecto en micro: aprox. {step.minutes}{' '}
                                    min.{' '}
                                    {step.wait === null
                                      ? 'Sin estimación de espera disponible.'
                                      : `Espera ${p.journey?.mode === 'demo' ? 'media supuesta' : 'estimada'}: ${step.wait} min. No es una llegada GPS.`}
                                  </small>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                        <button className="secondary" onClick={share}>
                          <Share2 size={16} />
                          Compartir itinerario
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : p.view !== 'travel' ? (
              <>
                <div className="section-heading">
                  <h2>
                    {p.view === 'favorites'
                      ? 'Guardadas en este dispositivo'
                      : 'Rutas disponibles'}
                  </h2>
                  <span>{shown.length} rutas</span>
                </div>
                <div className="route-list">
                  {shown.map((r) => (
                    <div className="route-row" key={r.id}>
                      <button
                        className="route-main"
                        onClick={() => p.onSelect(r.id)}
                      >
                        <RouteBadge route={r} />
                        <div>
                          <strong>{r.name}</strong>
                          <p>
                            {r.stops.length
                              ? stopById(p.network, r.stops[0])?.name
                              : 'Inicio del recorrido'}
                            <ArrowRight size={12} />
                            {r.stops.length
                              ? stopById(p.network, r.stops.at(-1)!)?.name
                              : 'Fin del recorrido'}
                          </p>
                          <small>
                            <Clock size={12} />
                            {r.frequency[0]
                              ? `Cada ${r.frequency.join('–')} min`
                              : 'Frecuencia por verificar'}{' '}
                            <span>·</span>{' '}
                            {r.service?.fare !== undefined
                              ? money(r.fare)
                              : 'Tarifa por verificar'}
                          </small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                      <FavoriteButton
                        route={r}
                        saved={p.favorites.includes(r.id)}
                        onToggle={favorite}
                      />
                    </div>
                  ))}
                </div>
                {!shown.length && (
                  <div className="empty-state">
                    <Heart size={28} />
                    <h3>
                      {p.view === 'favorites'
                        ? 'Todavía no guardaste rutas'
                        : p.network.routes.length ? 'No hay coincidencias' : 'Aún no hay rutas disponibles'}
                    </h3>
                    <p>
                      {p.view === 'favorites'
                        ? 'Toca el corazón de una ruta para tenerla aquí.'
                        : p.network.routes.length ? 'Prueba con otra zona o nombre.' : 'Los recorridos aparecerán cuando se habiliten para pasajeros.'}
                    </p>
                  </div>
                )}
                <div className="travel-tip">
                  <div>
                    <Check size={17} />
                  </div>
                  <p>
                    <strong>Conoce tu ruta antes de salir</strong>
                    <span>Revisa el sentido y el punto de abordaje.</span>
                  </p>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
