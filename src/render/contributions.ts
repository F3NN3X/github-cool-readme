import type { Config } from '../config.ts';
import type { ContributionItem } from '../compute.ts';
import { icon } from './icons.ts';
import {
  CARD_HEIGHT, CARD_WIDTH as WIDTH, CONTENT_TOP, PAD, card, esc, fadeIn, formatCompact, formatMonth, headerText, plural, textWidth, truncate, type Theme,
} from './svg.ts';

// Four rows fit the shared card height.
const ROW = 33;
const AVATAR = 26;

export function describe(i: ContributionItem): string {
  const parts: string[] = [];
  if (i.merged) parts.push(`${plural(i.merged, 'PR')} merged`);
  if (i.open) parts.push(i.merged ? `${i.open} open` : `${plural(i.open, 'PR')} open`);
  return `${parts.join(', ')} · ${formatMonth(i.lastDate)}`;
}

export function renderContributions(items: ContributionItem[], theme: Theme, config: Config): string {
  const title = config.contributions.title;
  const header = title ? headerText(title, PAD) : '';
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Notable contributions', desc: 'No contributions to other projects yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No contributions to other projects yet</text>`,
    });
  }

  const nameX = PAD + AVATAR + 12;
  const starsRight = WIDTH - PAD;
  const rows = items
    .map((item, i) => {
      const [owner, repo] = item.repo.split('/');
      const stars = formatCompact(item.stars);
      const room = starsRight - nameX - textWidth(stars, 12) - 30;
      // Show "owner/" in a softer color; shorten the repo name first, then the owner.
      let ownerText = `${owner}/`;
      let repoText = truncate(repo, room - textWidth(ownerText, 13), 13, true);
      if (repoText.endsWith('…') && repoText.length < 10) {
        ownerText = truncate(ownerText, room / 3, 13);
        repoText = truncate(repo, room - textWidth(ownerText, 13), 13, true);
      }
      const cx = AVATAR / 2;
      const avatar = item.avatar
        ? `<clipPath id="av${i}"><circle cx="${cx}" cy="${cx}" r="${cx}"/></clipPath>` +
          `<image href="${item.avatar}" width="${AVATAR}" height="${AVATAR}" clip-path="url(#av${i})"/>` +
          `<circle cx="${cx}" cy="${cx}" r="${cx - 0.5}" stroke="${theme.border}" fill="none"/>`
        : `<circle cx="${cx}" cy="${cx}" r="${cx}" fill="${theme.track}"/>` +
          `<text x="${cx}" y="${cx + 4.5}" text-anchor="middle" class="value secondary">${esc(owner[0]?.toUpperCase() ?? '?')}</text>`;
      return fadeIn(
        PAD,
        CONTENT_TOP + i * ROW,
        i,
        avatar +
          `<text x="${nameX - PAD}" y="10.5" class="label"><tspan class="secondary">${esc(ownerText)}</tspan><tspan style="font-weight: 600;">${esc(repoText)}</tspan></text>` +
          `<text x="${nameX - PAD}" y="24.5" class="muted" style="font-size: 11px;">${esc(describe(item))}</text>` +
          icon('star', starsRight - PAD - textWidth(stars, 12) - 20, 6, 14) +
          `<text x="${starsRight - PAD}" y="17" class="value secondary" style="font-size: 12px;" text-anchor="end">${stars}</text>`,
        config,
      );
    })
    .join('\n');

  return card({
    width: WIDTH,
    height: Math.max(CARD_HEIGHT, CONTENT_TOP + items.length * ROW + 5),
    title: title ?? 'Notable contributions',
    desc: items.map((i) => `${i.repo} (${i.stars} stars): ${describe(i)}`).join('. '),
    theme,
    config,
    body: header + rows,
  });
}
