import { EventEmitter } from 'node:events';

/** Server-push events. `to` is a player id, or '*' for everyone. */
export interface PushEvent {
  to: string | '*';
  type: 'refresh' | 'message' | 'alert' | 'chat' | 'toast';
  data?: unknown;
}

class Bus extends EventEmitter {
  push(e: PushEvent) { this.emit('push', e); }
}
export const bus = new Bus();
bus.setMaxListeners(100);
