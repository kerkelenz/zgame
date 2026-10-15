import { UNITS } from '../../shared/data';
import { Art } from './art';

/** a glyph for each achievement; anything without one gets a star */
const GLYPH: Record<string, string> = {
  firstMine: '⛏', industrial: '🏭', firstBlood: '⚔', warlord: '💀', colonist: '🪐', empire: '👑', moonlit: '🌙', explorer: '🧭', salvager: '♻',
  outpostBreaker: '🏴', pirate: '☠', missileer: '🚀', moonbreaker: '💥', diplomat: '🤝', voidslayer: '☄', voidguardian: '🛡', voidquartermaster: '📦', voidscout: '🔭', topTen: '🏆',
};
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** an achievement as a round medal; `title` is what pointing at it shows */
export function Medal({ id, name, desc, size = 56, dim = false }: { id: string; name: string; desc?: string; size?: number; dim?: boolean }) {
  const h = hue(id);
  return (
    <span className={`medal${dim ? ' dim' : ''}`} style={{ width: size, height: size, fontSize: size * 0.46, background: `radial-gradient(circle at 35% 30%, hsl(${h} 70% 62%), hsl(${h} 60% 32%))`, borderColor: `hsl(${h} 70% 70%)` }} title={desc ? `${name}: ${desc}` : name} role="img" aria-label={name}>{GLYPH[id] ?? '★'}</span>
  );
}

/** the profile picture: a ship, a defense, or the picture of a planet or moon look; falls back to the picture of `fallbackLook` (the home world) */
export function Avatar({ id, size = 96, fallbackLook }: { id?: string | null; size?: number; fallbackLook?: string | null }) {
  let src: string | undefined;
  let label = 'Profile picture';
  if (id) {
    const [kind, key] = id.split(':');
    if ((kind === 'ship' || kind === 'defense') && (UNITS as Record<string, { name: string }>)[key]) { src = Art.icon(kind, key, (UNITS as Record<string, { name: string }>)[key].name); label = (UNITS as Record<string, { name: string }>)[key].name; }
    else if (kind === 'planet' || kind === 'moon') src = Art.spriteOfLook(key, kind === 'moon');
  }
  src ??= Art.spriteOfLook(fallbackLook, false);
  return src ? <img className="avatar" src={src} width={size} height={size} alt={label} style={{ width: size, height: size }} /> : <span className="avatar blank" style={{ width: size, height: size }} aria-hidden>👤</span>;
}
