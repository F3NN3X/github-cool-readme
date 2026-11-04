// Raw data collected from GitHub. Nothing in here is filtered by the config's
// include/exclude rules, so a snapshot can be re-rendered with different settings.
// A snapshot names private repositories: never publish it.

export interface Language {
  name: string;
  color: string | null;
  size: number;
}

export interface Repo {
  nameWithOwner: string;
  owner: string;
  ownerIsOrg: boolean;
  isPrivate: boolean;
  isFork: boolean;
  stars: number;
  /** Only filled for repos you committed to. */
  languages: Language[];
}

export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED';

/** A pull request or issue you opened, or a pull request you reviewed. */
export interface Activity {
  kind: 'pr' | 'issue' | 'review';
  /** Lowercase nameWithOwner, key into Snapshot.repos. */
  repo: string;
  /** When the pull request or issue was opened (also for reviews). */
  createdAt: string;
  state?: PullRequestState;
  mergedAt?: string | null;
}

export interface CommitCounts {
  last12Months: number;
  allTime: number;
}

export interface Snapshot {
  version: 3;
  generatedAt: string;
  user: { login: string; name: string | null; createdAt: string };
  /** Start of the "last 12 months" window. */
  last12MonthsFrom: string;
  /** Organizations the user belongs to (lowercase logins). */
  orgs: string[];
  /** Keyed by lowercase nameWithOwner. */
  repos: Record<string, Repo>;
  /** Repos owned by the user, for stars. */
  ownedRepos: string[];
  /** Stars your repos received in the last 12 months (and still have). */
  recentStars: Record<string, number>;
  /** Your commits on each repo's default branch. */
  commits: Record<string, CommitCounts>;
  activity: Activity[];
  /** Contribution calendar for the last 12 months. */
  calendar: { date: string; count: number }[];
  /** Owner login (lowercase) -> data: URI of the avatar. */
  avatars: Record<string, string>;
}
