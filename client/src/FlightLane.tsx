import { useGame } from './game';
import { flightProgress, type FlightLike } from './motion';

/** A fleet on a line from its own planet to its target: a ship that glides along as the seconds pass, turning round on the way home. */
export function FlightLane({ m, hostile = false }: { m: FlightLike; hostile?: boolean }) {
  const { now } = useGame();
  const { frac, dir } = flightProgress(m, now);
  const label = dir === 'hold' ? 'holding at the target' : `${Math.round(frac * 100)}% of the way ${dir === 'back' ? 'back' : 'there'}`;
  return (
    <div className={`lane ${dir}${hostile ? ' hostile' : ''}`} role="img" aria-label={label} title={label}>
      <i className="laneend start" />
      <i className="lanetrack" />
      <i className="laneend end" />
      <span className="laneship" style={{ left: `${Math.round(frac * 1000) / 10}%` }}>
        <i className="lanetrail" />
        <span className="laneglyph">➤</span>
      </span>
    </div>
  );
}
