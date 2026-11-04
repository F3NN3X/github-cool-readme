import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { DEFAULT_CONFIG, type Config } from '../src/config.ts';
import { fixture } from './fixtures/snapshot.ts';

const config = (patch: (c: Config) => void = () => {}): Config => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return c;
};

const row = (m: ReturnType<typeof compute>, key: string) => {
  const r = m.summary.rows.find((r) => r.key === key)!;
  return [r.last12Months, r.allTime];
};

describe('summary', () => {
  it('counts everything with the default settings', () => {
    const m = compute(fixture(), config());
    expect(row(m, 'commits')).toEqual([160, 350]);
    expect(row(m, 'pullRequests')).toEqual([5, 9]);
    expect(row(m, 'issues')).toEqual([1, 2]);
    expect(row(m, 'reviews')).toEqual([1, 1]);
    expect(m.summary.stars).toEqual({ last12Months: 23, allTime: 123 }); // forks excluded
    expect(m.summary.activity).toEqual({ activeDays: 6, totalDays: 10, percent: 60 });
  });

  it('counts repos beyond the 100 GitHub lists, but only when nothing is filtered', () => {
    const s = fixture();
    s.last12Months.totals.commits += 7; // contributions in repos the per-repo lists left out
    expect(row(compute(s, config()), 'commits')[0]).toBe(167);
    expect(row(compute(s, config((c) => (c.include.orgs = false))), 'commits')[0]).toBe(60);
  });

  it('leaves out private repos when asked', () => {
    const m = compute(fixture(), config((c) => (c.include.private = false)));
    expect(row(m, 'commits')).toEqual([10, 100]);
    expect(row(m, 'pullRequests')).toEqual([3, 6]);
    expect(m.summary.stars).toEqual({ last12Months: 20, allTime: 120 });
  });

  it('leaves out organization repos when asked', () => {
    const m = compute(fixture(), config((c) => (c.include.orgs = false)));
    expect(row(m, 'commits')).toEqual([60, 150]);
    expect(row(m, 'issues')).toEqual([0, 1]);
    expect(row(m, 'reviews')).toEqual([0, 0]);
  });
});

describe('languages', () => {
  const shares = (m: ReturnType<typeof compute>) => Object.fromEntries(m.languages.map((l) => [l.name, Math.round(l.percent * 10) / 10]));

  it('weights each repo by your commits there', () => {
    expect(shares(compute(fixture(), config()))).toEqual({ Ruby: 34.3, C: 25.7, Batchfile: 22.9, Rust: 14.3, Python: 2.9 });
  });

  it('gives an excluded language share to the rest of that repo', () => {
    const m = compute(fixture(), config((c) => (c.languages.exclude = ['batchfile'])));
    expect(shares(m)).toEqual({ Ruby: 57.1, C: 25.7, Rust: 14.3, Python: 2.9 });
  });

  it('applies repo weights, where 0 leaves a repo out', () => {
    const m = compute(fixture(), config((c) => (c.languages.repoWeights = { 'acme/platform': 0, game: 2 })));
    expect(shares(m)).toEqual({ C: 72, Rust: 20, Python: 8 });
  });

  it('excludes repos, by short name for your own', () => {
    const m = compute(fixture(), config((c) => (c.languages.excludeRepos = ['secret'])));
    expect(m.languages.map((l) => l.name)).not.toContain('Rust');
  });

  it('folds the rest into Other', () => {
    const m = compute(fixture(), config((c) => (c.languages.count = 2)));
    expect(shares(m)).toEqual({ Ruby: 34.3, C: 25.7, Other: 40 });
    expect(m.languages.at(-1)!.color).toBeNull();
  });
});

describe('notable contributions', () => {
  const repos = (m: ReturnType<typeof compute>) => m.contributions.map((c) => c.repo);

  it('lists merged and open pull requests to other public repos, by stars', () => {
    const m = compute(fixture(), config());
    expect(repos(m)).toEqual(['big/project', 'mid/project', 'tiny/project']);
    expect(m.contributions[0]).toMatchObject({ merged: 1, open: 0, lastDate: '2026-09-10T00:00:00Z', avatar: 'data:image/png;base64,AAAA' });
  });

  it('can leave open pull requests out', () => {
    expect(repos(compute(fixture(), config((c) => (c.contributions.includeOpen = false))))).toEqual(['big/project', 'tiny/project']);
  });

  it('never shows pull requests closed without merging, even when pinned', () => {
    const m = compute(fixture(), config((c) => (c.contributions.pin = ['old/archive'])));
    expect(repos(m)).toEqual(['big/project', 'mid/project', 'tiny/project']);
    expect(m.notes).toEqual(['contributions.pin: "old/archive" has no merged or open pull requests of yours, so it is not shown']);
  });

  it('gives pinned repos their place before the most starred', () => {
    const m = compute(fixture(), config((c) => { c.contributions.pin = ['tiny/project']; c.contributions.count = 1; }));
    expect(repos(m)).toEqual(['tiny/project']);
  });

  it('hides repos', () => {
    expect(repos(compute(fixture(), config((c) => (c.contributions.hide = ['BIG/Project']))))).toEqual(['mid/project', 'tiny/project']);
  });

  it('notes config entries that match nothing', () => {
    const m = compute(fixture(), config((c) => (c.contributions.pin = ['nobody/nothing'])));
    expect(m.notes).toEqual(['contributions.pin: "nobody/nothing" matched no repository you contributed to']);
  });
});
