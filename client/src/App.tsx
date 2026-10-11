import { useEffect, useRef, useState } from 'react';
import { ResIcon } from './ResIcon';
import { drawStarfield } from './art';
import { useGame } from './game';
import { Countdown, fmt, coordStr } from './ui';
import { t, useLang } from './i18n';
import { isOpen, loadCollapsed, saveCollapsed, setAllGroups, useShowAllPages, visibleNav } from './nav';
import { Tour } from './Tour';
import { CHANGELOG, markChangelogSeen, unseenRelease } from './changelog';
import { Alliance } from './pages/Alliance';
import { Chat } from './pages/Chat';
import { Command } from './pages/Command';
import { Economy } from './pages/Economy';
import { ItemDetail } from './pages/ItemDetail';
import { Simulator } from './pages/Simulator';
import { Settings } from './pages/Settings';
import { Empire } from './pages/Empire';
import { Guide } from './pages/Guide';
import { FleetPage } from './pages/Fleet';
import { Galaxy } from './pages/Galaxy';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { Contacts } from './pages/Contacts';
import { WhatsNew } from './pages/WhatsNew';
import { Invasion } from './pages/Invasion';
import { Territory } from './pages/Territory';
import { Contracts } from './pages/Contracts';
import { Automation } from './pages/Automation';
import { Highscore } from './pages/Highscore';
import { Messages } from './pages/Messages';
import { Overview } from './pages/Overview';
import { Items } from './pages/Items';
import { TechTree } from './pages/TechTree';
import { Resources } from './pages/Resources';


export function App() {
  useLang();
  const [whatsNew, setWhatsNew] = useState(unseenRelease());
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const showAll = useShowAllPages();
  const g = useGame();
  const stars = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => stars.current && drawStarfield(stars.current);
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);
  const { me, planet, planets, page, setPage, live, toasts, fleets, offline } = g;
  // unread messages and hostile fleets show in the browser tab title
  const unread = me?.unread ?? 0, hostile = fleets.incoming.length;
  useEffect(() => { document.title = `${hostile ? '⚠ ' : ''}${unread ? `(${unread}) ` : ''}Zgame`; }, [unread, hostile]);
  if (!me || !planet) return <div className="loading">Loading universe…</div>;

  const page_ = (() => {
    switch (page) {
      case 'empire': return <Empire />;
      case 'economy': return <Economy />;
      case 'detail': return <ItemDetail />;
      case 'resources': return <Resources />;
      case 'buildings': return <Items kind="building" />;
      case 'research': return <Items kind="tech" />;
      case 'techtree': return <TechTree />;
      case 'shipyard': return <Items kind="ship" />;
      case 'defense': return <Items kind="defense" />;
      case 'fleet': return <FleetPage />;
      case 'galaxy': return <Galaxy />;
      case 'alliance': return <Alliance />;
      case 'messages': return <Messages />;
      case 'chat': return <Chat />;
      case 'highscore': return <Highscore />;
      case 'profile': return <Profile />;
      case 'admin': return <Admin />;
      case 'contacts': return <Contacts />;
      case 'news': return <WhatsNew />;
      case 'invasion': return <Invasion />;
      case 'territory': return <Territory />;
      case 'contracts': return <Contracts />;
      case 'automation': return <Automation />;
      case 'guide': return <Guide />;
      case 'settings': return <Settings />;
      case 'command': return <Command />;
      case 'simulator': return <Simulator />;
      default: return <Overview />;
    }
  })();

  const energy = planet.production.energyProduced - planet.production.energyUsed;
  return (
    <div className="shell">
      <canvas id="stars" ref={stars} aria-hidden="true" />
      <Tour />
      <header className="top">
        <div className="brand">Zgame</div>
        <select value={planet.id} onChange={(e) => g.selectPlanet(e.target.value)}>
          {planets.map((p) => <option key={p.id} value={p.id}>{p.isMoon ? '🌙 ' : ''}{p.name} {coordStr(p.coords)}</option>)}
        </select>
        <div className="res">
          <span className="metal" title="Metal"><ResIcon k="metal" /> {fmt(live.metal)}<small>/{fmt(planet.capacity.metal)}</small></span>
          <span className="crystal" title="Crystal"><ResIcon k="crystal" /> {fmt(live.crystal)}<small>/{fmt(planet.capacity.crystal)}</small></span>
          <span className="deut" title="Vespene Gas"><ResIcon k="deuterium" /> {fmt(live.deuterium)}<small>/{fmt(planet.capacity.deuterium)}</small></span>
          <span className={energy < 0 ? 'bad' : 'energy'} title="Energy balance">⚡ {fmt(energy)}</span>
        </div>
        <div className="who">
          <span className="energy" title="Command Credits" onClick={() => setPage('command')} style={{ cursor: 'pointer' }}>★ {fmt(me.credits)}</span>
          {me.alliance && <span className="tag">[{me.alliance.tag}]</span>} {me.player.username}
          <button className="link" onClick={g.logout}>{t('common.logout', 'Log out')}</button>
        </div>
      </header>
      {me.season?.ended && <div className="alertbar newsbar" onClick={() => setPage('highscore')}>🏆 Season {me.season.number} is over - champion {me.season.ended.winnerName ?? 'nobody'}.{me.season.ended.resetAt ? <> The universe resets in <Countdown to={me.season.ended.resetAt} />.</> : ' Waiting for an admin to reset.'}</div>}
      {!me.season?.ended && me.season?.endsAt && me.season.endsAt - Date.now() < 7 * 86_400_000 && <div className="alertbar newsbar" onClick={() => setPage('highscore')}>🏁 Season {me.season.number} ends in <Countdown to={me.season.endsAt} /></div>}
      {me.invasion && <div className="alertbar invbar" onClick={() => setPage('invasion')}>{me.invasion.phase === 'announced' ? <>☄ Void invasion: the rift at {coordStr(me.invasion.rift)} opens in <Countdown to={me.invasion.startsAt} /> - click to prepare</> : <>☄ The Void Armada is at {coordStr(me.invasion.rift)} - the front needs every fleet it can get. Retreats in <Countdown to={me.invasion.endsAt} /></>}</div>}
      {whatsNew && <div className="alertbar newsbar" onClick={() => { markChangelogSeen(); setWhatsNew(false); setPage('news'); }}>✨ New: {CHANGELOG[0].title} - click to see what changed</div>}
      {offline && <div className="alertbar" style={{ background: '#4a3a1c', cursor: 'default' }}>Connection to the server lost - retrying…</div>}
      {me.vacation && <div className="alertbar vacbar" onClick={() => setPage('settings')}>🏖 Vacation mode: your empire is frozen and protected. You can leave after {new Date(me.vacation.minUntil).toLocaleString()} - open Settings.</div>}
      {me.pendingTributes > 0 && <div className="alertbar" onClick={() => setPage('command')}>⚠ A hostile empire is demanding tribute - open Command to answer before the deadline</div>}
      {fleets.incoming.length > 0 && (
        <div className="alertbar" onClick={() => setPage('fleet')}>
          ⚠ {fleets.incoming.length} hostile fleet{fleets.incoming.length > 1 ? 's' : ''} inbound{fleets.incoming.some((f) => f.ally) ? ' (including on allies)' : ''} – click for details{fleets.incoming.length === 1 ? ` (from ${fleets.incoming[0].ownerName} at ${coordStr(fleets.incoming[0].from)})` : ''}
        </div>
      )}
      <div className="body">
        <nav>
          <div className="navtools">
            <button onClick={() => { const next = setAllGroups(true); setCollapsed(next); saveCollapsed(next); }} title={t('nav.expandAll', 'Open every group')}>{t('nav.expandAll', 'Expand all')}</button>
            <button onClick={() => { const next = setAllGroups(false); setCollapsed(next); saveCollapsed(next); }} title={t('nav.collapseAll', 'Close every group (the one you are in stays open)')}>{t('nav.collapseAll', 'Collapse all')}</button>
          </div>
          {visibleNav(me.features, showAll, !!me.player.admin, page).map((grp) => {
            const open = isOpen(grp.id, collapsed, page);
            const badge = (id: string) => (id === 'messages' ? me.unread : id === 'contracts' ? me.contractsClaimable : id === 'invasion' && me.invasion ? '!' : 0) || 0;
            const closedBadge = grp.items.reduce((sum, it) => sum + (badge(it.id) === '!' ? 1 : Number(badge(it.id))), 0);
            return (
              <div key={grp.id} className={`navgroup${open ? '' : ' closed'}`}>
                <button className="navhead" aria-expanded={open} onClick={() => { const next = { ...collapsed, [grp.id]: open }; setCollapsed(next); saveCollapsed(next); }}>
                  <span>{open ? '▾' : '▸'} {t(`nav.group.${grp.id}`, grp.label)}</span>{!open && closedBadge > 0 && <b className="badge">{closedBadge}</b>}
                </button>
                {grp.items.map((it) => (
                  <button key={it.id} className={`navitem${page === it.id ? ' active' : ''}`} onClick={() => setPage(it.id)}>
                    {t(`nav.${it.id}`, it.label)}{badge(it.id) !== 0 && <b className="badge">{badge(it.id)}</b>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <main>{page_}</main>
      </div>
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}
