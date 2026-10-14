import { MOON_LOOKS, PLANET_LOOKS } from '../../shared/artlist';
import { POSITION_BONUS } from '../../shared/data';
import { LIFEFORMS, type LifeformId } from '../../shared/lifeforms';
import { ROLES } from '../../shared/roles';
import { Art } from './art';
import { useGame } from './game';
import { EnergyIcon, ResIcon } from './ResIcon';
import { fmt } from './ui';

/** "gasgiant" reads "Gas giant"; everything else is just capitalised */
const NAMES: Record<string, string> = { gasgiant: 'Gas giant' };
export const lookName = (look: string | null | undefined, isMoon: boolean) => {
  if (!look) return isMoon ? 'Moon' : 'Planet';
  const n = NAMES[look] ?? `${look[0].toUpperCase()}${look.slice(1)}`;
  return isMoon || look === 'gasgiant' ? (isMoon ? `${n} moon` : n) : `${n} planet`;
};
const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}.`;

/**
 * The top of the Overview: the planet's (or moon's) wide banner with its name written over it, what kind of world it is, a switch between a
 * planet and its moon, and the facts you check most: size, building fields, temperature, orbit bonus, what it makes an hour and its energy.
 */
export function PlanetHero() {
  const { planet, planets, selectPlanet } = useGame();
  const base = planet.isMoon ? planets.find((x) => x.id === planet.parentId) ?? planet : planet;
  const moon = planet.isMoon ? planet : planets.find((x) => x.parentId === planet.id);
  const bodies = [base, moon].filter((b): b is typeof planet => !!b);
  const role = ROLES.find((r) => r.id === planet.role);
  const desc = (planet.isMoon ? MOON_LOOKS : PLANET_LOOKS)[planet.look as string];
  const bonus = !planet.isMoon && POSITION_BONUS[planet.coords.p];
  const p = planet.production;
  const fieldsShare = Math.min(100, Math.round((planet.usedFields / Math.max(1, planet.fields)) * 100));

  return (
    <section className={`hero${planet.isMoon ? ' moonhero' : ''}`} style={{ backgroundImage: `url(${Art.banner(planet.id, planet.maxTemp, !!planet.isMoon)})` }} aria-label={`${planet.name}, ${lookName(planet.look, !!planet.isMoon)}`}>
      <div className="herotop">
        <div className="herotitle">
          <span className="herokind">{lookName(planet.look, !!planet.isMoon)}{role && <span className="herorole">{role.label}</span>}{planet.lifeform && LIFEFORMS[planet.lifeform as LifeformId] && <span className="herorole" title="The people of this planet">{LIFEFORMS[planet.lifeform as LifeformId].name}</span>}</span>
          {desc && <span className="herodesc">{sentence(desc)}</span>}
        </div>
        {bodies.length > 1 && (
          <div className="herobodies" role="group" aria-label="Planet and moon">
            <span className="orbit" aria-hidden="true"><img src={Art.planet(base.id, base.maxTemp, false)} alt="" /><span className="orbiter"><img src={Art.planet(moon!.id, moon!.maxTemp, true)} alt="" /></span></span>
            {bodies.map((b) => (
              <button key={b.id} className={`herobody${b.id === planet.id ? ' on' : ''}`} onClick={() => selectPlanet(b.id)} aria-pressed={b.id === planet.id} title={b.isMoon ? 'Show the moon' : 'Show the planet'}>
                <img src={Art.planet(b.id, b.maxTemp, !!b.isMoon)} alt="" /><span>{b.isMoon ? 'Moon' : 'Planet'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="herostats">
        {planet.diameter && <span className="herochip" title="Diameter">◎ {fmt(planet.diameter)} km</span>}
        <span className="herochip fields" title="Building fields in use"><span className="fieldbar"><i style={{ width: `${fieldsShare}%` }} /></span> {planet.usedFields} / {planet.fields} fields</span>
        <span className="herochip" title="The warmest it gets here; colder planets make more vespene gas">🌡 {planet.maxTemp} °C</span>
        {bonus && <span className="herochip good" title="Orbit bonus">{Object.entries(bonus).map(([k, v]) => `+${Math.round((v as number) * 100)}% ${k}`).join(', ')}</span>}
        <span className="herochip" title="Production per hour"><span className="metal"><ResIcon k="metal" size={14} /> {fmt(p.metal)}</span> · <span className="crystal"><ResIcon k="crystal" size={14} /> {fmt(p.crystal)}</span> · <span className="deut"><ResIcon k="deuterium" size={14} /> {fmt(p.deuterium)}</span> <span className="muted small">/ h</span></span>
        <span className={`herochip${p.efficiency < 1 ? ' bad' : ''}`} title="Energy produced / used, and how fast the mines run"><EnergyIcon size={14} /> {fmt(p.energyProduced)} / {fmt(p.energyUsed)} ({Math.round(p.efficiency * 100)}%)</span>
      </div>
    </section>
  );
}
