import { post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, when } from '../ui';

function Vacation() {
  const { me, act, now } = useGame();
  const v = me.vacation as { since: number; minUntil: number } | null;
  const hours = me.config.vacationMinHours;
  return (
    <Card title="Vacation mode">
      <div className="settings-section">
        <p className="muted">Freeze your empire while you are away. Nothing is produced, and nobody can attack, spy on, bombard or station fleets with you. Raiders and tribute demands skip you.</p>
        <ul className="notes">
          <li>It lasts at least <b>{hours} hours</b>, and while you are away you cannot build, research, trade or send fleets.</li>
          <li>To start, your empire must be quiet: no fleets or missiles in flight, no construction, research or shipyard queues, no hostile fleets heading for you and no allied fleets stationed with you.</li>
          <li>The time away gives no production when you return, and your planets show a <span className="tag vac">v</span> flag in the Galaxy.</li>
        </ul>
        {v ? (
          <>
            <p>You have been on vacation since <b>{when(v.since)}</b>.</p>
            {now < v.minUntil
              ? <p className="muted">You can leave in <Countdown to={v.minUntil} /> (at {when(v.minUntil)}).</p>
              : <p className="good">The minimum stay is over - you can leave whenever you like.</p>}
            <button className="primary" disabled={now < v.minUntil} onClick={() => void act(() => post('/vacation/end'), 'Welcome back!')}>Leave vacation mode</button>
          </>
        ) : (
          <button onClick={() => { if (confirm(`Start vacation mode? It lasts at least ${hours} hours and your empire will be frozen.`)) void act(() => post('/vacation/start'), 'Vacation mode started'); }}>Start vacation mode</button>
        )}
      </div>
    </Card>
  );
}

export function Settings() {
  return (
    <Page title="Settings">
      <Vacation />
    </Page>
  );
}
