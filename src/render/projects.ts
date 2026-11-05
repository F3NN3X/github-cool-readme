import type { Config } from '../config.ts';
import type { ProjectItem } from '../compute.ts';
import { ROW, TOP, scrollingRows } from './contributions.ts';
import { icon } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, TEXT, WIDE as WIDTH, card, esc, fadeIn, formatCompact, headerText, textWidth, truncate, type Theme } from './svg.ts';

const NAME_X = 22;

export function describeProject(p: ProjectItem): string {
  return [p.language?.name, p.description].filter(Boolean).join(' · ');
}

export function renderProjects(items: ProjectItem[], theme: Theme, config: Config): string {
  const title = config.projects.title;
  const header = title ? headerText(title, PAD) : '';
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Projects', desc: 'No public projects yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No public projects yet</text>`,
    });
  }

  const right = WIDTH - 2 * PAD;
  const rows = items
    .map((item, i) => {
      const stars = formatCompact(item.stars);
      const name = truncate(item.repo, right - NAME_X - textWidth(stars, SMALL) - 30, TEXT, true);
      return fadeIn(
        PAD,
        TOP + i * ROW,
        i,
        `<circle cx="6" cy="9" r="6" fill="${item.language?.color ?? theme.neutral}"/>` +
          `<text x="${NAME_X}" y="13" class="label" style="font-weight: 600;">${esc(name)}</text>` +
          `<text x="${NAME_X}" y="30" class="small muted">${esc(truncate(describeProject(item), right - NAME_X, SMALL))}</text>` +
          icon('star', right - textWidth(stars, SMALL) - 20, 1, 14) +
          `<text x="${right}" y="13" class="small secondary" style="font-weight: 600;" text-anchor="end">${stars}</text>`,
        config,
      );
    })
    .join('\n');

  const list = scrollingRows(rows, items.length, WIDTH, config, 'projects');
  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Projects',
    desc: items.map((i) => `${i.repo} (${i.stars} stars): ${describeProject(i)}`).join('. '),
    theme,
    config,
    css: list.css,
    body: header + list.body,
  });
}
