import { useGame } from '../game';
import { Card, Page, fmt, when } from '../ui';

export interface QuestRow {
  id: string; name: string; hint: string; chapter: string; optional: boolean;
  reward: { metal?: number; crystal?: number; deuterium?: number; credits?: number };
  unlocks: string[]; doneAt: number | null; open: boolean;
}

/** the page a quest sends you to */
export const QUEST_PAGE: Record<string, string> = {
  o1: 'buildings', o2: 'buildings', o3: 'buildings', o4: 'buildings', 'q-lab': 'buildings', o5: 'research', o6: 'buildings', 'q-ships': 'shipyard', o9: 'defense',
  o7: 'galaxy', o8: 'galaxy', o10: 'galaxy', o11: 'fleet', 'q-trade': 'market', 'q-upgrade': 'upgrades', 'q-class': 'command', 'q-ally': 'alliance', o12: 'overview',
};
export const PAGE_LABEL: Record<string, string> = {
  research: 'Research', techtree: 'Tech tree', shipyard: 'Shipyard', defense: 'Defense', fleet: 'Fleet', galaxy: 'Galaxy', map: 'Map', contacts: 'Contacts', contracts: 'Contracts', highscore: 'Standing',
  alliance: 'Alliance', chat: 'Chat', empire: 'Empire', economy: 'Economy', market: 'Market', command: 'Command', upgrades: 'Upgrades', lifeform: 'Lifeform',
};

export const rewardText = (r: QuestRow['reward']) => [r.metal && `${fmt(r.metal)} metal`, r.crystal && `${fmt(r.crystal)} crystal`, r.deuterium && `${fmt(r.deuterium)} vespene gas`, r.credits && `${fmt(r.credits)} Command Credits`].filter(Boolean).join(' · ');
const opens = (q: QuestRow) => (q.unlocks.length ? `Opens ${q.unlocks.map((p) => PAGE_LABEL[p] ?? p).join(', ')}` : '');

/** One quest as a card: what to do, what it pays and which pages it opens */
export function QuestCard({ q, go, canGo }: { q: QuestRow; go: (page: string) => void; canGo: (page: string) => boolean }) {
  const page = QUEST_PAGE[q.id];
  return (
    <div className="quest open">
      <div className="row between">
        <b>{q.name}{q.optional && <span className="muted small"> · side quest</span>}</b>
        <span className="reward small">{rewardText(q.reward)}</span>
      </div>
      <p className="small">{q.hint}</p>
      <div className="row between">
        <span className="muted small">{opens(q)}</span>
        {page && canGo(page) && page !== 'overview' && <button onClick={() => go(page)}>Go to {PAGE_LABEL[page] ?? page.charAt(0).toUpperCase() + page.slice(1)}</button>}
      </div>
    </div>
  );
}

/** The quest line: what is open now, then every chapter with what is done and what is still to come */
export function Quests() {
  const { me, setPage } = useGame();
  const quests: QuestRow[] = me.quests ?? [];
  const unlocked: string[] | null = me.unlocked ?? null;
  const canGo = (page: string) => !unlocked || unlocked.includes(page);
  const done = quests.filter((q) => q.doneAt).length;
  const open = quests.filter((q) => q.open);
  const chapters = [...new Set(quests.map((q) => q.chapter))];
  return (
    <Page title="Quests">
      <Card title={`${done} of ${quests.length} quests done`}>
        <div className="bar"><div style={{ width: `${quests.length ? (done / quests.length) * 100 : 0}%` }} /></div>
        <p className="muted small">Quests teach the game one step at a time. Each one pays a reward, and finishing some of them opens more pages in the menu. Several can be open at once: do them in any order.</p>
      </Card>
      {open.length > 0 && (
        <Card title="Open now">
          {open.map((q) => <QuestCard key={q.id} q={q} go={setPage} canGo={canGo} />)}
        </Card>
      )}
      {open.length === 0 && done === quests.length && <Card><p>You have done every quest. The galaxy is yours.</p></Card>}
      {chapters.map((c) => {
        const list = quests.filter((q) => q.chapter === c);
        const all = list.every((q) => q.doneAt);
        return (
          <Card key={c} title={<>{c}{all && <span className="muted small"> · complete</span>}</>}>
            <ol className="objectives">
              {list.map((q) => (
                <li key={q.id} className={q.doneAt ? 'done' : q.open ? 'current' : 'locked'}>
                  <b>{q.name}</b>{q.optional && <span className="muted small"> · side quest</span>}{' '}
                  <span className="muted small">{q.doneAt ? `done ${when(q.doneAt)}` : q.open ? 'open' : 'opens later'}</span>
                  {!q.doneAt && <span className="reward small">{rewardText(q.reward)}</span>}
                </li>
              ))}
            </ol>
          </Card>
        );
      })}
    </Page>
  );
}
