import { ACTIVITY_DAYS, repoKey, type Config } from './config.ts';
import { commitTypes, pullStats, streakStats } from './stats.ts';
import type { ContributionWindow, Snapshot } from './types.ts';

export type CountKey = 'commits' | 'pullRequests' | 'reviews' | 'issues';

export interface SummaryModel {
  title: string | null;
  ring: Config['summary']['ring'];
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

/** Contributions per weekday over the last 12 months, Monday first. */
export interface WeekdayItem {
  day: string;
  count: number;
}

export interface ProjectItem {
  repo: string;
  description: string | null;
  stars: number;
  language: { name: string; color: string | null } | null;
}

export interface ActivityItem {
  repo: string;
  commits: number;
  date: string;
  message: string;
}

export interface YearItem {
  year: string;
  contributions: number;
  milestone: string | null;
}

export interface GlanceItem {
  label: string;
  value: number | string;
}

export interface TelemetryModel {
  /** Contributions per day, the last 7 days. */
  perDay: number;
  /** The busiest 7 days of the last 12 months, per day. */
  peakPerDay: number;
  /** Contributions per day, the last ACTIVITY_DAYS days, oldest first. */
  days: number[];
  /** Your public repos with commits in the last ACTIVITY_DAYS days, of how many. */
  activeRepos: number;
  publicRepos: number;
  updated: string;
}

export interface NowModel {
  repo: string;
  description: string | null;
  language: { name: string; color: string | null } | null;
  stars: number;
  release: string | null;
  commits: number;
  message: string | null;
  date: string | null;
  /** Your commits per day, the last ACTIVITY_DAYS days, oldest first. */
  days: number[];
}

export interface ReleaseItem {
  repo: string;
  tag: string;
  date: string;
  /** How many releases the repo has. */
  count: number;
}

export interface DownloadsModel {
  /** Across all your public repos, not only the ones listed. */
  total: number;
  items: { repo: string; downloads: number }[];
}

export interface Model {
  summary: SummaryModel;
  languages: LanguageItem[];
  contributions: ContributionItem[];
  weekly: WeekdayItem[];
  projects: ProjectItem[];
  activity: ActivityItem[];
  years: YearItem[];
  glance: GlanceItem[];
  releases: ReleaseItem[];
  downloads: DownloadsModel;
  streaks: GlanceItem[];
  pulls: GlanceItem[];
  telemetry: TelemetryModel;
  now: NowModel | null;
  types: LanguageItem[];
  /** Things the user should know, e.g. config entries that matched nothing. */
  notes: string[];
}

const ROW_LABELS: Record<CountKey, string> = {
  commits: 'Commits',
  pullRequests: 'PRs created',
  reviews: 'PRs reviewed',
  issues: 'Issues',
};

const FIELDS = ['commits', 'pullRequests', 'reviews', 'issues'] as const;

/** GitHub text can hold control characters, which SVG can't. */
const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

const repoName = (nameWithOwner: string): string => nameWithOwner.split('/')[1] ?? nameWithOwner;

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

  // Summary: both columns from the contributions API, only the time window differs.
  const filtering = !include.private || !include.orgs;
  const counts = (windows: ContributionWindow[]) => {
    const sums: Record<CountKey, number> = { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
    for (const w of windows) {
      const listed = { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
      for (const [key, c] of Object.entries(w.byRepo)) {
        for (const f of FIELDS) listed[f] += c[f];
        if (!included(key)) continue;
        for (const f of FIELDS) sums[f] += c[f];
      }
      // GitHub lists at most 100 repos per type and window; the rest only shows in the totals.
      // That rest can be counted only when nothing is filtered out.
      if (!filtering) for (const f of FIELDS) sums[f] += Math.max(0, w.totals[f] - listed[f]);
    }
    return sums;
  };
  const last12 = counts([snapshot.last12Months]);
  const all = counts(snapshot.allTime);
  const activeDays = snapshot.calendar.filter((d) => d.count > 0).length;
  const totalDays = snapshot.calendar.length;

  const summary: SummaryModel = {
    title: config.summary.title,
    ring: config.summary.ring,
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

  const commitsByRepo = new Map<string, number>();
  for (const w of snapshot.allTime) {
    for (const [key, c] of Object.entries(w.byRepo)) {
      if (c.commits) commitsByRepo.set(key, (commitsByRepo.get(key) ?? 0) + c.commits);
    }
  }

  const scores = new Map<string, { color: string | null; score: number }>();
  for (const [key, commits] of commitsByRepo) {
    if (!included(key) || excludedRepos.has(key)) continue;
    const weight = weights.get(key) ?? 1;
    if (weight === 0) continue;
    // An excluded language's share of the repo is dropped, not handed to the repo's other languages.
    const langs = snapshot.repos[key].languages;
    const size = langs.reduce((s, l) => s + l.size, 0);
    if (!size) continue;
    for (const l of langs) {
      if (excludedLangs.has(l.name.toLowerCase())) continue;
      const entry = scores.get(l.name) ?? { color: l.color, score: 0 };
      entry.score += (commits * weight * l.size) / size;
      scores.set(l.name, entry);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  // Without "Other", the languages shown share 100% between them, so the bar stays full.
  const total = (lc.other ? ranked : ranked.slice(0, lc.count)).reduce((s, [, e]) => s + e.score, 0);
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
  const outside = snapshot.pullRequests.filter((a) => {
    if (hidden.has(a.repo)) return false;
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

  // Weekly rhythm: the contribution calendar summed per weekday. Like the active-days ring, it
  // follows the calendar, which the include settings cannot filter.
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekly: WeekdayItem[] = DAYS.map((day) => ({ day, count: 0 }));
  for (const d of snapshot.calendar) {
    const sundayFirst = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    weekly[(sundayFirst + 6) % 7].count += d.count;
  }

  // Projects and activity: your public repos, without the profile repo itself.
  const publicRepos = snapshot.publicRepos.filter((r) => r.nameWithOwner.toLowerCase() !== `${login}/${login}`);
  const pc = config.projects;
  const projectPins = [...known(pc.pin, 'projects.pin')];
  const projectsHidden = known(pc.hide, 'projects.hide');
  const pinPlace = (key: string) => {
    const at = projectPins.indexOf(key);
    return at < 0 ? projectPins.length : at;
  };
  const projects: ProjectItem[] = publicRepos
    .filter((r) => !r.isArchived && !projectsHidden.has(r.nameWithOwner.toLowerCase()))
    .sort((a, b) => pinPlace(a.nameWithOwner.toLowerCase()) - pinPlace(b.nameWithOwner.toLowerCase()) || b.stars - a.stars)
    .slice(0, pc.count)
    .map((r) => ({
      repo: repoName(r.nameWithOwner),
      description: r.description ? clean(r.description) : null,
      stars: r.stars,
      language: r.language,
    }));

  const activityHidden = known(config.activity.hide, 'activity.hide');
  const activity: ActivityItem[] = publicRepos
    .flatMap((r) =>
      r.lastCommit && r.recentCommits && !activityHidden.has(r.nameWithOwner.toLowerCase())
        ? [{ repo: repoName(r.nameWithOwner), commits: r.recentCommits, date: r.lastCommit.date, message: clean(r.lastCommit.message) }]
        : [],
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, config.activity.count);

  // Year by year: the summary's four counts added up, per calendar year.
  const contributionsIn = (windows: ContributionWindow[]) => Object.values(counts(windows)).reduce((s, n) => s + n, 0);
  const years: YearItem[] = snapshot.allTime
    .map((w) => {
      const year = w.from.slice(0, 4);
      return { year, contributions: contributionsIn([w]), milestone: config.years.milestones[year] ?? null };
    })
    .filter((y) => y.contributions > 0)
    .reverse()
    .slice(0, config.years.count);

  // At a glance: totals only, so private repos are counted but never named.
  const owned = snapshot.ownedRepos.filter((k) => included(k) && !snapshot.repos[k].isFork);
  const publicOwned = owned.filter((k) => !snapshot.repos[k].isPrivate);
  const { label, prefix } = config.glance.counter;
  const touched = new Set(Object.keys(snapshot.repos).filter(included).flatMap((k) => snapshot.repos[k].languages.map((l) => l.name)));
  const glance: GlanceItem[] = [
    { label: 'Repositories', value: owned.length },
    { label: 'Public repos', value: publicOwned.length },
    ...(label && prefix
      ? [{ label, value: publicOwned.filter((k) => repoName(snapshot.repos[k].nameWithOwner).toLowerCase().startsWith(prefix.toLowerCase())).length }]
      : []),
    { label: 'Stars earned', value: summary.stars.allTime },
    { label: 'Languages', value: touched.size },
    { label: 'Contributions', value: contributionsIn(snapshot.allTime) },
  ];

  const releasesHidden = known(config.releases.hide, 'releases.hide');
  const releases: ReleaseItem[] = publicRepos
    .flatMap((r) => {
      const [latest] = r.releases;
      return latest && !releasesHidden.has(r.nameWithOwner.toLowerCase())
        ? [{ repo: repoName(r.nameWithOwner), tag: clean(latest.tag), date: latest.date, count: r.releases.length }]
        : [];
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, config.releases.count);

  const downloadsHidden = known(config.downloads.hide, 'downloads.hide');
  const downloadCounts = publicRepos
    .filter((r) => !downloadsHidden.has(r.nameWithOwner.toLowerCase()))
    .map((r) => ({ repo: repoName(r.nameWithOwner), downloads: r.releases.reduce((s, x) => s + x.downloads, 0) }))
    .filter((d) => d.downloads > 0)
    .sort((a, b) => b.downloads - a.downloads);
  const downloads: DownloadsModel = {
    total: downloadCounts.reduce((s, d) => s + d.downloads, 0),
    items: downloadCounts.slice(0, config.downloads.count),
  };

  const streaks = streakStats(snapshot.allDays);
  const pulls = pullStats(snapshot.pullRequests.filter((pr) => included(pr.repo)));

  // Telemetry: the calendar's last days, against your busiest week of the last 12 months.
  const counts7 = snapshot.calendar.map((_, i, all) => all.slice(Math.max(0, i - 6), i + 1).reduce((s, d) => s + d.count, 0) / 7);
  const telemetry: TelemetryModel = {
    perDay: counts7.at(-1) ?? 0,
    peakPerDay: Math.max(0, ...counts7),
    days: snapshot.calendar.slice(-ACTIVITY_DAYS).map((d) => d.count),
    activeRepos: publicRepos.filter((r) => r.recentCommits > 0).length,
    publicRepos: publicRepos.length,
    updated: snapshot.generatedAt,
  };

  const focus = snapshot.focus;
  const focusRepo = focus && publicRepos.find((r) => r.nameWithOwner === focus.nameWithOwner);
  const now: NowModel | null = focus && focusRepo
    ? {
        repo: repoName(focusRepo.nameWithOwner),
        description: focusRepo.description ? clean(focusRepo.description) : null,
        language: focusRepo.language,
        stars: focusRepo.stars,
        release: focusRepo.releases[0] ? clean(focusRepo.releases[0].tag) : null,
        commits: focusRepo.recentCommits,
        message: focusRepo.lastCommit ? clean(focusRepo.lastCommit.message) : null,
        date: focusRepo.lastCommit?.date ?? null,
        days: Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
          const end = Date.parse(snapshot.generatedAt) - (ACTIVITY_DAYS - 1 - i) * 864e5;
          const day = new Date(end).toISOString().slice(0, 10);
          return focus.commitDates.filter((d) => d.startsWith(day)).length;
        }),
      }
    : null;

  const types = commitTypes(snapshot.commitSubjects);

  if (filtering && config.cards.some((card) => card === 'telemetry' || card === 'streaks')) {
    notes.push('the include settings cannot filter the contribution calendar, so the telemetry and streaks cards still count private and organization work');
  }

  return { summary, languages, contributions, weekly, projects, activity, years, glance, releases, downloads, streaks, pulls, telemetry, now, types, notes };
}
