import type { DestinationCategory } from './destinations';

// Glyphs from Lucide (ISC), the icon set used across the app, so map markers
// read as the same family as the interface. 24×24 grid, stroke-only.
export const PLACE_GLYPHS: Record<DestinationCategory, string> = {
  mercado:
    '<path d="m15 11-1 9"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"/><path d="M4.5 15.5h15"/><path d="m5 11 4-7"/><path d="m9 11 1 9"/>',
  comercio:
    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  colegio:
    '<path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M18 4.933V21"/><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6"/><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11"/><path d="M6 4.933V21"/><circle cx="12" cy="9" r="2"/>',
  inicial:
    '<path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"/><rect x="14" y="2" width="8" height="8" rx="1"/>',
  superior:
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  salud:
    '<path d="M12 7v4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M14 9h-4"/><path d="M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16"/>',
  terminal:
    '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/>',
  servicio:
    '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  recreacion:
    '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
};

/** Standalone glyph (for popups and lists). */
export const glyphSvg = (category: DestinationCategory, size = 16, color = 'currentColor') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PLACE_GLYPHS[category]}</svg>`;

/**
 * Map marker: a soft rounded square in the category color with a white glyph
 * and a thin halo matching the basemap. Drawn at 2× for sharp rendering.
 */
export function markerSvg(category: DestinationCategory, color: string, dark: boolean) {
  return glyphMarkerSvg(PLACE_GLYPHS[category], color, dark);
}

/** Glyphs for map events (Lucide): closure barrier, fair, alert. */
export const EVENT_GLYPHS = {
  barrera:
    '<rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/>',
  feria: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
} as const;

/** Rounded-square marker with a white glyph, same family as place markers. */
export function glyphMarkerSvg(glyph: string, color: string, dark: boolean) {
  const halo = dark ? '#171c23' : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
  <rect x="3" y="3.5" width="26" height="26" rx="9" fill="#10182033"/>
  <rect x="3" y="2.5" width="26" height="26" rx="9" fill="${halo}"/>
  <rect x="5" y="4.5" width="22" height="22" rx="7.5" fill="${color}"/>
  <g transform="translate(9 8.5) scale(0.5833)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;
}

/**
 * Traffic light for the map, same housing as `SignalIcon`: three lamps with
 * only the current one lit, so the phase reads without relying on color alone.
 */
export function signalLightSvg(phase: 'red' | 'amber' | 'green', dark: boolean) {
  // Light rim in both themes: the dark housing must stand out on a dark map.
  const halo = dark ? '#8a94a3' : '#ffffff';
  const lit = { red: '#e5484d', amber: '#f5a524', green: '#30a46c' };
  const lamp = (p: keyof typeof lit, cy: number) =>
    `<circle cx="16" cy="${cy}" r="3.6" fill="${p === phase ? lit[p] : '#3a4250'}"/>` +
    (p === phase ? `<circle cx="16" cy="${cy}" r="5.4" fill="${lit[p]}" opacity=".28"/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
  <rect x="9.5" y="2" width="13" height="27" rx="4.5" fill="${halo}"/>
  <rect x="11" y="3.5" width="10" height="24" rx="3.2" fill="#1c222b"/>
  ${lamp('red', 8.5)}${lamp('amber', 15.5)}${lamp('green', 22.5)}
</svg>`;
}

/** Rasterizes an SVG string for MapLibre `addImage`. */
export function rasterize(svg: string, size = 64): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      resolve(ctx.getImageData(0, 0, size, size));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Direction arrow for one-way streets, in the quiet grey of basemap labels:
 * a thin shaft and a filled head pointing along +x (MapLibre aligns the icon's
 * x axis with the line direction). Drawn at 2x.
 */
export function onewayArrow(dark: boolean): ImageData {
  const c = document.createElement('canvas');
  c.width = 56;
  c.height = 28;
  const ctx = c.getContext('2d')!;
  const ink = dark ? '#aab4c2' : '#6f7a88';
  const halo = dark ? '#171c23' : '#ffffff';
  const draw = (stroke: string, width: number, fill: boolean) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(8, 14);
    ctx.lineTo(36, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(34, 6.5);
    ctx.lineTo(48, 14);
    ctx.lineTo(34, 21.5);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
  };
  draw(halo, 6, true);
  draw(ink, 2.6, true);
  return ctx.getImageData(0, 0, 56, 28);
}
