# Laboratorio de movilidad: implementación y uso

Implementado el 18 de septiembre de 2026 sobre el proyecto existente. Acceso: **Administración → Laboratorio de movilidad**. En desarrollo también se puede abrir `http://localhost:5173/?panel=movilidad`; conserva la pantalla de acceso administrativo.

## Qué funciona

| Área del plan | Implementación disponible |
|---|---|
| Población | Lectura de las 6.929 manzanas del GeoJSON existente, 246.911 habitantes asociados al Censo 2017 y 3.728 manzanas sin población. Deduplicación por distrito, zona y manzana; conflictos conservados como desconocidos. |
| PDU y calidad | Catálogo de 40 registros de líneas/flota, 17 atractores, 5 calendarios y 23 evidencias con páginas y límites de uso. Se conservan 1.963 vehículos impresos y 1.969 calculados. |
| Destinos | Registro y edición de entradas, búsqueda geográfica, selección en mapa, categoría, grupo/complejo, días, horario, fuente y validación. Las entradas de un mismo grupo no multiplican el número de oportunidades. |
| Calendario | Afectaciones vinculadas a una línea, día y ventana. Permite minutos adicionales al ciclo o suspensión de la línea. Pendientes excluidos; efectos nuevos marcados como supuestos. |
| Comparación | Recorrido base y alternativo, ambos sentidos, flota activa/reserva, capacidad, velocidad comercial, regulación en cabeceras, intervalos, costes, carga crítica opcional y tarifa. |
| Acceso | Población conocida única próxima a abordajes; población que alcanza al menos un destino abierto; mediana y P90 del tiempo al destino más cercano; desconexiones, ganancias y pérdidas por zona. |
| Alternativas | Evaluación de intervalos discretos compatibles con flota/capacidad. Generador de desvíos acotados hacia destinos o manzanas conocidas sin proximidad, calculando ida y vuelta sobre calles. |
| Abordajes | Registro explícito por sentido y exclusión de puntos intermedios en la propuesta. Los vértices del editor no se convierten automáticamente en paraderos. |
| Campo | Conteos agregados antes/después, fecha, ventana, unidades, ascensos, ciclo e intervalos; media y variabilidad. Se puede llevar un intervalo observado al escenario. |
| Trazabilidad | Estudios con parámetros, versión del motor, referencia reproducible y resultado. Exportación completa con los datos de entrada y resultados por manzana; respaldo/importación del laboratorio. |
| Persistencia | Navegador sin API; almacenamiento privado en SQLite/PostgreSQL mediante la API existente cuando está conectada. Revisión incremental y rechazo de escrituras obsoletas. |

## Recorrido recomendado

1. En **Fuentes y calidad**, revisar cobertura censal y la discrepancia de flota. El catálogo documental no carga 40 rutas inventadas en el mapa de pasajeros.
2. En **Destinos**, seleccionar una entrada del PDU o añadir un establecimiento. Ubicar su acceso, completar horario/días y documentar la revisión. Los registros sin ubicación o sin horario revisado no producen tiempos de acceso.
3. En **Comparar propuestas**, elegir una ruta existente o un borrador con ida y vuelta. Las rutas sintéticas permanecen identificadas como demostración. Si el borrador no tiene abordajes, registrarlos en el desplegable correspondiente.
4. Sustituir los valores iniciales ilustrativos por recursos y observaciones del piloto. Comparar primero el mismo trazado con otro intervalo. La velocidad comercial incluye detenciones intermedias; la regulación se añade únicamente para cabeceras.
5. Calcular. Revisar unidades necesarias, intervalo sostenible, plazas por hora, coste y zonas que pierden acceso. Si se desea, generar un desvío hacia un destino ubicado o una manzana candidata y compararlo con la misma flota. Revisar su geometría en el editor.
6. Guardar el estudio y exportar el paquete reproducible para revisión técnica. El estado «Piloto propuesto» es un estado del estudio, no una autorización de circulación. Ninguna de estas acciones publica la alternativa a pasajeros.

Los borradores generados se integran al almacén del editor existente y se incluyen en el respaldo/servidor privado del laboratorio; sus abordajes candidatos permanecen en el laboratorio. La geometría puede necesitar nuevas paradas, revisión de cabeceras y restricciones para micros. No se promete que todo desvío mejore la base.

## Cálculo y límites que deben mantenerse visibles

- El ciclo es `km de ida y vuelta / velocidad comercial × 60 + regulación + demoras del escenario`.
- Las unidades necesarias para el intervalo solicitado son `ceil(ciclo / intervalo)`. La reserva se descuenta de la flota asignada. Si no alcanza, el intervalo sostenible aumenta; no se crean unidades ficticias.
- La oferta por hora/sentido es `60 / intervalo sostenible × capacidad`. La carga crítica opcional es un dato que aporta el usuario, no ascensos extrapolados ni demanda inferida del censo. Si hay sobrecarga, el cálculo no estima colas adicionales y advierte la inviabilidad.
- El coste/hora combina vehículo-km por hora × coste/km y unidades en servicio × coste/unidad-hora. Evitar contar un mismo coste en ambos parámetros. Si ambos son cero, se muestra «Sin costes».
- El tiempo de acceso compara caminar directamente o caminar al abordaje + medio intervalo + viaje directo en el sentido correcto + caminata final. El destino debe seguir abierto al llegar. La espera supone servicio regular y llegadas aleatorias.
- Solo se compara una línea base con una alternativa en cada estudio. No hay asignación de demanda, optimización de la red completa, transbordos, congestión dinámica, colas de embarque ni simulación de emisiones.
- Mediana y P90 se ponderan por población conocida con conexión. Las personas sin conexión permanecen visibles en un indicador separado; no se presentan esos promedios como viajes observados de pasajeros.
- El calendario es una instantánea de la franja seleccionada. No representa cambios de cierre durante el viaje ni primeras/últimas salidas. Las afectaciones de la base se heredan conservadoramente por su alternativa: un nuevo identificador no demuestra que un desvío las evite.
- La generación de geometría reutiliza el motor de calles existente, con perfil de automóvil. Conserva cabeceras y referencias del trazado, pero exige revisar giros, ancho y transitabilidad para micros. Las peticiones se cancelan y no se sustituyen errores del proveedor por rectas ficticias.

### Dos métodos de acceso

**Proximidad en línea recta:** funciona inmediatamente con el censo y los abordajes. Es exploratoria, medida desde centroides; no demuestra una conexión a pie ni resuelve ríos, muros, cruces o accesibilidad universal. El mapa y el resultado lo indican.

**Conexiones peatonales importadas:** funciona con longitudes dirigidas previamente calculadas/verificadas. Un enlace ausente sigue desconectado, sin usar una recta de respaldo. En el desplegable de abordajes se exportan los puntos y la plantilla:

```json
{
  "source": "Red peatonal y método de cálculo, versión y responsable",
  "date": "2026-09-18",
  "pointFingerprint": "conservar la referencia exportada",
  "links": [
    {"from": "block:DISTRITO:ZONA:MANZANA", "to": "stop:ID", "meters": 250},
    {"from": "stop:ID", "to": "place:ID", "meters": 100},
    {"from": "block:DISTRITO:ZONA:MANZANA", "to": "place:ID", "meters": 300}
  ]
}
```

Los números del ejemplo describen el formato, no mediciones. Los enlaces deben proceder de un perfil peatonal, con accesos y barreras revisados. Los enlaces inversos no se infieren. La referencia de puntos impide reutilizar longitudes antiguas si se mueve un destino, abordaje o centroide. El piloto admite hasta 30.000 enlaces, sujeto además al límite total de archivo de 1,9 MB.

## Arquitectura

- `web/lib/pdu-catalog.json`: semilla documental reproducible desde la auditoría mediante `python web/scripts/build-pdu-catalog.py`.
- `web/lib/lab-types.ts` y `lab-data.ts`: contrato, validadores, adaptación de borradores y carga censal.
- `web/lib/lab-engine.ts`: funciones deterministas de acceso, flota, calendario y comparación.
- `web/lib/lab-worker.ts`: cálculo fuera del hilo de interfaz, progreso y cancelación por terminación del trabajador. El resultado queda invalidado al modificar sus parámetros.
- `web/lib/lab-candidates.ts`: generación de desvíos en ambos sentidos y conexión con el editor.
- `web/lib/lab-storage.ts`: persistencia local/API y comprobación de revisión.
- `web/components/MobilityLab.tsx` y `Lab*.tsx`: flujo integrado de administración, usando el mapa y los tokens existentes.
- `backend/lab.py`: modelos de entrada y escritura atómica con comparación de revisión. `GET/POST /api/admin/lab/state` requiere la misma autorización administrativa que el resto de la API.

No se agregan dependencias de ejecución. La búsqueda de intervalos es exhaustiva sobre un conjunto pequeño de candidatos y se identifica así. **OR-Tools, demanda OD calibrada, evaluación de transbordos con OTP y microsimulación SUMO no se presentan como implementados por este laboratorio.** Esas etapas del plan requieren formulación y datos adicionales; el comparador actual funciona sin simular que ya existen.

Las referencias de resultados son identificadores de reproducibilidad, no firmas criptográficas. El paquete completo exportado permite conservar los datos usados. Las fichas guardadas en el laboratorio son resúmenes históricos y se recalculan si cambia la red.

## Guardado y operación

- Sin `VITE_API_BASE_URL`, los cambios pertenecen al navegador/origen actual. Exportar un respaldo antes de cambiar de dispositivo o dominio. Los escenarios no se comparten solos entre dispositivos.
- Con API, el catálogo y los estudios se guardan en el registro privado `mobility-lab`; SQLite sirve al desarrollo y PostgreSQL a la instalación configurada. La API rechaza revisiones antiguas con HTTP 409 y entradas inconsistentes con HTTP 422.
- El archivo Docker de la API incluye también la semilla PDU. Reiniciar/reconstruir la API al desplegar el nuevo código.
- La actualización del laboratorio no modifica `network`, las publicaciones ni los servicios de pasajeros.
- El respaldo tiene un máximo de 1,9 MB, 20 fichas de estudio y 20 alternativas generadas. Exportar y archivar fichas para liberar espacio; los resultados detallados por manzana se descargan aparte. Los borradores ajenos al laboratorio conservan el comportamiento del editor existente.
- Las cuotas del navegador o errores de red se muestran como errores de guardado; no se anuncia un guardado exitoso antes de confirmarlo.

## Validación realizada

Comprobación de la entrega: TypeScript y lint de los módulos nuevos sin errores; compilación de producción correcta; 86 pruebas de lógica y 46 pruebas API aprobadas. La compilación conserva avisos del scaffold sobre configuración y tamaño de paquetes, sin impedir la salida.

Pruebas unitarias del censo real y del motor: nulos/duplicados, flota/reserva, capacidad/costes, destinos duplicados/cerrados, tiempos de llegada, caminos dirigidos y su versión, sentidos inválidos, ausencia de abordajes, calendario, suspensión y herencia de afectaciones.

Pruebas API: acceso protegido, persistencia, conflictos de revisión, rechazo atómico de datos inválidos y aislamiento respecto de la red pública.

Pruebas de navegador: cálculo real mediante Web Worker, guardado/recarga, exportación, edición de destino y calendario, observaciones, archivo inválido, generación en ambos sentidos con proveedor de calles controlado en la prueba, aislamiento de pasajeros, escritorio/móvil y temas. La prueba con proveedor controlado comprueba la integración; no certifica la disponibilidad externa ni la transitabilidad real de un micro.

## Datos que siguen haciendo falta

Geometrías vigentes de las líneas reales, capacidad habilitada y vehículos activos por turno, tiempos observados, entradas/horarios de destinos y colegios, carga por tramo, demanda OD y tramos/ventanas de las ferias. El PDU inicializa el catálogo; no contiene por sí solo toda esa información. Caracoto no se incorpora a las sumas censales de Juliaca y San Miguel sin un conjunto compatible.
