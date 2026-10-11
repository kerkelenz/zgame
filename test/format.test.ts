import { describe, expect, it } from 'vitest';
import { fmt, fmtCell, fmtDelta, fmtDur, fmtDurShort } from '../shared/format';

describe('number formatting', () => {
  it('groups digits and abbreviates big numbers', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    expect(fmt(12_345_678)).toBe('12.3M');
    expect(fmt(2_500_000_000)).toBe('2.50B');
    expect(fmt(999.9)).toBe('999');
  });
});

describe('durations', () => {
  it('shows every unit for exact timers', () => {
    expect(fmtDur(0)).toBe('0s');
    expect(fmtDur(59_000)).toBe('59s');
    expect(fmtDur(3_661_000)).toBe('1h 1m 1s');
    expect(fmtDur(90_000_000)).toBe('1d 1h 0m 0s');
  });

  it('shortens long ones to the two biggest units', () => {
    expect(fmtDurShort(45)).toBe('45s');
    expect(fmtDurShort(3 * 3600 + 20 * 60 + 5)).toBe('3h 20m');
    expect(fmtDurShort(11 * 86400 + 23 * 3600 + 58 * 60 + 18)).toBe('11d 23h');
    expect(fmtDurShort(Infinity)).toBe('never');
  });
});

describe('table cells', () => {
  it('formats each kind of column', () => {
    expect(fmtCell('int', 1234.7)).toBe('1,234');
    expect(fmtCell('dec', 1.05)).toBe('1.05');
    expect(fmtCell('dec', 2)).toBe('2');
    expect(fmtCell('pct', 0.0066)).toBe('0.66%');
    expect(fmtCell('pct', 0.973)).toBe('97.3%');
    expect(fmtCell('pct', 1)).toBe('100%');
    expect(fmtCell('mult', 9)).toBe('×9');
    expect(fmtCell('mult', 1.5)).toBe('×1.5');
    expect(fmtCell('mult', 1024)).toBe('×1,024');
    expect(fmtCell('dur', 3600)).toBe('1h 0m');
    expect(fmtCell('int', Infinity)).toBe('∞');
  });

  it('formats changes with a sign and nothing when unchanged', () => {
    expect(fmtDelta('int', 85_443)).toBe('+85,443');
    expect(fmtDelta('int', -300)).toBe('−300');
    expect(fmtDelta('pct', -0.027)).toBe('−2.7%');
    expect(fmtDelta('mult', 1)).toBe('+1'); // not "+×1"
    expect(fmtDelta('int', 0)).toBe('');
    expect(fmtDelta('int', NaN)).toBe('');
  });
});
