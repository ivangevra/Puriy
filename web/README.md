# Juliaca se mueve — web

Piloto de movilidad urbana con datos sintéticos explícitos. React/TypeScript, MapLibre/OpenFreeMap y respaldo Leaflet/OpenStreetMap.

`npm ci` y `npm run dev:full` para iniciar web y API juntas (puertos 5173 y 8001). `npm run dev -- --port 5173` inicia solo la web. `npm run build` para producción. `npx tsc --noEmit`, `npx vitest run` y `npx playwright test` para validar (los tests de navegador requieren el servidor local).

Sin `VITE_API_BASE_URL` la web es una demostración independiente; registros de campo, reportes, escenarios y favoritos se guardan únicamente en el dispositivo. Para usar la API FastAPI del proyecto raíz, configurar esa variable antes de arrancar o compilar. Nunca incluir claves en variables del frontend.

El mapa tiene tamaño explícito, encuadre adaptable y vista alternativa cuando no hay WebGL o falla el proveedor. La caché de desarrollo se elimina para que cambios de CSS y módulos no queden ocultos. Las teselas de terceros no se almacenan para offline.

Los recorridos son esquemáticos. Las tarifas, frecuencias, caminatas y resultados comparativos no describen servicios reales. Falta verificar rutas, integrar el proveedor GPS concreto y levantar aforos para conclusiones urbanas.
