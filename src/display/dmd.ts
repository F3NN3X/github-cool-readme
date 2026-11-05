// Shared pieces of the display cards: a grid of 3px cells, looks (amber, green, GitHub
// colours), the panel with optional round LED dots and glow, and keyframe helpers.

export const PITCH = 3;

// Every display card has the same size: 150 x 65 cells.
export const COLS = 150;
export const ROWS = 65;
export const W = COLS * PITCH; // 450
export const H = ROWS * PITCH; // 195
/** The row of the title line at the top of every card. */
export const TITLE_ROW = 3;
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;

export type Cell = [number, number];
export type Mode = 'light' | 'dark';
export type Color = 'amber' | 'green' | 'theme';

export interface Look {
  /** Lit dots. */
  lit: string;
  /** Rings and bars; the lit colour on the LED looks. */
  accent: string;
  /** A brighter tint for the shine that sweeps across text. */
  shine: string;
  /** Opacity of secondary text. */
  dim: number;
  /** Panel behind the dots; null for transparent. */
  panel: string | null;
  /** Unlit dots, shown faintly behind the lit ones. */
  unlit: string;
  unlitOpacity: number;
  glow: boolean;
}

export function look(color: Color, mode: Mode): Look {
  if (color === 'amber') {
    return { lit: '#ffab1a', accent: '#ffab1a', shine: '#fff2cc', dim: 0.55, panel: '#0d0b07', unlit: '#ffab1a', unlitOpacity: 0.09, glow: true };
  }
  if (color === 'green') {
    return { lit: '#3dff74', accent: '#3dff74', shine: '#e8ffef', dim: 0.55, panel: '#070d09', unlit: '#3dff74', unlitOpacity: 0.08, glow: true };
  }
  // theme: GitHub's Primer colours, on a transparent background, per light or dark theme.
  return mode === 'light'
    ? { lit: '#1f2328', accent: '#0969da', shine: '#0969da', dim: 0.6, panel: null, unlit: '#d1d9e0', unlitOpacity: 0.3, glow: false }
    : { lit: '#f0f6fc', accent: '#4493f8', shine: '#4493f8', dim: 0.6, panel: null, unlit: '#3d444d', unlitOpacity: 0.35, glow: false };
}

/** Lit cells as one path: each row's runs of neighbouring cells become one rectangle. */
export function cellsPath(cells: Cell[]): string {
  const rows = new Map<number, Set<number>>();
  for (const [c, r] of cells) {
    if (!rows.has(r)) rows.set(r, new Set());
    rows.get(r)!.add(c);
  }
  let d = '';
  for (const [r, set] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const cols = [...set].sort((a, b) => a - b);
    for (let i = 0; i < cols.length; ) {
      let j = i;
      while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
      const w = (j - i + 1) * PITCH;
      d += `M${cols[i] * PITCH} ${r * PITCH}h${w}v${PITCH}h-${w}z`;
      i = j + 1;
    }
  }
  return d;
}

export function path(cells: Cell[], fill: string, attrs = ''): string {
  return cells.length ? `<path d="${cellsPath(cells)}" fill="${fill}"${attrs ? ' ' + attrs : ''}/>` : '';
}

/** Cells of a ring of the given outer radius and thickness, all in cells. */
export function ringCells(cx: number, cy: number, outer: number, thickness: number): Cell[] {
  const cells: Cell[] = [];
  for (let r = Math.floor(cy - outer); r <= Math.ceil(cy + outer); r++) {
    for (let c = Math.floor(cx - outer); c <= Math.ceil(cx + outer); c++) {
      const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
      if (d <= outer && d > outer - thickness) cells.push([c, r]);
    }
  }
  return cells;
}

/** A keyframes rule on a shared timeline of `total` seconds; times in seconds. */
export function keyframes(name: string, total: number, frames: { t: number; css: string; ease?: string }[]): string {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / total) * 100)).toFixed(3)}%`;
  const body = sorted.map((f) => `${pct(f.t)} { ${f.css}${f.ease ? ` animation-timing-function: ${f.ease};` : ''} }`).join(' ');
  return `\n  @keyframes ${name} { ${body} }`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** How a display card is drawn. */
export interface Style {
  look: Look;
  /** Round LED dots; otherwise the cells are drawn as solid square pixels. */
  dots: boolean;
  animations: boolean;
}

export interface FrameOptions {
  width: number;
  height: number;
  title: string;
  desc: string;
  look: Look;
  dots: boolean;
  animations: boolean;
  css: string;
  body: string;
}

export function frame(o: FrameOptions): string {
  const { look: l } = o;
  const all = `x="0" y="0" width="${o.width}" height="${o.height}"`;
  const defs = [
    o.dots
      ? `<pattern id="dot" width="${PITCH}" height="${PITCH}" patternUnits="userSpaceOnUse"><circle cx="${PITCH / 2}" cy="${PITCH / 2}" r="1.2" fill="#fff"/></pattern>` +
        `<mask id="dots" maskUnits="userSpaceOnUse" ${all}><rect ${all} fill="url(#dot)"/></mask>`
      : '',
    l.glow
      ? `<filter id="glow" filterUnits="userSpaceOnUse" ${all}><feGaussianBlur stdDeviation="1.4" result="b"/>` +
        `<feComponentTransfer in="b" result="h"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>` +
        `<feMerge><feMergeNode in="h"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      : '',
  ].join('');
  const panel = l.panel ? `<rect x="0.5" y="0.5" width="${o.width - 1}" height="${o.height - 1}" rx="8" fill="${l.panel}"/>` : '';
  const unlit = o.dots ? `<rect ${all} fill="${l.unlit}" fill-opacity="${l.unlitOpacity}" mask="url(#dots)"/>` : '';
  let content = o.body;
  if (o.dots) content = `<g mask="url(#dots)">${content}</g>`;
  if (l.glow) content = `<g filter="url(#glow)">${content}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" fill="none" role="img" aria-labelledby="title desc">
<title id="title">${esc(o.title)}</title>
<desc id="desc">${esc(o.desc)}</desc>
<style>
  text { font-family: ${FONT}; }${o.animations ? o.css : ''}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>${defs}</defs>
${panel}
${unlit}
${content}
</svg>
`;
}
