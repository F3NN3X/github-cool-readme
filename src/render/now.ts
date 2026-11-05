import { ACTIVITY_DAYS, type Config } from '../config.ts';
import type { NowModel } from '../compute.ts';
import { icon } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, FULL as WIDTH, PAD, SMALL, TEXT, card, esc, fadeIn, formatDay, headerText, plural, truncate, type Theme } from './svg.ts';

const TEXT_WIDTH = 410;
const BARS_LEFT = 470;
const BARS_RIGHT = WIDTH - PAD;
const BASELINE = 148;
const MAX_BAR = 92;

export function describeNow(n: NowModel): string {
  return [
    n.language?.name,
    plural(n.stars, 'star'),
    n.release,
    `${plural(n.commits, 'commit')} in ${ACTIVITY_DAYS} days`,
  ].filter(Boolean).join(' · ');
}

export function renderNow(n: NowModel | null, theme: Theme, config: Config): string {
  const title = config.now.title;
  const header = title ? headerText(title, PAD) : '';
  if (!n) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Now building', desc: 'No recent public commits.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No recent public commits</text>`,
    });
  }

  const max = Math.max(1, ...n.days);
  const slot = (BARS_RIGHT - BARS_LEFT) / n.days.length;
  const animate = config.theme.animations;
  const bars = n.days
    .map((count, i) => {
      const height = count ? Math.max(3, (count / max) * MAX_BAR) : 2;
      const fill = count ? theme.heat[Math.min(3, Math.ceil((count / max) * 4) - 1)] : theme.track;
      const delay = animate ? ` style="animation-delay: ${200 + i * 25}ms"` : '';
      return `<rect class="rise"${delay} x="${(BARS_LEFT + i * slot + 1).toFixed(1)}" y="${(BASELINE - height).toFixed(1)}" width="${(slot - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="${fill}"/>`;
    })
    .join('');

  const details = fadeIn(
    PAD,
    CONTENT_TOP,
    0,
    `<text y="20" style="font-size: 22px; font-weight: 700;">${esc(truncate(n.repo, TEXT_WIDTH, 22, true))}</text>` +
      (n.description ? `<text y="44" class="label secondary">${esc(truncate(n.description, TEXT_WIDTH, TEXT))}</text>` : '') +
      `<circle cx="5" cy="62" r="5" fill="${n.language?.color ?? theme.neutral}"/>` +
      `<text x="16" y="66" class="small secondary">${esc(truncate(describeNow(n), TEXT_WIDTH - 16, SMALL))}</text>` +
      (n.message
        ? icon('git-commit', 0, 86) +
          `<text x="26" y="98" class="small">${esc(truncate(n.message, TEXT_WIDTH - 26, SMALL))}</text>` +
          (n.date ? `<text x="26" y="115" class="small muted">Latest commit · ${esc(formatDay(n.date))}</text>` : '')
        : ''),
    config,
  );

  const css = animate
    ? `\n  .rise { transform-box: fill-box; transform-origin: bottom; animation: rise 0.6s cubic-bezier(.2,.7,.2,1) both; }` +
      `\n  @keyframes rise { from { transform: scaleY(0); } }`
    : '';

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Now building',
    desc: `${n.repo}: ${describeNow(n)}.${n.message ? ` Latest commit: ${n.message}.` : ''}`,
    theme,
    config,
    css,
    body:
      header +
      headerText(`Commits, last ${ACTIVITY_DAYS} days`, BARS_LEFT) +
      `\n<line x1="${BARS_LEFT}" y1="${BASELINE + 0.5}" x2="${BARS_RIGHT}" y2="${BASELINE + 0.5}" stroke="${theme.track}"/>\n` +
      details + '\n' + bars,
  });
}
