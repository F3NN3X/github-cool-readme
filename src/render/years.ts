import type { Config } from '../config.ts';
import type { YearItem } from '../compute.ts';
import { CARD_HEIGHT, CONTENT_TOP, NARROW as WIDTH, PAD, SMALL, TEXT, card, esc, fadeIn, formatNumber, headerText, textWidth, truncate, type Theme } from './svg.ts';

const ROW = 46;
const BAR_Y = 22;
const BAR_HEIGHT = 8;
const NOTE_X = 44;

export function renderYears(items: YearItem[], theme: Theme, config: Config): string {
  const title = config.years.title;
  const header = title ? headerText(title, PAD) : '';
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Year by year', desc: 'No contributions yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No contributions yet</text>`,
    });
  }

  const inner = WIDTH - 2 * PAD;
  const max = Math.max(...items.map((y) => y.contributions));
  const rows = items
    .map((y, i) => {
      const count = formatNumber(y.contributions);
      const share = y.contributions / max;
      // Shaded with the contribution graph's greens, like the weekly card.
      const fill = theme.heat[Math.min(3, Math.ceil(share * 4) - 1)];
      const room = inner - NOTE_X - textWidth(count, TEXT, true) - 12;
      return fadeIn(
        PAD,
        CONTENT_TOP + i * ROW,
        i,
        `<text x="0" y="13" class="value">${esc(y.year)}</text>` +
          (y.milestone ? `<text x="${NOTE_X}" y="13" class="small muted">${esc(truncate(y.milestone, room, SMALL))}</text>` : '') +
          `<text x="${inner}" y="13" class="value" text-anchor="end">${count}</text>` +
          `<rect y="${BAR_Y}" width="${inner}" height="${BAR_HEIGHT}" rx="4" fill="${theme.track}"/>` +
          `<rect class="grow" y="${BAR_Y}" width="${(inner * share).toFixed(1)}" height="${BAR_HEIGHT}" rx="4" fill="${fill}"/>`,
        config,
      );
    })
    .join('\n');

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Year by year',
    desc: 'Contributions per year: ' + items.map((y) => `${y.year} ${y.contributions}${y.milestone ? ` (${y.milestone})` : ''}`).join(', ') + '.',
    theme,
    config,
    body: header + '\n' + rows,
  });
}
