import type { Config } from '../config.ts';
import type { DownloadsModel } from '../compute.ts';
import { ROW, TOP, scrollingRows } from './contributions.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, TEXT, WIDE as WIDTH, card, esc, fadeIn, formatNumber, headerText, textWidth, truncate, type Theme } from './svg.ts';

const BAR_Y = 22;
const BAR_HEIGHT = 8;

export function renderDownloads(m: DownloadsModel, theme: Theme, config: Config): string {
  const title = config.downloads.title;
  const header = title ? headerText(title, PAD) : '';
  if (!m.items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Downloads', desc: 'No release downloads yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No release downloads yet</text>`,
    });
  }

  const inner = WIDTH - 2 * PAD;
  const max = m.items[0].downloads;
  const rows = m.items
    .map((item, i) => {
      const count = formatNumber(item.downloads);
      const name = truncate(item.repo, inner - textWidth(count, TEXT, true) - 12, TEXT, true);
      return fadeIn(
        PAD,
        TOP + i * ROW,
        i,
        `<text x="0" y="13" class="label" style="font-weight: 600;">${esc(name)}</text>` +
          `<text x="${inner}" y="13" class="value" text-anchor="end">${count}</text>` +
          `<rect y="${BAR_Y}" width="${inner}" height="${BAR_HEIGHT}" rx="4" fill="${theme.track}"/>` +
          `<rect class="grow" y="${BAR_Y}" width="${((inner * item.downloads) / max).toFixed(1)}" height="${BAR_HEIGHT}" rx="4" fill="${theme.accent}"/>`,
        config,
      );
    })
    .join('\n');

  const list = scrollingRows(rows, m.items.length, WIDTH, config, 'downloads');
  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Downloads',
    desc: `${m.total} release downloads. ` + m.items.map((i) => `${i.repo}: ${i.downloads}`).join('. '),
    theme,
    config,
    css: list.css,
    body: header + headerText(`${formatNumber(m.total)} total`, WIDTH - PAD, 'end') + list.body,
  });
}
