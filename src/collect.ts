import { repoKey, type Config } from './config.ts';
import { fetchDataUri, type Client } from './github.ts';
import type { Activity, CommitCounts, PullRequestState, Repo, Snapshot } from './types.ts';

// Where the numbers come from:
// - commits: each repo's default-branch history, filtered to commits authored by you. GitHub's
//   contributions API hides private work as "restricted" counts, even from your own token, so
//   it cannot be used for this.
// - pull requests, issues, reviews: search, which covers every repo the token can read.
// - the contributions API is still used for the activity calendar and to find public repos
//   you committed to without opening a pull request.

const REPO_FIELDS = `nameWithOwner isPrivate isFork stargazerCount owner { login __typename }`;

interface RawRepo {
  nameWithOwner: string;
  isPrivate: boolean;
  isFork: boolean;
  stargazerCount: number;
  owner: { login: string; __typename: string; avatarUrl?: string };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** The last 365 days, today included. */
export function last12MonthsRange(now: Date): { from: Date; to: Date } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - 364 * DAY), to: now };
}

/** One window per calendar year, from account creation until now. */
export function yearRanges(createdAt: Date, now: Date): { from: Date; to: Date }[] {
  const ranges = [];
  for (let year = createdAt.getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    ranges.push({ from: start < createdAt ? createdAt : start, to: end > now ? now : end });
  }
  return ranges;
}

async function inBatches<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))));
  return out;
}

async function inParallel<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  return inBatches(items, size, (batch) => Promise.all(batch.map(fn)));
}

export async function collect(client: Client, config: Config, log: (msg: string) => void = () => {}): Promise<Snapshot> {
  const now = new Date();
  const repos: Record<string, Repo> = {};
  const avatarUrls: Record<string, string> = {};

  const remember = (raw: RawRepo): string => {
    const key = raw.nameWithOwner.toLowerCase();
    repos[key] = {
      nameWithOwner: raw.nameWithOwner,
      owner: raw.owner.login,
      ownerIsOrg: raw.owner.__typename === 'Organization',
      isPrivate: raw.isPrivate,
      isFork: raw.isFork,
      stars: raw.stargazerCount,
      languages: repos[key]?.languages ?? [],
    };
    if (raw.owner.avatarUrl) avatarUrls[raw.owner.login.toLowerCase()] = raw.owner.avatarUrl;
    return key;
  };

  /** Follows a paginated repository connection; `pick` finds it in the response. */
  const allRepos = async (query: string, variables: Record<string, unknown>, pick: (data: any) => { pageInfo: PageInfo; nodes: RawRepo[] } | null) => {
    const keys: string[] = [];
    for (let after: string | null = null; ; ) {
      const conn = pick(await client.query(query, { ...variables, after }));
      if (!conn) break;
      keys.push(...conn.nodes.map(remember));
      if (!conn.pageInfo.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
    return keys;
  };

  // Who.
  let login = config.user;
  if (!login) {
    const { viewer } = await client.query<{ viewer: { login: string } }>('query { viewer { login } }');
    login = viewer.login;
  }
  const { user } = await client.query<{
    user: { id: string; login: string; name: string | null; createdAt: string; organizations: { nodes: { login: string }[] } } | null;
  }>(`query($login: String!) { user(login: $login) { id login name createdAt organizations(first: 100) { nodes { login } } } }`, { login });
  if (!user) throw new Error(`GitHub user "${login}" not found`);
  login = user.login;
  const orgs = user.organizations.nodes.map((o) => o.login.toLowerCase());
  log(`User ${login}, member of ${orgs.length} organization(s), joined ${user.createdAt.slice(0, 10)}`);

  // Repos you can reach: your own, your organizations', and the ones you collaborate on.
  const ownedRepos = await allRepos(
    `query($login: String!, $after: String) { user(login: $login) {
      repositories(first: 100, after: $after, ownerAffiliations: OWNER) { pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`,
    { login },
    (d) => d.user.repositories,
  );
  const orgRepos = (
    await inParallel(orgs, 3, (org) =>
      allRepos(
        `query($org: String!, $after: String) { organization(login: $org) {
          repositories(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`,
        { org },
        (d) => d.organization?.repositories ?? null,
      ),
    )
  ).flat();
  const collaboratorRepos = await allRepos(
    `query($login: String!, $after: String) { user(login: $login) {
      repositories(first: 100, after: $after, affiliations: [COLLABORATOR], ownerAffiliations: [COLLABORATOR]) {
        pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`,
    { login },
    (d) => d.user.repositories,
  );
  log(`${ownedRepos.length} own repositories, ${orgRepos.length} in your organizations, ${collaboratorRepos.length} as collaborator`);

  // Calendar, and public repos you committed to (found through the contributions API).
  const last12 = last12MonthsRange(now);
  const { user: cal } = await client.query<{
    user: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } };
  }>(
    `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
      contributionsCollection(from: $from, to: $to) { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`,
    { login, from: last12.from.toISOString(), to: last12.to.toISOString() },
  );
  const calendar = cal.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));

  const years = yearRanges(new Date(user.createdAt), now);
  const discovered = (
    await inParallel(years, 4, async (range) => {
      const res = await client.query<{
        user: { contributionsCollection: { commitContributionsByRepository: { repository: RawRepo | null }[] } };
      }>(
        `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: 100) { repository { ${REPO_FIELDS} } } } } }`,
        { login, from: range.from.toISOString(), to: range.to.toISOString() },
      );
      return res.user.contributionsCollection.commitContributionsByRepository.flatMap((c) => (c.repository ? [remember(c.repository)] : []));
    })
  ).flat();

  // Pull requests, issues and reviews.
  type SearchNode = { __typename?: string; createdAt?: string; state?: PullRequestState; mergedAt?: string | null; repository?: RawRepo };
  const searchPage = (q: string, after: string | null) =>
    client.query<{ search: { issueCount: number; pageInfo: PageInfo; nodes: SearchNode[] } }>(
      `query($q: String!, $after: String) {
        search(query: $q, type: ISSUE, first: 100, after: $after) {
          issueCount pageInfo { hasNextPage endCursor }
          nodes {
            ... on PullRequest { createdAt state mergedAt repository { ${REPO_FIELDS} owner { avatarUrl(size: 80) } } }
            ... on Issue { createdAt repository { ${REPO_FIELDS} } }
          }
        } }`,
      { q, after },
    );
  const searchAll = async (q: string): Promise<SearchNode[]> => {
    const nodes: SearchNode[] = [];
    const follow = async (query: string) => {
      for (let after: string | null = null; ; ) {
        const { search } = await searchPage(query, after);
        nodes.push(...search.nodes);
        if (!search.pageInfo.hasNextPage) return search.issueCount;
        after = search.pageInfo.endCursor;
      }
    };
    const { search } = await searchPage(q, null);
    if (search.issueCount <= 1000) {
      await follow(q);
      return nodes;
    }
    // Search returns at most 1000 results: ask one year at a time.
    for (const y of years) {
      const count = await follow(`${q} created:${y.from.toISOString().slice(0, 10)}..${y.to.toISOString().slice(0, 10)}`);
      if (count > 1000) log(`warning: more than 1000 results for "${q}" in ${y.from.getUTCFullYear()}; only 1000 counted`);
    }
    return nodes;
  };

  const activity: Activity[] = [];
  const kinds: [Activity['kind'], string][] = [
    ['pr', `author:${login} type:pr`],
    ['issue', `author:${login} type:issue`],
    ['review', `reviewed-by:${login} -author:${login} type:pr`],
  ];
  for (const [kind, q] of kinds) {
    const nodes = await searchAll(q);
    for (const n of nodes) {
      if (!n.repository || !n.createdAt) continue;
      const repo = remember(n.repository);
      activity.push(kind === 'pr' ? { kind, repo, createdAt: n.createdAt, state: n.state, mergedAt: n.mergedAt ?? null } : { kind, repo, createdAt: n.createdAt });
    }
    log(`${nodes.length} ${kind === 'pr' ? 'pull requests' : kind === 'issue' ? 'issues' : 'reviewed pull requests'}`);
  }

  // Commits per repo, with each repo's languages.
  const candidates = [
    ...new Set([...ownedRepos, ...orgRepos, ...collaboratorRepos, ...discovered, ...activity.map((a) => a.repo)]),
  ].filter((k) => !repos[k].isFork); // a fork's history repeats its parent's commits
  const commits: Record<string, CommitCounts> = {};
  const countBatch = async (batch: string[]): Promise<void> => {
    const fields = batch
      .map((key, i) => {
        const [owner, name] = repos[key].nameWithOwner.split('/');
        return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          defaultBranchRef { target { ... on Commit {
            all: history(author: { id: $id }) { totalCount }
            recent: history(author: { id: $id }, since: $since) { totalCount } } } }
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }`;
      })
      .join('\n');
    type R = {
      defaultBranchRef: { target: { all?: { totalCount: number }; recent?: { totalCount: number } } } | null;
      languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
    } | null;
    const data = await client.query<Record<string, R>>(`query($id: ID!, $since: GitTimestamp!) {\n${fields}\n}`, {
      id: user.id,
      since: last12.from.toISOString(),
    });
    batch.forEach((key, i) => {
      const r = data[`r${i}`];
      if (!r) return;
      const all = r.defaultBranchRef?.target.all?.totalCount ?? 0;
      if (!all) return;
      commits[key] = { allTime: all, last12Months: r.defaultBranchRef?.target.recent?.totalCount ?? 0 };
      repos[key].languages = r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size }));
    });
  };
  log(`Counting your commits in ${candidates.length} repositories`);
  await inBatches(candidates, 10, async (batch) => {
    try {
      await countBatch(batch);
    } catch {
      // Large histories can time out; retry one repo at a time.
      for (const key of batch) {
        try {
          await countBatch([key]);
        } catch (err) {
          log(`warning: could not count commits in ${repos[key].nameWithOwner}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    return [];
  });

  // Stars received in the last 12 months: stargazers newest first, until one is older than the window.
  const since = last12.from.toISOString();
  const recentStars: Record<string, number> = {};
  const starred = ownedRepos.filter((k) => !repos[k].isFork && repos[k].stars > 0);
  type Stargazers = { edges: { starredAt: string }[]; pageInfo: PageInfo };
  const stargazers = (after: string | null) =>
    `stargazers(first: 100, after: ${after ? JSON.stringify(after) : 'null'}, orderBy: { field: STARRED_AT, direction: DESC }) {
      edges { starredAt } pageInfo { hasNextPage endCursor } }`;
  const repoRef = (key: string) => {
    const [owner, name] = repos[key].nameWithOwner.split('/');
    return `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)})`;
  };
  await inBatches(starred, 20, async (batch) => {
    const data = await client.query<Record<string, { stargazers: Stargazers } | null>>(
      `query {\n${batch.map((k, i) => `r${i}: ${repoRef(k)} { ${stargazers(null)} }`).join('\n')}\n}`,
    );
    for (const [i, key] of batch.entries()) {
      let page = data[`r${i}`]?.stargazers;
      let count = 0;
      while (page) {
        const recent = page.edges.filter((e) => e.starredAt >= since);
        count += recent.length;
        if (recent.length < page.edges.length || !page.pageInfo.hasNextPage) break;
        const next: Record<string, { stargazers: Stargazers } | null> = await client.query(
          `query { r: ${repoRef(key)} { ${stargazers(page.pageInfo.endCursor)} } }`,
        );
        page = next.r?.stargazers;
      }
      if (count) recentStars[key] = count;
    }
    return [];
  });

  // Avatars of the owners most likely to be on the contributions card: the most starred, plus pins.
  const outside = [...new Set(activity.filter((a) => a.kind === 'pr').map((a) => a.repo))].filter((k) => {
    const r = repos[k];
    return !r.isPrivate && r.owner.toLowerCase() !== login.toLowerCase() && !orgs.includes(r.owner.toLowerCase());
  });
  const wanted = new Set([
    ...outside.sort((a, b) => repos[b].stars - repos[a].stars).slice(0, config.contributions.count + 10),
    ...config.contributions.pin.map((p) => repoKey(p, login)),
  ]);
  const owners = [...new Set([...wanted].filter((r) => repos[r]).map((r) => repos[r].owner.toLowerCase()))];
  const avatars: Record<string, string> = {};
  await inParallel(owners, 6, async (owner) => {
    const url = avatarUrls[owner];
    const uri = url ? await fetchDataUri(url) : null;
    if (uri) avatars[owner] = uri;
  });

  for (const w of client.warnings) log(`warning: ${w}`);

  return {
    version: 3,
    generatedAt: now.toISOString(),
    user: { login, name: user.name, createdAt: user.createdAt },
    last12MonthsFrom: last12.from.toISOString(),
    orgs,
    repos,
    ownedRepos,
    recentStars,
    commits,
    activity,
    calendar,
    avatars,
  };
}
