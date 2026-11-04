import type { Config } from '../config.ts';
import type { LanguageItem } from '../compute.ts';
import { card, esc, fadeIn, truncate, type Theme } from './svg.ts';

const WIDTH = 350;
const PAD = 18;
const BAR_Y = 18;
const BAR_H = 8;
const GAP = 2;
const LEGEND_TOP = 46;
const LEGEND_ROW = 22;

const pct = (p: number) => `${p < 0.1 ? '<0.1' : p.toFixed(1)}%`;

export function renderLanguages(items: LanguageItem[], theme: Theme, config: Config): string {
  const barWidth = WIDTH - 2 * PAD;
  const colorOf = (l: LanguageItem) => l.color ?? theme.neutral;

  if (!items.length) {
    return card({
      width: WIDTH, height: 56, title: 'Languages', desc: 'No language data.', theme, config,
      body: `<text x="${PAD}" y="33" class="label muted">No language data yet</text>`,
    });
  }

  // Segments share the bar minus the gaps between them; a mask gives the bar its rounded ends.
  const usable = barWidth - GAP * (items.length - 1);
  let x = PAD;
  const segments = items
    .map((l) => {
      const w = Math.max(0, (l.percent / 100) * usable);
      const rect = `<rect x="${x.toFixed(2)}" y="${BAR_Y}" width="${w.toFixed(2)}" height="${BAR_H}" fill="${colorOf(l)}"/>`;
      x += w + GAP;
      return rect;
    })
    .join('');

  const bar = `
<mask id="bar"><rect class="grow" x="${PAD}" y="${BAR_Y}" width="${barWidth}" height="${BAR_H}" rx="4" fill="#fff"/></mask>
<g mask="url(#bar)">${segments}</g>`;

  const colWidth = barWidth / 2;
  const legend = items
    .map((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const name = truncate(l.name, colWidth - 70, 12);
      return fadeIn(
        PAD + col * colWidth,
        LEGEND_TOP + row * LEGEND_ROW,
        i,
        `<circle cx="5" cy="5" r="5" fill="${colorOf(l)}"/>` +
          `<text x="16" y="9.5" class="label" style="font-size: 12px;">${esc(name)}</text>` +
          `<text x="${colWidth - 12}" y="9.5" class="value secondary" style="font-size: 12px; font-weight: 400;" text-anchor="end">${pct(l.percent)}</text>`,
        config,
        70,
      );
    })
    .join('\n');

  const rows = Math.ceil(items.length / 2);
  return card({
    width: WIDTH,
    height: LEGEND_TOP + rows * LEGEND_ROW + 4,
    title: 'Most used languages',
    desc: items.map((l) => `${l.name} ${pct(l.percent)}`).join(', '),
    theme,
    config,
    body: bar + '\n' + legend,
  });
}
