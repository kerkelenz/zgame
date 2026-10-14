import { describe, expect, it } from 'vitest';
import { visibleAlerts, type Alert } from '../client/src/AlertStrip';

const mk = (id: string, level: Alert['level'], dismissible = false): Alert => ({ id, level, node: id, dismissible });

describe('the notice strip', () => {
  it('drops hidden notices and keeps the order it was given', () => {
    const all = [mk('hostile', 'danger'), mk('inv', 'warn', true), mk('news', 'info', true)];
    expect(visibleAlerts(all, new Set()).map((a) => a.id)).toEqual(['hostile', 'inv', 'news']);
    expect(visibleAlerts(all, new Set(['inv'])).map((a) => a.id)).toEqual(['hostile', 'news']);
  });
});
