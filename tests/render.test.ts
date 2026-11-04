import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { DEFAULT_CONFIG, type Config } from '../src/config.ts';
import { describe as describeItem } from '../src/render/contributions.ts';
import { renderAll } from '../src/render/index.ts';
import { formatCompact, truncate } from '../src/render/svg.ts';
import { fixture } from './fixtures/snapshot.ts';

/** Minimal well-formedness check: every opened tag is closed in order. */
function assertWellFormed(svg: string): void {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop(), `closing </${name}>`).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
}

const render = (patch: (c: Config) => void = () => {}) => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return renderAll(compute(fixture(), c), c);
};

describe('cards', () => {
  it('writes a light and a dark variant of each card', () => {
    expect(Object.keys(render()).sort()).toEqual([
      'contributions-dark.svg', 'contributions-light.svg',
      'languages-dark.svg', 'languages-light.svg',
      'summary-dark.svg', 'summary-light.svg',
    ]);
  });

  it('produces well-formed SVG with no missing values', () => {
    for (const [name, svg] of Object.entries(render())) {
      assertWellFormed(svg);
      expect(svg, name).not.toMatch(/NaN|undefined|null|Infinity/);
    }
  });

  it('escapes text', () => {
    const svg = render((c) => (c.summary.title = 'Tom & <Jerry>'))['summary-light.svg'];
    expect(svg).toContain('Tom &#38; &#60;Jerry&#62;');
    assertWellFormed(svg);
  });

  it('puts the numbers in the summary', () => {
    const svg = render()['summary-light.svg'];
    for (const n of ['160', '350', '23', '123', '60%']) expect(svg).toContain(`>${n}<`);
  });

  it('drops all animation when disabled', () => {
    for (const svg of Object.values(render((c) => (c.theme.animations = false)))) {
      expect(svg).not.toContain('@keyframes');
      expect(svg).not.toContain('animation-delay');
    }
  });

  it('renders empty states', () => {
    const c = structuredClone(DEFAULT_CONFIG);
    const model = compute({ ...fixture(), activity: [], commits: {} }, c);
    const files = renderAll(model, c);
    expect(files['languages-light.svg']).toContain('No language data yet');
    expect(files['contributions-light.svg']).toContain('No contributions to other projects yet');
  });
});

describe('formatting', () => {
  it('describes a contribution', () => {
    const base = { repo: 'a/b', owner: 'a', stars: 1, avatar: null, merged: 0, open: 0, lastDate: '2026-09-10T00:00:00Z' };
    expect(describeItem({ ...base, merged: 1 })).toBe('1 PR merged · Sep 2026');
    expect(describeItem({ ...base, merged: 3, open: 1 })).toBe('3 PRs merged, 1 open · Sep 2026');
    expect(describeItem({ ...base, open: 2 })).toBe('2 PRs open · Sep 2026');
  });

  it('shortens numbers and names', () => {
    expect([999, 1000, 1834, 27570, 1_250_000].map(formatCompact)).toEqual(['999', '1k', '1.8k', '28k', '1.3M']);
    expect(truncate('short', 100, 13)).toBe('short');
    expect(truncate('a-really-long-repository-name', 80, 13)).toMatch(/…$/);
  });
});
