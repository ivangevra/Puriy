# Puriy — Juliaca

Piloto de movilidad urbana para Juliaca (Perú): planificador de viajes en micro para pasajeros y laboratorio de análisis para el administrador. Contexto de producto en `PRODUCT.md`, diseño visual en `DESIGN.md`, uso y alcance en `README.md` y `docs/`.

## Idioma y estilo de respuesta

Responde en español. Si el plugin caveman está activo, aplícalo solo a tus mensajes en el chat; el código, los comentarios, los mensajes de commit, los textos de la interfaz y los documentos de `docs/` se escriben en español normal y completo, porque los leen jurados, operadores y pasajeros.

## Estructura

- `backend/`: FastAPI + SQLAlchemy. `main.py` (rutas), `auth.py` (cuentas, scrypt, Google OAuth), `planner.py`, `spatial.py`, `gtfs.py`, `integrations.py` (GPS, OTP), `lab.py` (laboratorio), `storage.py`. SQLite en local (`juliaca.db`), PostgreSQL/PostGIS en Docker.
- `web/`: React 19 + TypeScript sobre vinext/Vite, MapLibre con respaldo Leaflet. Componentes en `components/`, lógica en `lib/` (`road-graph.ts` Dijkstra/A*, `graph-routing.ts` trazado del editor, `traffic-model.ts`, `lab-*.ts`).
- `web/scripts/*.py`: generan los JSON de datos (`build-road-graph.py`, `build-places.py`, `build-demo-corridor.py`, `build-pdu-catalog.py`). Si cambia un dato generado, cambia el script y regenera; no edites el JSON a mano.
- `docs/fuentes/`: PDF del PDU convertidos a texto con marcas `<!-- pN -->`. Cita la página al usar datos del PDU.

## Comandos

```powershell
# Desarrollo (web 5173 + API 8001, lee .env de la raíz)
cd web; npm run dev

# Verificación
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd web; npx tsc --noEmit; npx vitest run; npm run lint
cd web; npx playwright test   # arranca API y web por su cuenta
cd web; npm run build
```

Usa siempre el Python de `.venv`. Antes de dar un cambio por terminado, ejecuta las pruebas que correspondan a lo que tocaste: pytest para `backend/`, `tsc` + vitest para `web/lib`, y Playwright cuando cambie un flujo visible. Informa qué se ejecutó y qué falló; si no pudiste ejecutar algo, dilo.

## Reglas del proyecto

- **Veracidad antes que precisión.** Los datos semilla, tiempos, GPS, tráfico y tarifas son sintéticos o ilustrativos y deben seguir rotulados como tales en la interfaz y en los documentos. No presentes como reales rutas, llegadas (ETA), tarifas, seguridad ni autorizaciones sin evidencia; el ETA está desactivado a propósito hasta que haya calibración.
- **Las propuestas van separadas de lo publicado.** Los escenarios del laboratorio y los borradores del editor no modifican los recorridos publicados.
- **Sentido de la vía importa.** El ruteo respeta sentidos únicos de OSM; no lo simplifiques a un grafo no dirigido.
- **Privacidad del pasajero.** Los itinerarios compartidos no llevan coordenadas personales; no registres ubicaciones de usuarios en logs ni en la API.
- **Secretos.** Nunca pongas claves en variables `VITE_*` ni en el código; van en `.env` (no versionado). No leas ni imprimas el contenido de `.env`.
- **Modo real.** Con `DEMO_MODE=false` la API no sirve la red sintética; no quites esa protección.
- **Móvil primero.** Pantallas táctiles al aire libre y conexión intermitente: contraste legible, objetivos táctiles amplios, movimiento reducido y entrada manual de origen si se niega la geolocalización.

## Forma de trabajar

- Haz el cambio que se pidió con el mínimo de código que lo resuelva bien. No agregues dependencias, capas de abstracción ni configuraciones que nadie pidió; si crees que hacen falta, propónlas en una línea.
- Lee el código existente antes de editar y sigue sus convenciones (nombres, densidad de comentarios, estilo de componentes).
- Si una petición es ambigua y la decisión cambia el resultado (por ejemplo, qué ruta o qué fuente de datos usar), pregunta; si hay un valor por defecto razonable, úsalo y menciónalo.
- No hagas commits ni despliegues salvo que se pidan.
- Mantén `README.md` al día cuando cambie cómo se instala, se ejecuta o qué está implementado.
