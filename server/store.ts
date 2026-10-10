import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import { createWorld, type World } from './world';

export function loadWorld(file: string, overrides: Partial<UniverseConfig> = {}): World {
  if (existsSync(file)) {
    try {
      const w = JSON.parse(readFileSync(file, 'utf8')) as World;
      // new config keys added since the save get defaults; explicit overrides win
      w.config = { ...DEFAULT_CONFIG, ...w.config, ...overrides };
      return w;
    } catch (e) {
      console.error('Failed to read save file, starting a new universe:', e);
    }
  }
  return createWorld(overrides);
}

export function saveWorld(file: string, w: World) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(w));
  renameSync(tmp, file);
}
