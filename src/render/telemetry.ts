import { ACTIVITY_DAYS, type Config } from '../config.ts';
import type { TelemetryModel } from '../compute.ts';
import { CARD_HEIGHT, FULL as WIDTH, HEADER_Y, PAD, card, esc, formatDay, formatNumber, headerText, type Theme } from './svg.ts';

const GAUGE_Y = 106;
const RADIUS = 44;
const SWEEP = 240; // degrees of the dial
const GAUGE_X = [92, 232, 372];
const LINE_LEFT = 470;
const LINE_TOP = 56;
const LINE_BOTTOM = 148;
const LINE_RIGHT = WIDTH - PAD;

function polar(cx: number, cy: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  return `${(cx + RADIUS * Math.cos(radians)).toFixed(2)} ${(cy + RADIUS * Math.sin(radians)).toFixed(2)}`;
}

/** A dial open at the bottom, filled to `share`; the path has a length of 100 so the fill is a percentage. */
function gauge(cx: number, value: string, label: string, share: number, theme: Theme): string {
  const start = 90 + (360 - SWEEP) / 2;
  const d = `M${polar(cx, GAUGE_Y, start)}A${RADIUS} ${RADIUS} 0 1 1 ${polar(cx, GAUGE_Y, start + SWEEP)}`;
  const filled = (Math.min(1, Math.max(0, share)) * 100).toFixed(1);
  return (
    `<path d="${d}" pathLength="100" stroke="${theme.track}" stroke-width="7" stroke-linecap="round"/>` +
    `<path class="gauge" d="${d}" pathLength="100" stroke="${theme.accent}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${filled} 100"/>` +
    `<text x="${cx}" y="${GAUGE_Y + 7}" text-anchor="middle" style="font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;">${esc(value)}</text>` +
    `<text x="${cx}" y="${GAUGE_Y + 66}" text-anchor="middle" class="small secondary">${esc(label)}</text>`
  );
}

function sparkline(days: number[], theme: Theme): string {
  if (days.length < 2) return '';
  const max = Math.max(1, ...days);
  const point = (count: number, i: number) => {
    const x = LINE_LEFT + (i * (LINE_RIGHT - LINE_LEFT)) / (days.length - 1);
    return [x, LINE_BOTTOM - (count / max) * (LINE_BOTTOM - LINE_TOP)];
  };
  const points = days.map(point);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [lastX, lastY] = points.at(-1)!;
  const total = days.reduce((s, n) => s + n, 0);
  return (
    `<path class="fade" d="${line}L${LINE_RIGHT} ${LINE_BOTTOM}L${LINE_LEFT} ${LINE_BOTTOM}Z" fill="${theme.accent}" fill-opacity="0.12"/>` +
    `<line x1="${LINE_LEFT}" y1="${LINE_BOTTOM + 0.5}" x2="${LINE_RIGHT}" y2="${LINE_BOTTOM + 0.5}" stroke="${theme.track}"/>` +
    `<path class="trace" d="${line}" pathLength="1" stroke="${theme.accent}" stroke-width="2" stroke-linejoin="round" stroke-dasharray="1"/>` +
    `<circle class="pulse" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="${theme.accent}"/>` +
    `<text x="${LINE_LEFT}" y="${LINE_BOTTOM + 24}" class="small secondary">${formatNumber(total)} contributions</text>` +
    `<text x="${LINE_RIGHT}" y="${LINE_BOTTOM + 24}" class="small secondary" text-anchor="end">Peak ${formatNumber(max)} a day</text>`
  );
}

export function renderTelemetry(m: TelemetryModel, theme: Theme, config: Config): string {
  const title = config.telemetry.title;
  const activeDays = m.days.filter((n) => n > 0).length;
  const gauges =
    gauge(GAUGE_X[0], formatNumber(m.perDay), 'Contributions a day', m.peakPerDay ? m.perDay / m.peakPerDay : 0, theme) +
    gauge(GAUGE_X[1], `${activeDays}/${ACTIVITY_DAYS}`, 'Active days', activeDays / ACTIVITY_DAYS, theme) +
    gauge(GAUGE_X[2], `${m.activeRepos}/${m.publicRepos}`, 'Public repos active', m.publicRepos ? m.activeRepos / m.publicRepos : 0, theme);

  const css = config.theme.animations
    ? `\n  .gauge { animation: gauge 1.2s cubic-bezier(.2,.7,.2,1) 0.2s both; }` +
      `\n  .trace { animation: trace 1.6s ease-out 0.3s both; }` +
      `\n  .pulse { animation: pulse 3s ease-in-out infinite; }` +
      `\n  @keyframes gauge { from { stroke-dasharray: 0 100; } }` +
      `\n  @keyframes trace { from { stroke-dashoffset: 1; } }` +
      `\n  @keyframes pulse { 50% { opacity: 0.35; } }`
    : '';

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Telemetry',
    desc:
      `${formatNumber(m.perDay)} contributions a day over the last 7 days, of a peak of ${formatNumber(m.peakPerDay)}. ` +
      `Active on ${activeDays} of the last ${ACTIVITY_DAYS} days. ${m.activeRepos} of ${m.publicRepos} public repos active.`,
    theme,
    config,
    css,
    body:
      (title ? headerText(title, PAD) : '') +
      `<text x="${GAUGE_X[2] + RADIUS + 8}" y="${HEADER_Y}" class="col" text-anchor="end">UPDATED ${esc(formatDay(m.updated).toUpperCase())}</text>` +
      headerText(`Last ${ACTIVITY_DAYS} days`, LINE_LEFT) +
      '\n' + gauges + '\n' + sparkline(m.days, theme),
  });
}
