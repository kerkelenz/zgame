/** Finds coordinates and names inside plain text so the page can turn them into working links. Pure, so it can be tested. */
export type Token =
  | { type: 'text'; text: string }
  | { type: 'coord'; text: string; g: number; s: number; p: number }
  | { type: 'player'; text: string; id: string }
  | { type: 'planet'; text: string; g: number; s: number; p: number };

export interface Directory {
  /** commanders and computer empires, by exact name */
  players: { id: string; name: string }[];
  /** planets whose name is known (your own), with where they are */
  planets: { name: string; g: number; s: number; p: number }[];
}

// only the bracketed form the game itself prints, [1:2:3]: a bare 10:45:30 is more likely a clock time
const COORD = String.raw`\[(\d{1,2}):(\d{1,3}):(\d{1,2})\]`;
const SPECIAL = /[.*+?^${}()|[\]\\]/g;
const esc = (s: string) => s.replace(SPECIAL, (c) => '\\' + c);
const compiled = new WeakMap<Directory, { re: RegExp; players: Map<string, string>; planets: Map<string, { g: number; s: number; p: number }> }>();

function compile(d: Directory) {
  let c = compiled.get(d);
  if (c) return c;
  const players = new Map(d.players.filter((x) => x.name.length >= 3).map((x) => [x.name, x.id]));
  const planets = new Map(d.planets.filter((x) => x.name.length >= 3 && !players.has(x.name)).map((x) => [x.name, { g: x.g, s: x.s, p: x.p }]));
  const names = [...players.keys(), ...planets.keys()].sort((a, b) => b.length - a.length).map(esc);
  const nameRe = names.length ? String.raw`|(?<![\w-])(${names.join('|')})(?![\w-])` : '';
  c = { re: new RegExp(`${COORD}${nameRe}`, 'g'), players, planets };
  compiled.set(d, c);
  return c;
}

const none: Directory = { players: [], planets: [] };

export function tokenize(text: string, dir: Directory = none): Token[] {
  const { re, players, planets } = compile(dir);
  const out: Token[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      const [g, s, p] = [m[1], m[2], m[3]].map(Number);
      out.push({ type: 'coord', text: m[0], g, s, p });
    } else {
      const name = m[4];
      const id = players.get(name);
      const at = planets.get(name);
      if (id) out.push({ type: 'player', text: name, id });
      else if (at) out.push({ type: 'planet', text: name, ...at });
      else out.push({ type: 'text', text: m[0] });
    }
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}
