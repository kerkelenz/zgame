import { useState } from 'react';
import { useGame } from './game';
import { t, useLang } from './i18n';

export const TOUR_KEY = 'zg.tourDone';
const seen = () => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; } };
const finish = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } };

export const STEPS: { page: string; title: string; text: string }[] = [
  { page: 'overview', title: 'Welcome, Commander', text: 'This is your homeworld. Resources flow in even while you are away, and the bar above always shows your stock, storage and energy balance. The Events list at the top shows every fleet movement that concerns you, with countdowns, and the Objective card teaches the game step by step.' },
  { page: 'buildings', title: 'Buildings', text: 'Mines make metal, crystal and vespene gas; solar plants keep them running. Queue upgrades here - they are paid for when queued and you can reorder or remove them.' },
  { page: 'research', title: 'Research', text: 'Technologies unlock ships, speed up fleets and strengthen your economy. One project runs at a time, with a queue behind it.' },
  { page: 'techtree', title: 'Tech tree', text: 'Every building, research, ship and defense on one map, with arrows showing what needs what. Cards that glow are ready to start; pick "Show only the path to" an item to see exactly what leads to it. Drag to pan, scroll or pinch to zoom.' },
  { page: 'shipyard', title: 'Shipyard & defense', text: 'Build cargo ships, fighters, probes and colony ships - and defenses that protect you while you are offline.' },
  { page: 'galaxy', title: 'The galaxy', text: 'Browse systems, spot inactive neighbours (i / I flags), bookmark favourites and send fleets from here. Beginners are protected until they grow.' },
  { page: 'fleet', title: 'Fleets', text: 'Send transports, spy, colonize, recycle debris or explore deep space. Always check the flight time and fuel before you launch.' },
  { page: 'alliance', title: 'Play together', text: 'Join an alliance to share a bank, buy bonuses, stand guard over each other\'s planets and plan wars or pacts. Command holds your class, officers and achievements.' },
  { page: 'settings', title: 'Make it yours', text: 'Alerts reach you outside the game (Discord, phone push), vacation mode freezes your empire, and you can pick sounds and language. Press Ctrl+K anywhere to jump to any page, item or commander, and ? for the keyboard shortcuts. Have fun!' },
];

export function Tour() {
  useLang();
  const { setPage } = useGame();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(!seen());
  if (!open) return null;
  const s = STEPS[i], last = i === STEPS.length - 1;
  const close = () => { finish(); setOpen(false); setPage('overview'); };
  const go = (n: number) => { setI(n); setPage(STEPS[n].page); };
  return (
    <div className="tour" role="dialog" aria-label="Welcome tour">
      <div className="tourbox">
        <div className="muted small">{i + 1} / {STEPS.length}</div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="row">
          <button className="link" onClick={close}>{t('tour.skip', 'Skip tour')}</button>
          <span className="spacer" />
          {i > 0 && <button onClick={() => go(i - 1)}>Back</button>}
          <button className="primary" onClick={() => (last ? close() : go(i + 1))}>{last ? t('tour.done', 'Let\'s play') : t('tour.next', 'Next')}</button>
        </div>
      </div>
    </div>
  );
}
