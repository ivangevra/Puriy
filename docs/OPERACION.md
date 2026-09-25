# Preparar el piloto real

## Inventario y GPS

Solicitar a los operadores el proveedor, documentación API, permisos y condiciones de uso, número de vehículos, correspondencia ruta/sentido/unidad, periodicidad, zona horaria, precisión, históricos y posibles interrupciones. No transmitir nombres de conductores ni datos de pasajeros.

Contrato normalizado por posición: `vehicle_id`, `route_id`, `direction` (0/1), `lat`, `lon`, `timestamp` ISO con zona, `source`, `simulated`. Ingestar por `POST /api/admin/gps/positions` con autorización de administrador. `POST /api/admin/gps/sync` consulta el endpoint configurado en el servidor. No programar consultas hasta conocer límites del proveedor. No se copian credenciales al cliente.

## Trabajo de campo

Seleccionar 3–5 rutas con ambos sentidos, registrar trazos GPS en servicio y puntos de abordaje por observación. Separar autorizado y observado. Levantar días laborables y fin de semana, hora punta y valle; anotar duración, clima/obras/incidencias, observadores y proporción de flota cubierta. Repetir conteos para controlar duplicados. Las encuestas no recogen nombres ni ubicaciones precisas de hogares.

Validar al menos 30 viajes reales que cubran ida/vuelta, transbordos, extremos, servicios terminados y caminatas problemáticas. Comparar recomendación con trayecto observado y documentar errores. Para ETA, separar datos de calibración y evaluación y reportar error absoluto mediano y percentil 90; no activar una promesa precisa sin resultados suficientes.

## Costos a medir

Registrar usuarios activos, consultas de viaje, posiciones por minuto, tamaño de históricos, memoria OTP, CPU, almacenamiento y egreso. Fórmula GPS: vehículos × 86 400 / intervalo en segundos × días activos; usar horas de operación reales al presupuestar. Cotizar API/DB, copias y recuperación, mapas, servidor OTP y dominio con consumos del piloto. No se contrataron servicios de pago ni se fijaron precios ficticios.

## Respaldo y monitoreo

SQLite local: usar la API `sqlite3.Connection.backup`, no copiar un archivo con transacciones activas. PostgreSQL: `pg_dump` diario cifrado fuera del servidor; retención operativa inicial 7 diarios y 4 semanales. Ensayar restauración en una base separada y verificar catálogo, versiones, reportes, escenarios y observaciones antes de cualquier conmutación.

Monitorear `/api/health`, errores del planificador, GPS por proveedor y porcentaje de posiciones con más de 90 s. Revisar rutas sin verificación y reportes pendientes cada jornada. GPS histórico necesita política de retención y purga antes de operar a escala; los registros de prueba actuales no incorporan borrado automático.

## Publicar

El sitio alojado será una demo hasta configurar `VITE_API_BASE_URL` con HTTPS. API, PostgreSQL y OTP deben instalarse aparte. Restringir CORS a los orígenes autorizados, colocar rate limiting y límite de cuerpo en el proxy, usar claves administrativas aleatorias y proteger copias. Mantener acceso privado mientras los datos no hayan superado verificación. Una propuesta de rutas nunca se publica como servicio sin revisión y autorización correspondientes.
