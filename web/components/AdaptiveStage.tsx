'use client';
import { useEffect, useRef } from 'react';
import { ARM, BLOCK, JEV_LATENCY, KINDS, LLM_LATENCY, MINI, NODES, type Kind, type LabSnapshot, type MiniSnapshot } from '../lib/adaptive-signals';
import { LAB_ACTS } from '../lib/demo-scenarios';

const LIGHT = { green: '#30a46c', amber: '#f5a524', red: '#e5484d' };
const TONE = { jev: '#275cba', rules: '#4b5563', llm: '#7c5cc4', fixed: '#d99a2b' };
// The view shows 25 m of each outer arm; vehicles further out are queued off-screen.
const VIEW = BLOCK / 2 + Math.min(ARM, 25);
const num = (v: number, d = 1) => v.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const FONT = 'system-ui, sans-serif';

/** Sizes the canvas to its box and returns a context in CSS pixels. */
function prepare(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  return { ctx, w, h, dpr };
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, bg: string, size: number) {
  ctx.font = `600 ${size}px ${FONT}`;
  const pad = size * 0.45,
    tw = ctx.measureText(text).width;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - pad, y - size * 0.8, tw + pad * 2, size * 1.6, size * 0.4);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = size / 10;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
}

// Street scene seen from above, in meters: sidewalks, rooftops, asphalt,
// yellow center line, zebra crossings and stop lines. Streets are 10 m wide
// (one lane per direction, right-hand traffic).
const CITY = {
  light: { walk: '#d8d3ca', road: '#50555d', yellow: '#f0c43a', white: '#f4f4f2', roofs: ['#c4a591', '#d3c2a6', '#bdbcb7', '#cbc3b4', '#b89886', '#b3bbbf', '#d6cfc2'] },
  dark: { walk: '#2c3036', road: '#1d2126', yellow: '#b8962e', white: '#c9ccd0', roofs: ['#4a3d37', '#4d463b', '#3f4143', '#4a463f', '#443833', '#3a4145', '#47443f'] },
};
const hash = (a: number, b = 0) => {
  let x = Math.imul(Math.round(a) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(b) + 0x632be5ab, 0xc2b2ae35);
  x ^= x >>> 15;
  return (Math.imul(x, 0x27d4eb2d) >>> 0) / 4294967296;
};

function drawCity(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], E: number, stop: number, dark: boolean) {
  const c = dark ? CITY.dark : CITY.light;
  ctx.fillStyle = c.walk;
  ctx.fillRect(-E, -E, E * 2, E * 2);
  // Rooftops on every block, 2.5 m of sidewalk from the curb; lots of ~8 m.
  const free = (cs: number[]) => {
    const edges = [-E, ...cs.flatMap((v) => [v - 7.5, v + 7.5]), E];
    const out: [number, number][] = [];
    for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] > edges[i]) out.push([edges[i], edges[i + 1]]);
    return out;
  };
  for (const [x0, x1] of free(xs))
    for (const [y0, y1] of free(ys))
      for (let x = x0, lw = 0; x < x1; x += lw) {
        // Lots of 6 to 12 m along x, 8 m along y.
        lw = Math.min(6 + Math.floor(hash(x, 3) * 7), x1 - x);
        for (let y = y0; y < y1; y += 8) {
          const lh = Math.min(8, y1 - y);
          ctx.fillStyle = c.roofs[Math.floor(hash(x, y) * c.roofs.length)];
          ctx.fillRect(x + 0.3, y + 0.3, lw - 0.6, lh - 0.6);
          // Shadow on the south and east side gives a sense of height.
          ctx.fillStyle = 'rgba(0,0,0,.1)';
          ctx.fillRect(x + 0.3, y + lh - 1.1, lw - 0.6, 0.8);
          ctx.fillRect(x + lw - 1.1, y + 0.3, 0.8, lh - 0.6);
        }
      }
  ctx.fillStyle = c.road;
  for (const x of xs) ctx.fillRect(x - 5, -E, 10, E * 2);
  for (const y of ys) ctx.fillRect(-E, y - 5, E * 2, 10);
  ctx.strokeStyle = c.yellow;
  ctx.lineWidth = 0.25;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (const x of xs) {
    ctx.moveTo(x, -E);
    ctx.lineTo(x, E);
  }
  for (const y of ys) {
    ctx.moveTo(-E, y);
    ctx.lineTo(E, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = c.road;
  for (const x of xs)
    for (const y of ys) {
      ctx.fillRect(x - 5, y - stop, 10, stop * 2);
      ctx.fillRect(x - stop, y - 5, stop * 2, 10);
    }
  // Zebra crossings between the curb and the stop line, then stop lines on the approach lanes.
  const cw = stop - 5.6;
  ctx.fillStyle = c.white;
  for (const x of xs)
    for (const y of ys) {
      for (let k = -4.25; k <= 4.3; k += 1) {
        ctx.fillRect(x - 5 - cw, y + k - 0.25, cw, 0.5);
        ctx.fillRect(x + 5, y + k - 0.25, cw, 0.5);
        ctx.fillRect(x + k - 0.25, y - 5 - cw, 0.5, cw);
        ctx.fillRect(x + k - 0.25, y + 5, 0.5, cw);
      }
      ctx.fillRect(x - stop, y + 0.3, 0.4, 4.5);
      ctx.fillRect(x + stop - 0.4, y - 4.8, 0.4, 4.5);
      ctx.fillRect(x - 4.8, y - stop, 4.5, 0.4);
      ctx.fillRect(x + 0.3, y + stop - 0.4, 4.5, 0.4);
    }
}

type Lamp = 'red' | 'amber' | 'green';
/** Three-lamp signal head; `size` in meters per lamp. */
function drawHead(ctx: CanvasRenderingContext2D, x: number, y: number, vertical: boolean, lit: Lamp, size: number) {
  const len = size * 3.2,
    wid = size * 1.25;
  ctx.fillStyle = '#15191e';
  ctx.beginPath();
  if (vertical) ctx.roundRect(x - wid / 2, y - len / 2, wid, len, size * 0.3);
  else ctx.roundRect(x - len / 2, y - wid / 2, len, wid, size * 0.3);
  ctx.fill();
  (['red', 'amber', 'green'] as const).forEach((lamp, i) => {
    const o = (i - 1) * size * 1.02;
    ctx.fillStyle = lamp === lit ? LIGHT[lamp] : '#3a4047';
    ctx.shadowColor = lamp === lit ? LIGHT[lamp] : 'transparent';
    ctx.shadowBlur = lamp === lit ? 10 : 0;
    ctx.beginPath();
    ctx.arc(vertical ? x : x + o, vertical ? y + o : y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

const PAINT = {
  auto: ['#f2f2ef', '#c5cad0', '#2e3440', '#a8322a', '#2f5fa8', '#e2b93b', '#6b7280'],
  micro: ['#2f9e6b', '#c9423d', '#275cba', '#d99a2b'],
  mototaxi: ['#c0392b', '#1f5fa8', '#e0a526', '#2c8a57'],
  moto: ['#e5484d', '#275cba', '#f2f2ef', '#1f2937'],
};
/** One vehicle seen from above, heading +x with its front at 0. `stretch` widens it so it reads at small sizes. */
function drawVehicle(ctx: CanvasRenderingContext2D, kind: Kind, id: number, stopped: boolean, stretch = 1) {
  const spec = KINDS[kind],
    L = spec.length,
    W = spec.width * stretch;
  const paint = PAINT[kind][Math.floor(hash(id, 7) * PAINT[kind].length)];
  const glass = '#1c2530';
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.roundRect(-L + 0.25, -W / 2 + 0.3, L, W, W * 0.25);
  ctx.fill();
  if (kind === 'auto') {
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.roundRect(-L, -W / 2, L, W, W * 0.3);
    ctx.fill();
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-L * 0.4, -W * 0.4, L * 0.15, W * 0.8, 0.2);
    ctx.roundRect(-L * 0.88, -W * 0.38, L * 0.11, W * 0.76, 0.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(-L * 0.75, -W * 0.36, L * 0.33, W * 0.72);
  } else if (kind === 'micro') {
    // White coaster-type bus with a route-colored stripe.
    ctx.fillStyle = '#f1f1ec';
    ctx.beginPath();
    ctx.roundRect(-L, -W / 2, L, W, 0.45);
    ctx.fill();
    ctx.fillStyle = paint;
    ctx.fillRect(-L + 0.3, -W / 2, L - 1.2, W * 0.16);
    ctx.fillRect(-L + 0.3, W / 2 - W * 0.16, L - 1.2, W * 0.16);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-1.1, -W * 0.42, 0.7, W * 0.84, 0.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (const x of [-L * 0.3, -L * 0.62]) ctx.fillRect(x, -W * 0.22, 1, W * 0.44);
  } else if (kind === 'mototaxi') {
    ctx.fillStyle = '#23272d';
    ctx.fillRect(-1.2, -0.18 * stretch, 1.15, 0.36 * stretch);
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.roundRect(-L, -W / 2, L - 1.0, W, 0.35);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(-L + 0.3, -W * 0.3, L - 1.6, W * 0.18);
  } else {
    ctx.fillStyle = '#23272d';
    ctx.fillRect(-L, -0.2 * stretch, L, 0.4 * stretch);
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.arc(-L * 0.55, 0, 0.38 * stretch, 0, Math.PI * 2);
    ctx.fill();
  }
  // Brake lights: bright when stopped.
  ctx.fillStyle = stopped ? '#ff3b30' : '#7a2320';
  if (stopped) {
    ctx.shadowColor = '#ff3b30';
    ctx.shadowBlur = 8;
  }
  if (kind === 'moto') ctx.fillRect(-L - 0.05, -0.12 * stretch, 0.25, 0.24 * stretch);
  else {
    ctx.fillRect(-L - 0.05, -W / 2 + 0.1, 0.3, W * 0.2);
    ctx.fillRect(-L - 0.05, W / 2 - 0.1 - W * 0.2, 0.3, W * 0.2);
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

/** Top view of the block: streets, the four signals, every vehicle and the latest decision at each crossing. */
function draw(canvas: HTMLCanvasElement, snap: LabSnapshot, dark: boolean, tone: string) {
  const p = prepare(canvas);
  if (!p) return;
  const { ctx, w, h, dpr } = p;
  const k = Math.min(w, h) / (VIEW * 2);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, (dpr * w) / 2, (dpr * h) / 2);
  const E = Math.max(w, h) / k / 2 + 10;
  // Vehicles stop 7 m before the crossing center (adaptive-signals.ts).
  drawCity(ctx, [-BLOCK / 2, BLOCK / 2], [-BLOCK / 2, BLOCK / 2], E, 7, dark);
  // Signal heads on the sidewalk, to the right of each approach lane.
  const head = Math.max(0.3, 3.5 / k);
  // Heads on the sidewalk, clear of the curb (5 m from the street axis).
  const off = 5.6 + head * 1.6;
  snap.signals.forEach((sg, i) => {
    const cx = i % 2 ? BLOCK / 2 : -BLOCK / 2,
      cy = i < 2 ? -BLOCK / 2 : BLOCK / 2;
    const lamp = (axis: 'EW' | 'NS'): Lamp => (sg.phase !== axis || sg.stage === 'allRed' ? 'red' : sg.stage === 'amber' ? 'amber' : 'green');
    drawHead(ctx, cx - 7.5, cy + off, true, lamp('EW'), head);
    drawHead(ctx, cx + 7.5, cy - off, true, lamp('EW'), head);
    drawHead(ctx, cx - off, cy - 7.5, false, lamp('NS'), head);
    drawHead(ctx, cx + off, cy + 7.5, false, lamp('NS'), head);
  });
  for (const v of snap.vehicles) {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.axis === 'EW' ? (v.dir === 1 ? 0 : Math.PI) : v.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    drawVehicle(ctx, v.kind, v.id, v.stopped, 1.4);
    ctx.restore();
  }
  // Latest decision at each crossing, shown for 3 s next to it (outside the block).
  const seen = new Set<string>();
  for (const e of snap.log) {
    if (snap.time - e.t > 3 || seen.has(e.node)) continue;
    seen.add(e.node);
    const i = NODES.indexOf(e.node);
    const cx = i % 2 ? BLOCK / 2 : -BLOCK / 2,
      cy = i < 2 ? -BLOCK / 2 : BLOCK / 2;
    const color = e.forced ? LIGHT.red : e.fallback ? '#b27a17' : tone;
    ctx.globalAlpha = Math.max(0.55, 1 - (snap.time - e.t) / 3);
    // At least 12 px on screen, whatever the panel size.
    const size = Math.max(4.2, 12 / k);
    pill(ctx, cx + Math.sign(cx) * (8 + size * 2.6), cy + Math.sign(cy) * (7 + size * 1.2), e.short, color, dark ? '#1a2029' : '#ffffff', size);
    ctx.globalAlpha = 1;
  }
}

/** Label with a background, in screen pixels. */
function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, bg: string, size: number, align: 'left' | 'right') {
  ctx.font = `600 ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width,
    pad = 7;
  const left = Math.max(8, align === 'left' ? x : x - tw - pad * 2);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, y - size - 5, tw + pad * 2, size + 12, 7);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, left + pad, y + 2);
}

/** «4 vehículos · ≈ 20 personas» for a queue (people per vehicle are illustrative). */
function queueText(kinds: Kind[]) {
  const people = Math.round(kinds.reduce((sum, k) => sum + KINDS[k].people, 0));
  return `${kinds.length} ${kinds.length === 1 ? 'vehículo' : 'vehículos'} · ≈ ${people} personas esperan`;
}

type MiniMode = 'sensor' | 'fixed' | 'ask';
/** One crossing of two streets (explanation steps), optionally with the question/answer timeline on top. */
function drawMini(canvas: HTMLCanvasElement, snap: MiniSnapshot, mode: MiniMode, tone: string, timeline: boolean, latency: number, dark: boolean) {
  const p = prepare(canvas);
  if (!p) return;
  const { ctx, w, h, dpr } = p;
  const ink = dark ? '#e6e9ee' : '#17202a',
    muted = dark ? '#9aa3b1' : '#5b6675',
    paper = dark ? '#1a2029' : '#ffffff';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = dark ? '#232a34' : '#e4e8ed';
  ctx.fillRect(0, 0, w, h);
  let top = 0;
  const fs = Math.max(11, Math.min(15, w / 34));
  // Phones: keep only the essentials so labels do not overlap.
  const narrow = w < 320;

  if (timeline) {
    // Timeline of the last 10 s: a question every second, the bar is the time waiting for the answer.
    const tl = narrow ? Math.min(60, h * 0.3) : Math.min(120, h * 0.3);
    top = tl;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, tl);
    const x0 = 14,
      x1 = w - 14,
      span = 10;
    const X = (t: number) => x0 + ((t - (snap.time - span)) / span) * (x1 - x0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `600 ${fs}px ${FONT}`;
    if (!narrow) {
      ctx.fillStyle = ink;
      ctx.fillText('Cada segundo pregunta: ¿seguir o cambiar?', x0, fs + 8);
    }
    ctx.textAlign = narrow ? 'left' : 'right';
    ctx.fillStyle = tone;
    ctx.fillText(`responde en ≈ ${num(latency, latency < 1 ? 1 : 0)} s`, narrow ? x0 : x1, fs + 8);
    const row = tl * 0.62;
    ctx.strokeStyle = dark ? '#48505e' : '#c9d0d9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, row);
    ctx.lineTo(x1, row);
    ctx.stroke();
    ctx.font = `${fs * 0.8}px ${FONT}`;
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    if (!narrow) {
      ctx.fillText('hace 10 s', x0, tl - 8);
      ctx.textAlign = 'right';
      ctx.fillText('ahora', x1, tl - 8);
    }
    for (const q of snap.queries) {
      if (q.asked < snap.time - span) continue;
      const done = q.due <= snap.time;
      const end = Math.min(q.due, snap.time);
      ctx.strokeStyle = done ? tone : LIGHT.amber;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(q.asked), row);
      ctx.lineTo(Math.max(X(q.asked) + 0.1, X(end)), row);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = muted;
      ctx.beginPath();
      ctx.arc(X(q.asked), row, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (done) {
        ctx.fillStyle = q.change ? tone : paper;
        ctx.strokeStyle = tone;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(q.due), row, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (snap.thinking !== null && !narrow) {
      ctx.fillStyle = LIGHT.amber;
      ctx.font = `600 ${fs * 0.85}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`pensando… ${num(snap.thinking, 1)} s`, x1, row - 12);
    }
  }

  // Crossing: vehicles stop at MINI.stop, 9 m before the center (a zebra crossing in between).
  const STOP = 9;
  const C = MINI.stop + STOP;
  // Zoomed in: ±36 m around the center; longer queues continue off-screen (see the label).
  const VIEW_MINI = 36;
  const aw = w,
    ah = h - top;
  const k = Math.min(aw, ah) / (VIEW_MINI * 2);
  const cx = aw / 2,
    cy = top + ah / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, aw, ah);
  ctx.clip();
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * cx, dpr * cy);
  drawCity(ctx, [0], [0], Math.max(aw, ah) / k / 2 + 10, STOP, dark);
  if (mode !== 'fixed') {
    // Detection zone on both approaches: what the controller "sees".
    ctx.fillStyle = tone + '40';
    ctx.fillRect(-STOP - MINI.near, 0.3, MINI.near, 4.4);
    ctx.fillRect(-4.7, -STOP - MINI.near, 4.4, MINI.near);
  }
  const lamp = (axis: 'EW' | 'NS'): Lamp => (snap.phase !== axis ? 'red' : snap.stage === 'amber' ? 'amber' : 'green');
  const head = Math.max(0.8, 12 / k);
  const off = 5.6 + head * 1.6;
  drawHead(ctx, -STOP - 0.5, off, true, lamp('EW'), head);
  drawHead(ctx, -off, -STOP - 0.5, false, lamp('NS'), head);
  for (const c of snap.cars) {
    const at = c.s - C;
    ctx.save();
    if (c.axis === 'EW') ctx.translate(at, 2.5);
    else {
      ctx.translate(-2.5, at);
      ctx.rotate(Math.PI / 2);
    }
    drawVehicle(ctx, c.kind, c.id, c.stopped, 1.15);
    ctx.restore();
  }
  ctx.restore();

  // Labels in screen pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (narrow) return;
  const bg = dark ? 'rgba(26,32,41,.92)' : 'rgba(255,255,255,.94)';
  if (snap.queue.EW.length) tag(ctx, 10, cy + 8 * k + fs + 14, queueText(snap.queue.EW), LIGHT.red, bg, fs * 0.9, 'left');
  if (snap.queue.NS.length) tag(ctx, cx - 9 * k, top + fs + 14, queueText(snap.queue.NS), LIGHT.red, bg, fs * 0.9, 'right');
  const status =
    mode === 'fixed'
      ? snap.countdown === null
        ? 'Cambia por reloj'
        : `Cambia por reloj en ${Math.ceil(snap.countdown)} s`
      : mode === 'sensor'
        ? `Detecta: ${snap.waiting.EW} en E-O, ${snap.waiting.NS} en N-S`
        : latency < 1
          ? 'Responde antes del siguiente segundo'
          : snap.thinking !== null
            ? 'Esperando la respuesta…'
            : 'Respuesta aplicada, con datos de hace 5 s';
  tag(ctx, w - 10, h - 16, status, mode === 'fixed' ? TONE.fixed : tone, bg, fs, 'right');
}

type PanelProps = {
  title: string;
  note: string;
  kpis: [string, string][];
  paint: (canvas: HTMLCanvasElement) => void;
};
function Panel({ title, note, kpis, paint }: PanelProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Every render is a new frame of the animation.
  useEffect(() => {
    if (ref.current) paint(ref.current);
  });
  return (
    <figure className="lab-panel">
      <figcaption><strong>{title}</strong><span>{note}</span></figcaption>
      <canvas ref={ref} data-title={title} aria-label={title} />
      <div className="lab-panel-kpis">
        {kpis.map(([label, value]) => <span key={label}>{label} <b>{value}</b></span>)}
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

/** Takeaway of each explanation step: total waiting, side by side. */
function Bars({ rows }: { rows: [string, number, string][] }) {
  const top = Math.max(10, ...rows.map((r) => r[1]));
  return (
    <figure className="lab-chart lab-bars">
      <figcaption>Espera acumulada de todos los vehículos (s): menos es mejor</figcaption>
      {rows.map(([label, value, color]) => (
        <div key={label} className="lab-bar">
          <span>{label}</span>
          <i><b style={{ width: `${(value / top) * 100}%`, background: color }} /></i>
          <strong>{num(value, 0)} s</strong>
        </div>
      ))}
    </figure>
  );
}

const STEPS = ['El problema', 'Por qué Jev', 'En el tráfico'];

export default function AdaptiveStage({ hud, dark, onSeek }: { hud: Record<string, unknown>; dark: boolean; onSeek: (t: number) => void }) {
  const act = hud.act as 0 | 1 | 2;
  const steps = (
    <ol className="lab-steps" aria-label="Pasos de la demostración">
      {STEPS.map((s, i) => (
        <li key={s}>
          <button type="button" aria-current={act === i ? 'step' : undefined} onClick={() => onSeek(LAB_ACTS[i])}>
            <b>{i + 1}</b>{s}
          </button>
        </li>
      ))}
    </ol>
  );

  if (act < 2) {
    const l = hud.left as MiniSnapshot,
      r = hud.right as MiniSnapshot;
    const intro = act === 0;
    const leftTone = TONE.jev,
      rightTone = intro ? TONE.fixed : TONE.llm;
    const kpis = (s: MiniSnapshot, asks: boolean): [string, string][] => [
      ['Espera acumulada', `${num(s.waitSum, 0)} s`],
      ['Detenidos', String(s.stopped)],
      asks ? ['Decisiones', String(s.decisions)] : ['Cambios de luz', String(s.switches)],
    ];
    return (
      <div className="lab-stage">
        <header className="lab-head lab-head-intro">
          {steps}
          <h3>{intro ? '¿Qué es un semáforo adaptativo?' : '¿Por qué Jev y no un chat como ChatGPT o Claude?'}</h3>
          <p>
            {intro
              ? 'Izquierda: mira cuántos vehículos esperan y decide cada segundo si sigue en verde o cambia. Derecha: cambia por reloj, haya o no vehículos. Mismos vehículos en ambos lados.'
              : `Para decidir cada segundo, la respuesta tiene que llegar antes del segundo siguiente. Jev solo elige entre opciones fijas (seguir o cambiar); un modelo general redacta su respuesta en texto. TypeSafe anuncia que Jev es de 200 a 400 veces más rápido y barato (dato del proveedor, no medido en Puriy). Tiempos del dibujo: ilustrativos.`}
          </p>
        </header>
        <div className="lab-panels">
          <Panel
            title={intro ? 'Semáforo adaptativo' : 'Jev (simulado)'}
            note={intro ? 'mira la calle cada segundo' : 'elige una opción con su probabilidad'}
            kpis={kpis(l, true)}
            paint={(c) => drawMini(c, l, intro ? 'sensor' : 'ask', leftTone, !intro, JEV_LATENCY, dark)}
          />
          <Panel
            title={intro ? 'Tiempo fijo' : 'Modelo de lenguaje general'}
            note={intro ? 'cambia cada 10 s' : `ChatGPT, Claude u otro · ≈ ${LLM_LATENCY} s, ilustrativo`}
            kpis={kpis(r, !intro)}
            paint={(c) => drawMini(c, r, intro ? 'fixed' : 'ask', rightTone, !intro, LLM_LATENCY, dark)}
          />
        </div>
        <Bars
          rows={[
            [intro ? 'Adaptativo' : 'Jev', l.waitSum, leftTone],
            [intro ? 'Tiempo fijo' : 'Modelo general', r.waitSum, rightTone],
          ]}
        />
      </div>
    );
  }

  const j = hud.jev as LabSnapshot,
    a = hud.adaptive as LabSnapshot,
    f = hud.fixed as LabSnapshot;
  const diff = a.metrics.avgWait > 0 ? 1 - j.metrics.avgWait / a.metrics.avgWait : 0;
  const kpis = (s: LabSnapshot): [string, string][] => [
    ['Espera media', `${num(s.metrics.avgWait)} s`],
    ['Cola', String(s.metrics.queue)],
    ['Salieron', String(s.metrics.cleared)],
  ];
  return (
    <div className="lab-stage">
      <header className="lab-head">
        {steps}
        <div>
          <strong data-good={diff >= 0}>{diff >= 0 ? '−' : '+'}{num(Math.abs(diff) * 100, 0)} %</strong>
          <span>espera con Jev frente a sin Jev</span>
        </div>
        <div><b>{num(j.metrics.avgWait)} s</b><span>con Jev (simulado)</span></div>
        <div><b>{num(a.metrics.avgWait)} s</b><span>sin Jev (reglas)</span></div>
        <div><b>{num(f.metrics.avgWait)} s</b><span>tiempo fijo</span></div>
        <p>Misma manzana, mismas llegadas. Los globos junto a cada cruce muestran la última decisión. Jev simulado localmente: no es el modelo real de TypeSafe.</p>
      </header>
      <div className="lab-panels">
        <Panel
          title="Con Jev (simulado)"
          note={`${j.metrics.queries} consultas · ${j.metrics.fallbacks} a la regla`}
          kpis={kpis(j)}
          paint={(c) => draw(c, j, dark, TONE.jev)}
        />
        <Panel
          title="Sin Jev (reglas)"
          note={`decide cada segundo · ${a.metrics.switches} cambios`}
          kpis={kpis(a)}
          paint={(c) => draw(c, a, dark, TONE.rules)}
        />
      </div>
      <Chart j={j.series} a={a.series} f={f.series} />
    </div>
  );
}
