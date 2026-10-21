import { useState } from 'react';
import { useGame } from './game';
import { t, useLang } from './i18n';
import { hasFinishedTutorial, startTutorial } from './tutorialSteps';

export const TOUR_KEY = 'zg.tourDone';
const seen = () => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; } };
const finish = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } };

export const STEPS: { page: string; title: string; text: string }[] = [
  { page: 'overview', title: 'Welcome, Commander', text: 'This is your homeworld. Resources flow in even while you are away, and the bar above always shows your stock, storage and energy balance. The Events list shows every fleet movement that concerns you.' },
  { page: 'buildings', title: 'Buildings', text: 'Mines make metal, crystal and vespene gas; solar plants keep them running. Queue upgrades here: they are paid for when queued and keep going while you are away.' },
  { page: 'quests', title: 'Quests', text: 'Quests tell you what to do next and pay a reward. Finishing some of them opens more of the menu (Research, the Shipyard, the Galaxy and the rest), so the game grows with you instead of showing everything at once.' },
  { page: 'settings', title: 'Make it yours', text: 'Alerts reach you outside the game (Discord, phone push), vacation mode freezes your empire, and you can pick sounds and language. Press Ctrl+K anywhere to jump to any page, item or commander, and ? for the keyboard shortcuts.' },
];

export function Tour() {
  useLang();
  const { setPage, me } = useGame();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(!seen());
  if (!open) return null;
  const s = STEPS[i], last = i === STEPS.length - 1;
  const close = () => { finish(); setOpen(false); setPage('overview'); if (me && !hasFinishedTutorial(me.player.id)) startTutorial(me.player.id); };
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
