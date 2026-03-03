import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import type {
  Config,
  StatusData,
  DoctorData,
  DoctorCheck,
  SessionInfo,
} from './types.js';
import { loadConfig, saveConfig } from './config.js';
import { SessionManager } from './session.js';
import { ChromeService } from './chrome-service.js';
import { RateLimiter } from './rate-limiter.js';
import { getRecipe, listRecipes } from '../recipes/index.js';
import type { RecipeListItem } from '../recipes/index.js';
import {
  findChromeBinary,
  detectOS,
  getConfigDir,
  cleanStaleLocks,
} from './platform.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class OpenBrowser {
  private config: Config;
  private sessionManager: SessionManager;
  private chromeService: ChromeService;
  private rateLimiter: RateLimiter;

  constructor(options?: { configPath?: string; profileDir?: string }) {
    const overrides = options?.profileDir
      ? { profileDir: options.profileDir }
      : undefined;
    this.config = loadConfig(options?.configPath, overrides);
    this.sessionManager = new SessionManager(this.config.cdpPort);
    this.chromeService = new ChromeService(this.config);
    this.rateLimiter = new RateLimiter(this.config.rateLimits);
  }

  async connect(): Promise<Browser> {
    return chromium.connectOverCDP(
      `http://localhost:${this.config.cdpPort}`,
    );
  }

  async getStatus(): Promise<StatusData> {
    const cdp = await this.chromeService.getCdpInfo();
    const pid = cdp.running ? await this.chromeService.getPid() : undefined;

    let sessions: SessionInfo[] = [];
    if (cdp.running) {
      try {
        sessions = await this.sessionManager.getSessions();
      } catch {
        // CDP connected but cookie read failed
      }
    }

    return {
      chrome: {
        running: cdp.running,
        pid: pid ?? undefined,
        version: cdp.version,
        endpoint: cdp.running
          ? `http://localhost:${this.config.cdpPort}`
          : undefined,
      },
      profile: this.config.profileDir,
      sessions,
    };
  }

  async getSession(domain: string): Promise<SessionInfo | null> {
    return this.sessionManager.getSession(domain);
  }

  async listSessions(): Promise<SessionInfo[]> {
    return this.sessionManager.getSessions();
  }

  listRecipes(): RecipeListItem[] {
    return listRecipes();
  }

  async runRecipe<T = unknown>(name: string, args?: Record<string, string>): Promise<T> {
    const recipe = getRecipe(name);
    if (!recipe) {
      const available = listRecipes().map((r) => r.name).join(', ');
      throw new Error(`Unknown recipe: ${name}. Available: ${available}`);
    }

    // Check required sessions
    for (const domain of recipe.requires) {
      const session = await this.getSession(domain);
      if (!session || !session.active) {
        throw new Error(
          `${domain} session not active. Run: openbrowser login`,
        );
      }
    }

    // Rate limit
    for (const domain of recipe.requires) {
      await this.rateLimiter.wait(domain);
    }

    const browser = await this.connect();
    try {
      return (await recipe.run(browser, args)) as T;
    } finally {
      await browser.close();
    }
  }

  async diagnose(): Promise<DoctorData> {
    const checks: DoctorCheck[] = [];

    // 1. Chrome binary
    const chromeBinary = findChromeBinary();
    if (chromeBinary) {
      checks.push({
        name: 'chrome-binary',
        status: 'pass',
        message: `Found at ${chromeBinary}`,
      });
    } else {
      checks.push({
        name: 'chrome-binary',
        status: 'fail',
        message: 'Chrome not found',
        fix: 'Install Google Chrome or Chromium',
      });
    }

    // 2. Profile directory
    if (existsSync(this.config.profileDir)) {
      checks.push({
        name: 'profile-dir',
        status: 'pass',
        message: this.config.profileDir,
      });
    } else {
      checks.push({
        name: 'profile-dir',
        status: 'warn',
        message: `Profile directory not found: ${this.config.profileDir}`,
        fix: 'Run: openbrowser setup',
      });
    }

    // 3. Stale locks
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    const staleLocks = lockFiles.filter((f) =>
      existsSync(join(this.config.profileDir, f)),
    );

    const cdp = await this.chromeService.getCdpInfo();
    if (staleLocks.length > 0 && !cdp.running) {
      checks.push({
        name: 'stale-locks',
        status: 'warn',
        message: `Stale lock files found: ${staleLocks.join(', ')}`,
        fix: 'Run: openbrowser login (will clean up automatically)',
      });
    } else {
      checks.push({
        name: 'stale-locks',
        status: 'pass',
        message: 'No stale lock files',
      });
    }

    // 4. CDP connection
    if (cdp.running) {
      checks.push({
        name: 'cdp-connection',
        status: 'pass',
        message: `Connected to ${cdp.version ?? 'Chrome'} on port ${this.config.cdpPort}`,
      });
    } else {
      checks.push({
        name: 'cdp-connection',
        status: 'fail',
        message: `No response on port ${this.config.cdpPort}`,
        fix: 'Start the service: openbrowser setup, then start the service',
      });
    }

    // 5. Session health
    if (cdp.running) {
      try {
        const sessions = await this.sessionManager.getSessions();
        for (const session of sessions) {
          if (session.active && !session.warning) {
            checks.push({
              name: `session-${session.domain}`,
              status: 'pass',
              message: `Active${session.expiresInDays !== undefined ? `, expires in ${session.expiresInDays} days` : ''}`,
            });
          } else if (session.active && session.warning) {
            checks.push({
              name: `session-${session.domain}`,
              status: 'warn',
              message: session.warning,
              fix: 'Run: openbrowser login',
            });
          } else {
            checks.push({
              name: `session-${session.domain}`,
              status: 'fail',
              message: session.warning ?? 'Not logged in',
              fix: 'Run: openbrowser login',
            });
          }
        }
      } catch {
        checks.push({
          name: 'sessions',
          status: 'warn',
          message: 'Could not read session data',
        });
      }
    }

    // 6. Config file
    const configDir = getConfigDir();
    const configFile = `${configDir}/config.json`;
    if (existsSync(configFile)) {
      checks.push({
        name: 'config',
        status: 'pass',
        message: configFile,
      });
    } else {
      checks.push({
        name: 'config',
        status: 'warn',
        message: 'No config file (using defaults)',
        fix: 'Run: openbrowser setup',
      });
    }

    const healthy = checks.every((c) => c.status !== 'fail');

    return { checks, healthy };
  }

  async login(): Promise<void> {
    const os = detectOS();

    // Stop Chrome service first
    console.log('Stopping Chrome service...');
    this.chromeService.stop();

    // Wait for Chrome to fully stop
    let retries = 10;
    while (retries > 0 && (await this.chromeService.isRunning())) {
      await new Promise((r) => setTimeout(r, 500));
      retries--;
    }

    // Clean stale locks
    cleanStaleLocks(this.config.profileDir);

    if (os === 'linux') {
      await this.loginLinux();
    } else {
      await this.loginMacOS();
    }

    // Restart headless service
    console.log('Restarting Chrome service...');
    try {
      this.chromeService.start();
    } catch {
      console.log(
        'Could not start service automatically. Start manually or run: openbrowser setup',
      );
    }
  }

  private async loginMacOS(): Promise<void> {
    console.log('Opening Chrome for login...');
    console.log('Log into your accounts, then close this Chrome window.');
    console.log();

    const chrome = this.chromeService.launchForLogin();

    await new Promise<void>((resolve) => {
      chrome.on('exit', () => resolve());
    });

    console.log('Chrome closed.');
  }

  private async loginLinux(): Promise<void> {
    // Start Xvfb
    console.log('Starting virtual display...');
    this.chromeService.startXvfb();

    // Launch Chrome on virtual display
    console.log('Starting Chrome on virtual display...');
    const chrome = this.chromeService.launchForLogin();

    // Start VNC
    console.log('Starting VNC server...');
    const vnc = this.chromeService.startVnc();

    console.log();
    console.log(`Connect via: ssh -L ${this.config.vncPort}:localhost:${this.config.vncPort} <host>`);
    console.log(`Then open:   vnc://localhost:${this.config.vncPort}`);
    console.log(`Password:    ${this.config.vncPassword}`);
    console.log();
    console.log('Log into your accounts, then disconnect VNC.');
    console.log('VNC will auto-close after disconnect.');

    // Wait for VNC to exit (x11vnc -once exits after first disconnect)
    await new Promise<void>((resolve) => {
      vnc.on('exit', () => resolve());
    });

    // Kill Chrome on virtual display
    chrome.kill();
    console.log('VNC disconnected. Chrome closed.');
  }

  async setup(): Promise<{ servicePath: string; mcpConfig: object }> {
    // Ensure directories exist
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    if (!existsSync(this.config.profileDir)) {
      mkdirSync(this.config.profileDir, { recursive: true });
    }

    // Save default config
    saveConfig(this.config);

    // Install service
    let servicePath: string;
    let instructions: string;
    try {
      const result = this.chromeService.install();
      servicePath = result.path;
      instructions = result.instructions;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('EACCES') || msg.includes('permission denied')) {
        console.error(`Permission denied writing service file.`);
        console.error('On Linux, run with sudo: sudo npx openbrowser setup');
        console.error('Or the service will be installed in user mode if available.');
        process.exit(1);
      }
      throw err;
    }

    console.log('Setup complete.');
    console.log();
    console.log(instructions);
    console.log();
    console.log('MCP configuration (add to your claude_desktop_config.json):');
    const mcpConfig = this.chromeService.getMcpConfig();
    console.log(JSON.stringify(mcpConfig, null, 2));
    console.log();
    console.log('Next step: openbrowser login');

    return { servicePath, mcpConfig };
  }
}

export type { Config, StatusData, SessionInfo, DoctorData, DoctorCheck, CommandOutput } from './types.js';
export type { Recipe, RecipeListItem, PrsResult, InboxResult, LinkedInResult, SearchResult } from '../recipes/index.js';
