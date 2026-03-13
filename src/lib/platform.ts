import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Platform = 'darwin' | 'linux';

export function assertSupportedPlatform(): void {
  if (process.platform === 'win32') {
    console.error('OpenBrowser supports macOS and Linux only.');
    console.error(
      'Track Windows support: https://github.com/buildingopen/openbrowser/issues/1',
    );
    process.exit(1);
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.error(`Unsupported platform: ${process.platform}`);
    process.exit(1);
  }
}

export function detectOS(): Platform {
  const p = process.platform;
  if (p !== 'darwin' && p !== 'linux') {
    throw new Error(`Unsupported platform: ${p}. OpenBrowser supports macOS and Linux only.`);
  }
  return p;
}

export function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export function hasCommand(name: string): boolean {
  try {
    execFileSync('which', [name], { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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

function findFileRecursive(dir: string, name: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === name && entry.isFile()) return join(dir, entry.name);
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findFileRecursive(join(dir, entry.name), name, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch { /* permission error */ }
  return null;
}

export function getHeadlessShellDir(): string {
  return join(homedir(), '.openbrowser', 'headless-shell');
}

/**
 * Find a locally installed chrome-headless-shell binary.
 * Returns the binary path or null if not installed.
 */
export function findHeadlessShellBinary(): string | null {
  const dir = getHeadlessShellDir();
  if (!existsSync(dir)) return null;
  return findFileRecursive(dir, 'chrome-headless-shell', 5);
}

/**
 * Download chrome-headless-shell using @puppeteer/browsers.
 * Stores it in ~/.openbrowser/headless-shell/.
 * Returns the binary path.
 */
export function installHeadlessShell(): string {
  const dir = getHeadlessShellDir();
  mkdirSync(dir, { recursive: true });

  execFileSync('npx', [
    '-y', '@puppeteer/browsers', 'install',
    'chrome-headless-shell@stable',
    '--path', dir,
  ], { encoding: 'utf-8', timeout: 120_000, stdio: 'pipe' });

  const binary = findHeadlessShellBinary();
  if (!binary) throw new Error('chrome-headless-shell installation failed');

  try { execFileSync('chmod', ['+x', binary], { stdio: 'pipe' }); } catch { /* ignore */ }
  return binary;
}
