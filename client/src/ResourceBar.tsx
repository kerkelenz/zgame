import { resName } from '../../shared/data';
import { fullState, timeToFull } from './afford';
import { useGame } from './game';
import { EnergyIcon, ResIcon } from './ResIcon';
import { fmt, fmtDur } from './ui';

/** the selected world's stock, one line: used where the planet cards do not carry the numbers themselves (a moon, or many planets in one switcher) */
export function ResourceBar() {
  const { planet, live } = useGame();
  if (!planet) return null;
  const energy = planet.production.energyProduced - planet.production.energyUsed;
  return (
    <div className="res" data-tour="resources">
      {(['metal', 'crystal', 'deuterium'] as const).map((k) => {
        const ms = timeToFull(live[k], planet.production[k], planet.capacity[k]);
        const st = fullState(ms);
        const cls = k === 'deuterium' ? 'deut' : k;
        return (
          <span key={k} className={`${cls}${st ? ' ' + st : ''}`} title={`${resName(k)} (storage ${fmt(planet.capacity[k])})${ms === 0 ? ': storage is full, production is wasted' : ms !== null ? `: full in ${fmtDur(ms)}` : ''}`}>
            <ResIcon k={k} /> {fmt(live[k])}<small>/{fmt(planet.capacity[k])}</small>{st === 'soon' && ms !== null && <small className="fullin"> {fmtDur(ms)}</small>}{st === 'full' && <small className="fullin"> FULL</small>}
          </span>
        );
      })}
      <span className={energy < 0 ? 'bad' : 'energy'} title={energy < 0 ? `Energy balance: mines run at ${Math.round((planet.production.efficiency ?? 1) * 100)}% until you build more power` : 'Energy balance'}><EnergyIcon /> {fmt(energy)}{energy < 0 && planet.production.efficiency != null && <small className="fullin"> {Math.round(planet.production.efficiency * 100)}%</small>}</span>
    </div>
  );
}
