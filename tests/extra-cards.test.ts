import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { CARDS, ConfigError, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import type { Snapshot } from '../src/types.ts';
import { fixture } from './fixtures/snapshot.ts';

const EXTRA = ['projects', 'glance', 'activity', 'years'] as const;

const model = (patch: (c: Config) => void = () => {}, data: Snapshot = fixture()) => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return compute(data, c);
};

const renderExtra = (patch: (c: Config) => void = () => {}, data: Snapshot = fixture()) => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.cards = [...CARDS];
  patch(c);
  return renderAll(compute(data, c), c);
};

describe('settings', () => {
  it('leaves the extra cards out unless asked for', () => {
    expect(DEFAULT_CONFIG.cards).toEqual(['summary', 'languages', 'contributions', 'weekly']);
  });

  it('accepts the extra cards with their settings', () => {
    const c = parseConfig(`
cards: [projects, glance, activity, years]
projects: { count: 4, pin: [web], hide: [cli] }
activity: { count: 2 }
years: { milestones: { 2026: Big year } }
glance: { counter: { label: Tools, prefix: tool- } }
`);
    expect(c.years.milestones).toEqual({ 2026: 'Big year' });
    expect(c.glance.counter).toEqual({ label: 'Tools', prefix: 'tool-' });
  });

  it('refuses the extra cards in the oled style', () => {
    expect(() => parseConfig('style: oled\ncards: [summary, projects]')).toThrow(ConfigError);
  });

  it('refuses milestones that are not text', () => {
    expect(() => parseConfig('years: { milestones: { 2026: [a] } }')).toThrow(ConfigError);
  });
});

describe('projects', () => {
  it('shows the most starred first, without the profile repo or archived repos', () => {
    expect(model().projects.map((p) => p.repo)).toEqual(['game', 'tool-b', 'tool-a']);
  });

  it('puts pins first, in their order, and drops hidden repos', () => {
    const repos = model((c) => { c.projects.pin = ['tool-a']; c.projects.hide = ['game']; }).projects;
    expect(repos.map((p) => p.repo)).toEqual(['tool-a', 'tool-b']);
  });

  it('keeps to the count', () => {
    expect(model((c) => (c.projects.count = 1)).projects).toHaveLength(1);
  });

  it('cleans control characters out of descriptions', () => {
    expect(model().projects[0].description).toBe('A game  of sorts');
  });
});

describe('activity', () => {
  it('lists repos with recent commits, latest first, without the profile repo', () => {
    expect(model().activity.map((a) => a.repo)).toEqual(['tool-a', 'game']);
  });

  it('hides repos and keeps to the count', () => {
    expect(model((c) => (c.activity.hide = ['tool-a'])).activity.map((a) => a.repo)).toEqual(['game']);
    expect(model((c) => (c.activity.count = 1)).activity).toHaveLength(1);
  });
});

describe('years', () => {
  it('adds up the four counts per year, newest first, with milestones', () => {
    const years = model((c) => (c.years.milestones = { 2026: 'Big year' })).years;
    expect(years.map((y) => y.year)).toEqual(['2026', '2025', '2024']);
    expect(years[0]).toEqual({ year: '2026', contributions: 156, milestone: 'Big year' });
    expect(years[1].milestone).toBeNull();
  });

  it('follows the include settings', () => {
    const years = model((c) => (c.include.private = false)).years;
    expect(years.find((y) => y.year === '2026')?.contributions).toBeLessThan(156);
  });
});

describe('glance', () => {
  const value = (label: string, patch: (c: Config) => void = () => {}) =>
    model(patch).glance.find((g) => g.label === label)?.value;

  it('counts repos without forks, and public ones apart', () => {
    expect(value('Repositories')).toBe(2);
    expect(value('Public repos')).toBe(1);
  });

  it('counts languages across the repos you worked on', () => {
    expect(value('Languages')).toBe(5);
    expect(value('Languages', (c) => (c.include.private = false))).toBe(2);
  });

  it('adds the counter only when it is set', () => {
    expect(value('Games')).toBeUndefined();
    expect(value('Games', (c) => (c.glance.counter = { label: 'Games', prefix: 'GA' }))).toBe(1);
  });
});

describe('rendering', () => {
  const size = (svg: string) => svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/)!.slice(1).join('x');

  it('makes all the cards in light and dark, at the usual sizes', () => {
    const files = renderExtra();
    expect(Object.keys(files)).toHaveLength(CARDS.length * 2);
    expect(size(files['projects-dark.svg'])).toBe('450x195');
    expect(size(files['activity-dark.svg'])).toBe('450x195');
    expect(size(files['glance-dark.svg'])).toBe('350x195');
    expect(size(files['years-dark.svg'])).toBe('350x195');
  });

  it('has no missing values, with data or without', () => {
    const empty = { ...fixture(), publicRepos: [], allTime: [] };
    for (const files of [renderExtra(), renderExtra(() => {}, empty)]) {
      for (const card of EXTRA) expect(files[`${card}-light.svg`], card).not.toMatch(/NaN|undefined|null|Infinity/);
    }
  });

  it('escapes text from GitHub', () => {
    const svg = renderExtra()['activity-light.svg'];
    expect(svg).toContain('fix &#60;script&#62; tag');
    expect(svg).not.toContain('<script>');
  });

  it('never names a private repo', () => {
    for (const card of EXTRA) expect(renderExtra()[`${card}-light.svg`], card).not.toContain('secret');
  });

  it('scrolls only when more rows than fit', () => {
    expect(renderExtra()['projects-light.svg']).not.toContain('class="scroll"');
    const data = fixture();
    data.publicRepos.push({ ...data.publicRepos[1], nameWithOwner: 'octo/tool-c' });
    expect(renderExtra(() => {}, data)['projects-light.svg']).toContain('class="scroll"');
  });
});
