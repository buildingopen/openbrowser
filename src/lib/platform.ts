import { execSync, execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Platform = 'darwin' | 'linux';

export function assertSupportedPlatform(): void {
  if (process.platform === 'win32') {
    console.error('OpenBrowser supports macOS and Linux only.');
    console.error(
      'Track Windows support: https://github.com/federicodeponte/openbrowser/issues/1',
    );
    process.exit(1);
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.error(`Unsupported platform: ${process.platform}`);
    process.exit(1);
  }
}

export function detectOS(): Platform {
  return process.platform as Platform;
}

const CHROME_PATHS_DARWIN = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const CHROME_PATHS_LINUX = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
];

export function findChromeBinary(): string | null {
  const os = detectOS();

  if (os === 'darwin') {
    for (const path of CHROME_PATHS_DARWIN) {
      if (existsSync(path)) return path;
    }
    return null;
  }

  for (const name of CHROME_PATHS_LINUX) {
    try {
      const path = execFileSync('which', [name], { encoding: 'utf-8' }).trim();
      if (path) return path;
    } catch {
      // not found, try next
    }
  }
  return null;
}

export function getConfigDir(): string {
  return join(homedir(), '.openbrowser');
}

export function getProfileDir(): string {
  return join(getConfigDir(), 'chrome-profile');
}

export function isHeadless(): boolean {
  if (detectOS() === 'darwin') return false;
  // Linux: check if a display is available
  return !process.env['DISPLAY'] || process.env['DISPLAY'] === ':98';
}

export function cleanStaleLocks(profileDir: string): void {
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const file of lockFiles) {
    const path = join(profileDir, file);
    try {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    } catch {
      // ignore errors (e.g., file already gone)
    }
  }
}
