import { describe, expect, it } from 'vitest';
import { KEY_DIR, nearestInDirection } from '../client/src/treeNav';
import { bumped } from '../client/src/useFlash';
import { readFileSync } from 'node:fs';

describe('tech tree keyboard moves', () => {
  const spots = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 200, y: 0 }, { id: 'c', x: 200, y: 90 }, { id: 'd', x: 400, y: 400 }, { id: 'e', x: 0, y: 90 }];
  it('goes to the card straight ahead rather than a nearer one off to the side', () => {
    expect(nearestInDirection(spots, 'a', 'right')).toBe('b');
    expect(nearestInDirection(spots, 'a', 'down')).toBe('e');
    expect(nearestInDirection(spots, 'b', 'down')).toBe('c');
    expect(nearestInDirection(spots, 'c', 'left')).toBe('e');
  });
  it('stays put at an edge or for an unknown card, and knows the four arrow keys', () => {
    expect(nearestInDirection(spots, 'a', 'left')).toBeNull();
    expect(nearestInDirection(spots, 'a', 'up')).toBeNull();
    expect(nearestInDirection(spots, 'zz', 'right')).toBeNull();
    expect(Object.keys(KEY_DIR)).toEqual(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  });
});

describe('the glow when a number rises', () => {
  it('lights up on a rise only, never on the first value or a fall', () => {
    expect(bumped(undefined, 5)).toBe(false);
    expect(bumped(4, 5)).toBe(true);
    expect(bumped(5, 5)).toBe(false);
    expect(bumped(6, 5)).toBe(false);
  });
});

describe('accessibility basics in the stylesheet and the shell', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');
  const app = readFileSync('client/src/App.tsx', 'utf8');
  it('respects reduced motion, shows keyboard focus and announces pop-ups', () => {
    // the device's reduced-motion setting is the default of the Animation choice, and the styles stand still when it is off or reduced
    expect(readFileSync('client/src/motion.ts', 'utf8')).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/data-motion="off"/);
    expect(css).toMatch(/data-motion="reduced"/);
    expect(css).toMatch(/:focus-visible/);
    expect(app).toMatch(/aria-live="polite"/);
    expect(app).toMatch(/Skip to the page/);
  });
});
