'use client';
import DraftRecovery from '../components/DraftRecovery';
import { request, listRecords } from '../lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BusFront,
  Route as RouteIcon,
  Heart,
  Presentation,
  Settings2,
  ArrowUpRight,
  WifiOff,
  X,
  Info,
} from 'lucide-react';
import TransitMap from '../components/TransitMap';
import LogoMark from '../components/Logo';
import Travel from '../components/Travel';
import RouteEditor from '../components/RouteEditor';
import Signals from '../components/Signals';
import RouteManager from '../components/RouteManager';
import ManzanaMap from '../components/ManzanaMap';
import {
  DRAFT_KEY,
  newDraft,
  withServiceDefaults,
} from '../lib/route-drafts';
import {
  PUBLISHED_KEY,
  SIGNALS_KEY,
  readPublications,
  readSignals,
  mapWorkspaceNetwork,
  publicationError,
  type PublishedRoute,
  type SignalPoint,
} from '../lib/map-workspace';
import type { RouteDraft } from '../lib/route-drafts';
import type { MapDirection } from '../lib/map-data';
import {
  EMPTY_NETWORK,
  isRoutePublic,
  readLocal,
  writeLocal,
  type Network,
  type Point,
  type Journey,
  type Position,
} from '../lib/mobility';
import { getNetwork, getPositions, IS_LOCAL_DEMO } from '../lib/api';
import {
  applyStoredToken,
  authAvailable,
  authConfig,
  exchangeLoginCode,
  fetchFavorites,
  fetchMe,
  logoutAccount,
  saveFavorites,
  saveSession,
  type AuthUser,
} from '../lib/auth';
import AuthDialog from '../components/AuthDialog';
import ProfileMenu from '../components/ProfileMenu';
import Analytics from '../components/Analytics';
import MobilityLab from '../components/MobilityLab';
import Admin from '../components/Admin';
import AdminPanel, { type AdminTool } from '../components/AdminPanel';
import AdminHome from '../components/AdminHome';
import AdminPlaces from '../components/AdminPlaces';
import Demos from '../components/Demos';
import { configureOffline } from '../lib/offline';
import { ThemeControl } from '../components/Theme';
export default function Home() {
  const [adminMode, setAdminMode] = useState(false);
  const [adminSession, setAdminSession] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const favoritesSynced = useRef(false);
  const [publications, setPublications] = useState<PublishedRoute[]>([]);
  const [signals, setSignals] = useState<SignalPoint[]>([]);
  const [manageRoutes, setManageRoutes] = useState(false);
  const [adminTool, setAdminTool] = useState<AdminTool>('overview');
  const [pendingReports, setPendingReports] = useState(0);
  const [signalFocus, setSignalFocus] = useState<string | null>(null);
  const [showSignals, setShowSignals] = useState(true);
  const [showPublished, setShowPublished] = useState(true);
  const [mapDirection, setMapDirection] = useState<MapDirection>('both');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [network, setNetwork] = useState<Network>(EMPTY_NETWORK),
    [loaded, setLoaded] = useState(IS_LOCAL_DEMO),
    [loadError, setLoadError] = useState('');
  const [view, setView] = useState('travel'),
    [selected, setSelected] = useState<string | null>(null),
    [origin, setOrigin] = useState<Point | null>(null),
    [destination, setDestination] = useState<Point | null>(null),
    [originName, setOriginName] = useState(''),
    [destinationName, setDestinationName] = useState(''),
    [pickMode, setPickMode] = useState<string | null>(null),
    [journey, setJourney] = useState<Journey | null>(null),
    [favorites, setFavorites] = useState<string[]>([]),
    [positions, setPositions] = useState<Position[]>([]),
    [toast, setToast] = useState(''),
    [offline, setOffline] = useState(false),
    [coverage, setCoverage] = useState(false),
    [info, setInfo] = useState(false);
  const notify = (text: string) => setToast(text);
  const passengerNetwork = useMemo(
    () => ({
      ...network,
      routes: network.routes.filter(isRoutePublic),
    }),
    [network],
  );
  const availableNetwork = adminMode ? network : passengerNetwork;
  const availablePublications = useMemo(
    () =>
      adminMode
        ? publications
        : publications.filter(
            (p) => p.draft.passengerVisible && !publicationError(p.draft),
          ),
    [adminMode, publications],
  );
  const planningNetwork = useMemo(
    () => mapWorkspaceNetwork(availableNetwork, availablePublications),
    [availableNetwork, availablePublications],
  );
  const displayNetwork = useMemo(
    () =>
      mapWorkspaceNetwork(
        availableNetwork,
        showPublished
          ? availablePublications
          : availablePublications.filter((item) =>
              journey?.legs.some(
                (leg) => leg.route_id === `published:${item.draft.id}`,
              ),
            ),
      ),
    [availableNetwork, availablePublications, showPublished, journey],
  );
  const mapNetwork = useMemo(() => {
    if (view !== 'travel') return displayNetwork;
    const recommendedIds = new Set(journey?.legs.map((leg) => leg.route_id) || []);
    return {
      ...displayNetwork,
      routes: displayNetwork.routes.filter((route) => recommendedIds.has(route.id)),
    };
  }, [displayNetwork, journey, view]);
  const persistWorkspace = async (
    items: PublishedRoute[],
    lights: SignalPoint[],
  ) => {
    if (!adminSession || user?.role !== 'admin')
      throw new Error('Inicia sesión como administrador.');
    if (!IS_LOCAL_DEMO)
      await request('/admin/workspace/state', {
        publications: items,
        signals: lights,
      });
  };
  const enterAdmin = async () => {
    if (user?.role !== 'admin' || IS_LOCAL_DEMO)
      throw new Error('Inicia sesión con una cuenta administradora.');
    const data = await request<{ publications: unknown; signals: unknown }>(
      '/admin/workspace/state',
    );
    setPublications(readPublications(data.publications));
    setSignals(readSignals(data.signals));
    setAdminSession(true);
    setAdminMode(true);
    setView('admin');
    listRecords<{ status: string }>('reports')
      .then((r) => setPendingReports(r.filter((x) => x.status === 'pending').length))
      .catch(() => {});
  };
  const publish = async (draft: RouteDraft) => {
    try {
      const normalized = withServiceDefaults(draft);
      const problem = publicationError(normalized);
      if (problem) throw new Error(problem);
      const next = [
        {
          draft: structuredClone(normalized),
          publishedAt: new Date().toISOString(),
        },
        ...publications.filter((p) => p.draft.id !== draft.id),
      ];
      await persistWorkspace(next, signals);
      const previous = localStorage.getItem(PUBLISHED_KEY);
      if (previous) localStorage.setItem(PUBLISHED_KEY + '-backup', previous);
      localStorage.setItem(PUBLISHED_KEY, JSON.stringify(next));
      setPublications(next);
      setShowPublished(true);
      if (view === 'admin') setAdminTool('publications');
      else setView('routes');
      setSelected(`published:${draft.id}`);
      setJourney(null);
      setMapDirection('both');
      notify(
        'Propuesta publicada en tu mapa local. Visible en este navegador.',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const withdraw = async (id: string) => {
    try {
      const next = publications.filter((p) => p.draft.id !== id);
      await persistWorkspace(next, signals);
      const previous = localStorage.getItem(PUBLISHED_KEY);
      if (previous) localStorage.setItem(PUBLISHED_KEY + '-backup', previous);
      localStorage.setItem(PUBLISHED_KEY, JSON.stringify(next));
      setPublications(next);
      if (selected === `published:${id}`) setSelected(null);
      notify('Publicación retirada. El borrador se conserva.');
    } catch {
      notify('No se pudo retirar la publicación.');
    }
  };
  const saveSignals = async (items: SignalPoint[]) => {
    try {
      await persistWorkspace(publications, items);
    } catch (e) {
      notify((e as Error).message);
      return;
    }
    localStorage.setItem(SIGNALS_KEY, JSON.stringify(items));
    setSignals(items);
  };
  useEffect(() => {
    getNetwork()
      .then((net) => {
        const local = readLocal<Network | null>(
          'juliaca-managed-network-v1',
          null,
        );
        setNetwork(
          IS_LOCAL_DEMO &&
            local &&
            Array.isArray(local.routes) &&
            Array.isArray(local.stops)
            ? local
            : net,
        );
        setLoaded(true);
        if (!IS_LOCAL_DEMO) {
          setOrigin(null);
          setOriginName('');
        }
      })
      .catch((e) => {
        setLoadError(e.message);
        if (!IS_LOCAL_DEMO) {
          setNetwork({ stops: [], routes: [] });
          setLoaded(true);
        }
      });
    setFavorites(readLocal('juliaca-favorites', []));
    if (IS_LOCAL_DEMO) {
      setPublications(readPublications(readLocal(PUBLISHED_KEY, [])));
      setSignals(readSignals(readLocal(SIGNALS_KEY, [])));
    } else {
      request<{ publications: unknown }>('/public/workspace')
        .then((data) => setPublications(readPublications(data.publications)))
        .catch(() => {});
      applyStoredToken();
      authConfig()
        .then((config) => setGoogleEnabled(config.google))
        .catch(() => {});
      const loginCode = new URLSearchParams(location.search).get('login_code');
      if (loginCode) {
        exchangeLoginCode(loginCode)
          .then((data) => {
            saveSession(data.token);
            setUser(data.user);
            setToast(`Hola, ${data.user.name || data.user.email}.`);
          })
          .catch((e) => setToast((e as Error).message))
          .finally(() => {
            const url = new URL(location.href);
            url.searchParams.delete('login_code');
            history.replaceState({}, '', url);
          });
      } else
        fetchMe()
          .then((data) => {
            if (data.user) setUser(data.user);
            else saveSession(null);
          })
          .catch(() => {});
    }
    const route = new URLSearchParams(location.search).get('ruta');
    if (route) {
      setSelected(route);
      setView('routes');
    }
    if (new URLSearchParams(location.search).has('demos')) setView('demos');
    if (new URLSearchParams(location.search).get('panel') === 'movilidad') {
      setAdminTool('lab');
    }
    setOffline(!navigator.onLine);
    const sync = () => setOffline(!navigator.onLine);
    addEventListener('online', sync);
    addEventListener('offline', sync);
    configureOffline().catch(() => {});
    return () => {
      removeEventListener('online', sync);
      removeEventListener('offline', sync);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const update = () =>
      getPositions()
        .then((p) => {
          if (active) setPositions(p);
        })
        .catch(() => {
          if (active) setPositions([]);
        });
    update();
    const id = setInterval(update, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!user || IS_LOCAL_DEMO || favoritesSynced.current) return;
    favoritesSynced.current = true;
    fetchFavorites()
      .then(({ ids }) => {
        if (!ids.length) {
          if (favorites.length) saveFavorites(favorites).catch(() => {});
          return;
        }
        const merged = [...new Set([...ids, ...favorites])];
        setFavorites(merged);
        writeLocal('juliaca-favorites', merged);
        if (merged.length !== ids.length) saveFavorites(merged).catch(() => {});
      })
      .catch(() => {});
  }, [user, favorites]);
  const updateFavorites = (ids: string[]) => {
    setFavorites(ids);
    if (user && !IS_LOCAL_DEMO) saveFavorites(ids).catch(() => {});
  };
  const signOut = async () => {
    try {
      if (user && !IS_LOCAL_DEMO) await logoutAccount();
    } catch {
      /* La sesión local se cierra igual. */
    }
    saveSession(null);
    localStorage.removeItem('juliaca-favorites');
    localStorage.removeItem('juliaca-saved-routes');
    setUser(null);
    setFavorites([]);
    favoritesSynced.current = false;
    setAdminSession(false);
    setAdminMode(false);
    setView('travel');
    setSelected(null);
    setJourney(null);
    setPickMode(null);
    notify('Sesión cerrada.');
  };
  const navigate = (next: string) => {
    const canAdmin = user?.role === 'admin';
    if (
      ['admin', 'editor', 'analytics', 'signals'].includes(next) &&
      !canAdmin
    ) {
      return;
    }
    if (['admin', 'editor', 'analytics', 'signals'].includes(next)) {
      if (!adminSession) {
        enterAdmin().catch((error) => notify((error as Error).message));
        return;
      }
      setAdminMode(true);
    }
    if (['editor', 'signals', 'analytics'].includes(next)) {
      setView('admin');
      setAdminTool(next as AdminTool);
    } else setView(next);
    setManageRoutes(false);
    if (next === 'admin') setAdminTool('overview');
    setMapDirection('both');
    setSelected(null);
    setJourney(null);
    setPickMode(null);
  };
  const manageNetwork = async (next: Network) => {
    if (!adminSession) throw new Error('Inicia sesión para editar rutas.');
    localStorage.setItem('juliaca-managed-network-v1', JSON.stringify(next));
    setNetwork(next);
    setSelected(null);
    setJourney(null);
    if (!IS_LOCAL_DEMO)
      try {
        await request('/admin/network/import', next);
      } catch (e) {
        notify(
          'Guardado en este navegador; el servidor no se pudo sincronizar: ' +
            (e as Error).message,
        );
      }
  };
  const editRouteDrawing = (r: Network['routes'][number]) => {
    try {
      const d = {
        ...newDraft(),
        name: r.name,
        code: r.code,
        color: r.color,
        source: r.source,
        outbound: r.geometry.map((p) => [p[0], p[1]]),
        inbound: r.inbound_geometry.map((p) => [p[0], p[1]]),
      };
      const current = readLocal<{ drafts: unknown[] }>(DRAFT_KEY, {
        drafts: [],
      });
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ active: d.id, drafts: [d, ...current.drafts] }),
      );
      navigate('editor');
    } catch {
      notify('No se pudo crear la copia de edición.');
    }
  };
  const openAdminDraft = (draft: RouteDraft) => {
    const store = readLocal<{ drafts: RouteDraft[] }>(DRAFT_KEY, {
      drafts: [],
    });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        active: draft.id,
        drafts: [
          draft,
          ...(store.drafts || []).filter((d) => d.id !== draft.id),
        ],
      }),
    );
    setView('admin');
    setAdminTool('editor');
  };
  const pick = (point: Point) => {
    if (pickMode === 'origin') {
      setOrigin(point);
      setOriginName('Punto elegido en el mapa');
    } else {
      setDestination(point);
      setDestinationName('Destino elegido en el mapa');
    }
    setPickMode(null);
    setJourney(null);
  };
  return (
    <div
      className="app-shell"
      data-ready={hydrated}
      inert={!hydrated}
      aria-busy={!hydrated}
    >
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="app-header">
        <a href="/" className="brand" aria-label="Puriy, inicio">
          <span className="brand-mark">
            <LogoMark size={42} />
          </span>
          <span>
            puriy<span className="brand-dot">.</span>
            <small>Juliaca</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          <button
            className={view === 'travel' ? 'active' : ''}
            aria-current={view === 'travel' ? 'page' : undefined}
            onClick={() => navigate('travel')}
          >
            <BusFront size={21} />
            <span>Viajar</span>
          </button>
          <button
            className={view === 'routes' ? 'active' : ''}
            aria-current={view === 'routes' ? 'page' : undefined}
            onClick={() => navigate('routes')}
          >
            <RouteIcon size={21} />
            <span>Rutas</span>
          </button>
          <button
            className={view === 'favorites' ? 'active' : ''}
            aria-label="Rutas guardadas"
            aria-current={view === 'favorites' ? 'page' : undefined}
            onClick={() => navigate('favorites')}
          >
            <Heart size={21} />
            <span>Guardadas</span>
          </button>
          <button
            className={view === 'demos' ? 'active' : ''}
            aria-current={view === 'demos' ? 'page' : undefined}
            onClick={() => navigate('demos')}
          >
            <Presentation size={21} />
            <span>Demos</span>
          </button>
        </nav>
        <div className="rail-bottom">
          {user?.role === 'admin' && (
            <button
              className={`icon-button ${view === 'admin' ? 'active' : ''}`}
              aria-label="Administrar plataforma"
              title="Administrar plataforma"
              onClick={() => navigate('admin')}
            >
              <Settings2 size={20} />
            </button>
          )}
          {(user || authAvailable) && (
            <ProfileMenu
              user={user}
              favoritesCount={favorites.length}
              onLogin={() => {
                setAuthMode('login');
                setAuthOpen(true);
              }}
              onFavorites={() => navigate('favorites')}
              onAdmin={() => navigate('admin')}
              onSignOut={signOut}
            />
          )}
          <span>JUL / PE</span>
        </div>
      </header>
      <div className="app-body">
        <div className="workspace-bar">
          <div className="workspace-location">
            <span className="wordmark">
              puriy<span>.</span>
            </span>
            <span className="breadcrumb-divider">/</span>
            <span>
              {view === 'signals'
                ? 'Inventario de semáforos'
                : view === 'editor'
                  ? 'Editor de recorridos'
                  : view === 'travel'
                    ? 'Planifica tu viaje'
                    : view === 'routes'
                      ? 'Explorar rutas'
                      : view === 'analytics'
                        ? 'Observatorio de movilidad'
                        : view === 'favorites'
                          ? 'Rutas guardadas'
                          : view === 'demos'
                            ? 'Demostraciones'
                          : 'Administración'}
            </span>
          </div>
          <div className="header-actions">
            {adminSession && (
              <button
                className="secondary"
                onClick={() => {
                  setAdminMode(!adminMode);
                  setView(adminMode ? 'travel' : 'admin');
                  setJourney(null);
                  setSelected(null);
                }}
              >
                {adminMode ? 'Ver como pasajero' : 'Volver al panel'}
              </button>
            )}
            <ThemeControl />
          </div>
        </div>
        {adminMode && view !== 'demos' && (
          <div className="status-strip">
            <div>
              <span className="status-dot" />
              {network.routes.some((r) => r.status === 'demo') ? (
                <>
                  <strong>Modo demostración</strong>
                  <span>
                    Rutas y frecuencias de ejemplo. No usar para viajar.
                  </span>
                </>
              ) : network.routes.length ? (
                <>
                  <strong>Red de movilidad</strong>
                  <span>Consulta la fecha y fuente de cada recorrido.</span>
                </>
              ) : (
                <>
                  <strong>Sin red cargada</strong>
                  <span>
                    Publica un recorrido desde el editor para verlo en el mapa.
                  </span>
                </>
              )}
            </div>
            <button
              onClick={() => setInfo(!info)}
              aria-label="Información sobre los datos"
            >
              <Info size={16} />
            </button>
          </div>
        )}
        {offline && (
          <div className="offline-strip">
            <WifiOff size={16} />
            Sin conexión. Las fichas guardadas siguen disponibles; el mapa y GPS
            necesitan internet.
          </div>
        )}
        <section
          className="project-info t-panel-slide"
          data-open={info}
          inert={!info}
          aria-hidden={!info}
        >
          <button
            className="icon-button"
            aria-label="Cerrar información"
            onClick={() => setInfo(false)}
          >
            <X size={18} />
          </button>
          <h2>Una ciudad mejor conectada.</h2>
          <p>
            Este proyecto une orientación para pasajeros y análisis de movilidad
            en Juliaca. El piloto permite probar recorridos, registrar
            observaciones y comparar propuestas.
          </p>
          <p>
            Los datos de demostración no corresponden a servicios autorizados.
            El seguimiento real se habilita al integrar GPS de operadores y
            verificar las rutas. Las propuestas urbanas requieren mediciones y
            revisión técnica.
          </p>
        </section>
        <div id="main-content" className="content-frame" tabIndex={-1}>
          {!loaded && !adminMode ? (
            <div className="empty-state">
              <h1>
                {loadError ? 'No se pudo cargar la red' : 'Cargando rutas…'}
              </h1>
              <p>{loadError}</p>
              {loadError && (
                <button className="primary" onClick={() => location.reload()}>
                  Volver a intentar
                </button>
              )}
            </div>
          ) : view === 'editor' ? (
            <RouteEditor
              network={network}
              notify={notify}
              publications={publications}
              onPublish={publish}
              onWithdraw={withdraw}
            />
          ) : view === 'signals' ? (
            <Signals
              initialId={signalFocus}
              network={displayNetwork}
              signals={signals}
              onChange={saveSignals}
              notify={notify}
            />
          ) : view === 'admin' ? (
            <AdminPanel
              tool={adminTool}
              onTool={setAdminTool}
              badges={{ reports: pendingReports }}
            >
              {adminTool === 'overview' ? (
                <AdminHome
                  network={network}
                  publications={publications}
                  signals={signals}
                  positions={positions}
                  pendingReports={pendingReports}
                  onTool={setAdminTool}
                />
              ) : adminTool === 'publications' ? (
                <div className="workspace admin-hub">
                  <p className="muted">
                    Edita recorridos, configura su servicio y decide cuáles
                    verán los pasajeros.
                  </p>
                  {!publications.length && (
                    <div className="admin-empty">
                      <strong>Todavía no hay recorridos publicados</strong>
                      <p>
                        Recupera un borrador de abajo o dibuja uno nuevo en el
                        editor.
                      </p>
                      <button
                        className="primary"
                        onClick={() => setAdminTool('editor')}
                      >
                        Abrir editor
                      </button>
                    </div>
                  )}
                  {publications.map((item) => (
                    <div className="admin-route-row" key={item.draft.id}>
                      <strong>
                        {item.draft.code} · {item.draft.name}
                      </strong>
                      <span>
                        {publicationError(item.draft) ||
                          (item.draft.passengerVisible
                            ? 'Visible para pasajeros'
                            : 'Solo administración')}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => {
                          const store = readLocal<{ drafts: RouteDraft[] }>(
                            DRAFT_KEY,
                            { drafts: [] },
                          );
                          localStorage.setItem(
                            DRAFT_KEY,
                            JSON.stringify({
                              active: item.draft.id,
                              drafts: [
                                item.draft,
                                ...store.drafts.filter(
                                  (d) => d.id !== item.draft.id,
                                ),
                              ],
                            }),
                          );
                          setAdminTool('editor');
                        }}
                      >
                        Editar ruta y servicio
                      </button>
                      <button
                        className="text-button"
                        onClick={() => withdraw(item.draft.id)}
                      >
                        Retirar publicación
                      </button>
                      <button
                        className="secondary"
                        disabled={
                          !item.draft.passengerVisible &&
                          !!publicationError(item.draft)
                        }
                        title={
                          !item.draft.passengerVisible
                            ? publicationError(item.draft) ||
                              'Mostrar esta ruta a los pasajeros'
                            : 'Ocultar esta ruta a los pasajeros'
                        }
                        onClick={() =>
                          publish({
                            ...item.draft,
                            passengerVisible: !item.draft.passengerVisible,
                          })
                        }
                      >
                        {item.draft.passengerVisible
                          ? 'Ocultar a pasajeros'
                          : 'Mostrar a pasajeros'}
                      </button>
                    </div>
                  ))}
                  <DraftRecovery
                    publications={publications}
                    onOpen={openAdminDraft}
                  />
                </div>
              ) : adminTool === 'data' ||
                adminTool === 'reports' ||
                adminTool === 'gps' ? (
                <Admin
                  key={adminTool}
                  section={adminTool}
                  network={network}
                  notify={notify}
                  onNetwork={setNetwork}
                  onPending={setPendingReports}
                />
              ) : adminTool === 'routes' ? (
                <RouteManager
                  network={network}
                  onChange={manageNetwork}
                  onDraw={editRouteDrawing}
                />
              ) : adminTool === 'editor' ? (
                <RouteEditor
                  network={network}
                  notify={notify}
                  publications={publications}
                  onPublish={publish}
                  onWithdraw={withdraw}
                />
              ) : adminTool === 'signals' ? (
                <Signals
                  initialId={signalFocus}
                  network={displayNetwork}
                  signals={signals}
                  onChange={saveSignals}
                  notify={notify}
                />
              ) : adminTool === 'lab' ? (
                <MobilityLab
                  network={mapWorkspaceNetwork(network, publications)}
                  notify={notify}
                  onOpenDraft={openAdminDraft}
                />
              ) : adminTool === 'manzanas' ? (
                <div className="workspace">
                  <p className="muted">
                    Cartografía INEI con población del Censo 2017 por manzana.
                    Clic en una manzana para ver habitantes, área y densidad;
                    busca por código (ej. 001E) para ubicarla.
                  </p>
                  <ManzanaMap />
                </div>
              ) : adminTool === 'places' ? (
                <AdminPlaces />
              ) : (
                <Analytics network={network} notify={notify} />
              )}
            </AdminPanel>
          ) : view === 'demos' ? (
            <Demos />
          ) : view === 'analytics' ? (
            <Analytics network={network} notify={notify} />
          ) : (
            <main className="travel-layout">
              {adminMode && view === 'routes' && manageRoutes ? (
                <aside className="travel-panel">
                  <div className="panel-content">
                    <RouteManager
                      network={network}
                      onChange={manageNetwork}
                      onDraw={editRouteDrawing}
                    />
                    <button
                      className="secondary"
                      onClick={() => setManageRoutes(false)}
                    >
                      Volver al catálogo
                    </button>
                  </div>
                </aside>
              ) : (
                <Travel
                  publicView={!adminMode}
                  planningNetwork={planningNetwork}
                  onManage={adminMode ? () => setManageRoutes(true) : undefined}
                  onBrowseRoutes={() => navigate('routes')}
                  mapDirection={mapDirection}
                  onDirection={setMapDirection}
                  key={view}
                  {...{
                    network: adminMode ? availableNetwork : planningNetwork,
                    view,
                    selected,
                    origin,
                    destination,
                    setOrigin,
                    setDestination,
                    originName,
                    destinationName,
                    setOriginName,
                    setDestinationName,
                    setPickMode,
                    journey,
                    setJourney,
                    favorites,
                    setFavorites: updateFavorites,
                    notify,
                  }}
                  onSelect={setSelected}
                />
              )}
              <div className="map-region">
                {adminMode &&
                  (publications.length > 0 || signals.length > 0) && (
                    <div className="workspace-map-layers">
                      {publications.length > 0 && (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={showPublished}
                              onChange={(e) => {
                                setShowPublished(e.target.checked);
                                if (selected?.startsWith('published:'))
                                  setSelected(null);
                              }}
                            />
                            Propuestas locales
                          </label>
                          <div className="published-map-list">
                            {publications.map((p) => (
                              <button
                                key={p.draft.id}
                                className={
                                  selected === `published:${p.draft.id}`
                                    ? 'active'
                                    : ''
                                }
                                onClick={() => {
                                  setShowPublished(true);
                                  setSelected(`published:${p.draft.id}`);
                                  setJourney(null);
                                }}
                              >
                                {p.draft.code || 'PROP'} · {p.draft.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {signals.length > 0 && (
                        <label>
                          <input
                            type="checkbox"
                            checked={showSignals}
                            onChange={(e) => setShowSignals(e.target.checked)}
                          />
                          Semáforos · {signals.length}
                        </label>
                      )}
                      {selected?.startsWith('published:') && (
                        <p>
                          Propuesta sin validar · publicación en este navegador.{' '}
                          <button onClick={() => navigate('editor')}>
                            Editar publicaciones
                          </button>
                        </p>
                      )}
                    </div>
                  )}
                <TransitMap
                  allowSimulation={adminMode}
                  signals={adminMode && showSignals ? signals : []}
                  onSignal={(id) => {
                    setSignalFocus(id);
                    navigate('signals');
                  }}
                  direction={mapDirection}
                  onDirection={setMapDirection}
                  {...{
                    selected,
                    origin,
                    destination,
                    pickMode,
                    journey,
                    positions,
                  }}
                  network={mapNetwork}
                  onSelect={setSelected}
                  onPick={pick}
                  coverage={coverage}
                  places
                  onPlace={(place) => {
                    setDestination(place);
                    setDestinationName(place.name);
                    setJourney(null);
                    if (view !== 'travel') setView('travel');
                  }}
                />
                {adminMode && (
                  <div className="map-footer">
                    <span>
                      <span className="tiny-dot" />
                      {network.routes.length} rutas en el piloto{' '}
                      <span className="footer-divider">/</span>{' '}
                      {positions.length
                        ? 'Posiciones disponibles'
                        : 'GPS de operadores pendiente de integrar'}
                    </span>
                    <button onClick={() => setCoverage(!coverage)}>
                      {coverage ? 'Ocultar cobertura' : 'Ver cobertura'}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </main>
          )}
        </div>
        <AuthDialog
          open={authOpen}
          mode={authMode}
          onMode={setAuthMode}
          onClose={() => setAuthOpen(false)}
          onUser={(next) => {
            favoritesSynced.current = false;
            setUser(next);
          }}
          notify={notify}
          google={googleEnabled}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
