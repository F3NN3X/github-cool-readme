import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { CARDS, ConfigError, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import { commitTypes } from '../src/stats.ts';
import type { Snapshot } from '../src/types.ts';
import { fixture } from './fixtures/snapshot.ts';

const model = (patch: (c: Config) => void = () => {}, data: Snapshot = fixture()) => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return compute(data, c);
};

const render = (patch: (c: Config) => void = () => {}, data: Snapshot = fixture()) => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.cards = [...CARDS];
  patch(c);
  return renderAll(compute(data, c), c);
};

describe('commit types', () => {
  it('reads conventional subjects, with scopes and breaking marks, leaving out merges', () => {
    const types = commitTypes(['feat: a', 'feat(ui): b', 'fix!: c', 'docs: d', 'Merge pull request #1', 'Update things']);
    expect(types.map((t) => [t.name, t.percent])).toEqual([['feat', 40], ['fix', 20], ['docs', 20], ['Other', 20]]);
  });

  it('folds unknown prefixes and the types past the fifth into Other', () => {
    const subjects = ['feat: a', 'feat: a', 'fix: b', 'docs: c', 'test: d', 'chore: e', 'ci: f', 'wip: g'];
    const types = commitTypes(subjects);
    expect(types).toHaveLength(6);
    expect(types.at(-1)?.name).toBe('Other');
    expect(types.reduce((s, t) => s + t.percent, 0)).toBeCloseTo(100);
  });

  it('copes with no commits', () => {
    expect(commitTypes([])).toEqual([]);
    expect(commitTypes(['Merge branch main'])).toEqual([]);
  });
});

describe('telemetry', () => {
  it('compares the last week with the busiest week', () => {
    const data = fixture();
    data.calendar = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), count: i < 10 ? 14 : 7 }));
    const t = model(() => {}, data).telemetry;
    expect(t.perDay).toBe(7);
    expect(t.peakPerDay).toBe(14);
    expect(t.days).toHaveLength(30);
  });

  it('warns that the calendar cards ignore the include settings', () => {
    const warned = (patch: (c: Config) => void) => model(patch).notes.some((n) => n.includes('cannot filter'));
    expect(warned((c) => { c.include.private = false; c.cards = ['telemetry']; })).toBe(true);
    expect(warned((c) => { c.include.orgs = false; c.cards = ['streaks']; })).toBe(true);
    expect(warned((c) => { c.include.private = false; c.cards = ['summary']; })).toBe(false);
    expect(warned((c) => (c.cards = ['telemetry']))).toBe(false);
  });

  it('counts active public repos, without the profile repo', () => {
    const t = model().telemetry;
    expect(t.activeRepos).toBe(2);
    expect(t.publicRepos).toBe(4);
  });
});

describe('now building', () => {
  it('shows the focus repo with commits per day, ending today', () => {
    const now = model().now!;
    expect(now.repo).toBe('game');
    expect(now.days).toHaveLength(30);
    expect(now.days.at(-1)).toBe(2);
    expect(now.days.at(-3)).toBe(1);
    expect(now.days.reduce((s, n) => s + n, 0)).toBe(3);
  });

  it('is empty without a focus repo', () => {
    expect(model(() => {}, { ...fixture(), focus: null }).now).toBeNull();
  });

  it('accepts a repo in the settings', () => {
    expect(parseConfig('now: { repo: game }').now.repo).toBe('game');
  });
});

describe('rendering', () => {
  const NEW = ['telemetry', 'now', 'types'] as const;
  const size = (svg: string) => svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/)!.slice(1).join('x');

  it('refuses these cards in the oled style', () => {
    for (const card of NEW) expect(() => parseConfig(`style: oled\ncards: [${card}]`)).toThrow(ConfigError);
  });

  it('renders each card at its size, with and without data', () => {
    const empty = { ...fixture(), publicRepos: [], focus: null, commitSubjects: [], calendar: [] };
    for (const files of [render(), render(() => {}, empty)]) {
      for (const card of NEW) {
        const svg = files[`${card}-dark.svg`];
        expect(size(svg), card).toBe(card === 'types' ? '350x195' : '800x195');
        expect(svg, card).not.toMatch(/NaN|undefined|null|Infinity/);
      }
    }
  });

  it('skips the animations when they are off', () => {
    const off = render((c) => (c.theme.animations = false));
    expect(off['telemetry-light.svg']).not.toContain('@keyframes gauge');
    expect(off['now-light.svg']).not.toContain('@keyframes rise');
  });
});

describe('scrolling', () => {
  const six = (data: Snapshot) => {
    for (let i = 0; i < 6; i++) {
      data.publicRepos.push({
        nameWithOwner: `octo/extra-${i}`, description: null, isArchived: false, stars: 1, language: null, recentCommits: 1,
        lastCommit: { date: '2026-11-01T00:00:00Z', message: 'x' }, releases: [{ tag: 'v1', date: '2026-11-01T00:00:00Z', downloads: 1 }],
      });
    }
    return data;
  };
  const delay = (svg: string) => svg.match(/\.scroll \{ animation: scroll ([\d.]+)s ease-in-out ([\d.]+)s infinite/);

  it('gives each scrolling card its own turn, with no two moving together', () => {
    const files = render((c) => (c.contributions.count = 6), six(fixture()));
    const cards = ['projects', 'releases', 'downloads', 'activity'].map((card) => delay(files[`${card}-light.svg`]));
    const turns = cards.map((m) => Number(m![2]));
    expect(new Set(turns).size).toBe(turns.length);
    const sorted = [...turns].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(0.8);
    expect(sorted.at(-1)! - sorted[0]).toBeLessThan(Number(cards[0]![1]) / 2);
  });

  it('follows the order of the cards setting', () => {
    const files = render((c) => (c.cards = ['activity', 'projects']), six(fixture()));
    expect(delay(files['activity-light.svg'])![2]).toBe('0');
    expect(delay(files['projects-light.svg'])![2]).toBe('2');
  });
});
