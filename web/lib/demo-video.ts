export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
const LAYOUT_WIDTH = 1280;
const LAYOUT_HEIGHT = 720;

const GUIDES: Record<string, string> = {
  viaje: 'Puriy compara dónde abordar y bajar para calcular el tiempo completo: caminata, espera, viaje en micro y caminata final.',
  ruta: 'El recorrido sigue calles reales. La ida y la vuelta pueden usar vías distintas por los sentidos de circulación.',
  algoritmo: 'Dijkstra y A* buscan una ruta en una red de calles con tiempos y sentidos. A* orienta la búsqueda hacia el destino.',
  gps: 'Las posiciones simuladas muestran cómo detectar datos atrasados y micros agrupados, sin inventar dónde está una unidad.',
  trafico: 'Compara la velocidad reciente con la habitual del mismo día y hora. Una alternativa se propone solo si ahorra tiempo.',
  semaforos: 'Compara el plan fijo de hoy, una onda verde simple y un plan optimizado (ciclo, repartos y desfases) con aforos ilustrativos. Aplicarlo requiere aforos reales y validación municipal.',
  flota: 'Relaciona la frecuencia prometida con el tiempo de ida, vuelta y regulación para estimar cuántos micros hacen falta.',
  cobertura: 'Cuenta la población y los destinos próximos a los puntos de abordaje dentro de un umbral de 400 metros.',
  desvio: 'Ante una calle cerrada, identifica abordajes afectados y busca un desvío que respete los sentidos de circulación.',
  adaptativo: 'Tres pasos: qué es un semáforo que mira la calle, por qué necesita respuestas en menos de un segundo (Jev frente a un modelo de lenguaje general) y cómo se ve en una manzana con y sin Jev. Tiempos y resultados ilustrativos.',
};

export type DemoVideoVariant = 'clean' | 'explained';
export type DemoVideoSource =
  | { kind: 'map'; canvas: HTMLCanvasElement }
  | { kind: 'lab'; canvases: [HTMLCanvasElement, HTMLCanvasElement] };

export type DemoVideoScene = {
  id: string;
  title: string;
  caption: string;
  code: string;
  index: number;
  count: number;
  time: number;
  duration: number;
  /** Playback speed of the recording (1 = real time). */
  speed: number;
};

function wrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  for (const [i, value] of lines.slice(0, maxLines).entries()) {
    ctx.fillText(value, x, y + i * lineHeight);
  }
}

function drawCover(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  if (!canvas.width || !canvas.height) return;
  const scale = Math.max(width / canvas.width, height / canvas.height);
  const cropW = width / scale, cropH = height / scale;
  ctx.drawImage(canvas, (canvas.width - cropW) / 2, (canvas.height - cropH) / 2, cropW, cropH, x, y, width, height);
}

function drawVisual(ctx: CanvasRenderingContext2D, source: DemoVideoSource, x: number, y: number, width: number, height: number) {
  if (source.kind === 'map') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);
    drawCover(ctx, source.canvas, x, y, width, height);
    return;
  }
  ctx.fillStyle = '#e6ebf1';
  ctx.fillRect(x, y, width, height);
  const gap = 12;
  const panelWidth = (width - gap * 3) / 2;
  source.canvases.forEach((canvas, index) => {
    const panelX = x + gap + index * (panelWidth + gap);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(panelX, y + gap, panelWidth, height - gap * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX, y + gap, panelWidth, height - gap * 2 - 38);
    ctx.clip();
    drawCover(ctx, canvas, panelX, y + gap, panelWidth, height - gap * 2 - 38);
    ctx.restore();
    ctx.fillStyle = '#17202a';
    ctx.font = '600 17px Manrope, Arial, sans-serif';
    ctx.fillText(canvas.dataset.title ?? '', panelX + 14, y + height - gap - 13);
  });
}

export function drawDemoVideo(
  ctx: CanvasRenderingContext2D,
  source: DemoVideoSource,
  scene: DemoVideoScene,
  variant: DemoVideoVariant,
) {
  ctx.save();
  ctx.setTransform(ctx.canvas.width / LAYOUT_WIDTH, 0, 0, ctx.canvas.height / LAYOUT_HEIGHT, 0, 0);
  const w = LAYOUT_WIDTH, h = LAYOUT_HEIGHT;
  if (variant === 'clean') {
    drawVisual(ctx, source, 0, 0, w, h);
    ctx.textAlign = 'right';
    ctx.font = '600 13px Manrope, Arial, sans-serif';
    ctx.fillStyle = '#25313f';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (source.kind === 'map') {
      ctx.fillText(`Simulación${scene.speed === 1 ? '' : ` · ×${scene.speed}`} · © OpenMapTiles · © OpenStreetMap`, w - 18, h - 16);
    } else {
      ctx.fillText(`Prototipo simulado${scene.speed === 1 ? '' : ` · ×${scene.speed}`}`, w - 18, h - 16);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#f5f6f3';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#17202a';
  ctx.fillRect(0, 0, w, 104);
  ctx.fillStyle = '#a9c7ff';
  ctx.font = 'bold 18px Manrope, Arial, sans-serif';
  ctx.fillText('PURIY  /  DEMOSTRACIÓN', 30, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Manrope, Arial, sans-serif';
  ctx.fillText(scene.title, 30, 80);
  ctx.font = 'bold 19px Manrope, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${String(scene.index + 1).padStart(2, '0')} / ${String(scene.count).padStart(2, '0')}`, 1248, 58);
  ctx.textAlign = 'left';

  // Cover the map area without stretching the street geometry.
  const mapX = 24, mapY = 128, mapW = 792, mapH = 508;
  ctx.fillStyle = '#e6ebf1';
  ctx.fillRect(mapX, mapY, mapW, mapH);
  drawVisual(ctx, source, mapX, mapY, mapW, mapH);
  ctx.fillStyle = 'rgba(23, 32, 42, 0.88)';
  ctx.fillRect(mapX + 12, mapY + 12, source.kind === 'lab' ? 210 : 178, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Manrope, Arial, sans-serif';
  ctx.fillText(source.kind === 'lab' ? 'PROTOTIPO  ·  SIMULADO' : `SIMULACIÓN  ·  ${scene.code}`, mapX + 22, mapY + 35);
  if (source.kind === 'map') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillRect(mapX + 12, mapY + mapH - 32, 395, 23);
    ctx.fillStyle = '#263747';
    ctx.font = '13px Manrope, Arial, sans-serif';
    ctx.fillText('Mapa: OpenFreeMap · OpenMapTiles · OpenStreetMap', mapX + 19, mapY + mapH - 16);
  }

  const panelX = 840, panelY = 128, panelW = 416, panelH = 508;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.fillStyle = '#346dca';
  ctx.fillRect(panelX, panelY, 5, panelH);
  ctx.fillStyle = '#285cb0';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('QUÉ DEMUESTRA', panelX + 27, panelY + 42);
  ctx.fillStyle = '#182d25';
  ctx.font = '26px Arial, sans-serif';
  wrappedText(ctx, GUIDES[scene.id] || scene.title, panelX + 27, panelY + 83, 364, 34, 6);
  ctx.fillStyle = '#dce6df';
  ctx.fillRect(panelX + 27, panelY + 266, 362, 2);
  ctx.fillStyle = '#285cb0';
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText('EN ESTE MOMENTO', panelX + 27, panelY + 304);
  ctx.fillStyle = '#182d25';
  ctx.font = '23px Arial, sans-serif';
  wrappedText(ctx, scene.caption, panelX + 27, panelY + 341, 364, 30, 6);

  ctx.fillStyle = '#485b51';
  ctx.font = '17px Arial, sans-serif';
  ctx.fillText('Tiempos, GPS y tráfico son simulados para explicar el método.', 26, 672);
  ctx.textAlign = 'right';
  ctx.fillText(`${scene.speed === 1 ? '' : `×${scene.speed} · `}${Math.floor(scene.time)} / ${scene.duration} s`, 1254, 672);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d8e6dc';
  ctx.fillRect(26, 690, 1228, 8);
  ctx.fillStyle = '#346dca';
  ctx.fillRect(26, 690, 1228 * Math.min(1, scene.time / scene.duration), 8);
  ctx.restore();
}
