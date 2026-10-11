import { describe, expect, it } from 'vitest';
import { tokenize, type Directory } from '../client/src/linkify';

const dir = (): Directory => ({
  players: [{ id: 'p1', name: 'Zealoteer' }, { id: 'p2', name: 'Zeal' }, { id: 'p3', name: 'Casual_Zeal' }, { id: 'p4', name: 'ab' }],
  planets: [{ name: "Zealoteer's Homeworld", g: 2, s: 17, p: 10 }, { name: 'Colony', g: 1, s: 2, p: 3 }],
});
const kinds = (t: string, d = dir()) => tokenize(t, d).map((x) => (x.type === 'text' ? `"${x.text}"` : `${x.type}:${x.text}`));

describe('finding links in text', () => {
  it('finds bracketed coordinates', () => {
    expect(kinds('Battle at Target [1:4:7] now')).toEqual(['"Battle at Target "', 'coord:[1:4:7]', '" now"']);
    expect(kinds('from [2:17:10] to [3:5:16].')).toEqual(['"from "', 'coord:[2:17:10]', '" to "', 'coord:[3:5:16]', '"."']);
    const t = tokenize('[2:17:10]')[0];
    expect(t).toMatchObject({ type: 'coord', g: 2, s: 17, p: 10 });
  });

  it('leaves times, ratios and long numbers alone', () => {
    expect(kinds('at 10:45:30 and ratio 1:2:3:4 and [12345:6:7] and [1:2]')).toEqual(['"at 10:45:30 and ratio 1:2:3:4 and [12345:6:7] and [1:2]"']);   // a clock time is not a position
  });

  it('finds player names as whole words, the longest name first', () => {
    expect(kinds('Zealoteer attacked Casual_Zeal and Zeal.')).toEqual(['player:Zealoteer', '" attacked "', 'player:Casual_Zeal', '" and "', 'player:Zeal', '"."']);
    expect(kinds('Zealoteers and ZealotX')).toEqual(['"Zealoteers and ZealotX"']);          // part of a longer word: no link
  });

  it('ignores names that are too short, and links the planets whose names are known', () => {
    expect(kinds('ab went home')).toEqual(['"ab went home"']);
    expect(kinds("Fleet leaves Zealoteer's Homeworld [2:17:10] for Colony")).toEqual(['"Fleet leaves "', "planet:Zealoteer's Homeworld", '" "', 'coord:[2:17:10]', '" for "', 'planet:Colony']);
  });

  it('works with no directory, with special characters in names, and with empty text', () => {
    expect(tokenize('hello [1:2:3]').map((x) => x.type)).toEqual(['text', 'coord']);
    const d: Directory = { players: [{ id: 'x', name: 'A.B+C' }], planets: [] };
    expect(kinds('hi A.B+C!', d)).toEqual(['"hi "', 'player:A.B+C', '"!"']);
    expect(tokenize('')).toEqual([]);
  });
});
