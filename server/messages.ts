import { bus } from './bus';
import { categoryOf, externalNotify } from './external';
import { uid, type MessageKind, type World } from './world';

const MAX_PER_PLAYER = 150;

export function notifyPlayer(
  w: World, to: string, kind: MessageKind, subject: string, body: string, data?: unknown, from: string | null = null,
) {
  if (!w.players[to] || w.players[to].npc) return;
  const now = Date.now();
  const cat = categoryOf(kind, subject);
  // a player who switched completion messages off hears nothing in the game when something finishes (alerts outside the game still go out)
  const quiet = cat === 'completions' && /^(Construction|Research|Production) complete/i.test(subject) && !!w.players[to].prefs?.quietCompletions;
  if (!quiet) {
    w.messages.push({ id: uid(), to, from, kind, subject, body, data, at: now, read: false });
    // trim: keep newest MAX_PER_PLAYER per recipient
    let count = 0;
    for (let i = w.messages.length - 1; i >= 0; i--) {
      if (w.messages[i].to === to && ++count > MAX_PER_PLAYER) w.messages.splice(i, 1);
    }
    bus.push({ to, type: 'message', data: { kind, subject } });
  }
  if (cat) externalNotify(w, to, cat, subject, body.slice(0, 600), now);
}
