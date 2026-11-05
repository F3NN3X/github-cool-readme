import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { CARDS, ConfigError, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import { fixture } from './fixtures/snapshot.ts';

const about = (patch: (c: Config) => void = () => {}) => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.cards = ['about'];
  patch(c);
  return renderAll(compute(fixture(), c), c)['about-light.svg'];
};

describe('about card', () => {
  it('reads its text from the settings, keeping the order of the facts', () => {
    const c = parseConfig(`
cards: [about]
about:
  headline: Hello
  lines: [One, Two]
  facts: { Focus: Tools, Stack: Rust }
`);
    expect(c.about.headline).toBe('Hello');
    expect(Object.keys(c.about.facts)).toEqual(['Focus', 'Stack']);
  });

  it('shows the headline, the lines and the facts', () => {
    const svg = about((c) => { c.about.headline = 'Hello'; c.about.lines = ['Line one']; c.about.facts = { Focus: 'Tools' }; });
    for (const text of ['Hello', 'Line one', 'FOCUS', 'Tools']) expect(svg).toContain(text);
    expect(svg).toMatch(/<svg [^>]*width="800" height="195"/);
  });

  it('escapes the text', () => {
    expect(about((c) => (c.about.lines = ['a <b> & c']))).toContain('a &#60;b&#62; &#38; c');
  });

  it('works without a headline, and says so when empty', () => {
    expect(about((c) => (c.about.lines = ['Only text']))).toContain('Only text');
    const empty = about();
    expect(empty).toContain('Nothing here yet');
    expect(empty).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it('is left out by default and refused in the oled style', () => {
    expect(DEFAULT_CONFIG.cards).not.toContain('about');
    expect(CARDS).toContain('about');
    expect(() => parseConfig('style: oled\ncards: [about]')).toThrow(ConfigError);
  });
});
