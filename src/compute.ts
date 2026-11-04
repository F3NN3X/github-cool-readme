import { repoKey, type Config } from './config.ts';
import type { Activity, Snapshot } from './types.ts';

export type CountKey = 'commits' | 'pullRequests' | 'reviews' | 'issues' | 'repos';

export interface SummaryModel {
  title: string | null;
  rows: { key: CountKey; label: string; last12Months: number; allTime: number }[];
  /** Stars received in the last 12 months, and the current total. */
  stars: { last12Months: number; allTime: number };
  activity: { activeDays: number; totalDays: number; percent: number };
}

export interface LanguageItem {
  name: string;
  /** null for "Other". */
  color: string | null;
  percent: number;
}

export interface ContributionItem {
  repo: string;
  owner: string;
  stars: number;
  avatar: string | null;
  merged: number;
  open: number;
  /** ISO date of the latest merge, or of the latest opened pull request if none merged. */
  lastDate: string;
}

export interface Model {
  summary: SummaryModel;
  languages: LanguageItem[];
  contributions: ContributionItem[];
  /** Things the user should know, e.g. config entries that matched nothing. */
  notes: string[];
}

const ROW_LABELS: Record<CountKey, string> = {
  commits: 'Commits',
  pullRequests: 'Pull requests',
  reviews: 'Pull requests reviewed',
  issues: 'Issues',
  repos: 'Repos contributed to',
};

const KIND_ROW: Record<Activity['kind'], CountKey> = { pr: 'pullRequests', issue: 'issues', review: 'reviews' };

export function compute(snapshot: Snapshot, config: Config): Model {
  const notes: string[] = [];
  const login = snapshot.user.login.toLowerCase();
  const { include } = config;

  const included = (key: string): boolean => {
    const repo = snapshot.repos[key];
    if (!repo) return false;
    if (!include.private && repo.isPrivate) return false;
    if (!include.orgs && repo.ownerIsOrg && snapshot.orgs.includes(repo.owner.toLowerCase())) return false;
    return true;
  };

  const known = (refs: string[], setting: string): Set<string> => {
    const keys = new Set(refs.map((r) => repoKey(r, login)));
    for (const k of keys) if (!snapshot.repos[k]) notes.push(`${setting}: "${k}" matched no repository you contributed to`);
    return keys;
  };

  // Summary: both columns from the same sources, only the time window differs.
  const counts = (recentOnly: boolean) => {
    const sums: Record<CountKey, number> = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, repos: 0 };
    const repos = new Set<string>();
    for (const [key, c] of Object.entries(snapshot.commits)) {
      const n = recentOnly ? c.last12Months : c.allTime;
      if (!n || !included(key)) continue;
      sums.commits += n;
      repos.add(key);
    }
    for (const a of snapshot.activity) {
      if (!included(a.repo) || (recentOnly && a.createdAt < snapshot.last12MonthsFrom)) continue;
      sums[KIND_ROW[a.kind]]++;
      repos.add(a.repo);
    }
    sums.repos = repos.size;
    return sums;
  };
  const last12 = counts(true);
  const all = counts(false);
  const activeDays = snapshot.calendar.filter((d) => d.count > 0).length;
  const totalDays = snapshot.calendar.length;

  const summary: SummaryModel = {
    title: config.summary.title,
    rows: (Object.keys(ROW_LABELS) as CountKey[]).map((key) => ({
      key,
      label: ROW_LABELS[key],
      last12Months: last12[key],
      allTime: all[key],
    })),
    stars: snapshot.ownedRepos
      .filter((k) => included(k) && !snapshot.repos[k].isFork)
      .reduce(
        (sum, k) => ({
          last12Months: sum.last12Months + (snapshot.recentStars[k] ?? 0),
          allTime: sum.allTime + snapshot.repos[k].stars,
        }),
        { last12Months: 0, allTime: 0 },
      ),
    activity: {
      activeDays,
      totalDays,
      percent: totalDays ? Math.round((activeDays / totalDays) * 100) : 0,
    },
  };

  // Languages: each repo's language mix, weighted by your commits there (all time).
  const lc = config.languages;
  const excludedLangs = new Set(lc.exclude.map((l) => l.toLowerCase()));
  const excludedRepos = known(lc.excludeRepos, 'languages.excludeRepos');
  const weights = new Map<string, number>();
  for (const [ref, w] of Object.entries(lc.repoWeights)) weights.set(repoKey(ref, login), w);
  known(Object.keys(lc.repoWeights), 'languages.repoWeights');

  const scores = new Map<string, { color: string | null; score: number }>();
  for (const [key, c] of Object.entries(snapshot.commits)) {
    if (!c.allTime || !included(key) || excludedRepos.has(key)) continue;
    const weight = weights.get(key) ?? 1;
    if (weight === 0) continue;
    const langs = snapshot.repos[key].languages.filter((l) => !excludedLangs.has(l.name.toLowerCase()));
    const size = langs.reduce((s, l) => s + l.size, 0);
    if (!size) continue;
    for (const l of langs) {
      const entry = scores.get(l.name) ?? { color: l.color, score: 0 };
      entry.score += (c.allTime * weight * l.size) / size;
      scores.set(l.name, entry);
    }
  }
  const total = [...scores.values()].reduce((s, e) => s + e.score, 0);
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const languages: LanguageItem[] = ranked.slice(0, lc.count).map(([name, e]) => ({
    name,
    color: e.color,
    percent: total ? (e.score / total) * 100 : 0,
  }));
  const rest = ranked.slice(lc.count).reduce((s, [, e]) => s + e.score, 0);
  if (lc.other && total && (rest / total) * 100 >= 0.5) {
    languages.push({ name: 'Other', color: null, percent: (rest / total) * 100 });
  }

  // Notable contributions: merged (and optionally open) pull requests to public repos of other
  // people and organizations. Pull requests closed without merging never count.
  const cc = config.contributions;
  const pins = known(cc.pin, 'contributions.pin');
  const hidden = known(cc.hide, 'contributions.hide');
  const outside = snapshot.activity.filter((a) => {
    if (a.kind !== 'pr' || hidden.has(a.repo)) return false;
    if (a.state !== 'MERGED' && !(a.state === 'OPEN' && cc.includeOpen)) return false;
    const r = snapshot.repos[a.repo];
    const owner = r.owner.toLowerCase();
    return !r.isPrivate && owner !== login && !snapshot.orgs.includes(owner);
  });
  const grouped = new Map<string, ContributionItem & { dates: string[]; mergedDates: string[] }>();
  for (const pr of outside) {
    const repo = snapshot.repos[pr.repo];
    const item = grouped.get(pr.repo) ?? {
      repo: repo.nameWithOwner,
      owner: repo.owner,
      stars: repo.stars,
      avatar: snapshot.avatars[repo.owner.toLowerCase()] ?? null,
      merged: 0,
      open: 0,
      lastDate: '',
      dates: [],
      mergedDates: [],
    };
    if (pr.state === 'MERGED') item.merged++;
    else item.open++;
    item.dates.push(pr.createdAt);
    if (pr.mergedAt) item.mergedDates.push(pr.mergedAt);
    grouped.set(pr.repo, item);
  }
  // Pins take their places first; the remaining places go to the most starred.
  const eligible = [...grouped.entries()].sort((a, b) => b[1].stars - a[1].stars);
  const pinned = eligible.filter(([key]) => pins.has(key));
  const others = eligible.filter(([key]) => !pins.has(key)).slice(0, Math.max(0, cc.count - pinned.length));
  const contributions: ContributionItem[] = [...pinned, ...others]
    .map(([, { dates, mergedDates, ...item }]) => ({
      ...item,
      lastDate: (mergedDates.length ? mergedDates : dates).sort().at(-1) ?? '',
    }))
    .sort((a, b) => b.stars - a.stars);
  for (const key of pins) {
    if (snapshot.repos[key] && !grouped.has(key)) {
      notes.push(`contributions.pin: "${key}" has no merged${cc.includeOpen ? ' or open' : ''} pull requests of yours, so it is not shown`);
    }
  }

  return { summary, languages, contributions, notes };
}
