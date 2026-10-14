import { useGame } from '../game';
import { Card, Page } from '../ui';
import { ADMIN, COMMUNITY } from '../guide/community';
import { PLAY } from '../guide/play';
import { START } from '../guide/start';
import { WORLD } from '../guide/world';
import type { Topic } from '../guide/types';

/** The player manual. The topics live in client/src/guide/, in the order they are shown. */
const TOPICS: Topic[] = [...START, ...PLAY, ...WORLD, ...COMMUNITY];

export function Guide() {
  const { me } = useGame();
  const topics = me.player.admin ? [...TOPICS, ADMIN] : TOPICS;
  const go = (id: string) => document.getElementById('guide-' + id)?.scrollIntoView({ block: 'start' });
  return (
    <Page title="Guide">
      <Card title="Contents">
        <div className="chips">{topics.map((t) => <button key={t.id} onClick={() => go(t.id)}>{t.title}</button>)}</div>
      </Card>
      {topics.map((t) => (
        <div key={t.id} id={'guide-' + t.id}>
          <Card title={t.title}>{t.body}</Card>
        </div>
      ))}
    </Page>
  );
}
