import type { Config } from '../config.ts';
import type { CountKey, SummaryModel } from '../compute.ts';
import { icon, type IconName } from './icons.ts';
import { card, esc, fadeIn, formatNumber, type Theme } from './svg.ts';

const ICONS: Record<CountKey, IconName> = {
  commits: 'git-commit',
  pullRequests: 'git-pull-request',
  reviews: 'code-review',
  issues: 'issue-opened',
};

const WIDTH = 480;
const ROW = 26;
const COL_12 = 268; // right edge of the "12 months" column
const COL_ALL = 352; // right edge of the "All time" column
const RING_X = 418;
const RADIUS = 38;

export function renderSummary(m: SummaryModel, theme: Theme, config: Config): string {
  const top = m.title ? 46 : 18;
  const rows = [
    ...m.rows.map((r) => ({ icon: ICONS[r.key], label: r.label, last12: formatNumber(r.last12Months), all: formatNumber(r.allTime) })),
    { icon: 'star' as IconName, label: 'Stars earned', last12: formatNumber(m.stars.last12Months), all: formatNumber(m.stars.allTime) },
  ];
  const tableTop = top + 22;
  const height = tableTop + rows.length * ROW + 8;

  const header =
    `<text x="${COL_12}" y="${top + 8}" class="head" text-anchor="end">12 MONTHS</text>` +
    `<text x="${COL_ALL}" y="${top + 8}" class="head" text-anchor="end">ALL TIME</text>`;

  const body = rows
    .map((r, i) =>
      fadeIn(
        0,
        tableTop + i * ROW,
        i,
        icon(r.icon, 18, 2) +
          `<text x="44" y="14" class="label">${esc(r.label)}</text>` +
          (r.last12 ? `<text x="${COL_12}" y="14" class="value" text-anchor="end">${r.last12}</text>` : '') +
          `<text x="${COL_ALL}" y="14" class="value" text-anchor="end">${r.all}</text>`,
        config,
      ),
    )
    .join('\n');

  // Activity ring: share of days with at least one contribution.
  const cy = tableTop + (rows.length * ROW) / 2 - 8;
  const circumference = 2 * Math.PI * RADIUS;
  const offset = circumference * (1 - m.activity.percent / 100);
  const ring = `
<circle cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.track}" stroke-width="7" fill="none"/>
<circle class="ring" cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.accent}" stroke-width="7" fill="none" stroke-linecap="round"
  stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${RING_X} ${cy})"/>
<g class="pop"><text x="${RING_X}" y="${cy + 7}" text-anchor="middle" style="font-size: 20px; font-weight: 700;">${m.activity.percent}%</text></g>
<text x="${RING_X}" y="${cy + RADIUS + 22}" text-anchor="middle" class="head">ACTIVE DAYS</text>
<text x="${RING_X}" y="${cy + RADIUS + 36}" text-anchor="middle" class="head">LAST 12 MONTHS</text>`;

  const css = config.theme.animations
    ? `\n  @keyframes ring { from { stroke-dashoffset: ${circumference.toFixed(2)}; } }`
    : '';

  const desc = [
    ...m.rows.map((r) => `${r.label}: ${r.last12Months} in the last 12 months, ${r.allTime} all time.`),
    `Stars earned: ${m.stars.last12Months} in the last 12 months, ${m.stars.allTime} all time.`,
    `Active on ${m.activity.activeDays} of the last ${m.activity.totalDays} days (${m.activity.percent}%).`,
  ].join(' ');

  return card({
    width: WIDTH,
    height: Math.max(height, cy + RADIUS + 46),
    title: m.title ?? 'GitHub stats',
    desc,
    theme,
    config,
    css,
    body: (m.title ? `<text x="18" y="28" class="title">${esc(m.title)}</text>\n` : '') + header + '\n' + body + ring,
  });
}
