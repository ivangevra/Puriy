# Juliaca se mueve: planificación de rutas con evidencia

**Actualización:** la revisión posterior del diagnóstico PDU amplía y precisa esta propuesta en [Plan detallado de movilidad con PDU](PLAN_DETALLADO_MOVILIDAD_PDU.md), acompañado por [Auditoría de datos y fuentes](AUDITORIA_PDU_MOVILIDAD.md). Usar esos documentos como referencia vigente para planificación; este archivo conserva el análisis inicial.

Análisis realizado el 18 de septiembre de 2026. Documento de propuesta; no implementa un optimizador ni certifica recorridos para pasajeros.

## Decisión recomendada

Presentar un **sistema de apoyo a decisiones que propone y compara recorridos, paraderos y frecuencias de micros**, combinando población por manzana, destinos, horarios, recorridos observados y condiciones de las calles. La salida debe explicar quién gana cobertura, cuánto cambia el viaje, cuántas unidades se necesitan y qué supuestos sostienen la propuesta.

Elegir el **Desafío 2: Innovación Tecnológica para la Movilidad Urbana Sostenible e Inseguridad**. La reestructuración de rutas del Desafío 1 es un beneficio de la solución, pero las bases piden elegir uno. Si el trabajo finalmente se concentra en una intervención vial y no en la herramienta tecnológica, convendría elegir el Desafío 1.

Nombre descriptivo sugerido: **Juliaca se mueve: rutas que conectan barrios y oportunidades**.

Mensaje para el jurado: «Combinamos dónde viven las personas, adónde necesitan viajar y cómo funcionan las calles para comparar mejoras de rutas y frecuencias antes de probarlas con los transportistas».

No se puede garantizar la máxima calificación. La estrategia es presentar evidencia clara en los cinco criterios, con un alcance realizable y limitaciones explícitas.

## Qué se verificó en los archivos

Se leyeron los KML de polígonos de `E:/TEST MCP/juliaca-censos` y los GeoJSON que carga `web/components/ManzanaMap.tsx`. Se compararon distrito, zona, manzana y población entre ambos formatos, sin diferencias en esos campos. Los GeoJSON de puntos y polígonos tienen los mismos recuentos y sumas.

| Distrito | Manzanas geométricas | Con población asociada | Sin población asociada | Suma de población asociada de 2017 |
|---|---:|---:|---:|---:|
| Juliaca | 5.204 | 2.473 | 2.731 | 194.987 |
| San Miguel | 1.725 | 728 | 997 | 51.924 |
| Ambos | 6.929 | 3.201 | 3.728 | 246.911 |

Estas sumas describen los registros de estos archivos: **no son una certificación de la población total distrital, ni población actual**. El 47,5% de las manzanas de Juliaca tiene población asociada; ese porcentaje mide cobertura de registros, no porcentaje de habitantes representados. No se detectaron inconsistencias entre hombres + mujeres y población en los registros KML con esos tres valores.

La captura compartida muestra 194.694 habitantes para Juliaca: son 293 menos que los archivos locales actuales. La causa no se estableció; comprobar versión de los datos publicados, filtros y caché antes de la exposición.

Los campos disponibles son distrito, zona, manzana, población 2017, hombres, mujeres, área, densidad y geometría. No equivalen a una encuesta de movilidad. Tampoco contienen por sí solos visitas a comercios, matrícula escolar, ocupación de vehículos ni flujos de viajes.

La interfaz afirma que las manzanas sin dato son de trazado posterior al censo. La ausencia de población, por sí sola, **no demuestra esa causa**: puede haber cambios de delimitación, diferencias de códigos o fallos de correspondencia. Usar «sin correspondencia poblacional verificada» hasta investigar cada caso. Nunca convertir esos nulos en cero para decidir cobertura.

La interfaz declara densidad calculada con población 2017 y área de cartografía actual. Es una combinación temporal que debe identificarse, y requiere revisar divisiones/fusiones de manzanas antes de extrapolar. El campo `shape_area` del WFS está en coordenadas geográficas: no utilizarlo directamente como metros cuadrados. Recalcular áreas en un sistema métrico adecuado, por ejemplo UTM 19S/WGS84 para esta zona, verificando el CRS original.

También existe un ZIP de tabulados de 2025. Se revisó su lista de archivos, no sus tablas internas. No se verificó que incluya población a nivel de manzana. El INEI anuncia resultados 2025 a nivel provincial y distrital [S5]; comprobar disponibilidad y compatibilidad territorial antes de actualizar. Un total distrital nuevo puede servir como control de un escenario, pero repartirlo entre manzanas no convierte esa estimación en censo observado.

## Qué datos añadir y para qué

| Capa | Variables mínimas | Fuente propuesta y validación | Decisión que permite |
|---|---|---|---|
| Población | Total, año, identificador territorial, calidad de correspondencia | INEI y archivos existentes; resolver nulos y cambios de límites | Localizar demanda residencial potencial |
| Colegios e institutos | Coordenadas de entrada, matrícula por turno, horas de entrada/salida, personal | MINEDU/ESCALE y confirmación con cada institución [S3, S4] | Refuerzos por horario y paraderos escolares |
| Comercio y mercados | Entradas, horarios, trabajadores, afluencia por franja y día | Catastro/licencias municipales, administradores y conteos de campo | Viajes por compras y trabajo, días de feria |
| Salud y servicios | Ubicación, entrada accesible, atención por hora, trabajadores | RENIPRESS para establecimientos; actividad mediante consulta y conteos [S6] | Acceso a servicios esenciales |
| Universidades, terminales y empleo | Entradas/salidas por hora, usuarios, trabajadores | Instituciones, operadores, encuestas y aforos | Destinos y viajes externos al área censal |
| Red vial y peatonal | Sentidos, giros, ancho útil, superficie, cruces, restricciones, obstáculos y anegamientos | OSM como base, municipalidad y recorrido de campo | Recorridos transitables por el vehículo real y acceso a pie |
| Transporte existente | Ida/vuelta, abordajes, horarios, intervalos observados, flota, capacidad, tarifas | Operadores y municipalidad; GPS autorizado y observación | Línea base comparable y restricciones operativas |
| Viajes y tráfico | Origen/destino agregado, motivo, hora, modo, ascensos/descensos, velocidad y colas | PMUS si se obtiene acceso, encuestas, aforos y GPS | Calibrar demanda y comprobar demoras |
| Accesibilidad y seguridad | Veredas, cruces, iluminación observada, accesibilidad, incidentes fechados y revisados | Auditoría de campo y fuentes oficiales disponibles | Priorizar actuaciones y detectar barreras |

Plaza Vea es un destino candidato aportado por el usuario, no un destino cuya afluencia se haya medido en este análisis. Lo mismo aplica a cualquier mercado o colegio sugerido. No identificar «los más visitados» mediante número de reseñas ni asignar el mismo peso a todos los puntos. Un colegio con varios servicios educativos en un mismo local requiere evitar duplicaciones al unir padrón y matrícula.

El MTC anunció el 22 de junio de 2026 la culminación del diagnóstico del PMUS Juliaca [S7]. Recomiendo solicitar inventario de rutas, aforos, matrices origen-destino y metodología. La existencia del diagnóstico no acredita que esos archivos estén disponibles para descarga o reutilización. Presentar la herramienta como apoyo al PMUS ofrece una vía de adopción concreta.

## Cómo propondría las rutas

1. **Preparar datos con trazabilidad.** Conservar fuente, fecha, unidad, estado observado/estimado y versión. Usar identificadores territoriales completos; «001E» no identifica una manzana de forma única. Conservar KML para intercambio y usar tablas espaciales para el cálculo.
2. **Construir la red de calles aptas.** Separar red peatonal y red vehicular; excluir tramos incompatibles con los micros. Calcular ida y regreso por separado. Registrar calles desconocidas como pendientes de revisión.
3. **Estimar viajes por horario.** La población representa posibles orígenes; colegios, trabajo, salud y comercio representan destinos. Estimar una matriz origen-destino por motivo, franja y tipo de día, calibrada con encuestas y ascensos/descensos. Sin esos datos, hablar de demanda potencial y escenarios de sensibilidad, no de pasajeros pronosticados.
4. **Generar alternativas factibles.** Comenzar con rutas observadas: pequeños desvíos, extensiones, refuerzos y conexiones. Crear candidatos mediante caminos sobre la red vial. No obligar a un solo micro a visitar todos los lugares importantes; podría generar viajes excesivamente largos.
5. **Seleccionar rutas y frecuencias.** Optimizar una combinación de tiempo de viaje, cobertura, transbordos y coste operativo, sujeta a flota disponible, capacidad por tramo/sentido, longitud o tiempo máximo y cobertura mínima de zonas prioritarias. Penalizar concentración improductiva de unidades; compartir una avenida no prueba por sí mismo una duplicación inútil.
6. **Reasignar y comparar viajes.** Evaluar cómo viajarían los usuarios con cada alternativa; actualizar cargas y repetir si aparecen sobrecargas. Presentar tres alternativas: mayor cobertura, menor tiempo y equilibrio entre ambos, con las mismas condiciones de evaluación.
7. **Revisión y piloto.** Transportistas, usuarios y técnicos revisan ambos sentidos y los abordajes. La propuesta puede necesitar aprobación de la autoridad antes de cambiar el servicio. Los escenarios no deben convertirse automáticamente en rutas públicas.

Esquema inicial de demanda, como hipótesis de trabajo:

`viajes potenciales = población × tasa de viajes por persona × proporción que usa transporte público`

La distribución entre destinos depende de actividad, horario y coste del viaje. Las tasas no están en el censo y deben estimarse o medirse. No sumar habitantes, densidad y visitas como si fueran magnitudes equivalentes: población y densidad contienen información relacionada y pueden duplicar el peso residencial.

Para evitar sesgos hacia zonas ya documentadas, mostrar por separado resultados sobre población conocida y sobre escenarios de población faltante. Un reparto espacial uniforme dentro de una manzana también es un supuesto: usar accesos residenciales cuando estén disponibles y analizar sensibilidad en manzanas grandes.

## Tecnología recomendada e integración

| Componente | Papel propuesto | Alcance |
|---|---|---|
| React/TypeScript + MapLibre | Capas, selección de área y comparación de escenarios | Aprovechar la interfaz existente |
| PostgreSQL/PostGIS | Manzanas, destinos, calles, paraderos y versiones | Cálculos y almacenamiento espacial |
| FastAPI + Python | Calidad de datos, demanda, generación de candidatos y coordinación de cálculos | Extender el backend existente |
| OR-Tools, con modelo MIP o CP-SAT | Selección de candidatos, intervalos y asignación de recursos bajo restricciones | Modelo propio que se debe formular y validar [S2] |
| OpenTripPlanner + GTFS + OSM | Evaluar viajes de pasajeros sobre cada red propuesta | Planificador multimodal; no asumir que diseña automáticamente la red de micros [S1] |
| SUMO | Evaluación posterior de un corredor con tráfico, intersecciones y transporte público | Solo cuando haya aforos y calibración suficientes [S8] |

La formulación de rutas de transporte público no debe sustituirse sin más por un ejemplo de reparto de paquetes/VRP: aquí importan servicio compartido, horarios, cargas por tramo y transbordos. Tampoco se debe presentar una solución del optimizador como óptimo global si solo exploró un conjunto limitado de candidatos.

La documentación local describe ajuste vial con OSRM de automóvil, que no certifica restricciones específicas para micros. También describe una simulación visual de vehículos y semáforos: no equivale a un modelo calibrado de congestión. Revisar las restricciones reales antes de reutilizar ese trazado en el optimizador. El README documenta un adaptador OTP aún pendiente de prueba contra servidor real; comprobar su estado durante la implementación.

No es necesario entrenar una red neuronal para el primer piloto. La optimización y las reglas explícitas permiten explicar cada recomendación. Un modelo de lenguaje puede ayudar a redactar explicaciones, pero no debe inventar afluencias, restricciones viales ni resultados.

Módulos de datos sugeridos: `census_blocks`, `activity_places`, `street_edges`, `boarding_points`, `observed_services`, `od_estimates`, `scenarios`, `scenario_results`. Todas las estimaciones deben conservar sus supuestos y la versión de datos que las produjo.

## Qué mostrar en la demostración

Un nuevo módulo «Proponer y comparar rutas», con un recorrido sencillo:

1. Elegir zona y horario de análisis.
2. Ver población conocida, áreas sin dato y destinos verificados.
3. Elegir red base y límites: unidades disponibles, capacidad, caminata y coste máximo.
4. Generar tres alternativas con estados visibles: factible, pendiente de revisión o descartada.
5. Comparar mapa de ida/vuelta, abordajes, frecuencia, vehículos necesarios y ganadores/perdedores por zona.
6. Abrir «Por qué se propone»: fuentes, supuestos, restricciones y sensibilidad a demanda baja/media/alta.
7. Exportar informe y trazados para revisión técnica.

Cada alternativa debe tener una ficha que pueda decir: «Añade cobertura residencial en este sector; reduce la caminata a estos destinos; aumenta el ciclo y requiere más flota». La explicación debe derivarse del cálculo. Sin línea base observada, la comparación es una demostración hipotética, no un impacto real acreditado.

Indicadores recomendados:

| Indicador | Medición y cautela |
|---|---|
| Cobertura residencial | Habitantes únicos con acceso a un abordaje dentro de una distancia peatonal configurada, por ejemplo 400 m como supuesto a validar; mostrar también 300 y 500 m. No usar solo círculos ni sumar coberturas solapadas |
| Tiempo completo | Caminata + espera + tiempo en micro + transbordos + caminata final, ponderado por viajes; informar mediana y dispersión |
| Acceso a oportunidades | Población que puede llegar a determinados servicios en un umbral temporal definido y justificado |
| Capacidad y flota | Pasajeros por tramo/hora/sentido frente a capacidad ofertada; unidades y vehículo-km necesarios |
| Equidad | Sectores que mejoran, quedan igual o empeoran; incluir periferias y zonas con datos incompletos |
| Congestión | Demoras y colas observadas o simulación calibrada; una mejor cobertura por sí sola no acredita menos tráfico |

Ejemplo únicamente didáctico: si un ciclo completo tarda 80 minutos y salen unidades cada 10 minutos, hacen falta aproximadamente 8 unidades en circulación, antes de añadir reservas o descansos no incluidos en el ciclo. Si la capacidad fuese 30 personas por unidad, la oferta nominal sería 180 plazas/hora/sentido. Son supuestos ilustrativos, no datos de Juliaca. La espera de medio intervalo solo es una aproximación con servicio regular y llegadas de pasajeros compatibles con ese supuesto.

## Piloto y evaluación

Para la ideatón, acotar la demostración a **un corredor, 2-3 rutas y 10-20 destinos**. Es un alcance propuesto, no trabajo ya ejecutado. Evitar prometer una reorganización completa de Juliaca antes de tener datos.

Después, piloto sugerido de 4-6 semanas, sujeto a acceso a datos y coordinación:

- Semana 1: elegir corredor con operadores; verificar rutas, abordajes, destinos y calidad censal.
- Semana 2: observar varios días y franjas, incluyendo horas punta, valle y un día comercial relevante; recoger tiempos, frecuencias, cargas y viajes. La cantidad final de encuestas depende de la variabilidad y precisión buscada, no de una cifra arbitraria.
- Semanas 3-4: calibrar, reservar observaciones para validación independiente y comparar candidatos con iguales supuestos de demanda y flota.
- Semanas 5-6: si se autoriza, ensayo operativo y evaluación antes/después con días comparables; registrar obras, lluvias, ferias u otros cambios de contexto.

No extrapolar un muestreo corto a toda la ciudad. Separar mejoras estimadas de mejoras medidas. Para emisiones, se necesitan datos de flota, combustible y factores documentados; vehículo-km es un indicador operativo, no una medición de CO2.

Presupuesto a presentar: horas del equipo por rol + jornadas de campo y movilidad + infraestructura mensual + verificación y mantenimiento. Valorar también el trabajo aportado voluntariamente. Obtener cotizaciones antes de publicar un importe; software de código abierto no elimina costes operativos. Responsable propuesto: equipo mantiene la plataforma; operadores aportan operación; municipalidad revisa planificación y eventual implementación. Estas son funciones propuestas, no alianzas confirmadas.

## Cómo responder a los cinco criterios

Las bases, sección IX, asignan 20% a cada criterio, con calificación de 1 a 5. En empate se prioriza Impacto y luego Innovación. No exigen prototipo, aunque lo consideran deseable.

| Criterio | Evidencia para aspirar a una evaluación alta |
|---|---|
| Innovación | Comparación explicable de rutas y frecuencias que integra barrios, destinos y restricciones locales; mostrar qué decisión permite que el mapa actual no permite |
| Impacto | Línea base, población efectivamente cubierta, tiempos y zonas ganadoras/perdedoras; separar hipótesis de resultados observados |
| Viabilidad | Piloto pequeño, flota compatible, datos conseguibles, coste desglosado y responsabilidades; distinguir acuerdos logrados de acuerdos por gestionar |
| Claridad | Un problema, una solución, una demostración, un plan. Relacionar cada capa de datos con una decisión concreta |
| Trabajo en equipo y exposición | Los tres miembros participan y dominan datos, tecnología y operación; respuestas ensayadas sobre vacíos censales, costes y validación |

Guion sugerido para los cinco minutos: 40 s problema; 45 s evidencia y sus límites; 85 s demostración; 60 s comparación e impacto; 45 s piloto, coste y responsables; 25 s cierre. Total: 300 s. No sobrecargarlo con una lista de tecnologías.

Según las bases aportadas, el cierre es el **20 de septiembre de 2026 a las 23:59**, y la fase presencial el **25 de septiembre desde las 08:00**. La organización puede modificar fechas; no se comprobó una convocatoria posterior. La sección VI pide tres integrantes de 15-29 años y autorización para menores. La sección 5.2 dice «3 personas máximo», mientras la VI exige tres: preparar un equipo de tres cumple ambas redacciones. Revisar anexos antes de enviar. Leer las bases no autoriza a enviar la inscripción; este análisis no realizó envíos.

## Otros usos útiles de la población

1. **Ubicación de paraderos:** aumentar acceso a pie y priorizar revisión de cruces y veredas.
2. **Refuerzos por franja:** combinar hogares y matrícula/actividad para ajustar frecuencias, manteniendo rutas comprensibles.
3. **Acceso equitativo a salud y educación:** identificar barrios con viajes largos a servicios esenciales.
4. **Priorización de cruces y entorno escolar:** combinar residentes, escolares y exposición peatonal con aforos; la población sola no justifica instalar un semáforo.
5. **Planificación del levantamiento de datos:** localizar vacíos censales y barrios cuya demanda debe observarse antes de decidir.

Los datos de hombres y mujeres sirven para describir cobertura y orientar investigación de barreras. No permiten inferir inseguridad, motivos de viaje ni demanda diferenciada sin encuestas. Recoger viajes de forma agregada y evitar publicar domicilios o recorridos personales.

Para mantener claridad en el concurso, integrar cobertura, frecuencias y acceso a servicios alrededor de la misma propuesta. Dejar control semafórico, predicción de inseguridad y gemelo digital de toda la ciudad para investigación posterior con datos adecuados.

## Fuentes y alcance de la revisión

- Bases locales: `C:/Users/ivang/Downloads/BASES_IDEATÓN POR EL TRANSPORTE URBANO_ JULIACA.pdf`; texto de las 9 páginas, revisión visual de las páginas 2-6.
- KML locales: `juliaca_manzanas_poligonos.kml` y `san_miguel_manzanas_poligonos.kml`, en `E:/TEST MCP/juliaca-censos`.
- Datos de aplicación: `web/public/data/manzanas-poligonos.geojson` y `web/public/data/manzanas-puntos.geojson`.
- Integración consultada: `web/components/ManzanaMap.tsx`, `README.md`, `PRODUCT.md`, `compose.yaml`, dependencias y `docs/EDITOR_Y_DESAFIOS.md`. No se ejecutó una prueba funcional del sitio ni una auditoría exhaustiva del backend. El proyecto no figura en el índice de código disponible; se usó lectura directa.
- [S1: OpenTripPlanner](https://www.opentripplanner.org/).
- [S2: OR-Tools, optimización entera](https://developers.google.com/optimization/mip).
- [S3: MINEDU, información espacial](https://sigmed.minedu.gob.pe/descargas/).
- [S4: ESCALE, Censo Escolar y padrón](https://escale.minedu.gob.pe/censo-escolar).
- [S5: INEI, Censos Nacionales 2025](https://www.gob.pe/institucion/inei/campa%C3%B1as/92656-los-censos-nacionales-2025-ya-estan-en-marcha).
- [S6: SUSALUD, consulta RENIPRESS](https://www.gob.pe/institucion/susalud/campa%C3%B1as/95866-consulta-el-renipress).
- [S7: MTC, diagnóstico PMUS Juliaca, 22/06/2026](https://www.gob.pe/institucion/mtc/noticias/1410015-promovilidad-culmina-diagnostico-de-movilidad-de-juliaca-como-parte-de-la-formulacion-del-pmus).
- [S8: SUMO, documentación](https://sumo.dlr.de/docs/).

Fuentes web consultadas el 18/09/2026. Para S5 y S7 se obtuvo información del resultado indexado; la apertura directa devolvió error 418. No se descargó el diagnóstico PMUS, no se verificó un ranking de destinos locales ni se calcularon todavía rutas nuevas.
