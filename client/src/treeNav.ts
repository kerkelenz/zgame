/** Moving between tech-tree cards with the arrow keys: the nearest card in that direction, or null. Pure, so it can be tested. */
export type Dir = 'left' | 'right' | 'up' | 'down';
export interface Spot { id: string; x: number; y: number }

export function nearestInDirection(spots: Spot[], from: string, dir: Dir): string | null {
  const o = spots.find((s) => s.id === from);
  if (!o) return null;
  let best: { id: string; score: number } | null = null;
  for (const s of spots) {
    if (s.id === from) continue;
    const dx = s.x - o.x, dy = s.y - o.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    const score = along + across * 2.5;                     // prefer the card straight ahead over a nearer one off to the side
    if (!best || score < best.score) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

export const KEY_DIR: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
