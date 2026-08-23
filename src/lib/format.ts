/**
 * Display formatting.
 *
 * A resource bar on a phone has room for about six characters. "1,284,553" does
 * not fit, and even where it does, a number that reflows its width every second
 * is visually noisy. So we abbreviate - and we do it consistently, in one place,
 * because half the screens showing "1.2M" and the other half showing "1200000"
 * is the kind of inconsistency players notice immediately.
 */

/**
 * Compact number formatting: `1234` -> `1.2k`, `3_400_000` -> `3.4M`.
 *
 * Rules chosen for glanceability rather than precision:
 *
 * - Below 1,000: whole numbers. You are counting individual units here and
 *   "847" is both short and exact.
 * - Above that: one decimal place, dropped when it is zero (`5k`, not `5.0k`).
 * - Rounded *down*, not to nearest. If the bar says you have 1.2k metal, you
 *   have at least 1,200 - so a build the UI implies you can afford is one you
 *   can actually afford. Rounding up would produce infuriating near-misses.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) return `${sign}${Math.floor(abs)}`;

  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];

  for (const [threshold, suffix] of units) {
    if (abs < threshold) continue;
    // Truncate to one decimal rather than rounding, per the note above.
    const scaled = Math.floor((abs / threshold) * 10) / 10;
    const text = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
    return `${sign}${text}${suffix}`;
  }

  return `${sign}${Math.floor(abs)}`;
}

/** Full thousands-separated form, for places with room to be exact. */
export function formatExact(value: number): string {
  return Math.floor(value).toLocaleString('en-US');
}

/**
 * Duration as `1h 23m 45s`.
 *
 * Larger units are dropped when zero, so a short build reads `45s` rather than
 * `0d 0h 0m 45s`. Smaller units are kept once a larger one is present, because
 * a countdown that jumps from `2m` to `1m` while seconds tick invisibly
 * underneath feels broken.
 *
 * @param seconds Duration in seconds. Negative values clamp to zero, since a
 *                countdown that has run out should read `0s`, not `-3s`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '-';

  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/** Per-hour rate as `+1.2k/h`. The sign is explicit so gains read as gains. */
export function formatRate(perHour: number): string {
  const sign = perHour < 0 ? '' : '+';
  return `${sign}${formatNumber(perHour)}/h`;
}

/** A percentage for the energy penalty label, e.g. `-12%`. */
export function formatPercentDelta(factor: number): string {
  const percent = Math.round((1 - factor) * 100);
  return `-${percent}%`;
}

/** `1:42:8` - the canonical way to write coordinates in this genre. */
export function formatCoords(coords: { galaxy: number; system: number; position: number }): string {
  return `${coords.galaxy}:${coords.system}:${coords.position}`;
}
