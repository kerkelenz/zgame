import { resName } from '../../shared/data';
import { fullState, timeToFull } from './afford';
import { useGame } from './game';
import { EnergyIcon, ResIcon } from './ResIcon';
import { fmt, fmtDur } from './ui';

type WorldView = ReturnType<typeof useGame>['planets'][number];
const KEYS = ['metal', 'crystal', 'deuterium'] as const;

/** a world's stock as it is right now (the server sends it as of `updatedAt`; production runs on from there) */
export function liveStock(w: WorldView, now: number) {
  const dt = Math.max(0, now - w.updatedAt) / 3_600_000;
  const f = (k: (typeof KEYS)[number]) => {
    const cur = w.resources[k], rate = w.production[k], cap = w.capacity[k];
    return rate >= 0 ? (cur >= cap ? cur : Math.min(cap, cur + rate * dt)) : Math.max(0, cur + rate * dt);
  };
  return { metal: f('metal'), crystal: f('crystal'), deuterium: f('deuterium') };
}

/** the three resources of a planet on its card: amount and a thin bar for how full the store is, red when full or about to be; energy below */
export function PlanetRes({ w, tour, energy: showEnergy = true }: { w: WorldView; tour?: boolean; energy?: boolean }) {
  const { now } = useGame();
  const have = liveStock(w, now);
  const energy = w.production.energyProduced - w.production.energyUsed;
  return (
    <div className="pres" data-tour={tour ? 'resources' : undefined}>
      {KEYS.map((k) => {
        const ms = timeToFull(have[k], w.production[k], w.capacity[k]);
        const st = fullState(ms);
        const cls = k === 'deuterium' ? 'deut' : k;
        const share = Math.min(100, Math.round((have[k] / Math.max(1, w.capacity[k])) * 100));
        return (
          <span key={k} className={`pr ${cls}${st ? ' ' + st : ''}`} title={`${resName(k)}: ${fmt(have[k])} of ${fmt(w.capacity[k])}${ms === 0 ? ' - storage is full, production is wasted' : ms !== null ? ` - full in ${fmtDur(ms)}` : ''}`}>
            <ResIcon k={k} size={14} /><span className="prn">{fmt(have[k])}{st === 'full' && <small className="fullin"> FULL</small>}</span>
            <i className="prbar"><b style={{ width: `${share}%` }} /></i>
          </span>
        );
      })}
      {showEnergy && <span className={`prE ${energy < 0 ? 'bad' : 'energy'}`} title={energy < 0 ? `Energy balance: mines run at ${Math.round((w.production.efficiency ?? 1) * 100)}% until you build more power` : 'Energy balance'}><EnergyIcon size={12} /> {fmt(energy)}</span>}
    </div>
  );
}
