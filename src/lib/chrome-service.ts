import { execSync, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.js';
import { detectOS, findChromeBinary, findHeadlessShellBinary, installHeadlessShell, cleanStaleLocks, checkPort } from './platform.js';
import { getConfigDir } from './platform.js';

const SYSTEMD_TEMPLATE = (config: Config, chromeBinary: string, userMode: boolean) => `[Unit]
Description=OpenBrowser - Authenticated Chrome with CDP
After=network.target

[Service]
Type=simple
ExecStartPre=/bin/bash -c 'pgrep -f "Xvfb ${config.xvfbDisplay}" || (Xvfb ${config.xvfbDisplay} -screen 0 1280x800x24 & sleep 1)'
ExecStart=${chromeBinary} \\
    --user-data-dir=${config.profileDir} \\
    --no-sandbox \\
    --disable-gpu \\
    --remote-debugging-port=${config.cdpPort} \\
    --remote-debugging-address=127.0.0.1 \\
    --disable-background-timer-throttling \\
    --disable-renderer-backgrounding \\
    --disable-backgrounding-occluded-windows \\
    --no-first-run \\
    --disable-sync \\
    --lang=en-US \\
    --start-maximized \\
    --window-size=1280,800 \\
    --window-position=0,0
Restart=on-failure
RestartSec=5
Environment=DISPLAY=${config.xvfbDisplay}
Environment=TZ=${config.timezone}

[Install]
WantedBy=${userMode ? 'default.target' : 'multi-user.target'}
`;

const LAUNCHD_TEMPLATE = (config: Config, chromeBinary: string, isHeadlessShell: boolean) => {
  const configDir = getConfigDir();
  const args = [
    chromeBinary,
    `--user-data-dir=${config.profileDir}`,
    // chrome-headless-shell is always headless; regular Chrome needs the flag
    ...(isHeadlessShell ? [] : ['--headless=new']),
    `--remote-debugging-port=${config.cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--disable-sync',
    '--disable-gpu',
    '--lang=en-US',
    '--window-size=1280,800',
  ];
  const argsXml = args.map(a => `        <string>${a}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openbrowser.chrome</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TZ</key>
        <string>${config.timezone}</string>
    </dict>
    <key>StandardErrorPath</key>
    <string>${configDir}/chrome.err</string>
    <key>StandardOutPath</key>
    <string>${configDir}/chrome.out</string>
</dict>
</plist>
`;
};

export class ChromeService {
  private config: Config;
  private os: 'darwin' | 'linux';
  private xvfbProcess: ChildProcess | null = null;

  constructor(config: Config) {
    this.config = config;
    this.os = detectOS();
  }

  async getCdpInfo(): Promise<{ running: boolean; version?: string }> {
    try {
      const res = await fetch(
        `http://localhost:${this.config.cdpPort}/json/version`,
      );
      if (!res.ok) return { running: false };
      const data = (await res.json()) as { Browser?: string };
      return { running: true, version: data.Browser ?? undefined };
    } catch {
      return { running: false };
    }
  }

  async isRunning(): Promise<boolean> {
    const info = await this.getCdpInfo();
    return info.running;
  }

  async getPid(): Promise<number | null> {
    // Try lsof first (macOS default, Linux with lsof installed)
    try {
      const output = execSync(
        `lsof -ti :${this.config.cdpPort} 2>/dev/null`,
        { encoding: 'utf-8' },
      ).trim();
      if (output) {
        const pids = output.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
        if (pids.length > 0) return Math.min(...pids);
      }
    } catch {
      // lsof not available or no match, try ss
    }

    // Fallback: ss (Linux without lsof)
    try {
      const output = execSync(
        `ss -tlnp 2>/dev/null | grep ':${this.config.cdpPort} '`,
        { encoding: 'utf-8' },
      ).trim();
      if (output) {
        const match = output.match(/pid=(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    } catch {
      // ss not available or no match
    }

    return null;
  }

  install(): { path: string; instructions: string } {
    if (!existsSync(this.config.profileDir)) {
      mkdirSync(this.config.profileDir, { recursive: true });
    }

    if (this.os === 'linux') {
      const chromeBinary = findChromeBinary();
      if (!chromeBinary) {
        throw new Error(
          'Google Chrome is not installed. Download it from https://google.com/chrome',
        );
      }
      return this.installSystemd(chromeBinary);
    }

    // macOS: prefer chrome-headless-shell so regular Chrome stays usable
    const existingShell = findHeadlessShellBinary();
    if (existingShell) {
      return this.installLaunchd(existingShell, true);
    }

    try {
      const shell = installHeadlessShell();
      return this.installLaunchd(shell, true);
    } catch {
      // Download failed (no npm, network error), fall back to regular Chrome
    }

    const chromeBinary = findChromeBinary();
    if (!chromeBinary) {
      throw new Error(
        'Google Chrome is not installed. Download it from https://google.com/chrome',
      );
    }
    return this.installLaunchd(chromeBinary, false);
  }

  private isRoot(): boolean {
    return process.getuid?.() === 0;
  }

  private getSystemdDir(): string {
    if (this.isRoot()) {
      return '/etc/systemd/system';
    }
    const home = process.env['HOME'] ?? '~';
    const dir = join(home, '.config', 'systemd', 'user');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private installSystemd(chromeBinary: string): {
    path: string;
    instructions: string;
  } {
    const root = this.isRoot();
    const serviceDir = this.getSystemdDir();
    const servicePath = join(serviceDir, 'openbrowser.service');
    const content = SYSTEMD_TEMPLATE(this.config, chromeBinary, !root);
    writeFileSync(servicePath, content, 'utf-8');

    return {
      path: servicePath,
      instructions: 'Run: openbrowser start',
    };
  }

  private installLaunchd(chromeBinary: string, isHeadlessShell: boolean): {
    path: string;
    instructions: string;
  } {
    const plistDir = join(
      process.env['HOME'] ?? '~',
      'Library',
      'LaunchAgents',
    );
    if (!existsSync(plistDir)) {
      mkdirSync(plistDir, { recursive: true });
    }
    const plistPath = join(plistDir, 'com.openbrowser.chrome.plist');
    const content = LAUNCHD_TEMPLATE(this.config, chromeBinary, isHeadlessShell);
    writeFileSync(plistPath, content, 'utf-8');

    return {
      path: plistPath,
      instructions: 'Run: openbrowser start',
    };
  }

  private systemctl(action: string): void {
    const flag = this.isRoot() ? '' : ' --user';
    execSync(`systemctl${flag} ${action} openbrowser`, { stdio: 'inherit' });
  }

  private getUid(): number {
    return process.getuid?.() ?? 501;
  }

  private getPlistPath(): string {
    return join(
      process.env['HOME'] ?? '~',
      'Library',
      'LaunchAgents',
      'com.openbrowser.chrome.plist',
    );
  }

  async start(): Promise<void> {
    // Check port availability first
    const portFree = await checkPort(this.config.cdpPort);
    if (!portFree) {
      // If Chrome is already responding, nothing to do
      const info = await this.getCdpInfo();
      if (info.running) return;
      throw new Error(
        `Port ${this.config.cdpPort} is already used by another program. ` +
        `Close it or run: openbrowser doctor`,
      );
    }

    if (this.os === 'linux') {
      // Reload unit files in case service was re-installed
      try { this.systemctl('daemon-reload'); } catch { /* ignore */ }
      this.systemctl('start');
    } else {
      const plistPath = this.getPlistPath();
      const uid = this.getUid();

      // Bootout existing service first (handles re-installs)
      try {
        execFileSync('launchctl', ['bootout', `gui/${uid}/com.openbrowser.chrome`], { stdio: 'pipe' });
      } catch {
        // Not loaded, that's fine
      }

      // Modern API: bootstrap
      try {
        execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'pipe' });
      } catch (bootstrapErr) {
        // Fall back to legacy load; if both fail, throw the original error
        try {
          execFileSync('launchctl', ['load', plistPath], { stdio: 'pipe' });
        } catch {
          throw bootstrapErr;
        }
      }
    }

    // Verify Chrome actually responds (poll for up to 5s)
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const info = await this.getCdpInfo();
      if (info.running) return;
    }

    throw new Error(
      `Browser started but not responding. Run: openbrowser doctor`,
    );
  }

  stop(): void {
    if (this.os === 'linux') {
      try {
        this.systemctl('stop');
      } catch {
        // service might not be running
      }
    } else {
      const uid = this.getUid();

      // Modern API: bootout
      try {
        execFileSync('launchctl', ['bootout', `gui/${uid}/com.openbrowser.chrome`], { stdio: 'pipe' });
        return;
      } catch {
        // Fall back to legacy unload
      }

      const plistPath = this.getPlistPath();
      try {
        execFileSync('launchctl', ['unload', plistPath], { stdio: 'pipe' });
      } catch {
        // service might not be loaded
      }
    }
  }

  async restart(): Promise<void> {
    this.stop();
    // Wait for port to actually be released (up to 6s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkPort(this.config.cdpPort)) break;
    }
    if (!(await checkPort(this.config.cdpPort))) {
      throw new Error(
        `Browser is still shutting down. Wait a moment and try again, or run: openbrowser stop`,
      );
    }
    await this.start();
  }

  launchForLogin(): ChildProcess {
    const chromeBinary = findChromeBinary();
    if (!chromeBinary) {
      const os = detectOS();
      const installHint = os === 'darwin'
        ? 'Install from https://google.com/chrome or: brew install --cask google-chrome'
        : 'Install with: sudo apt install google-chrome-stable (or: sudo dnf install google-chrome-stable)';
      throw new Error(`Google Chrome is not installed. ${installHint}`);
    }

    cleanStaleLocks(this.config.profileDir);

    if (!existsSync(this.config.profileDir)) {
      mkdirSync(this.config.profileDir, { recursive: true });
    }

    const args = [
      `--user-data-dir=${this.config.profileDir}`,
      '--no-first-run',
      '--disable-sync',
      '--lang=en-US',
    ];

    if (this.os === 'linux') {
      // On Linux headless, use Xvfb display
      const env = {
        ...process.env,
        DISPLAY: this.config.xvfbDisplay,
        TZ: this.config.timezone,
      };
      return spawn(chromeBinary, args, { env, stdio: 'ignore', detached: false });
    }

    // macOS: launch directly, user sees the window
    return spawn(chromeBinary, args, { stdio: 'ignore', detached: false });
  }

  async startXvfb(): Promise<void> {
    const display = this.config.xvfbDisplay;
    const lockFile = `/tmp/.X${display.replace(':', '')}-lock`;

    // Check if lock file exists but process is dead (stale lock)
    if (existsSync(lockFile)) {
      try {
        const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
        if (pid && !isNaN(pid)) {
          try {
            process.kill(pid, 0); // Check if process is alive
            return; // Process is running, reuse it
          } catch {
            // Process is dead, remove stale lock
            unlinkSync(lockFile);
          }
        }
      } catch {
        // Can't read lock file, remove it
        try { unlinkSync(lockFile); } catch { /* ignore */ }
      }
    }

    this.xvfbProcess = spawn('Xvfb', [display, '-screen', '0', '1280x800x24', '-ac'], {
      stdio: 'ignore',
      detached: true,
    });
    this.xvfbProcess.unref();

    // Wait for Xvfb to create lock file (up to 5 seconds)
    for (let i = 0; i < 50; i++) {
      if (existsSync(lockFile)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Virtual display failed to start. Install it with: apt install xvfb');
  }

  stopXvfb(): void {
    if (this.xvfbProcess) {
      try { this.xvfbProcess.kill(); } catch { /* already dead */ }
      this.xvfbProcess = null;
      // Only clean up lock file if we owned the process
      const display = this.config.xvfbDisplay;
      const lockFile = `/tmp/.X${display.replace(':', '')}-lock`;
      try { unlinkSync(lockFile); } catch { /* ignore */ }
    }
  }

  startVnc(): ChildProcess {
    return spawn(
      'x11vnc',
      [
        '-display',
        this.config.xvfbDisplay,
        '-passwd',
        this.config.vncPassword,
        '-rfbport',
        String(this.config.vncPort),
        '-once',
      ],
      { stdio: 'pipe' },
    );
  }

  getMcpConfig(): object {
    const args: string[] = ['-y', 'openbrowser-ai', 'mcp'];
    const defaultProfile = join(
      process.env['HOME'] ?? '~',
      '.openbrowser',
      'chrome-profile',
    );
    if (this.config.profileDir !== defaultProfile) {
      args.push('--profile', this.config.profileDir);
    }
    return {
      mcpServers: {
        openbrowser: {
          command: 'npx',
          args,
        },
      },
    };
  }
}
