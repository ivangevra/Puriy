# Editor de recorridos y siguientes entregas

## Lo disponible

En la navegación, abrir **Dibujar**. Crear un recorrido y dejar activo **Seguir calles**. Marcar puntos de paso cerca de la vía; el editor calcula la conexión entre ellos. Ida y vuelta se calculan por separado. **Trazado libre** es una alternativa explícita para propuestas sin ajuste vial. Cada sentido conserva su propia geometría. Para corregir un punto, seleccionarlo en la lista y pulsar su nueva ubicación en el mapa. Hay eliminación, deshacer, rehacer y entrada numérica de coordenadas. El modo Explorar mapa pausa el dibujo.

Los borradores se guardan automáticamente en el navegador. No se incorporan al planificador ni a la red publicada. Descargar **Copia JSON** para respaldo y reimportación. **GeoJSON · ambos** se habilita cuando los dos sentidos tienen geometría calculada vigente (o al menos dos puntos en modo libre); sirve para llevar las líneas a una herramienta geográfica. No es un archivo GTFS ni incluye paraderos verificados. No se sincroniza todavía entre dispositivos.

La copia invertida solo está habilitada sobre un sentido vacío: copia puntos de paso y, en modo calles, solicita un cálculo independiente para el regreso. No invierte simplemente la geometría vial calculada. Las marcas del dibujo son vértices geométricos, no puntos de abordaje.

En las fichas, el selector Ida/Vuelta ahora controla también el mapa. La ida se representa continua, la vuelta discontinua; chevrones de 12 píxeles muestran el sentido en la ruta seleccionada, sin aumentar con el zoom. La vista general evita marcadores de dirección innecesarios. Los recorridos pueden verse juntos o por separado. El encuadre considera ambas geometrías. El planificador mantiene el sentido que corresponde al itinerario.

## Evidencia que puede acompañar cada borrador

Fuente y fecha del trazado, condiciones de abordaje y accesibilidad, puntos críticos e hipótesis de mejora. La lista de revisión es un registro personal de trabajo: marcarla no acredita autorización, accesibilidad ni seguridad. Las advertencias identifican sentidos incompletos, falta de fuente/fecha y segmentos mayores de 1,5 km que conviene revisar.

## Prioridades para los dos desafíos

| Prioridad | Próxima herramienta | Cómo demostrar su utilidad |
|---|---|---|
| 1 | Validar el ajuste vial implementado y las restricciones específicas para micros | Comprobar en campo ambos sentidos de 3–5 rutas. Mantener geometría manual, observada y autorizada separadas. Un ajuste automático también necesita revisión. |
| 1 | Puntos de abordaje por sentido | Fichas con foto, fuente, fecha, acceso peatonal y condiciones de espera. Distinguir paradero oficial de punto habitual. Un vértice del dibujo no debe convertirse automáticamente en paradero. |
| 2 | Revisión y publicación con historial | Subir borradores al servidor, comparar versiones y aprobar una copia. Conservar la red anterior y la identidad de quien revisó. Publicar solo después de verificar los datos necesarios para viajar. |
| 2 | Comparación de propuestas usando los trazados dibujados | Evaluar los mismos 30 viajes de referencia sobre red base y propuesta: caminata, tiempo, conexiones perdidas y transbordos. Incluir viajes en ambos sentidos, fuera de horario y fuera de cobertura. |
| 2 | Congestión y regularidad por tramo y horario | Combinar aforos de duración conocida y GPS autorizado. Medir velocidad, tiempo y variabilidad; la coincidencia de rutas por sí sola no prueba congestión. |
| 3 | Llegadas con incertidumbre | Asociar vehículo, ruta y sentido, reunir históricos y comparar predicción con llegada observada. Con GPS desactualizado, retirar la predicción. |
| 3 | Accesibilidad e incidentes revisados | Registrar cruces, veredas, iluminación y acceso a la unidad. Moderar reportes y proteger identidades. No etiquetar rutas como seguras por ausencia de reportes. |
| 3 | Seguimiento de impacto del piloto | Repetir los mismos conteos y viajes antes/después. Mostrar tamaño de muestra, fechas, cambios de contexto y límites. Estimar emisiones únicamente con datos de flota y una metodología documentada. |

## Propuesta para presentar el proyecto

Mostrar un viaje de pasajero, dibujar una alternativa de ida y vuelta, explicar la hipótesis y mostrar qué mediciones la confirmarían. Separar claramente lo implementado, lo observado y lo pendiente de validar. Para planificación vial, la evidencia central son los cambios medidos de cobertura y regularidad; para innovación sostenible, la calidad de información al pasajero, accesibilidad y reducción de barreras de uso.

## Alcance técnico actual

El editor ajusta a calles mediante OSRM, con un perfil de conducción de automóvil. No valida restricciones específicas de micros ni publica servicios. El perfil y la cartografía pueden contener limitaciones que requieren revisión de campo. La exportación conserva esos límites y el estado de borrador. Los datos de ejemplo originales siguen protegidos. JSON local tiene validación de versión, tipos, coordenadas y un límite de 1000 vértices por sentido.

## Ajuste vial implementado

Elegir calzada permite orientar la salida y llegada según los puntos del trazo (tolerancia de 75 grados), o buscar por cercanía. Los cruces intermedios no tienen una orientación forzada. Se solicitan maniobras y se permite al motor evaluar cambios de sentido disponibles en su red, sin forzar continuar recto en todos los puntos. Ninguna opción habilita circular en contra de las restricciones registradas. La orientación inferida de los puntos no certifica el sentido legal de una calle.

Calles y sentido muestra nombres de vías, orientación inicial y distancia por tramo. Marca para revisión los cambios de sentido y rodeos mayores que el doble de la distancia directa y al menos 250 m adicionales. Es una heurística de revisión, no una declaración de error vial. Reubicar punto selecciona el destino del tramo para corregirlo con el próximo clic en el mapa. Cambiar el ajuste invalida los cálculos guardados; los borradores anteriores se recalculan sin perder sus puntos.

Se consulta [OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/) con coordenadas ordenadas, geometría GeoJSON completa y radio máximo de búsqueda de 100 m por punto. Hasta 80 puntos de paso por sentido. Las llamadas se agrupan tras 600 ms sin cambios y se espacian al menos 1,1 segundos. Solicitudes antiguas se cancelan y sus respuestas nunca reemplazan puntos posteriores. No se dibuja una recta como sustituto ante errores. Hay mensajes de puntos alejados, conexión inexistente, servicio caído y reintento.

Puntos editables y geometría calculada se guardan por separado, con firma de los puntos, proveedor y fecha. Mover un punto invalida el ajuste anterior inmediatamente y bloquea exportación hasta recalcular. Exportar conserva la geometría vial completa. Las copias anteriores se pueden abrir y ajustar; el modo libre sigue disponible explícitamente. La fuente del cálculo no sustituye la fuente del operador.

La variable pública `VITE_ROAD_ROUTING_URL` permite usar un servidor compatible propio; debe configurarse en el frontend sin credenciales. Si está vacía se utiliza `https://router.project-osrm.org`, un servicio externo de demostración que requiere internet y puede no estar disponible. Los puntos marcados se transmiten al servicio. Para operación sostenida, desplegar o contratar una instancia y validar cobertura y perfil.


## Publicar una propuesta en el mapa local

1. En Dibujar, nombra el recorrido y completa al menos un sentido. Si comenzaste el otro, complétalo o elimina sus puntos.
2. Pulsa Publicar en mi mapa. Se crea una copia independiente y se abre el mapa principal con ella seleccionada.
3. En la franja Propuestas locales puedes seleccionar u ocultar los recorridos publicados.
4. Vuelve al borrador para actualizar la publicación o retirarla. Editar el borrador por sí solo no modifica la copia publicada.

Las copias viven en `juliaca-published-map-v1` del almacenamiento local. No son servicios de pasajeros ni publicaciones compartidas con otros dispositivos. El planificador local incluye la red base y las propuestas publicadas como opciones experimentales claramente identificadas. Los vértices de las propuestas no se agregan como paraderos. La integración de publicación compartida requerirá API administrativa, almacenamiento y revisión de metadatos del servicio.

## Inventario de semáforos

Semáforos permite añadir un punto con el mapa o coordenadas, registrar acceso, estado observado, fuente, fecha, duraciones y observaciones, editarlo, eliminarlo y exportar GeoJSON. Los registros se guardan en `juliaca-signals-v1`. Los marcadores están disponibles también en el mapa principal, donde pueden ocultarse. Son puntos de inventario, sin fase actual ni control físico del equipo.

Estudios sugeridos: aforos y colas por acceso; tiempos de cruce peatonal y rampas; evaluación de coordinación semafórica con mediciones; relación entre demoras observadas y propuestas de recorrido. Cualquier modificación física requiere revisión técnica y coordinación con la autoridad competente.


## Simulación visual y caminata

Guarda las tres duraciones del semáforo para animar el marcador: rojo, verde y ámbar. El guardado reinicia el ciclo y el panel muestra fase y segundos restantes. Vacíos, ciclo total cero o avería dejan las luces apagadas. Es una simulación local sin telemetría del equipo.

Simular un micro muestra el SVG frontal minimalista. La guía de viaje incorpora caminata hasta el abordaje, micro y llegada, con distancias aproximadas explícitas para la demostración. Sigue pendiente integrar y validar recorridos peatonales reales por calles y cruces antes de ofrecer navegación de campo.


### Planificación local y caminatas por calles

La preferencia inicial es **Abordaje más cercano**: ordena por metros peatonales hasta el primer abordaje; no por distancia total del viaje ni cercanía visual a una línea. Se mantienen las preferencias de menor tiempo, caminata total y transbordos. Las propuestas publicadas participan aunque se oculte su capa; la propuesta elegida vuelve a mostrarse. Su horario, tarifa y tiempo total se muestran por verificar.

Se calcula acceso y salida con el perfil peatonal de OSRM/FOSSGIS sobre OpenStreetMap, sin sustituir errores por líneas rectas. Las huellas siguen la geometría obtenida; el mapa vectorial las coloca sobre la línea durante el zoom. Los pasos muestran calles disponibles. Las coordenadas de origen/destino y accesos se envían a ese servicio; la interfaz lo informa. Se usa caché de sesión y cola de solicitudes con separación de 1050 ms. Para producción configurar `VITE_FOOT_ROUTING_URL` con una instancia de perfil peatonal dimensionada al uso; el servidor público es para el piloto, no tráfico masivo.

Alcance: candidatos de la red base a 650 m en línea recta, filtrados hasta 1500 m por caminos; propuestas con abordaje/bajada proyectados sobre su geometría respetando el orden de ida o vuelta. Estos puntos son propuestos, no paraderos oficiales. El ajuste del proveedor se rechaza si supera 75 m. Las propuestas admiten viajes directos; sus transbordos con otras rutas requieren incorporar puntos de conexión revisados. Un camino en OpenStreetMap no certifica condiciones de accesibilidad ni un abordaje permitido. Las líneas sintéticas de los micros siguen siendo de demostración.

Validación añadida: inclusión de una propuesta cercana, orden por distancia peatonal, sentido único, destino fuera de alcance, error de proveedor sin trazado recto y conservación de geometrías. Prueba de navegador con publicación local y tamaños de escritorio/celular.

### Ajuste del acceso a las esquinas y respuesta progresiva

Para propuestas sin paraderos registrados, el tramo peatonal se recorta en su primer encuentro con el recorrido del micro; la salida se recorta desde el último encuentro que permita seguir hacia el destino. Ambos puntos deben conservar el orden del sentido seleccionado. Se usan intersecciones de segmentos y coincidencias de hasta 2 m para geometrías compartidas. No se desplazan los paraderos definidos de la red base. Los puntos sugeridos se representan con círculos, no con iconos de paradero; falta verificar si se permite abordar allí.

Se mantiene una línea discontinua con huellas más espaciadas. El buscador entrega la primera opción calculada mientras completa las alternativas, reutiliza caminatas idénticas dentro de la consulta y evita pedir rutas de longitud inferior a 1 m. Se conserva el límite del proveedor público. No se promete un tiempo fijo: depende de la red y del servidor peatonal.

### Servicio configurable y tiempos estimados

En **Dibujar → Configurar servicio del micro**, cada borrador admite empresa, modelo, intervalo de salida, tarifa, velocidad media operativa y horario diurno. **Actualizar publicación en mi mapa** aplica la configuración a la copia publicada. Los datos persisten en este navegador y siguen siendo supuestos/propuestas, no servicio verificado.

Tiempo estimado: caminata por red peatonal a 70 m/min, viaje por longitud del tramo del micro y velocidad configurada (15 km/h como supuesto si falta), espera media de la mitad del intervalo. El total incluye la caminata final. Sin intervalo no se inventa espera: se muestra tiempo parcial con «+». No se calcula ETA GPS ni congestión en vivo. Ajustar velocidad e intervalo con mediciones locales antes de usar como información de servicio. El horario admite inicio y fin en un mismo día.

El vehículo simulado usa una combi en vista de planta, blanca con ventanas oscuras y detalles discretos, orientada según su recorrido. Sigue rotulado como simulación.

### Administración y vista del pasajero

Entrada: botón **Administrar plataforma**. En desarrollo sin API existe **Entrar al panel local**; solo es una herramienta del equipo, no autenticación de producción. Con `VITE_API_BASE_URL` configurado, el panel verifica `ADMIN_TOKEN` contra `/api/admin/status`; la clave queda solo en memoria y se elimina al cerrar sesión. En una compilación de producción sin API, el acceso local no está disponible. No hay registro de cuentas múltiples: un administrador mediante clave del servidor, pasajeros sin cuenta.

El panel reúne edición/eliminación de la red base, lista de recorridos propios con edición del borrador/servicio y retiro de publicación, semáforos y análisis. **Ver como pasajero** oculta las herramientas y simulaciones. Las rutas sintéticas no se incluyen en la vista pública. Las publicaciones requieren marcar **Habilitar para pasajeros**, además de fuente, horario, tarifa y frecuencia; eso registra una decisión del administrador, no una certificación independiente. Los borradores existentes no se habilitan automáticamente.

Con servidor: las publicaciones y semáforos se guardan en la base mediante `POST /api/admin/workspace/state`; `GET` en la misma URL está protegido. `/api/public/workspace` entrega solo publicaciones habilitadas, sin notas internas ni ciclos simulados. La edición de la red base usa el importador administrativo con versión anterior. Sin API se conserva el almacenamiento local anterior. Para compartir con otros dispositivos sigue siendo necesario desplegar y configurar el backend, HTTPS, `ADMIN_TOKEN` privado y el origen CORS; esta tarea no desplegó infraestructura ni cambió credenciales.

Simulación interna: posición por longitud acumulada de la geometría y velocidad configurada (15 km/h si falta), actualizada cada 100 ms y orientada al sentido de marcha. Ante rojo o ámbar se detiene 6 m antes del punto proyectado del semáforo si está a no más de 18 m del recorrido; reanuda en verde. Es una aproximación por proximidad, no modela carriles, fases por acceso, colas ni prioridad entre intersecciones. No aparece como seguimiento real en la vista del pasajero. Al completar la ruta se detiene, sin saltar al inicio.

### Panel estable y recuperación de recorridos

La navegación interna del administrador permanece fija entre Mis recorridos, Red de rutas, Editor y frecuencias, Semáforos, Movilidad y Datos y reportes. El origen inicial queda vacío: el punto del mapa aparece solo tras seleccionar un origen o usar ubicación.

Se conservan publicaciones legibles aunque hayan quedado pendientes de los nuevos requisitos de publicación; el panel permite corregirlas sin borrarlas del inventario. «Borradores guardados» busca en el archivo de borradores, publicaciones y copia anterior, y abre el registro sin reemplazar su geometría. El respaldo incluye los archivos originales. Cada cambio de publicaciones conserva una copia anterior. «Mostrar a pasajeros» valida los datos y muestra el motivo cuando no puede habilitarse.

El servidor de desarrollo fija puerto 5173 y strictPort para evitar que otro arranque cambie silenciosamente el origen a 3001. Los datos locales pertenecen a una dirección/puerto y navegador: una ruta guardada en otro origen necesita exportación desde ese origen e importación de su Copia JSON. No se crean geometrías de reemplazo para rutas desaparecidas.
