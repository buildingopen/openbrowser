import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    vncPassword: '',
    vncPort: 5900,
    xvfbDisplay: ':98',
  };
}

export { randomPassword };

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILENAME);
}

function checkConfigPermissions(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    if (mode & 0o077) {
      process.stderr.write(
        `Warning: ${filePath} is accessible by other users (mode ${mode.toString(8)}). Run: chmod 600 ${filePath}\n`,
      );
    }
  } catch { /* file doesn't exist yet */ }
}

export function loadConfig(configPath?: string, overrides?: Partial<Config>): Config {
  const path = configPath ?? getConfigPath();
  const defaults = defaultConfig();

  // Only check permissions on the real config path (skip explicit test paths)
  if (!configPath) checkConfigPermissions(path);

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
  try { chmodSync(path, 0o600); } catch { /* may fail on Windows */ }
}
