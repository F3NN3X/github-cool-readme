import { createRequire } from 'node:module';

// Octicons (MIT, GitHub) so the icons match the rest of the profile page.
const require = createRequire(import.meta.url);
const data = require('@primer/octicons/build/data.json') as Record<string, { heights: Record<string, { path: string }> }>;

export type IconName = 'git-commit' | 'git-pull-request' | 'code-review' | 'issue-opened' | 'star' | 'star-fill';

/** A 16x16 octicon at (x, y), scaled to `size`. */
export function icon(name: IconName, x: number, y: number, size = 16, cls = 'icon'): string {
  const path = data[name]?.heights['16']?.path;
  if (!path) throw new Error(`unknown octicon ${name}`);
  const scale = size / 16;
  return `<g class="${cls}" transform="translate(${x} ${y}) scale(${scale})">${path}</g>`;
}
