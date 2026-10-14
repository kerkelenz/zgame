import { useMemo } from 'react';
import { advise, idleCount, type Advice } from './advice';
import { useGame } from './game';
import { Card } from './ui';

export function useAdvice(): Advice[] {
  const { me, planets, now } = useGame();
  // re-worked every ten seconds: the times in it are minutes, not seconds
  const slice = Math.floor(now / 10_000);
  return useMemo(() => (me ? advise({ me, planets, now }) : []), [me, planets, slice]); // eslint-disable-line react-hooks/exhaustive-deps
}

const ICON = { idle: '💤', warn: '⚠', tip: '💡' } as const;

/** Overview card: what is idle, about to be wasted, or worth doing, each with a button that goes there (switching to the planet it is about). */
export function AdviceCard() {
  const { selectPlanet, setPage } = useGame();
  const advice = useAdvice();
  if (!advice.length) return null;
  return (
    <Card title="What to do next">
      <ul className="advice">
        {advice.slice(0, 8).map((a) => (
          <li key={a.id} className={a.level}>
            <span>{ICON[a.level]} {a.text}</span>
            <button onClick={() => { if (a.planetId) selectPlanet(a.planetId); setPage(a.page); }}>Go</button>
          </li>
        ))}
      </ul>
      {advice.length > 8 && <p className="muted small">and {advice.length - 8} more</p>}
    </Card>
  );
}

/** Top-bar chip: how many things are idle right now (queues that should be running), pointing at the Overview list. */
export function IdleChip() {
  const { setPage } = useGame();
  const advice = useAdvice();
  const n = idleCount(advice);
  if (!n) return null;
  return (
    <button className="idlechip" title={advice.filter((a) => a.level === 'idle').map((a) => a.text).join('\n')} onClick={() => setPage('overview')}>
      💤 {n} idle
    </button>
  );
}
