# Puriy

Plataforma de pasajeros y análisis urbano. **Piloto funcional sin rutas de ejemplo: solo se muestran los recorridos que el administrador publique. No es todavía un servicio de orientación real.**

El **Laboratorio de movilidad**, en Administración, integra el censo por manzana, el catálogo documental PDU, destinos, calendario, flota, comparación y desvíos candidatos. [Guía de uso, alcance y validación](docs/LABORATORIO_MOVILIDAD.md).

## Abrir y desarrollar

En `web`: `npm ci`, luego `npm run dev`. Este comando inicia la web en http://localhost:5173 **y** la API en http://127.0.0.1:8001, espera a que la API responda y lee las variables del `.env` de la raíz. Si falta `.venv` o sus dependencias, las crea e instala desde `backend/requirements.txt`. Si el puerto 8001 está ocupado por otro programa lo avisa (`PURIY_API_PORT=8002 npm run dev` para cambiarlo). `npm run dev:web` inicia solo la web.

La web sin `VITE_API_BASE_URL` arranca sin red: el mapa solo muestra las propuestas publicadas desde el editor. Favoritos, reportes, escenarios y observaciones de esta modalidad se guardan en el navegador; no son registros compartidos. Los datos sintéticos de `web/lib/network.json` quedan únicamente como fixture de pruebas.

Para la API, desde la raíz:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

Si inicias web y API por separado, usa `web/.env.local` con `VITE_API_BASE_URL=http://127.0.0.1:8001` y reinicia la web. `npm run dev` define esta URL automáticamente. No poner claves privadas en variables `VITE_*`. API documentada en http://127.0.0.1:8001/docs.

Si abres la web desde un teléfono físico, `localhost` apunta al teléfono. En ese caso, publica ambos servidores en la red local y configura `VITE_API_BASE_URL` y `CORS_ORIGINS` con la dirección IP de tu computadora.

## Cuentas (correo y Google)

Con la API conectada, la web ofrece registro e ingreso con correo y contraseña. Las contraseñas se guardan con scrypt y sal por usuario; las sesiones son tokens aleatorios y solo se almacena su hash. Los favoritos se sincronizan por cuenta.

Variables del servidor (`.env`):

Docker Compose y `npm run dev` leen este archivo. Si ejecutas `uvicorn` directamente, define estas variables en la terminal antes de arrancarlo.

- La cuenta existente `ivangvera201@gmail.com` tiene un permiso administrativo explícito en la base de datos y puede usarlo al iniciar sesión con su contraseña. Una nueva inscripción con ese correo no hereda el permiso. Una sesión de Google verificada de ese correo también puede administrar.
- `juliaca.db` no se versiona, así que al clonar el repositorio en otra máquina no hay cuentas. Créala o restablécele la contraseña con `.\.venv\Scripts\python.exe -m backend.seed_admin` (pide la clave, mínimo 8 caracteres; también acepta `ADMIN_SEED_PASSWORD`). No imprime la contraseña ni publica recorridos.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: credenciales OAuth de Google. Sin ellas el botón «Google» queda deshabilitado.
- `PUBLIC_API_URL`: URL pública de la API para el callback de Google (por ejemplo `https://api.midominio.pe`). Vacío usa la del servidor.

En Google Cloud Console, crea un cliente OAuth de tipo «Aplicación web» y registra como URI de redirección `https://TU_API/api/auth/google/callback` (en local, `http://127.0.0.1:8001/api/auth/google/callback`). Autoriza también el origen de la web en `CORS_ORIGINS`. Configura `PUBLIC_API_URL` con la URL de la API y copia las credenciales OAuth a las variables del servidor. La API y la web deben estar conectadas para usar cuentas.

Para que otras personas vean los recorridos publicados, la web y la API deben estar desplegadas en internet: la vista estática por sí sola guarda las publicaciones en el navegador del administrador.

## Lugares concurridos

`web/lib/places-juliaca.json` reúne 523 destinos con nombre (colegios, educación inicial, mercados, centros comerciales, salud, universidades, terminales) tomados de OpenStreetMap; los citados en el diagnóstico PDU (pp. 54–56) llevan `pdu: true`. Se ven en el mapa (botón «Lugares»), en el buscador de destino sin conexión y en Administración › Lugares concurridos (CSV/GeoJSON). Regenerar: `python web/scripts/build-places.py`. OSM no es fuente oficial: verificar accesos y horarios del corredor piloto.

Los PDF de referencia están convertidos a texto en `docs/fuentes/` (con marcas `<!-- pN -->` de página) mediante `web/scripts/pdf-to-md.py` (PyMuPDF).

## Demostraciones para la exposición

Menú **Demos** (o `http://localhost:5173/?demos=1`), diez animaciones: viaje completo (caminata por calles con huellas, espera, a bordo), trazo de ida y vuelta, **cómo se calcula la ruta** (Dijkstra contra A* sobre la red vial y efecto de las calles de un solo sentido), GPS de unidades, tráfico por tramo con **ruta alternativa calculada**, flota según intervalo (interactivo), cobertura a 400 m con Censo 2017, feria con desvío calculado, **semáforos: ciclo, reparto y desfase** y el prototipo a futuro **semáforos adaptativos: con y sin Jev**. Teclas: ←/→, espacio, F. Cada demo se descarga como video (solo animación o con explicación) a la velocidad elegida en el reproductor: 0,5×, 1×, 2× o 4×. Tiempos, GPS y tráfico son simulados y así se rotula.

- El corredor sale del recorrido **N40 publicado en el editor**; cuando se dibuja y publica su **vuelta**, las demos la usan automáticamente. Sin API se usa la copia `web/lib/demo-corridor.json` (`python web/scripts/build-demo-corridor.py N40`).
- Red vial: `web/public/data/red-vial.json` (OpenStreetMap: 13.317 intersecciones, 21.198 tramos, 455 vías de un solo sentido y rotondas). Regenerar: `python web/scripts/build-road-graph.py`. Algoritmos en `web/lib/road-graph.ts`: Dijkstra y A* con peso = tiempo por tipo de vía, sentidos obligatorios, penalización por tráfico o cierre.
- Los mapas (Viajar, Rutas, Editor) muestran flechas de sentido al acercarse (zoom ≥ 15). Los sentidos de OSM pueden estar incompletos: verificar en campo.
- **Editor**: el trazo «Seguir calles» usa la red vial propia (`web/lib/graph-routing.ts`): cada punto se prueba en las calzadas cercanas y se elige la combinación coherente (Viterbi), sin giros en U en los vértices y respetando sentidos. Ya no hay que elegir calzada. OSRM queda como respaldo si la red no carga.
- **Semáforos** (`web/lib/signal-timing.ts`): cálculo de tiempos al estilo Synchro/HCM. Flujo de saturación con factores de ancho, pesados, pendiente, estacionamiento, micros que paran en la esquina, zona y giros; repartos por grado de saturación con verde peatonal mínimo (1,0 m/s) y amarillo/todo rojo cinemáticos; barrido de ciclos de 50 a 120 s; desfases con dispersión de pelotones (Robertson); índice de desempeño = demora + 10 s por detención + castigo por cola que no cabe. La demo compara el plan fijo supuesto de hoy, una onda verde simple y el plan optimizado, con demanda actual, +20 % y +40 %. Los cruces son intersecciones reales del corredor; aforos, anchos y planes son ilustrativos. No modela doble anillo NEMA, adelanto/retraso de giros, medio ciclo ni semáforos actuados.
- **Semáforos adaptativos (prototipo a futuro)** (`web/lib/adaptive-signals.ts`, `web/components/AdaptiveStage.tsx`): demo en tres pasos. **1. El problema:** un cruce guionado, semáforo que mira la calle frente a tiempo fijo. **2. Por qué Jev:** el mismo cruce preguntando cada segundo «seguir o cambiar», con Jev (≈0,4 s) frente a un modelo de lenguaje general (≈5 s, ilustrativo); la cifra de 200–400 veces más rápido y barato se muestra como dato del proveedor, no medido. **3. En el tráfico:** simulación vehículo por vehículo (modelo IDM) de una manzana con cuatro semáforos y ocho entradas. Compara, con las mismas llegadas, tres controles: **con Jev (simulado)**, que imita el uso de Jev de TypeSafe AI (estado del cruce en JSON, pregunta `Choice` extender/cambiar, respuesta con probabilidad y 0,4 s de latencia, vuelta a la regla si la confianza baja de 60 %; la política que responde es local, no el modelo real); **sin Jev**, reglas propias (extiende el verde mientras llegan vehículos y lo corta si queda sin uso o la otra calle acumula más espera); y **tiempo fijo** de 60 s. Prioridad opcional por pasajeros. Los vehículos no entran al cruce si no caben al otro lado. Capa de seguridad fija: verde mínimo 7 s, ámbar 3 s, todo rojo 2 s y verde máximo 40 s. Demanda y resultados ilustrativos; no se exporta a MP4.
- **Demo de algoritmos interactiva**: botones Origen/Destino y clic en el mapa; Dijkstra y A* se recalculan al instante.
- **Tráfico** (`web/lib/traffic-model.ts`): velocidad habitual por tramo de 100 m, día y hora (punta escolar/laboral, mercado al mediodía, sábado de mercado, ferias dominicales, micros lentos buscando pasajeros en horas valle). Corredor y alternativa se miden con el mismo modelo y el mismo A*; la alternativa solo se propone si ahorra ≥ 0,5 min. Valores ilustrativos hasta tener GPS histórico.
- **Algoritmo elegido**: A* con montículo binario sobre ~13 mil intersecciones (1–4 ms). Contraction Hierarchies solo aporta a escala regional; para viajes en micro con transbordos y horarios corresponde RAPTOR (OpenTripPlanner) cuando haya GTFS validado.

## Implementado

- React/TypeScript, mapa MapLibre con OpenFreeMap y respaldo Leaflet/OpenStreetMap cuando falla el proveedor o WebGL.
- Tamaño del mapa independiente de la cascada CSS; ResizeObserver, encuadre de rutas y limpieza de caché de desarrollo.
- Origen por ubicación, lista de lugares o mapa; destinos, búsqueda, hasta tres alternativas sintéticas, ida/vuelta, favoritos e itinerarios compartidos sin coordenadas personales.
- Fichas y reportes moderados. Administración reservada a la cuenta indicada arriba.
- Cobertura espacial aproximada, pares consecutivos compartidos, comparador de frecuencia/puntos de abordaje, formularios de observación y exportación JSON.
- FastAPI, persistencia SQLAlchemy, SQLite local y configuración PostgreSQL/PostGIS. Publicación con versión previa y actualización espacial transaccional.
- Ingesta GPS normalizada, validación de fechas, rechazo de datos antiguos fuera de orden y eliminación de posiciones obsoletas del mapa. Exportación de posiciones vigentes GTFS-RT.
- Adaptador OpenTripPlanner y exportador GTFS de demostración. El exportador sintético se bloquea en modo real.
- Manifest y caché de recursos de producción; nunca se almacenan teselas de terceros ni respuestas GPS en la caché de la aplicación.

## Pendiente para servicio real

1. Nombre del proveedor GPS, permiso de uso, contrato de su API y muestra. El conector actual exige la forma normalizada de `backend/models.py`; el traductor específico depende del proveedor.
2. Recorridos, puntos de abordaje, tarifas, calendarios y observaciones verificadas. No hay rutas oficiales cargadas.
3. GTFS real y red peatonal de OSM validados, construcción del grafo OTP y comprobación de contratos. La integración OTP está implementada pero **no probada contra un servidor real**. Utiliza la consulta `plan` de compatibilidad; revisar versión antes de migrar a `planConnection`.
4. Históricos y evaluación del error para predicciones de llegada. **ETA desactivado deliberadamente** hasta tener calibración; GPS fresco por sí solo no autoriza una predicción.
5. Aforos, encuestas y validación técnica. El comparador actual modifica frecuencias y puntos, no geometrías viales ni modelos de tráfico. No estima congestión, demanda poblacional ni emisiones.
6. Despliegue de la API, HTTPS, programación de sincronización GPS, límites de solicitudes en el proxy y presupuesto medido. La vista Sites es una demostración independiente; no aloja FastAPI ni PostgreSQL.
7. Integrar avisos de servicio a la interfaz de pasajeros (API creada), ampliar edición de geometrías y seguimiento de calidad por tramo.

## Verificar

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd web
npx tsc --noEmit
npx vitest run
npx playwright test
npm run build
```

Los tests del navegador arrancan la API en `127.0.0.1:8001` y la web en el puerto 5173 (configuración `webServer` de Playwright); requieren `npx playwright install chromium`. Se prueban 30 pares origen/destino sintéticos; esto **no reemplaza 30 viajes observados en campo**.

## Infraestructura

Copiar `.env.example` a `.env`, establecer claves y ejecutar `docker compose up --build db api`. Docker Desktop no estaba iniciado durante la implementación; PostgreSQL/PostGIS y OTP no se ejecutaron aquí. Las pruebas locales utilizaron SQLite, incluyendo copia y restauración.

Para OTP: colocar GTFS validado y extracto `.osm.pbf` en `otp/data`, construir el grafo con la versión seleccionada y luego iniciar el perfil `routing`. Mantener el grafo y el catálogo de rutas sincronizados antes de habilitar `DEMO_MODE=false`. La API impide servir la red sintética en ese modo.

## Referencias

- [GTFS](https://gtfs.org/es/getting-started/what-is-gtfs/)
- [Buenas prácticas GTFS Realtime](https://gtfs.org/documentation/realtime/realtime-best-practices/)
- [OpenTripPlanner](https://docs.opentripplanner.org/)
- [OpenFreeMap](https://openfreemap.org/quick_start/)
- [MTC: movilidad urbana de Juliaca](https://www.gob.pe/institucion/mtc/noticias/1337099-mtc-y-municipalidad-de-san-roman-fortalecen-coordinacion-para-mejorar-el-transporte-urbano-en-juliaca)
