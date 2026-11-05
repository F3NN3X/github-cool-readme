import { ACTIVITY_DAYS, type Config } from '../config.ts';
import type { ActivityItem } from '../compute.ts';
import { ROW, TOP, scrollingRows } from './contributions.ts';
import { icon } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, TEXT, WIDE as WIDTH, card, esc, fadeIn, formatDay, headerText, plural, textWidth, truncate, type Theme } from './svg.ts';

const NAME_X = 26;

export function describeActivity(a: ActivityItem): string {
  return `${plural(a.commits, 'commit')} · ${formatDay(a.date)}`;
}

export function renderActivity(items: ActivityItem[], theme: Theme, config: Config): string {
  const title = config.activity.title;
  const header = title ? headerText(title, PAD) : '';
  const none = `No commits to public repositories in the last ${ACTIVITY_DAYS} days`;
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Recent activity', desc: `${none}.`, theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">${esc(none)}</text>`,
    });
  }

  const right = WIDTH - 2 * PAD;
  const rows = items
    .map((item, i) => {
      const when = describeActivity(item);
      const name = truncate(item.repo, right - NAME_X - textWidth(when, SMALL) - 12, TEXT, true);
      return fadeIn(
        PAD,
        TOP + i * ROW,
        i,
        icon('git-commit', 0, 1) +
          `<text x="${NAME_X}" y="13" class="label" style="font-weight: 600;">${esc(name)}</text>` +
          `<text x="${right}" y="13" class="small secondary" text-anchor="end">${esc(when)}</text>` +
          `<text x="${NAME_X}" y="30" class="small muted">${esc(truncate(item.message, right - NAME_X, SMALL))}</text>`,
        config,
      );
    })
    .join('\n');

  const list = scrollingRows(rows, items.length, WIDTH, config, 'activity');
  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Recent activity',
    desc: items.map((i) => `${i.repo}: ${describeActivity(i)}, ${i.message}`).join('. '),
    theme,
    config,
    css: list.css,
    body: header + list.body,
  });
}
