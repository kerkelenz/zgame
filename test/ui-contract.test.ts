import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../client/src/styles.css', import.meta.url), 'utf8');

/** the declarations of the first top-level rule for `selector` (plain string search, no regex escaping to get wrong) */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open)).replace(/\s+/g, ' ');
}

describe('page layering (regression: a full-screen canvas once swallowed every click)', () => {
  it('the starfield sits behind the page and never takes mouse input', () => {
    const r = rule('#stars');
    expect(r).toContain('position: fixed');
    expect(r).toContain('pointer-events: none');
    expect(r).toContain('z-index: -1');
  });

  it('the app shell is its own stacking context so the canvas stays behind it', () => {
    const r = rule('.shell');
    expect(r).toContain('position: relative');
    expect(r).toContain('z-index: 1');
  });

  it('the guard actually finds the rules (so it cannot pass vacuously)', () => {
    expect(rule('#stars').length).toBeGreaterThan(10);
    expect(rule('.shell').length).toBeGreaterThan(10);
  });
});
