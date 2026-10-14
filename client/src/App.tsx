import { useEffect, useRef, useState } from 'react';
import { EnergyIcon, ResIcon } from './ResIcon';
import { drawStarfield } from './art';
import { useGame } from './game';
import { CoordLink, coordStr, Countdown, fmt, fmtDur, Linkify, PlayerLink } from './ui';
import { t, useLang } from './i18n';
import { PlayerSearch } from './PlayerSearch';
import { CommandPalette } from './CommandPalette';
import { CHORDS, cycleId, isTypingTarget } from './palette';
import { planetForKey, worldGroups } from './planetBar';
import { fullState, timeToFull } from './afford';
import { resName } from '../../shared/data';
import { Breadcrumb, Sidebar, SubTabs } from './NavParts';
import { PlanetStrip } from './PlanetStrip';
import { NavStick } from './NavStick';
import { rememberPage } from './nav';
import { Tour } from './Tour';
import { MobileBar } from './MobileBar';
import { Tutorial } from './Tutorial';
import { loadTutorial } from './tutorialSteps';
import { NotificationBell } from './NotificationBell';
import { IdleChip } from './AdviceCard';
import { markChangelogSeen, unseenRelease } from './changelog';
import { AlertStrip } from './AlertStrip';
import { ResourceBar } from './ResourceBar';
import { EncounterDialog } from './EncounterDialog';
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
import { Market } from './pages/Market';
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const g = useGame();
  const stars = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => stars.current && drawStarfield(stars.current);
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);
  const { me, planet, planets, page, setPage, live, toasts, fleets, offline } = g;
  useEffect(() => rememberPage(page), [page]);                    // a hub opens the page you were last on in it
  // keyboard: Ctrl+K palette, / search, [ ] planets, g + letter pages, ? help
  const latest = useRef({ g, setPaletteOpen });
  latest.current = { g, setPaletteOpen };
  useEffect(() => {
    let chord = 0;
    const onKey = (e: KeyboardEvent) => {
      const { g: game, setPaletteOpen: openPalette } = latest.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette((o) => !o); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || !game.me) return;
      if (chord && Date.now() < chord) {
        chord = 0;
        const hit = CHORDS[e.key.toLowerCase()];
        if (hit) { e.preventDefault(); game.setPage(hit.page); }
        return;
      }
      if (e.key === 'g') { chord = Date.now() + 1200; return; }
      if (e.key === '/') { e.preventDefault(); document.querySelector<HTMLInputElement>('.psearch input')?.focus(); }
      else if (e.key === '?') { e.preventDefault(); openPalette(true); }
      else if (planetForKey(worldGroups(game.planets), e.key)) game.selectPlanet(planetForKey(worldGroups(game.planets), e.key)!.id);
      else if ((e.key === '[' || e.key === ']') && game.planet) game.selectPlanet(cycleId(game.planets.map((p) => p.id), game.planet.id, e.key === ']' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // unread messages and hostile fleets show in the browser tab title
  const unread = me?.unread ?? 0, hostile = fleets.incoming.length;
  useEffect(() => { document.title = `${hostile ? '⚠ ' : ''}${unread ? `(${unread}) ` : ''}Zgame`; }, [unread, hostile]);
  const myId = me?.player.id;
  useEffect(() => { if (myId) loadTutorial(myId); }, [myId]);
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
      case 'galaxy': return <Galaxy key={g.galaxyAt ? `${g.galaxyAt.g}:${g.galaxyAt.s}` : 'home'} />;
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
      case 'market': return <Market />;
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
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to the page</a>
      <canvas id="stars" ref={stars} aria-hidden="true" />
      <Tour />
      <Tutorial />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <header className="top">
        <div className="brand">Zgame</div>
        <PlayerSearch />
        <IdleChip />
        <NotificationBell />
        <div className="who">
          <span className="energy" title="Command Credits" onClick={() => setPage('command')} style={{ cursor: 'pointer' }}>★ {fmt(me.credits)}</span>
          {me.alliance && <span className="tag">[{me.alliance.tag}]</span>} <PlayerLink id={me.player.id} name={me.player.username} />
          <button className="link" onClick={g.logout}>{t('common.logout', 'Log out')}</button>
        </div>
      </header>
      <EncounterDialog />
      <AlertStrip whatsNew={whatsNew} onNewsSeen={() => { markChangelogSeen(); setWhatsNew(false); }} />
      <div className="body">
        <Sidebar />
        <main id="main" tabIndex={-1}>
          <NavStick>
            <ResourceBar />
            <PlanetStrip />
            <SubTabs />
          </NavStick>
          <Breadcrumb />
          {page_}
        </main>
      </div>
      <MobileBar />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}><Linkify text={t.text} />{t.action && <button className="link toastact" onClick={t.action.run}>{t.action.label}</button>}</div>)}
      </div>
    </div>
  );
}
