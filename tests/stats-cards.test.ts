import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { CARDS, ConfigError, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import { formatDuration, streakLengths, streakStats } from '../src/stats.ts';
import type { Snapshot } from '../src/types.ts';
import { fixture } from './fixtures/snapshot.ts';

const model = (patch: (c: Config) => void = () => {}, data: Snapshot = fixture()) => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return compute(data, c);
};

const days = (start: string, counts: number[]) =>
  counts.map((count, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), count }));

const tile = (items: { label: string; value: number | string }[], label: string) => items.find((t) => t.label === label)?.value;

describe('streaks', () => {
  it('finds the longest run and the one reaching the last day', () => {
    expect(streakLengths(days('2026-01-01', [1, 1, 1, 0, 1, 1]))).toEqual({ current: 2, longest: 3 });
  });

  it('keeps the streak alive through a quiet last day', () => {
    expect(streakLengths(days('2026-01-01', [1, 1, 1, 0]))).toEqual({ current: 3, longest: 3 });
  });

  it('ends the streak after two quiet days', () => {
    expect(streakLengths(days('2026-01-01', [1, 1, 0, 0]))).toEqual({ current: 0, longest: 2 });
  });

  it('runs across a year boundary and ignores a day listed twice', () => {
    const list = [...days('2025-12-30', [1, 1, 1, 1]), { date: '2026-01-02', count: 1 }];
    expect(streakLengths(list)).toEqual({ current: 4, longest: 4 });
  });

  it('does not join runs with a missing day between them', () => {
    expect(streakLengths([{ date: '2026-01-01', count: 1 }, { date: '2026-01-03', count: 1 }])).toEqual({ current: 1, longest: 1 });
  });

  it('copes with no data', () => {
    expect(streakLengths([])).toEqual({ current: 0, longest: 0 });
    expect(tile(streakStats([]), 'Current streak')).toBe('0 days');
  });

  it('reports the best day and month', () => {
    const stats = model().streaks;
    expect(tile(stats, 'Current streak')).toBe('2 days');
    expect(tile(stats, 'Longest streak')).toBe('3 days');
    expect(tile(stats, 'Active days')).toBe(5);
    expect(tile(stats, 'Best day · Jan 2, 2026')).toBe(9);
    expect(tile(stats, 'Best month · Jan 2026')).toBe(12);
  });
});

describe('pull requests', () => {
  it('counts each state, with the merge rate and median', () => {
    const stats = model().pulls;
    expect(tile(stats, 'Opened')).toBe(9);
    expect(tile(stats, 'Merged')).toBe(5);
    expect(tile(stats, 'Open now')).toBe(2);
    expect(tile(stats, 'Closed unmerged')).toBe(2);
    expect(tile(stats, 'Merge rate')).toBe('71%');
    expect(tile(stats, 'Median time to merge')).toBe('24h');
  });

  it('follows the include settings', () => {
    expect(tile(model((c) => (c.include.private = false)).pulls, 'Opened')).toBe(6);
  });

  it('shows a dash with nothing to measure', () => {
    const stats = model(() => {}, { ...fixture(), pullRequests: [] }).pulls;
    expect(tile(stats, 'Merge rate')).toBe('–');
    expect(tile(stats, 'Median time to merge')).toBe('–');
  });

  it('formats durations', () => {
    expect(formatDuration(10 * 60 * 1000)).toBe('under 1h');
    expect(formatDuration(5 * 3600 * 1000)).toBe('5h');
    expect(formatDuration(72 * 3600 * 1000)).toBe('3d');
  });
});

describe('releases', () => {
  it('lists the latest release of each repo, newest first, without the profile repo', () => {
    expect(model().releases).toEqual([
      { repo: 'old', tag: '1.0', date: '2026-10-25T10:00:00Z', count: 1 },
      { repo: 'tool-b', tag: 'v2.0.0', date: '2026-10-20T10:00:00Z', count: 2 },
    ]);
  });

  it('hides repos and keeps to the count', () => {
    expect(model((c) => (c.releases.hide = ['old'])).releases.map((r) => r.repo)).toEqual(['tool-b']);
    expect(model((c) => (c.releases.count = 1)).releases).toHaveLength(1);
  });
});

describe('downloads', () => {
  it('adds up every release of a repo, biggest first', () => {
    expect(model().downloads).toEqual({
      total: 600,
      items: [{ repo: 'old', downloads: 500 }, { repo: 'tool-b', downloads: 100 }],
    });
  });

  it('keeps the total when the list is cut, and drops hidden repos from both', () => {
    expect(model((c) => (c.downloads.count = 1)).downloads).toEqual({ total: 600, items: [{ repo: 'old', downloads: 500 }] });
    expect(model((c) => (c.downloads.hide = ['old'])).downloads.total).toBe(100);
  });
});

describe('settings and rendering', () => {
  const NEW = ['releases', 'streaks', 'downloads', 'pulls'] as const;

  const render = (data: Snapshot = fixture()) => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.cards = [...CARDS];
    return renderAll(compute(data, c), c);
  };

  it('refuses these cards in the oled style', () => {
    for (const card of NEW) expect(() => parseConfig(`style: oled\ncards: [${card}]`)).toThrow(ConfigError);
  });

  it('renders each card at its size, with and without data', () => {
    const size = (svg: string) => svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/)!.slice(1).join('x');
    const empty = { ...fixture(), publicRepos: [], pullRequests: [], allDays: [] };
    for (const files of [render(), render(empty)]) {
      for (const card of NEW) {
        const svg = files[`${card}-dark.svg`];
        expect(size(svg), card).toBe(card === 'releases' || card === 'downloads' ? '450x195' : '350x195');
        expect(svg, card).not.toMatch(/NaN|undefined|null|Infinity/);
      }
    }
  });

  it('shows the download total on the card', () => {
    expect(render()['downloads-light.svg']).toContain('600 TOTAL');
  });
});
