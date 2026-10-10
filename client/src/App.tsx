import { useEffect, useRef } from 'react';
import { drawStarfield } from './art';
import { useGame } from './game';
import { fmt, coordStr } from './ui';
import { Alliance } from './pages/Alliance';
import { Chat } from './pages/Chat';
import { Command } from './pages/Command';
import { Simulator } from './pages/Simulator';
import { Empire } from './pages/Empire';
import { Guide } from './pages/Guide';
import { FleetPage } from './pages/Fleet';
import { Galaxy } from './pages/Galaxy';
import { Highscore } from './pages/Highscore';
import { Messages } from './pages/Messages';
import { Overview } from './pages/Overview';
import { Items } from './pages/Items';
import { Resources } from './pages/Resources';

const NAV: [string, string][] = [
  ['overview', 'Overview'], ['empire', 'Empire'], ['resources', 'Resources'], ['buildings', 'Buildings'], ['research', 'Research'],
  ['shipyard', 'Shipyard'], ['defense', 'Defense'], ['fleet', 'Fleet'], ['galaxy', 'Galaxy'],
  ['alliance', 'Alliance'], ['command', 'Command'], ['simulator', 'Simulator'], ['messages', 'Messages'], ['chat', 'Chat'], ['highscore', 'Standing'], ['guide', 'Guide'],
];

export function App() {
  const g = useGame();
  const stars = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => stars.current && drawStarfield(stars.current);
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);
  const { me, planet, planets, page, setPage, live, toasts, fleets, offline } = g;
  if (!me || !planet) return <div className="loading">Loading universe…</div>;

  const page_ = (() => {
    switch (page) {
      case 'empire': return <Empire />;
      case 'resources': return <Resources />;
      case 'buildings': return <Items kind="building" />;
      case 'research': return <Items kind="tech" />;
      case 'shipyard': return <Items kind="ship" />;
      case 'defense': return <Items kind="defense" />;
      case 'fleet': return <FleetPage />;
      case 'galaxy': return <Galaxy />;
      case 'alliance': return <Alliance />;
      case 'messages': return <Messages />;
      case 'chat': return <Chat />;
      case 'highscore': return <Highscore />;
      case 'guide': return <Guide />;
      case 'command': return <Command />;
      case 'simulator': return <Simulator />;
      default: return <Overview />;
    }
  })();

  const energy = planet.production.energyProduced - planet.production.energyUsed;
  return (
    <div className="shell">
      <canvas id="stars" ref={stars} aria-hidden="true" />
      <header className="top">
        <div className="brand">Stellar Frontier</div>
        <select value={planet.id} onChange={(e) => g.selectPlanet(e.target.value)}>
          {planets.map((p) => <option key={p.id} value={p.id}>{p.isMoon ? '🌙 ' : ''}{p.name} {coordStr(p.coords)}</option>)}
        </select>
        <div className="res">
          <span className="metal" title="Metal">M {fmt(live.metal)}<small>/{fmt(planet.capacity.metal)}</small></span>
          <span className="crystal" title="Crystal">C {fmt(live.crystal)}<small>/{fmt(planet.capacity.crystal)}</small></span>
          <span className="deut" title="Deuterium">D {fmt(live.deuterium)}<small>/{fmt(planet.capacity.deuterium)}</small></span>
          <span className={energy < 0 ? 'bad' : 'energy'} title="Energy balance">⚡ {fmt(energy)}</span>
        </div>
        <div className="who">
          <span className="energy" title="Command Credits" onClick={() => setPage('command')} style={{ cursor: 'pointer' }}>★ {fmt(me.credits)}</span>
          {me.alliance && <span className="tag">[{me.alliance.tag}]</span>} {me.player.username}
          <button className="link" onClick={g.logout}>Log out</button>
        </div>
      </header>
      {offline && <div className="alertbar" style={{ background: '#4a3a1c', cursor: 'default' }}>Connection to the server lost - retrying…</div>}
      {me.pendingTributes > 0 && <div className="alertbar" onClick={() => setPage('command')}>⚠ A hostile empire is demanding tribute - open Command to answer before the deadline</div>}
      {fleets.incoming.length > 0 && (
        <div className="alertbar" onClick={() => setPage('fleet')}>
          ⚠ {fleets.incoming.length} hostile fleet{fleets.incoming.length > 1 ? 's' : ''} inbound{fleets.incoming.some((f) => f.ally) ? ' (including on allies)' : ''} – click for details
        </div>
      )}
      <div className="body">
        <nav>
          {NAV.map(([id, label]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
              {label}{id === 'messages' && me.unread > 0 && <b className="badge">{me.unread}</b>}
            </button>
          ))}
        </nav>
        <main>{page_}</main>
      </div>
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}
