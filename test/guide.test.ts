import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, TECHS } from '../shared/data';

const src = readFileSync('client/src/pages/Guide.tsx', 'utf8');
/** the visible words of the guide: the text between JSX tags, plus the section titles */
const text = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).concat([...src.matchAll(/title: '([^']+)'/g)].map((m) => m[1])).join(' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

describe('the in-game guide', () => {
  it('is a how-to for players, not a release log', () => {
    expect(src).not.toMatch(/changelog|CHANGELOG|What's new/);
    for (const phrase of ['no longer', 'recently', 'has been added', 'new feature', 'previously', 'used to ', 'was changed', 'we added', 'now supports']) {
      expect(text.toLowerCase(), phrase).not.toContain(phrase);
    }
    expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/); // no dates
  });

  it('covers every screen in the navigation', () => {
    for (const page of ['Overview', 'Empire', 'Economy', 'Resources', 'Buildings', 'Research', 'Tech tree', 'Shipyard', 'Defense', 'Automation', 'Invasion', 'Territory', 'Contracts', 'Fleet', 'Galaxy', 'Alliance', 'Contacts', 'Command', 'Simulator', 'Messages', 'Chat', 'Standing', 'Settings']) {
      expect(text, page).toContain(page);
    }
  });

  it('describes how to get around: history, jump box, shortcuts, bell, undo, filter and the phone bar', () => {
    for (const phrase of ['Back</b> and <b>Forward', 'Ctrl+K', 'Only what I can start now', 'Undo', 'Repeat last', 'Recall', 'bell', 'FULL', 'Planner', 'Defense advisor', 'Roles', 'What to do next', 'Operations', 'Asking for help', 'Share links', 'Choosing an alliance', 'Server health', 'Skip to the page', 'reduced motion', 'hands-on tutorial', 'Battle replay']) expect(src, phrase).toContain(phrase);
  });

  it('explains the systems players have to know about', () => {
    for (const topic of ['Vespene Gas', 'Solar Plant', 'Astrophysics', 'Space Dock', 'Crawlers', 'Pathfinders', 'Lunar Base', 'Sensor Phalanx', 'Jump Gate', 'Deathstars', 'wreck field', 'vacation', 'tribute', 'Factions', 'Collector', 'General', 'Discoverer', 'Officers', 'bulletin', 'pact', 'war', 'recovery key', 'hall of fame', 'merchant', 'Gather', 'Supply depot', 'presets', 'Nanite Factory', 'Terraformer', 'Missile Silo', 'Events', 'Moon Forge']) {
      expect(text.toLowerCase(), topic).toContain(topic.toLowerCase());
    }
  });

  it('has no leftover mention of the old resource name', () => {
    expect(text).not.toMatch(/deuterium/i);
    void BUILDINGS; void TECHS;
  });

  it('gives each topic its own section with a contents entry', () => {
    const ids = [...src.matchAll(/id: '([a-z]+)', title:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
