import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.js';
import { getConfigDir, getProfileDir } from './platform.js';

const CONFIG_FILENAME = 'config.json';

function defaultConfig(): Config {
  return {
    cdpPort: 9222,
    profileDir: getProfileDir(),
    timezone: 'Europe/Berlin',
    vncPassword: 'temp1234',
    vncPort: 5900,
    xvfbDisplay: ':98',
  };
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILENAME);
}

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? getConfigPath();
  const defaults = defaultConfig();

  if (!existsSync(path)) return defaults;

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath ?? getConfigPath();
  const dir = getConfigDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
