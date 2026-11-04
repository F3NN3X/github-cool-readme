import type { Activity, Repo, Snapshot } from '../../src/types.ts';

const repo = (nameWithOwner: string, extra: Partial<Repo> = {}): Repo => ({
  nameWithOwner,
  owner: nameWithOwner.split('/')[0],
  ownerIsOrg: false,
  isPrivate: false,
  isFork: false,
  stars: 0,
  languages: [],
  ...extra,
});

const pr = (repo: string, createdAt: string, state: Activity['state'], mergedAt: string | null = null): Activity => ({
  kind: 'pr',
  repo,
  createdAt,
  state,
  mergedAt,
});

/** A made-up user "octo", member of the organization "acme". */
export function fixture(): Snapshot {
  return {
    version: 3,
    generatedAt: '2026-11-04T12:00:00Z',
    user: { login: 'octo', name: 'Octo', createdAt: '2015-03-01T00:00:00Z' },
    last12MonthsFrom: '2025-11-05T00:00:00Z',
    orgs: ['acme'],
    repos: {
      'octo/game': repo('octo/game', {
        stars: 120,
        languages: [
          { name: 'C', color: '#555555', size: 9000 },
          { name: 'Python', color: '#3572A5', size: 1000 },
        ],
      }),
      'octo/secret': repo('octo/secret', {
        isPrivate: true,
        stars: 3,
        languages: [{ name: 'Rust', color: '#dea584', size: 5000 }],
      }),
      'octo/fork': repo('octo/fork', { isFork: true, stars: 50 }),
      'acme/platform': repo('acme/platform', {
        ownerIsOrg: true,
        isPrivate: true,
        languages: [
          { name: 'Ruby', color: '#701516', size: 6000 },
          { name: 'Batchfile', color: '#C1F12E', size: 4000 },
        ],
      }),
      'acme/site': repo('acme/site', { ownerIsOrg: true, stars: 10 }),
      'big/project': repo('big/project', { ownerIsOrg: true, stars: 30000 }),
      'mid/project': repo('mid/project', { ownerIsOrg: true, stars: 2000 }),
      'tiny/project': repo('tiny/project', { stars: 5 }),
      'old/archive': repo('old/archive', { ownerIsOrg: true, stars: 40000 }),
      'hidden/private': repo('hidden/private', { isPrivate: true, stars: 9 }),
    },
    ownedRepos: ['octo/game', 'octo/secret', 'octo/fork'],
    recentStars: { 'octo/game': 20, 'octo/secret': 3, 'octo/fork': 7 },
    commits: {
      'octo/game': { allTime: 100, last12Months: 10 },
      'octo/secret': { allTime: 50, last12Months: 50 },
      'acme/platform': { allTime: 200, last12Months: 100 },
    },
    activity: [
      pr('octo/game', '2025-12-01T00:00:00Z', 'MERGED', '2025-12-02T00:00:00Z'),
      pr('acme/platform', '2024-01-01T00:00:00Z', 'MERGED', '2024-01-02T00:00:00Z'),
      pr('acme/platform', '2026-01-01T00:00:00Z', 'OPEN'),
      pr('big/project', '2026-09-01T00:00:00Z', 'MERGED', '2026-09-10T00:00:00Z'),
      pr('mid/project', '2026-10-01T00:00:00Z', 'OPEN'),
      pr('tiny/project', '2020-05-01T00:00:00Z', 'MERGED', '2020-05-03T00:00:00Z'),
      pr('old/archive', '2018-10-01T00:00:00Z', 'CLOSED'),
      pr('old/archive', '2018-11-01T00:00:00Z', 'CLOSED'),
      pr('hidden/private', '2026-02-01T00:00:00Z', 'MERGED', '2026-02-02T00:00:00Z'),
      { kind: 'issue', repo: 'acme/site', createdAt: '2026-03-01T00:00:00Z' },
      { kind: 'issue', repo: 'octo/game', createdAt: '2019-03-01T00:00:00Z' },
      { kind: 'review', repo: 'acme/platform', createdAt: '2026-04-01T00:00:00Z' },
    ],
    calendar: Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, count: i < 4 ? 0 : i })),
    avatars: { big: 'data:image/png;base64,AAAA' },
  };
}
