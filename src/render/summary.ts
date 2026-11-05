import type { Config } from '../config.ts';
import type { CountKey, SummaryModel } from '../compute.ts';
import { icon, type IconName } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, WIDE, card, esc, fadeIn, formatNumber, headerText, type Theme } from './svg.ts';

const ICONS: Record<CountKey, IconName> = {
  commits: 'git-commit',
  pullRequests: 'git-pull-request',
  reviews: 'code-review',
  issues: 'issue-opened',
};

const ROW = 28;
const COL_12 = 222; // right edge of the "year" column
const COL_ALL = 300; // right edge of the "all time" column
const RING_X = 374; // centred in the space right of the table
const RADIUS = 40;
const LOGO = 66; // GitHub mark: nearly fills the ring, as on the old github-readme-stats card

export function renderSummary(m: SummaryModel, theme: Theme, config: Config): string {
  const rows = [
    ...m.rows.map((r) => ({ icon: ICONS[r.key], label: r.label, last12: formatNumber(r.last12Months), all: formatNumber(r.allTime) })),
    { icon: 'star' as IconName, label: 'Stars earned', last12: formatNumber(m.stars.last12Months), all: formatNumber(m.stars.allTime) },
  ];
  const tableTop = CONTENT_TOP;
  const height = tableTop + rows.length * ROW + 8;

  const header =
    (m.title ? headerText(m.title, PAD) : '') +
    headerText('Year', COL_12, 'end') +
    headerText('All time', COL_ALL, 'end') +
    headerText(`${m.ring === 'github' ? `${m.activity.percent}% ` : ''}Active days`, RING_X, 'middle');

  const body = rows
    .map((r, i) =>
      fadeIn(
        0,
        tableTop + i * ROW,
        i,
        icon(r.icon, PAD, 3) +
          `<text x="${PAD + 26}" y="15" class="label">${esc(r.label)}</text>` +
          (r.last12 ? `<text x="${COL_12}" y="15" class="value" text-anchor="end">${r.last12}</text>` : '') +
          `<text x="${COL_ALL}" y="15" class="value" text-anchor="end">${r.all}</text>`,
        config,
      ),
    )
    .join('\n');

  // Activity ring: share of days with at least one contribution. Its caption sits on the header
  // line, and the ring is centred on the rows below it.
  const cy = tableTop + ((rows.length - 1) * ROW) / 2 + 10;
  const circumference = 2 * Math.PI * RADIUS;
  const offset = circumference * (1 - m.activity.percent / 100);
  const ring = `
<circle cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.track}" stroke-width="7" fill="none"/>
<circle class="ring" cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.accent}" stroke-width="7" fill="none" stroke-linecap="round"
  stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${RING_X} ${cy})"/>
${
  m.ring === 'github'
    ? // The mark is a circle cut off at the bottom; in its 24px drawing that circle's centre is (12, 12.5).
      `<g class="pop">${icon('mark-github', RING_X - (12 * LOGO) / 24, cy - (12.5 * LOGO) / 24, LOGO, 'logo')}</g>`
    : `<g class="pop"><text x="${RING_X}" y="${cy + 7}" text-anchor="middle" style="font-size: 20px; font-weight: 700;">${m.activity.percent}%</text></g>`
}`;

  const css =
    `\n  .logo { fill: ${theme.text}; }` +
    (config.theme.animations ? `\n  @keyframes ring { from { stroke-dashoffset: ${circumference.toFixed(2)}; } }` : '');

  const desc = [
    ...m.rows.map((r) => `${r.label}: ${r.last12Months} in the last 12 months, ${r.allTime} all time.`),
    `Stars earned: ${m.stars.last12Months} in the last 12 months, ${m.stars.allTime} all time.`,
    `Active on ${m.activity.activeDays} of the last ${m.activity.totalDays} days (${m.activity.percent}%).`,
  ].join(' ');

  return card({
    width: WIDE,
    height: Math.max(CARD_HEIGHT, height, cy + RADIUS + 10),
    title: m.title ?? 'GitHub stats',
    desc,
    theme,
    config,
    css,
    body: header + '\n' + body + ring,
  });
}
