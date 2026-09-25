// `npm run dev`: inicia la API FastAPI y la web juntas.
// Prepara el entorno de Python si falta y espera a que la API responda antes
// de avisar que el ingreso con cuenta está disponible.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(webRoot, '..');
const projectEnv = join(projectRoot, '.env');
if (existsSync(projectEnv)) loadEnvFile(projectEnv);
const apiPort = Number(process.env.PURIY_API_PORT || 8001);
const webPort = Number(process.env.PURIY_WEB_PORT || 5173);
const venvPython = join(
  projectRoot,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const apiUrl = process.env.VITE_API_BASE_URL || `http://127.0.0.1:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const childOptions = { stdio: 'inherit' };

async function isRunning(url, check) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok && check(await response.text());
  } catch {
    return false;
  }
}

const apiHealthy = () =>
  isRunning(`${apiUrl}/api/health`, (body) => {
    try {
      return JSON.parse(body).status === 'ok';
    } catch {
      return false;
    }
  });

const portBusy = (port) =>
  new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });

function run(command, args) {
  return spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' }).status === 0;
}

// Uses the project venv; creates it and installs backend requirements when
// the API modules cannot be imported.
function preparePython() {
  const probe = (python) =>
    spawnSync(python, ['-c', 'import fastapi, uvicorn, sqlalchemy, httpx'], {
      cwd: projectRoot,
      stdio: 'ignore',
    }).status === 0;
  if (existsSync(venvPython) && probe(venvPython)) return venvPython;
  if (!existsSync(venvPython)) {
    console.log('Creando entorno de Python en .venv…');
    const base = process.platform === 'win32' ? 'python' : 'python3';
    if (!run(base, ['-m', 'venv', '.venv'])) {
      if (probe(base)) return base;
      return null;
    }
  }
  console.log('Instalando dependencias de la API (backend/requirements.txt)…');
  if (!run(venvPython, ['-m', 'pip', 'install', '-q', '-r', 'backend/requirements.txt']))
    return null;
  return probe(venvPython) ? venvPython : null;
}

const cors = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
);
cors.add(webUrl);
cors.add(`http://127.0.0.1:${webPort}`);

const apiRunning = await apiHealthy();
const webRunning = await isRunning(webUrl, (body) => body.includes('Puriy'));
if (apiRunning) console.log(`La API ya está activa en ${apiUrl}.`);
if (webRunning) console.log(`La web ya está activa en ${webUrl}.`);

let api = null;
if (!apiRunning) {
  if (await portBusy(apiPort)) {
    console.error(
      `\nEl puerto ${apiPort} está ocupado por otro programa y no responde como API de Puriy.\n` +
        `Cierra ese proceso o usa otro puerto: PURIY_API_PORT=8002 npm run dev\n`,
    );
  } else {
    const python = preparePython();
    if (!python) {
      console.error(
        '\nNo se pudo preparar Python para la API. Instala Python 3.11+ y ejecuta:\n' +
          '  python -m venv .venv\n' +
          '  .venv\\Scripts\\python.exe -m pip install -r backend/requirements.txt\n',
      );
    } else {
      api = spawn(
        python,
        ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(apiPort)],
        {
          ...childOptions,
          cwd: projectRoot,
          env: { ...process.env, CORS_ORIGINS: [...cors].join(',') },
        },
      );
    }
  }
}

const web = webRunning
  ? null
  : spawn(
      process.execPath,
      [join(webRoot, 'node_modules', 'vinext', 'dist', 'cli.js'), 'dev', '--port', String(webPort)],
      {
        ...childOptions,
        cwd: webRoot,
        env: { ...process.env, VITE_API_BASE_URL: apiUrl },
      },
    );

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api?.kill();
  web?.kill();
  process.exitCode = code;
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
api?.on('error', (error) => console.error('No se pudo iniciar la API:', error.message));
web?.on('error', (error) => {
  console.error('No se pudo iniciar la web:', error.message);
  stop(1);
});
// The web stays up when the API stops so the error is visible; login shows
// the connection message until the API is restarted.
api?.on('exit', (code) => {
  if (!stopping)
    console.error(`\nLa API terminó (código ${code}). El ingreso con cuenta no funcionará hasta reiniciar npm run dev.\n`);
});
web?.on('exit', (code) => {
  if (!stopping) stop(code || 0);
});

if (api) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !(await apiHealthy()) && api.exitCode === null)
    await new Promise((r) => setTimeout(r, 500));
}
const apiOk = apiRunning || (await apiHealthy());
console.log(
  `\nPuriy listo: web ${webUrl} · API ${apiUrl} ${apiOk ? '(conectada)' : '(SIN API: revisa los mensajes de arriba)'}\n`,
);
