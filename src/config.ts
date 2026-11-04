import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface Config {
  /** GitHub login. Defaults to the token's owner. */
  user: string | null;
  include: {
    /** Count private repositories in the summary and languages cards. */
    private: boolean;
    /** Count repositories of organizations you belong to. */
    orgs: boolean;
  };
  theme: {
    /** Card background; "transparent" blends into GitHub's page. */
    background: 'transparent' | 'solid';
    border: boolean;
    animations: boolean;
  };
  summary: {
    title: string | null;
  };
  languages: {
    count: number;
    exclude: string[];
    excludeRepos: string[];
    /** Multiplier per repo; 1 is neutral, 0 excludes it. */
    repoWeights: Record<string, number>;
    /** Fold the remaining languages into an "Other" entry. */
    other: boolean;
  };
  contributions: {
    count: number;
    includeOpen: boolean;
    /** Shown before the others, if they have a merged (or open) pull request of yours. */
    pin: string[];
    hide: string[];
  };
}

export const DEFAULT_CONFIG: Config = {
  user: null,
  include: { private: true, orgs: true },
  theme: { background: 'transparent', border: false, animations: true },
  summary: { title: null },
  languages: { count: 6, exclude: [], excludeRepos: [], repoWeights: {}, other: true },
  contributions: { count: 6, includeOpen: true, pin: [], hide: [] },
};

export class ConfigError extends Error {}

type Shape = { [key: string]: 'boolean' | 'string' | 'string?' | 'number' | 'string[]' | 'weights' | Shape };

const SHAPE: Shape = {
  user: 'string?',
  include: { private: 'boolean', orgs: 'boolean' },
  theme: { background: 'string', border: 'boolean', animations: 'boolean' },
  summary: { title: 'string?' },
  languages: {
    count: 'number',
    exclude: 'string[]',
    excludeRepos: 'string[]',
    repoWeights: 'weights',
    other: 'boolean',
  },
  contributions: { count: 'number', includeOpen: 'boolean', pin: 'string[]', hide: 'string[]' },
};

function check(value: unknown, shape: Shape, path: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${path || 'config'} must be a mapping`);
  }
  for (const [key, v] of Object.entries(value)) {
    const where = path ? `${path}.${key}` : key;
    const expected = shape[key];
    if (expected === undefined) {
      throw new ConfigError(`unknown setting "${where}"`);
    }
    if (typeof expected === 'object') {
      check(v, expected, where);
      continue;
    }
    const ok =
      expected === 'boolean' ? typeof v === 'boolean'
      : expected === 'string' ? typeof v === 'string'
      : expected === 'string?' ? v === null || typeof v === 'string'
      : expected === 'number' ? typeof v === 'number' && Number.isInteger(v) && v > 0
      : expected === 'string[]' ? Array.isArray(v) && v.every((s) => typeof s === 'string')
      : typeof v === 'object' && v !== null && !Array.isArray(v) &&
        Object.values(v).every((n) => typeof n === 'number' && n >= 0);
    if (!ok) {
      const what = expected === 'weights' ? 'a mapping of repo to a number >= 0'
        : expected === 'number' ? 'a positive whole number'
        : expected === 'string[]' ? 'a list of strings'
        : expected === 'string?' ? 'a string'
        : `a ${expected}`;
      throw new ConfigError(`"${where}" must be ${what}`);
    }
  }
}

function merge<T>(base: T, override: unknown): T {
  if (typeof override !== 'object' || override === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, v] of Object.entries(override)) {
    const b = out[key];
    out[key] =
      typeof b === 'object' && b !== null && !Array.isArray(b) && typeof v === 'object' && v !== null && !Array.isArray(v)
        && key !== 'repoWeights'
        ? merge(b, v)
        : v;
  }
  return out as T;
}

export function parseConfig(text: string): Config {
  const raw: unknown = parse(text) ?? {};
  check(raw, SHAPE, '');
  const config = merge(DEFAULT_CONFIG, raw);
  if (config.theme.background !== 'transparent' && config.theme.background !== 'solid') {
    throw new ConfigError('"theme.background" must be "transparent" or "solid"');
  }
  return config;
}

export function loadConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`cannot read config file ${path}`);
  }
  return parseConfig(text);
}

/** "repo" means a repo of the user; "owner/repo" is taken as is. Lowercased for matching. */
export function repoKey(ref: string, login: string): string {
  const name = ref.includes('/') ? ref : `${login}/${ref}`;
  return name.toLowerCase();
}
