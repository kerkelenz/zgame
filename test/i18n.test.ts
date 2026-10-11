import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../client/src/changelog';
import { LANGS, englishKeys, t, translatedKeys } from '../client/src/i18n';

describe('translations', () => {
  it('every language covers the same keys', () => {
    const base = englishKeys().sort();
    expect(base.length).toBeGreaterThan(30);
    for (const l of Object.keys(LANGS).filter((x) => x !== 'en')) expect(translatedKeys(l).sort(), l).toEqual(base);
  });
  it('falls back to the English text for unknown keys and the default language', () => {
    expect(t('nav.overview', 'Overview')).toBe('Overview'); // test env defaults to English
    expect(t('does.not.exist', 'Fallback')).toBe('Fallback');
  });
  it('every nav item has a translation key', () => {
    for (const id of ['overview', 'empire', 'economy', 'resources', 'buildings', 'research', 'shipyard', 'defense', 'fleet', 'galaxy', 'alliance', 'contacts', 'command', 'simulator', 'messages', 'chat', 'highscore', 'settings', 'guide', 'admin']) {
      expect(englishKeys(), id).toContain('nav.' + id);
    }
  });
});

describe('changelog', () => {
  it('has unique ids, newest first, and some content', () => {
    expect(new Set(CHANGELOG.map((r) => r.id)).size).toBe(CHANGELOG.length);
    const dates = CHANGELOG.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const r of CHANGELOG) expect(r.items.length).toBeGreaterThan(0);
  });
});
