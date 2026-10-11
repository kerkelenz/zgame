/** Number and time formatting shared by the UI and its tests. */
export const fmt = (n: number) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e7) return (n / 1e6).toFixed(1) + 'M';
  return n.toLocaleString('en-US');
};

export function fmtDur(ms: number) {
  let s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return (d ? `${d}d ` : '') + (h || d ? `${h}h ` : '') + (m || h || d ? `${m}m ` : '') + `${s}s`;
}

/** a long duration reduced to its two biggest units: "11d 23h", "1h 52m", "45s" */
export function fmtDurShort(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never';
  return fmtDur(seconds * 1000).split(' ').slice(0, 2).join(' ');
}

export type CellFmt = 'int' | 'dec' | 'pct' | 'dur' | 'mult';
const trim = (n: number, d: number) => n.toFixed(d).replace(/\.?0+$/, '');
const mult = (v: number) => (v >= 100 ? fmt(v) : trim(v, v >= 10 ? 1 : 2));

/** one table cell */
export function fmtCell(kind: CellFmt, v: number): string {
  if (!Number.isFinite(v)) return '∞';
  switch (kind) {
    case 'int': return fmt(v);
    case 'dec': return trim(v, 3);
    case 'pct': return trim(v * 100, Math.abs(v * 100) < 10 ? 2 : 1) + '%';
    case 'dur': return fmtDurShort(v);
    case 'mult': return '×' + mult(v);
  }
}

/** the change from the previous level, signed; empty when nothing changed */
export function fmtDelta(kind: CellFmt, d: number): string {
  if (Math.abs(d) < 1e-9 || !Number.isFinite(d)) return '';
  const sign = d > 0 ? '+' : '−';
  const a = Math.abs(d);
  return sign + (kind === 'mult' ? mult(a) : fmtCell(kind, a));
}
