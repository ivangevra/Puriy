'use client';
import { useEffect, useRef } from 'react';
import { ARM, BLOCK, KINDS, type LabSnapshot } from '../lib/adaptive-signals';

const LIGHT = { green: '#30a46c', amber: '#f5a524', red: '#e5484d' };
// The view shows 50 m of each outer arm; vehicles further out are queued off-screen.
const VIEW = BLOCK / 2 + Math.min(ARM, 50);
const EXTENT = BLOCK / 2 + ARM;
const num = (v: number, d = 1) => v.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Top view of the block: streets, the four signals and every vehicle. */
function draw(canvas: HTMLCanvasElement, snap: LabSnapshot, dark: boolean) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  const k = Math.min(w, h) / (VIEW * 2);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, (dpr * w) / 2, (dpr * h) / 2);
  ctx.fillStyle = dark ? '#1a2029' : '#e4e8ed';
  ctx.fillRect(-w, -h, w * 2, h * 2);
  const road = dark ? '#2d3440' : '#ffffff',
    mark = dark ? '#48505e' : '#c9d0d9';
  // Streets 10 m wide; the block in the middle.
  ctx.fillStyle = road;
  for (const c of [-BLOCK / 2, BLOCK / 2]) {
    ctx.fillRect(-EXTENT, c - 5, EXTENT * 2, 10);
    ctx.fillRect(c - 5, -EXTENT, 10, EXTENT * 2);
  }
  ctx.fillStyle = dark ? '#232a34' : '#d5dbe2';
  ctx.fillRect(-BLOCK / 2 + 6, -BLOCK / 2 + 6, BLOCK - 12, BLOCK - 12);
  ctx.fillStyle = dark ? '#6b7482' : '#8a94a3';
  ctx.font = '5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MANZANA', 0, 2);
  ctx.strokeStyle = mark;
  ctx.lineWidth = 0.3;
  ctx.setLineDash([2, 2]);
  for (const c of [-BLOCK / 2, BLOCK / 2]) {
    ctx.beginPath();
    ctx.moveTo(-EXTENT, c);
    ctx.lineTo(EXTENT, c);
    ctx.moveTo(c, -EXTENT);
    ctx.lineTo(c, EXTENT);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Signal heads at the four approaches of each crossing.
  snap.signals.forEach((sg, i) => {
    const cx = i % 2 ? BLOCK / 2 : -BLOCK / 2,
      cy = i < 2 ? -BLOCK / 2 : BLOCK / 2;
    const color = (axis: 'EW' | 'NS') =>
      sg.phase !== axis || sg.stage === 'allRed' ? LIGHT.red : sg.stage === 'amber' ? LIGHT.amber : LIGHT.green;
    ctx.fillStyle = color('EW');
    ctx.fillRect(cx - 7.5, cy + 0.6, 1.4, 4);
    ctx.fillRect(cx + 6.1, cy - 4.6, 1.4, 4);
    ctx.fillStyle = color('NS');
    ctx.fillRect(cx - 4.6, cy - 7.5, 4, 1.4);
    ctx.fillRect(cx + 0.6, cy + 6.1, 4, 1.4);
  });
  for (const v of snap.vehicles) {
    const spec = KINDS[v.kind];
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.axis === 'EW' ? (v.dir === 1 ? 0 : Math.PI) : v.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = spec.color;
    // Drawn 1.5× wider than real so they read at small sizes.
    const width = spec.width * 1.5;
    ctx.fillRect(-spec.length, -width / 2, spec.length, width);
    if (v.stopped) {
      ctx.fillStyle = LIGHT.red;
      ctx.fillRect(-spec.length, -width / 2, 0.6, width);
    }
    ctx.restore();
  }
}

function Panel({ title, note, snap, dark }: { title: string; note: string; snap: LabSnapshot; dark: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, snap, dark);
  }, [snap, dark]);
  return (
    <figure className="lab-panel">
      <figcaption><strong>{title}</strong><span>{note}</span></figcaption>
      <canvas ref={ref} aria-label={`${title}: ${snap.vehicles.length} vehículos en la manzana`} />
      <div className="lab-panel-kpis">
        <span>Espera media <b>{num(snap.metrics.avgWait)} s</b></span>
        <span>Cola <b>{snap.metrics.queue}</b></span>
        <span>Salieron <b>{snap.metrics.cleared}</b></span>
      </div>
    </figure>
  );
}

function Chart({ j, a, f }: { j: number[]; a: number[]; f: number[] }) {
  const n = Math.max(j.length, a.length, f.length, 2);
  const top = Math.max(5, ...j, ...a, ...f);
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * 100).toFixed(2)},${(40 - (v / top) * 38).toFixed(2)}`).join('');
  return (
    <figure className="lab-chart">
      <figcaption>Espera media por vehículo (s) · hasta {num(top, 0)} s</figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Espera media por vehículo en el tiempo">
        <path d={path(f)} data-series="fixed" />
        <path d={path(a)} data-series="adaptive" />
        <path d={path(j)} data-series="jev" />
      </svg>
      <div className="lab-legend">
        <span data-series="jev">Con Jev (simulado)</span>
        <span data-series="adaptive">Sin Jev (reglas)</span>
        <span data-series="fixed">Tiempo fijo</span>
      </div>
    </figure>
  );
}

export default function AdaptiveStage({ hud, dark }: { hud: Record<string, unknown>; dark: boolean }) {
  const j = hud.jev as LabSnapshot,
    a = hud.adaptive as LabSnapshot,
    f = hud.fixed as LabSnapshot;
  const diff = a.metrics.avgWait > 0 ? 1 - j.metrics.avgWait / a.metrics.avgWait : 0;
  return (
    <div className="lab-stage">
      <header className="lab-head">
        <div>
          <strong data-good={diff >= 0}>{diff >= 0 ? '−' : '+'}{num(Math.abs(diff) * 100, 0)} %</strong>
          <span>espera con Jev frente a sin Jev</span>
        </div>
        <div><b>{num(j.metrics.avgWait)} s</b><span>con Jev (simulado)</span></div>
        <div><b>{num(a.metrics.avgWait)} s</b><span>sin Jev (reglas)</span></div>
        <div><b>{num(f.metrics.avgWait)} s</b><span>tiempo fijo</span></div>
        <p>Misma manzana, mismas llegadas. Jev simulado localmente: no es el modelo real de TypeSafe.</p>
      </header>
      <div className="lab-panels">
        <Panel
          title="Con Jev (simulado)"
          note={`${j.metrics.queries} consultas · ${j.metrics.fallbacks} a la regla`}
          snap={j}
          dark={dark}
        />
        <Panel title="Sin Jev (reglas)" note={`decide cada segundo · ${a.metrics.switches} cambios`} snap={a} dark={dark} />
      </div>
      <Chart j={j.series} a={a.series} f={f.series} />
    </div>
  );
}
