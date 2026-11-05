import { formatDay, formatMonth, formatNumber, plural } from './render/svg.ts';
import type { LanguageItem } from './compute.ts';
import type { PullRequest, Snapshot } from './types.ts';

type Tile = { label: string; value: number | string };

const HOUR = 60 * 60 * 1000;

/** A span as the largest unit that reads well: "under 1h", "5h", "3d". */
export function formatDuration(ms: number): string {
  const hours = ms / HOUR;
  if (hours < 1) return 'under 1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The longest run of active days, and the run reaching today; a quiet today doesn't end a streak. */
export function streakLengths(days: Snapshot['allDays']): { current: number; longest: number } {
  const dates = [...new Map(days.map((d) => [d.date, d.count])).entries()].sort(([a], [b]) => a.localeCompare(b));
  let longest = 0;
  let run = 0;
  let previous = 0;
  for (const [date, count] of dates) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (count > 0) {
      run = previous && time - previous === 24 * HOUR ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = time;
    } else {
      run = 0;
      previous = 0;
    }
  }
  const reaching = dates.at(-1)?.[1] === 0 ? dates.slice(0, -1) : dates;
  let current = 0;
  for (let i = reaching.length - 1; i >= 0 && reaching[i][1] > 0; i--) {
    const gap = i < reaching.length - 1 ? Date.parse(reaching[i + 1][0]) - Date.parse(reaching[i][0]) : 24 * HOUR;
    if (gap !== 24 * HOUR) break;
    current++;
  }
  return { current, longest };
}

export function streakStats(days: Snapshot['allDays']): Tile[] {
  const { current, longest } = streakLengths(days);
  const active = days.filter((d) => d.count > 0);
  const total = active.reduce((s, d) => s + d.count, 0);
  const best = active.reduce<Snapshot['allDays'][number] | null>((top, d) => (top && top.count >= d.count ? top : d), null);
  const months = new Map<string, number>();
  for (const d of active) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.count);
  const bestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
  return [
    { label: 'Current streak', value: plural(current, 'day') },
    { label: 'Longest streak', value: plural(longest, 'day') },
    { label: 'Active days', value: active.length },
    { label: 'Average on active days', value: active.length ? formatNumber(total / active.length) : 0 },
    { label: best ? `Best day · ${formatDay(best.date)}, ${best.date.slice(0, 4)}` : 'Best day', value: best?.count ?? 0 },
    { label: bestMonth ? `Best month · ${formatMonth(`${bestMonth[0]}-01`)}` : 'Best month', value: bestMonth?.[1] ?? 0 },
  ];
}

const TYPE_COLORS: Record<string, string> = {
  feat: '#2da44e', fix: '#cf222e', docs: '#0969da', refactor: '#8250df', test: '#bf8700',
  chore: '#6e7781', perf: '#e16f24', ci: '#1b7c83', build: '#a475f9', style: '#bf3989',
};

const SHOWN_TYPES = 5; // the sixth place in the legend is "Other"

/** The share of each conventional commit type; merges aren't counted, and the rest is "Other". */
export function commitTypes(subjects: string[]): LanguageItem[] {
  const counted = subjects.filter((s) => !/^merge /i.test(s));
  const counts = new Map<string, number>();
  for (const subject of counted) {
    const type = subject.match(/^([a-z]+)(\([^)]*\))?!?:/i)?.[1].toLowerCase();
    const key = type && TYPE_COLORS[type] ? type : 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].filter(([type]) => type !== 'other').sort((a, b) => b[1] - a[1]);
  const shown = ranked.slice(0, SHOWN_TYPES);
  const rest = counted.length - shown.reduce((s, [, n]) => s + n, 0);
  return [
    ...shown.map(([name, n]) => ({ name, color: TYPE_COLORS[name], percent: (n / counted.length) * 100 })),
    ...(rest ? [{ name: 'Other', color: null, percent: (rest / counted.length) * 100 }] : []),
  ];
}

export function pullStats(pulls: PullRequest[]): Tile[] {
  const count = (state: PullRequest['state']) => pulls.filter((p) => p.state === state).length;
  const merged = count('MERGED');
  const closed = count('CLOSED');
  const decided = merged + closed;
  const times = pulls.flatMap((p) => (p.mergedAt ? [Date.parse(p.mergedAt) - Date.parse(p.createdAt)] : []));
  return [
    { label: 'Opened', value: pulls.length },
    { label: 'Merged', value: merged },
    { label: 'Merge rate', value: decided ? `${Math.round((merged / decided) * 100)}%` : '–' },
    { label: 'Median time to merge', value: times.length ? formatDuration(median(times)) : '–' },
    { label: 'Open now', value: count('OPEN') },
    { label: 'Closed unmerged', value: closed },
  ];
}
