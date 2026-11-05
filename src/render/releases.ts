import type { Config } from '../config.ts';
import type { ReleaseItem } from '../compute.ts';
import { ROW, TOP, scrollingRows } from './contributions.ts';
import { icon } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, TEXT, WIDE as WIDTH, card, esc, fadeIn, formatDay, headerText, plural, textWidth, truncate, type Theme } from './svg.ts';

const NAME_X = 26;

export function renderReleases(items: ReleaseItem[], theme: Theme, config: Config): string {
  const title = config.releases.title;
  const header = title ? headerText(title, PAD) : '';
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Latest releases', desc: 'No releases yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No releases yet</text>`,
    });
  }

  const right = WIDTH - 2 * PAD;
  const rows = items
    .map((item, i) => {
      const date = `${formatDay(item.date)}, ${item.date.slice(0, 4)}`;
      const name = truncate(item.repo, right - NAME_X - textWidth(date, SMALL) - 12, TEXT, true);
      return fadeIn(
        PAD,
        TOP + i * ROW,
        i,
        icon('tag', 0, 1) +
          `<text x="${NAME_X}" y="13" class="label" style="font-weight: 600;">${esc(name)}</text>` +
          `<text x="${right}" y="13" class="small secondary" text-anchor="end">${esc(date)}</text>` +
          `<text x="${NAME_X}" y="30" class="small muted">${esc(truncate(`${item.tag} · ${plural(item.count, 'release')}`, right - NAME_X, SMALL))}</text>`,
        config,
      );
    })
    .join('\n');

  const list = scrollingRows(rows, items.length, WIDTH, config);
  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Latest releases',
    desc: items.map((i) => `${i.repo} ${i.tag} (${i.date.slice(0, 10)})`).join('. '),
    theme,
    config,
    css: list.css,
    body: header + list.body,
  });
}
