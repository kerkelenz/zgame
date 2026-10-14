import { describe, expect, it } from 'vitest';
import { OBJECTIVES } from '../server/progress';
import { runBot } from './helpers/newPlayerBot';

describe('the guided first hours can be finished', () => {
  it('a bot that follows the objectives with the real rules completes all twelve in under a day at the default speed', () => {
    const r = runBot(20, 3);
    expect(r.stuck, r.stuck).toBe('');
    for (const o of OBJECTIVES) expect(r.done[o.id], `${o.id} ${o.name}`).toBeGreaterThan(0);
    expect(r.done.o6).toBeLessThan(3);                                    // the yards open within the first hours
    expect(r.done.o12).toBeLessThan(24);
    expect(r.points).toBeGreaterThanOrEqual(5000);
  }, 120_000);
  it('and the hints name what a newcomer needs for the harder steps', () => {
    const hint = (id: string) => OBJECTIVES.find((o) => o.id === id)!.hint;
    expect(hint('o1')).toMatch(/Buildings page/);
    expect(hint('o7')).toMatch(/Shipyard 3.*Combustion Drive 3.*Espionage Technology 2/);
    expect(hint('o8')).toMatch(/Combustion Drive 2/);
    expect(hint('o10')).toMatch(/Impulse Drive 3/);
    expect(hint('o9')).toMatch(/20/);
  });
});

describe('the last objective scales with the server speed', () => {
  it('asks for 5,000 points at a normal speed and less where the economy is slow', async () => {
    const { o12Target } = await import('../server/progress');
    const at = (economySpeed: number) => o12Target({ config: { economySpeed } } as never);
    expect(at(20)).toBe(5000);
    expect(at(5)).toBe(5000);
    expect(at(1)).toBe(1000);
    expect(at(0.1)).toBe(1000);
  });
});
