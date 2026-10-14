import { describe, expect, it } from 'vitest';
import { markAllRead, pushNote, unreadNotes, type Note } from '../client/src/notes';

const n = (id: number, text: string, at: number) => ({ id, text, kind: 'info' as const, at });
describe('notification centre', () => {
  it('keeps the newest first and counts the unread', () => {
    let l: Note[] = [];
    l = pushNote(l, n(1, 'Metal Mine: level 5', 1000));
    l = pushNote(l, n(2, 'Fleet arrived', 20_000));
    expect(l.map((x) => x.id)).toEqual([2, 1]);
    expect(unreadNotes(l)).toBe(2);
    l = markAllRead(l);
    expect(unreadNotes(l)).toBe(0);
  });
  it('merges the same message arriving twice at once and drops the oldest over the limit', () => {
    let l: Note[] = [];
    l = pushNote(l, n(1, 'x', 1000));
    l = pushNote(l, n(2, 'x', 2000));
    expect(l).toHaveLength(1);
    for (let i = 0; i < 10; i++) l = pushNote(l, n(10 + i, `m${i}`, 100_000 + i * 10_000), 5);
    expect(l).toHaveLength(5);
    expect(l[0].text).toBe('m9');
  });
});
