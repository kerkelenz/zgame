import { describe, expect, it } from 'vitest';
import { caretAfterDigits, countDigits, groupInt, parseGrouped } from '../shared/numfmt';

describe('number input formatting', () => {
  it('groups digits for the language', () => {
    expect(groupInt(2000000, 'en')).toBe('2,000,000');
    expect(groupInt(2000000, 'de')).toBe('2.000.000');
    expect(groupInt(1234567, 'fr').replace(/\s/g, ' ')).toMatch(/^1 234 567$/);
    expect(groupInt(0)).toBe('0');
    expect(groupInt(-5)).toBe('0');
    expect(groupInt(12.9)).toBe('12');
    expect(groupInt(Number.NaN)).toBe('0');
  });

  it('reads back whatever the player types, separators or not', () => {
    expect(parseGrouped('2,000,000')).toBe(2000000);
    expect(parseGrouped('2.000.000')).toBe(2000000);
    expect(parseGrouped('2 000 000')).toBe(2000000);
    expect(parseGrouped('12abc3')).toBe(123);
    expect(parseGrouped('')).toBeNull();
    expect(parseGrouped('abc')).toBeNull();
    expect(parseGrouped('9'.repeat(30))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('keeps the caret after the same digit when separators move', () => {
    // typing a 7th digit at the end of "123,456" gives "1,234,567": the caret stays at the end
    const typed = '123,4567';
    const digits = countDigits(typed);
    expect(caretAfterDigits('1,234,567', digits)).toBe(9);
    // typing in the middle: after the 2nd digit of "1,234" is after the '2' (index 3)
    expect(caretAfterDigits('1,234', 2)).toBe(3);
    expect(caretAfterDigits('1,234', 0)).toBe(0);
    expect(caretAfterDigits('1,234', 99)).toBe(5);
  });
});
