import React from 'react';
import { createRoot } from 'react-dom/client';
import Demos from '../components/Demos';
import { ThemeProvider } from '../components/Theme';
import { setWorkerUrl } from 'maplibre-gl';
import roadGraph from '../public/data/red-vial.json';
import manzanas from '../public/data/manzanas-puntos.geojson';

const workerSource = document.getElementById('puriy-map-worker')?.textContent;
if (workerSource) {
  // The fragment selects MapLibre's classic-worker path for file:// pages.
  setWorkerUrl(`${URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))}#.cjs`);
}

const embedded = new Map([
  ['/data/red-vial.json', JSON.stringify(roadGraph)],
  ['/data/manzanas-puntos.geojson', JSON.stringify(manzanas)],
]);
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
  const body = embedded.get(path);
  if (body !== undefined) {
    return Promise.resolve(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  return nativeFetch(input, init);
}) as typeof fetch;

let initialTheme: 'light' | 'dark' = 'light';
try {
  if (localStorage.getItem('puriy-demos-theme') === 'dark') initialTheme = 'dark';
} catch {}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultPreference={initialTheme} storageKey="puriy-demos-theme"><Demos showThemeToggle /></ThemeProvider>,
);
