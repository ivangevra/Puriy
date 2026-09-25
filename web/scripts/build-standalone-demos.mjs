import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(webRoot, '..', 'artifacts', 'Puriy-Demos.html');
const result = await build({
  entryPoints: [join(webRoot, 'standalone-demos', 'entry.tsx')],
  bundle: true,
  write: false,
  outdir: join(webRoot, 'standalone-demos', 'build'),
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  minify: true,
  loader: { '.geojson': 'json' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '', VITE_GEOCODER_URL: '', VITE_FOOT_ROUTING_URL: '', VITE_ROAD_ROUTING_URL: '', DEV: false }),
  },
});
const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
const mapCss = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text;
if (!js || !mapCss) throw new Error('No se generó el JS o CSS de las demos.');
const workerResult = await build({
  entryPoints: [join(webRoot, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs')],
  bundle: true,
  write: false,
  outfile: join(webRoot, 'standalone-demos', 'build', 'worker.js'),
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  minify: true,
});
const workerJs = workerResult.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
if (!workerJs) throw new Error('No se generó el worker del mapa.');

const tokens = await readFile(join(webRoot, 'tokens.css'), 'utf8');
const mobility = (await readFile(join(webRoot, 'app', 'mobility.css'), 'utf8'))
  .replace(/^@import '\.\.\/tokens\.css';\s*/m, '');
const fontFace = await Promise.all([400, 600, 700].map(async (weight) => {
  const bytes = await readFile(join(webRoot, 'node_modules', '@fontsource', 'manrope', 'files', `manrope-latin-${weight}-normal.woff2`));
  return `@font-face{font-family:Manrope;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')}`;
}));
const iconMeta = await Promise.all(['footprints', 'micro'].map(async (name) => {
  const svg = await readFile(join(webRoot, 'public', `${name}.svg`));
  return `<meta name="puriy-demo-${name}" content="data:image/svg+xml;base64,${svg.toString('base64')}">`;
}));
const standaloneCss = `.demos{height:100dvh;min-height:0}.demos-upcoming{display:none}.demos-head-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.demos-theme-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:7px 10px;border:1px solid var(--color-line);border-radius:9px;color:var(--color-secondary);white-space:nowrap}.demos-theme-toggle:hover{background:var(--color-raised);color:var(--color-ink)}.demos-head .demos-theme-toggle span{font-size:12px;letter-spacing:0;text-transform:none;color:inherit}@media(max-width:900px){.demos{height:auto;min-height:100dvh}}`;
const css = [...fontFace, tokens, mobility, mapCss, standaloneCss].join('\n');
const themeBoot = `try{const p=localStorage.getItem('puriy-demos-theme');document.documentElement.dataset.theme=p==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`;
const html = `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Puriy · Demos interactivas</title>${iconMeta.join('')}<script>${themeBoot}</script><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="text/plain" id="puriy-map-worker">${workerJs.replaceAll('</script', '<\\/script')}</script><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(output);
