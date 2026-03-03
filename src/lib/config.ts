import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import type { Config } from './types.js';
import { getConfigDir, getProfileDir } from './platform.js';

const CONFIG_FILENAME = 'config.json';

function randomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let result = '';
  for (const b of bytes) {
    result += chars[b % chars.length];
  }
  return result;
}

function defaultConfig(): Config {
  return {
    cdpPort: 9222,
    profileDir: getProfileDir(),
    timezone: 'Europe/Berlin',
    vncPassword: randomPassword(),
    vncPort: 5900,
    xvfbDisplay: ':98',
  };
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILENAME);
}

export function loadConfig(configPath?: string, overrides?: Partial<Config>): Config {
  const path = configPath ?? getConfigPath();
  const defaults = defaultConfig();

  let config: Config;
  if (!existsSync(path)) {
    config = defaults;
  } else {
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<Config>;
      config = { ...defaults, ...parsed };
    } catch {
      config = defaults;
    }
  }

  if (overrides) {
    return { ...config, ...overrides };
  }
  return config;
}

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath ?? getConfigPath();
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
