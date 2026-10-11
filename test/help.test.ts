import { describe, expect, it } from 'vitest';
import { BUILDINGS, DRIVE_SWITCH, TECHS, UNITS } from '../shared/data';
import { HELP } from '../shared/help';
import { unitDetails } from '../shared/effects';
import type { DetailCtx } from '../shared/effects';

describe('the explanations on the details page', () => {
  const ids = [...Object.keys(BUILDINGS), ...Object.keys(TECHS), ...Object.keys(UNITS)];

  it('cover every building, research, ship and defense, and nothing else', () => {
    for (const id of ids) expect(HELP[id], id).toBeTruthy();
    for (const id of Object.keys(HELP)) expect(ids, id).toContain(id);
  });

  it('are plain sentences, not placeholders, and use the current resource name', () => {
    for (const [id, h] of Object.entries(HELP)) {
      expect(h.does.length, id).toBeGreaterThan(30);
      expect(h.does.endsWith('.'), id).toBe(true);
      for (const t of h.tips ?? []) expect(t.endsWith('.'), `${id}: ${t}`).toBe(true);
      expect(JSON.stringify(h), id).not.toMatch(/deuterium/i);
    }
  });

  it('say the drive switches the same way the game does', () => {
    expect(DRIVE_SWITCH.bomber).toMatchObject({ tech: 'hyperspaceDrive', level: 8, speed: 5000 });
    expect(HELP.bomber.tips!.join(' ')).toMatch(/Hyperspace Drive 8/);
    expect(HELP.bomber.tips!.join(' ')).toMatch(/5,000/);
    expect(DRIVE_SWITCH.smallCargo).toMatchObject({ tech: 'impulseDrive', level: 5 });
    expect(HELP.impulseDrive.tips!.join(' ')).toMatch(/level 5/);
  });
});

describe('unit details for ships that change engine', () => {
  const ctx = (techs: Record<string, number>) => ({ techs, buildings: {}, speeds: { shipyard: 1 }, timeFactor: 1, classSpeed: 0 } as unknown as DetailCtx);

  it('list the speed at every level of the engine they switch to', () => {
    const d = unitDetails('bomber', ctx({ impulseDrive: 6, hyperspaceDrive: 3 }));
    expect(d.driveSwitch).toMatchObject({ tech: 'hyperspaceDrive', level: 8, speed: 5000 });
    const at = (l: number) => d.driveSwitch!.rows.find((r) => r.level === l)!.speed;
    expect(at(7)).toBeCloseTo(4000 * (1 + 0.2 * 6));                            // still on impulse (the player's impulse level 6)
    expect(at(8)).toBeCloseTo(5000 * (1 + 0.3 * 8));                            // switched
    expect(at(10)).toBeGreaterThan(at(8));
    expect(unitDetails('cruiser', ctx({})).driveSwitch).toBeNull();
    expect(unitDetails('smallCargo', ctx({ impulseDrive: 5 })).driveSwitch).toMatchObject({ tech: 'impulseDrive', level: 5 });
  });
});
