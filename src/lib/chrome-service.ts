import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.js';
import { detectOS, findChromeBinary, cleanStaleLocks } from './platform.js';

const SYSTEMD_TEMPLATE = (config: Config, chromeBinary: string) => `[Unit]
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
WantedBy=multi-user.target
`;

const LAUNCHD_TEMPLATE = (config: Config, chromeBinary: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openbrowser.chrome</string>
    <key>ProgramArguments</key>
    <array>
        <string>${chromeBinary}</string>
        <string>--user-data-dir=${config.profileDir}</string>
        <string>--headless=new</string>
        <string>--remote-debugging-port=${config.cdpPort}</string>
        <string>--remote-debugging-address=127.0.0.1</string>
        <string>--disable-background-timer-throttling</string>
        <string>--disable-renderer-backgrounding</string>
        <string>--no-first-run</string>
        <string>--disable-sync</string>
        <string>--disable-gpu</string>
        <string>--lang=en-US</string>
        <string>--window-size=1280,800</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TZ</key>
        <string>${config.timezone}</string>
    </dict>
    <key>StandardErrorPath</key>
    <string>/tmp/openbrowser-chrome.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/openbrowser-chrome.out</string>
</dict>
</plist>
`;

export class ChromeService {
  private config: Config;
  private os: 'darwin' | 'linux';

  constructor(config: Config) {
    this.config = config;
    this.os = detectOS();
  }

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(
        `http://localhost:${this.config.cdpPort}/json/version`,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    try {
      const res = await fetch(
        `http://localhost:${this.config.cdpPort}/json/version`,
      );
      const data = (await res.json()) as { Browser?: string };
      return data.Browser ?? null;
    } catch {
      return null;
    }
  }

  async getPid(): Promise<number | null> {
    try {
      const output = execSync(
        `lsof -ti :${this.config.cdpPort} 2>/dev/null || true`,
        { encoding: 'utf-8' },
      ).trim();
      if (!output) return null;
      const pid = parseInt(output.split('\n')[0], 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  install(): { path: string; instructions: string } {
    const chromeBinary = findChromeBinary();
    if (!chromeBinary) {
      throw new Error(
        'Chrome not found. Install Google Chrome or Chromium first.',
      );
    }

    if (!existsSync(this.config.profileDir)) {
      mkdirSync(this.config.profileDir, { recursive: true });
    }

    if (this.os === 'linux') {
      return this.installSystemd(chromeBinary);
    }
    return this.installLaunchd(chromeBinary);
  }

  private installSystemd(chromeBinary: string): {
    path: string;
    instructions: string;
  } {
    const servicePath = '/etc/systemd/system/openbrowser.service';
    const content = SYSTEMD_TEMPLATE(this.config, chromeBinary);
    writeFileSync(servicePath, content, 'utf-8');

    return {
      path: servicePath,
      instructions: [
        'Service installed. To start:',
        '  sudo systemctl daemon-reload',
        '  sudo systemctl enable openbrowser',
        '  sudo systemctl start openbrowser',
      ].join('\n'),
    };
  }

  private installLaunchd(chromeBinary: string): {
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
    const content = LAUNCHD_TEMPLATE(this.config, chromeBinary);
    writeFileSync(plistPath, content, 'utf-8');

    return {
      path: plistPath,
      instructions: [
        'Service installed. To start:',
        `  launchctl load ${plistPath}`,
        '',
        'To stop:',
        `  launchctl unload ${plistPath}`,
      ].join('\n'),
    };
  }

  start(): void {
    if (this.os === 'linux') {
      execSync('sudo systemctl start openbrowser', { stdio: 'inherit' });
    } else {
      const plistPath = join(
        process.env['HOME'] ?? '~',
        'Library',
        'LaunchAgents',
        'com.openbrowser.chrome.plist',
      );
      execSync(`launchctl load ${plistPath}`, { stdio: 'inherit' });
    }
  }

  stop(): void {
    if (this.os === 'linux') {
      try {
        execSync('sudo systemctl stop openbrowser', { stdio: 'inherit' });
      } catch {
        // service might not be running
      }
    } else {
      const plistPath = join(
        process.env['HOME'] ?? '~',
        'Library',
        'LaunchAgents',
        'com.openbrowser.chrome.plist',
      );
      try {
        execSync(`launchctl unload ${plistPath}`, { stdio: 'inherit' });
      } catch {
        // service might not be loaded
      }
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }

  launchForLogin(): ChildProcess {
    const chromeBinary = findChromeBinary();
    if (!chromeBinary) {
      throw new Error('Chrome not found.');
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
      return spawn(chromeBinary, args, { env, stdio: 'ignore', detached: true });
    }

    // macOS: launch directly, user sees the window
    return spawn(chromeBinary, args, { stdio: 'ignore', detached: false });
  }

  startXvfb(): void {
    const display = this.config.xvfbDisplay;
    try {
      execSync(`pgrep -f "Xvfb ${display}"`, { encoding: 'utf-8' });
      // already running
    } catch {
      spawn('Xvfb', [display, '-screen', '0', '1280x800x24'], {
        stdio: 'ignore',
        detached: true,
      }).unref();
      execSync('sleep 1');
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
    return {
      mcpServers: {
        browser: {
          command: 'npx',
          args: [
            '@playwright/mcp@latest',
            `--cdp-endpoint=http://localhost:${this.config.cdpPort}`,
          ],
        },
      },
    };
  }
}
