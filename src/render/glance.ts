import type { Config } from '../config.ts';
import type { GlanceItem } from '../compute.ts';
import { CARD_HEIGHT, CONTENT_TOP, NARROW as WIDTH, PAD, card, esc, fadeIn, formatNumber, headerText, type Theme } from './svg.ts';

const COLUMNS = 2;
const ROW = 48;

/** A narrow card of big numbers with a label under each, two to a row. */
export function tileCard(title: string | null, fallback: string, items: GlanceItem[], theme: Theme, config: Config): string {
  const column = (WIDTH - 2 * PAD) / COLUMNS;
  const tiles = items
    .map((item, i) =>
      fadeIn(
        PAD + (i % COLUMNS) * column,
        CONTENT_TOP + Math.floor(i / COLUMNS) * ROW,
        i,
        `<text y="18" style="font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;">${typeof item.value === 'number' ? formatNumber(item.value) : esc(item.value)}</text>` +
          `<text y="35" class="small secondary">${esc(item.label)}</text>`,
        config,
      ),
    )
    .join('\n');

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? fallback,
    desc: items.map((i) => `${i.label}: ${i.value}`).join('. ') + '.',
    theme,
    config,
    body: (title ? headerText(title, PAD) : '') + '\n' + tiles,
  });
}

export function renderGlance(items: GlanceItem[], theme: Theme, config: Config): string {
  return tileCard(config.glance.title, 'At a glance', items, theme, config);
}
