# Diseño de Juliaca se mueve

Rediseño aplicado el 6 de septiembre de 2026. Superficie operativa: planificar un viaje y estudiar la red de transporte. El usuario pidió una presentación moderna, minimalista y profesional, con tema claro y oscuro, tomando referencias relacionadas de styles.refero.design.

## Referencias estudiadas

Se consultaron los apartados DESIGN.md publicados por Refero, como evidencia de diseño, sin copiar marcas, fotografías ni tipografías propietarias.

- [Mapbox](https://styles.refero.design/style/be34bbe8-9a50-4f36-b379-840328f6350c): superficies oscuras jerarquizadas y controles cartográficos compactos. Aplicación: mapa amplio, controles agrupados y color funcional.
- [Felt](https://styles.refero.design/style/127a4efb-685c-42c3-83eb-72bb410a8429): el mapa ocupa el centro de la experiencia y la interfaz lo acompaña. Aplicación: separar herramientas del trazado y dar espacio al territorio. Su lenguaje editorial no se trasladó a la tarea operativa.
- [Linear](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1): tipografía contenida, densidad compacta y divisiones sutiles. Aplicación: pesos moderados, navegación discreta, filas de datos y superficies neutrales.

La síntesis es propia: un espacio de trabajo cartográfico cívico, no una reproducción de esas plataformas.

## Composición

Escritorio: barra lateral de 88 px para Viajar, Rutas, Movilidad y Guardadas; administración al pie. Cabecera de contexto y apariencia. Panel de viaje de 354 px junto a un mapa flexible. El panel desplaza su contenido sin desplazar el mapa. El aviso de demostración permanece visible.

Celulares y tabletas estrechas, hasta 820 px: mapa primero, formulario debajo y navegación inferior fija con zona segura. El contenido conserva espacio inferior para llegar al último control. Análisis y administración adaptan tablas, pestañas y formularios al ancho disponible.

## Sistema visual

Fuente Manrope autoalojada; pesos de interfaz 400–600, marca 700. Títulos de 27–29 px, cuerpo operativo de 12–14 px. Campos de entrada de 16 px en móvil para evitar zoom involuntario. Espaciado basado en 4 px. Radios 7–12 px, mayores en el panel móvil. Iconos Lucide de trazo consistente.

Colores semánticos en `web/tokens.css`. Tema claro: blanco y gris frío, tinta carbón. Tema oscuro: grafito y superficies escalonadas. Azul reservado para selección y foco; los cuatro colores de ruta mantienen su identidad. La tinta de las etiquetas de ruta se calcula para conservar contraste con su fondo. Las sombras se reservan para controles flotantes. Sin fotografías decorativas, gradientes ni efectos de cristal.

## Apariencia y mapa

Selector Claro / Oscuro / Sistema con etiquetas accesibles y estado pulsado. Preferencia en `juliaca-theme` del almacenamiento local; sin preferencia explícita se respeta el sistema. Inicialización antes del pintado e hidratación consistente. El cambio de tema no restablece la ruta, origen, destino ni cámara.

MapLibre usa OpenFreeMap Positron o Dark. En Dark se ajustan calles, agua y etiquetas para mejorar lectura. Las capas de rutas se reponen después de `style.load`, sin esperar que todas las teselas hayan terminado. El respaldo Leaflet/OSM conserva los recorridos; el filtro nocturno afecta solo a teselas, no a las rutas. Atribución siempre visible. No se almacenan teselas offline.

El contenedor del mapa tiene dimensiones explícitas, aislamiento de capas y ResizeObserver. Conserva los arreglos para WebGL ausente, errores de proveedor y caché local obsoleta.

## Movimiento y estados

Entrada breve del detalle de ruta, aparición de resultados, transición del panel informativo, intercambio de iconos reproducir/pausar y respuesta del botón de búsqueda. Duraciones de 160–280 ms con desaceleración. Las recetas de iconos y panel proceden de transitions-dev. `prefers-reduced-motion` elimina animaciones y transiciones. Sin movimiento ambiental automático.

Foco visible, enlace para saltar al contenido, campos y controles nativos. La información cerrada queda inerte y fuera del árbol accesible. Se mantienen carga, error, resultados vacíos, ubicación denegada, favoritos, trabajo de campo, escenarios y moderación.

## Validación

Inspección de ambos temas a 1440 × 960 y 390 × 844; revisión independiente de capturas: ship. Pruebas de ancho 320, 375, 414 y 768 px, proveedor bloqueado y WebGL ausente. Las pruebas de tema comprueban persistencia, cambios del sistema, movimiento reducido, continuidad del lienzo y píxeles de rutas efectivamente dibujados. Las capturas no validan rutas de transporte reales: todos los datos del piloto continúan siendo sintéticos.

Comprobación final de esta entrega: TypeScript y compilación correctos, 36 pruebas de lógica y 10 pruebas de navegador aprobadas. El detector estático aplicado a estilos y al selector de tema no emitió hallazgos. La compilación conserva avisos previos del scaffold sobre carga de configuración y tamaño de paquetes; no impiden la compilación.

## Editor de recorridos

La sección Dibujar extiende el espacio cartográfico con un panel de herramientas, mapa y revisión de campo. Ida continua, vuelta discontinua y flechas de coordenadas; selector sincronizado entre ficha y mapa. Borradores locales independientes de la red pública, autosave, historial de edición, exportación GeoJSON e importación de copia JSON. Móvil coloca el cambio de sentido junto al mapa y la revisión de campo después de la edición. Documentación operativa y prioridades en `docs/EDITOR_Y_DESAFIOS.md`.

## Corrección de notación y ajuste vial

Las flechas tienen cuerpo y punta redondeada, tamaño fijo de unos 22 px. En MapLibre se colocan directamente sobre las geometrías de línea mediante símbolos nativos, con orientación de marcha y desplazamiento en píxeles coherente con el trazo. El motor las transforma durante el zoom, sin esperar un estado React en zoomend. Leaflet conserva anclajes sobre el eje de la geometría y actualiza la densidad al terminar el zoom. Ida continua y vuelta discontinua; trazos con contorno y uniones redondeadas. Cámara 2D sin inclinación ni rotación. Los vértices del editor se representan con círculos.

El editor tiene Seguir calles como modo inicial y conserva puntos de paso separados de la geometría calculada. Estado de cálculo por sentido, errores sin rectas de sustitución y exportación de geometría vigente. El modo libre siempre se identifica. Prueba real con dos puntos de Juliaca: 40 coordenadas de ida y 41 de vuelta; se comprobaron los recorridos sobre la base cartográfica en claro, oscuro y móvil.


## Búsqueda y opciones de viaje

Origen y destino usan un combobox con sugerencias locales sin sensibilidad a tildes y búsqueda Photon limitada a Juliaca y sus alrededores. Teclado, selección explícita, cancelación de consultas antiguas, caché en memoria y errores recuperables. Las consultas en línea requieren tres caracteres y una pausa de 650 ms. No se utiliza Nominatim para autocompletar. VITE_GEOCODER_URL permite una instancia propia; el servicio público de demostración no garantiza disponibilidad. La interfaz informa que se consulta el texto en línea.

Las opciones de viaje muestran iconos de peatón y micro, secuencia de líneas, duración, subida, caminata y tarifa. La selección resalta una opción sin alterar el resto. La información de demostración permanece explícita. Comprobación: consulta real de Jirón Gonzales Prada, escenarios de error y respuesta obsoleta, escritorio y móvil en ambos temas.

«Viajar» empieza con origen y destino. Antes de buscar no muestra el catálogo ni traza recorridos en el mapa; al consultar presenta únicamente las opciones recomendadas y el itinerario elegido. «Rutas» reúne el catálogo completo y «Guardadas» conserva las rutas marcadas por el pasajero. El corazón intercambia contorno y relleno y confirma el guardado con un pulso breve, respetando movimiento reducido.


## Publicaciones locales y semáforos

Publicar en mi mapa crea una instantánea separada del borrador, visible en el mapa principal y persistida en este navegador. Un sentido completo basta; cualquier sentido empezado debe estar completo y con geometría vigente. Se puede actualizar o retirar sin borrar el borrador. Las propuestas no se agregan al planificador de pasajeros ni convierten vértices en paraderos. No hay publicación compartida entre dispositivos sin servidor integrado.

Semáforos usa la composición del editor: formulario, mapa, inventario y estudios siguientes. Registra ubicación, acceso, estado, tiempos por fase, señal peatonal, fuente y fecha. Los tiempos desconocidos permanecen vacíos; la suma no representa un ciclo completo con desfases. Marcadores con ciclo simulado rojo → verde → ámbar según las duraciones guardadas, con etiqueta visible de simulación. Las fases incompletas, ciclos de duración cero y averías no se animan. Guardado local, edición, eliminación, exportación GeoJSON y capa opcional en el mapa principal. Teclado, móvil y persistencia probados.


## Micro y acceso peatonal

Micro SVG minimalista de frente, plano, azul y blanco, con esquinas redondeadas y sin reflejos ni detalles decorativos. El mismo archivo sirve para MapLibre y Leaflet. El vehículo simulado conserva la etiqueta sin GPS real y sigue el sentido del itinerario seleccionado.

Pasos numerados: caminar al abordaje, tomar el micro, realizar conexiones y completar la llegada. El mapa muestra tramo peatonal punteado, peatón y punto de subida. Las distancias y tiempos del piloto son aproximaciones en línea recta; no se inventan giros ni indicaciones de cruce. El criterio Caminar menos permite priorizar acceso cercano dentro de las opciones de viaje.

Los ciclos se calculan desde la fecha de guardado y el reloj actual, sin acumular desfases por pestañas inactivas. No representan controladores físicos ni alteran su configuración.

## Marca y acceso a cuentas

El símbolo de Puriy representa un tramo de ruta entre dos puntos. Sustituye la antigua inicial verde y usa la tinta carbón, el papel y el azul del espacio cartográfico; se repite en la navegación, el acceso, el favicon y los iconos de instalación. Ingreso y registro comparten un diálogo de dos zonas en escritorio: un esquema de recorrido a la izquierda y el formulario operativo a la derecha. En móvil el formulario ocupa el ancho disponible. Ambos conservan Manrope, los radios y los controles del resto de la plataforma, con foco visible y estados de error y carga.

La herramienta administrativa de la navegación solo aparece para la cuenta `ivangvera201@gmail.com` cuando tiene un permiso explícito en la base de datos o inicia sesión mediante Google verificado. La API comprueba ese permiso en cada operación protegida. Una nueva inscripción con ese correo no recibe el permiso automáticamente. Google requiere credenciales OAuth configuradas en la API y queda inactivo mientras falten.

La cuenta se abre desde la parte inferior de la navegación lateral (a la derecha en la barra móvil). El menú muestra nombre, correo, tipo de acceso, rol y cantidad de rutas guardadas; ofrece accesos a guardadas, administración solo cuando corresponde y cierre de sesión. Al salir se retiran el token y las rutas guardadas del almacenamiento local de esa sesión. El menú cierra con Escape, clic fuera o una acción y conserva el foco visible.
