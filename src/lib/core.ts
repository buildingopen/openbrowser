import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import type {
  Config,
  StatusData,
  DoctorData,
  DoctorCheck,
  SessionInfo,
  AuthCookieSpec,
  SetupData,
} from './types.js';
import { AUTH_COOKIE_SPECS } from './types.js';
import { domainLabel } from './output.js';
import { loadConfig, saveConfig, randomPassword, getConfigPath } from './config.js';
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
  checkPort,
  hasCommand,
} from './platform.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class OpenBrowser {
  private config: Config;
  private configPath?: string;
  private sessionManager: SessionManager;
  private chromeService: ChromeService;
  private rateLimiter: RateLimiter;

  constructor(options?: { configPath?: string; profileDir?: string }) {
    const overrides = options?.profileDir
      ? { profileDir: options.profileDir }
      : undefined;
    this.configPath = options?.configPath;
    this.config = loadConfig(options?.configPath, overrides);
    this.sessionManager = new SessionManager(this.config.cdpPort, this.config.customDomains);
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
    let sessionError: string | undefined;
    if (cdp.running) {
      try {
        sessions = await this.sessionManager.getSessions();
      } catch (err) {
        sessionError = `Failed to read sessions: ${err instanceof Error ? err.message : String(err)}`;
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
      ...(sessionError ? { sessionError } : {}),
    };
  }

  async getSession(domain: string): Promise<SessionInfo | null> {
    return this.sessionManager.getSession(domain);
  }

  async listSessions(): Promise<SessionInfo[]> {
    return this.sessionManager.getSessions();
  }

  // Service control
  async startService(): Promise<void> {
    await this.chromeService.start();
  }

  stopService(): void {
    this.chromeService.stop();
  }

  async restartService(): Promise<void> {
    await this.chromeService.restart();
  }

  async isServiceRunning(): Promise<boolean> {
    return this.chromeService.isRunning();
  }

  // Domain management
  addDomain(domain: string, cookies: string[], label?: string): void {
    if (AUTH_COOKIE_SPECS.some((s) => s.domain === domain)) {
      throw new Error(`Cannot override built-in domain: ${domain}`);
    }
    const spec: AuthCookieSpec = {
      domain,
      requiredCookies: cookies,
      label: label ?? domain,
    };
    const custom = this.config.customDomains ?? [];
    const existing = custom.findIndex((d) => d.domain === domain);
    if (existing >= 0) {
      custom[existing] = spec;
    } else {
      custom.push(spec);
    }
    this.config.customDomains = custom;
    saveConfig(this.config, this.configPath);
    this.sessionManager = new SessionManager(this.config.cdpPort, this.config.customDomains);
  }

  removeDomain(domain: string): boolean {
    const custom = this.config.customDomains ?? [];
    const idx = custom.findIndex((d) => d.domain === domain);
    if (idx < 0) return false;
    custom.splice(idx, 1);
    this.config.customDomains = custom.length > 0 ? custom : undefined;
    saveConfig(this.config, this.configPath);
    this.sessionManager = new SessionManager(this.config.cdpPort, this.config.customDomains);
    return true;
  }

  listDomains(): AuthCookieSpec[] {
    return this.sessionManager.getSpecs();
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

    // Try API-first path if the recipe supports it (e.g., GitHub API with token)
    let apiError: string | undefined;
    if (recipe.runWithoutBrowser) {
      try {
        const result = await recipe.runWithoutBrowser(args);
        if (result !== null) return result as T;
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
        // API path failed, fall back to browser
      }
    }

    // Check required sessions in one CDP call
    if (recipe.requires.length > 0) {
      const sessions = await this.listSessions();
      for (const domain of recipe.requires) {
        const session = sessions.find((s) => s.domain === domain);
        if (!session || !session.active) {
          const label = domainLabel(domain);
          const msg = `Not logged into ${label}. Run: openbrowser login`;
          throw new Error(apiError ? `${msg} (API also failed: ${apiError})` : msg);
        }
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
    const os = detectOS();

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
        message: 'Chrome is not installed',
        fix: 'Download from https://google.com/chrome',
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

    // 4. Port conflict
    const portFree = await checkPort(this.config.cdpPort);
    if (cdp.running) {
      // Port in use by Chrome, that's expected
      checks.push({
        name: 'port-conflict',
        status: 'pass',
        message: `Port ${this.config.cdpPort} in use by browser (expected)`,
      });
    } else if (!portFree) {
      checks.push({
        name: 'port-conflict',
        status: 'fail',
        message: `Port ${this.config.cdpPort} is occupied by another process`,
        fix: `Another program is using port ${this.config.cdpPort}. Close that program and try again.`,
      });
    } else {
      checks.push({
        name: 'port-conflict',
        status: 'pass',
        message: `Port ${this.config.cdpPort} is available`,
      });
    }

    // 5. CDP connection
    if (cdp.running) {
      checks.push({
        name: 'cdp-connection',
        status: 'pass',
        message: `Browser responding${cdp.version ? ` (${cdp.version})` : ''}`,
      });
    } else {
      checks.push({
        name: 'cdp-connection',
        status: 'fail',
        message: 'Browser is not responding',
        fix: 'Run: openbrowser start',
      });
    }

    // 6. Session health
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

    // 7. Config file
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

    // 8. Linux-specific: Xvfb and x11vnc
    if (os === 'linux') {
      if (hasCommand('Xvfb')) {
        checks.push({
          name: 'xvfb',
          status: 'pass',
          message: 'Xvfb is installed',
        });
      } else {
        checks.push({
          name: 'xvfb',
          status: 'fail',
          message: 'Xvfb not found',
          fix: 'Install with: apt install xvfb (or: dnf install xorg-x11-server-Xvfb)',
        });
      }

      if (hasCommand('x11vnc')) {
        checks.push({
          name: 'x11vnc',
          status: 'pass',
          message: 'x11vnc is installed',
        });
      } else {
        checks.push({
          name: 'x11vnc',
          status: 'warn',
          message: 'x11vnc not found (needed for login on headless servers)',
          fix: 'Install with: apt install x11vnc (or: dnf install x11vnc)',
        });
      }
    }

    const healthy = checks.every((c) => c.status !== 'fail');

    return { checks, healthy };
  }

  async login(): Promise<void> {
    const os = detectOS();

    // Show pre-login session status
    try {
      const preSessions = await this.sessionManager.getSessions();
      const notLoggedIn = preSessions.filter((s) => !s.active);
      if (notLoggedIn.length > 0) {
        console.log();
        console.log('  Not logged in yet:');
        for (const session of notLoggedIn) {
          console.log(`    ${domainLabel(session.domain)}`);
        }
        console.log();
      }
    } catch {
      // Browser may not be running, skip pre-login status
    }

    // Stop browser to open login window
    console.log('Preparing login...');
    this.chromeService.stop();

    // Wait for Chrome to fully stop
    let retries = 10;
    while (retries > 0 && (await this.chromeService.isRunning())) {
      await new Promise((r) => setTimeout(r, 500));
      retries--;
    }

    if (await this.chromeService.isRunning()) {
      throw new Error('Browser did not stop within 5 seconds. Try: openbrowser stop');
    }

    // Clean stale locks
    cleanStaleLocks(this.config.profileDir);

    // SIGINT handler to clean up Chrome process
    const cleanup = () => {
      console.log('\nInterrupted. Cleaning up...');
      try { this.chromeService.stop(); } catch { /* ignore */ }
      console.log('Restart with: openbrowser start');
      process.exit(130);
    };
    process.on('SIGINT', cleanup);

    try {
      if (os === 'linux') {
        await this.loginLinux();
      } else {
        await this.loginMacOS();
      }
    } finally {
      process.removeListener('SIGINT', cleanup);
    }

    // Restart background browser
    console.log('Starting background browser...');
    try {
      await this.chromeService.start();
    } catch {
      console.log(
        'Could not restart automatically. Run: openbrowser start',
      );
      return;
    }

    // Show post-login session summary
    try {
      console.log();
      console.log('Checking accounts...');
      const postSessions = await this.sessionManager.getSessions();
      let loggedIn = 0;
      for (const session of postSessions) {
        const label = domainLabel(session.domain).padEnd(16);
        if (session.active) {
          loggedIn++;
          let expiry = '';
          if (session.expiresInDays !== undefined) {
            expiry = `(expires in ${session.expiresInDays} day${session.expiresInDays === 1 ? '' : 's'})`;
          }
          console.log(`    ${label} logged in ${expiry}`);
        } else {
          console.log(`    ${label} not logged in`);
        }
      }
      console.log();
      if (loggedIn === postSessions.length && loggedIn > 0) {
        console.log(`  All ${loggedIn} accounts connected. Try:`);
        console.log(`    openbrowser inbox       Read your unread emails`);
        console.log(`    openbrowser prs         Check your open pull requests`);
        console.log(`    openbrowser calendar    See today's meetings and events`);
      } else {
        console.log(`  ${loggedIn} of ${postSessions.length} accounts logged in.`);
        if (loggedIn < postSessions.length) {
          console.log(`  Run openbrowser login again to log into the rest.`);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private async loginMacOS(): Promise<void> {
    console.log();
    console.log('  A browser window will open.');
    console.log('  Log into Google, GitHub, and LinkedIn, then close the window.');
    console.log();

    const chrome = this.chromeService.launchForLogin();

    await new Promise<void>((resolve) => {
      chrome.on('exit', () => resolve());
    });

    console.log('Browser closed.');
  }

  private async loginLinux(): Promise<void> {
    // Ensure VNC password is set (might not be if setup wasn't run)
    if (!this.config.vncPassword) {
      this.config.vncPassword = randomPassword();
      saveConfig(this.config, this.configPath ?? getConfigPath());
    }

    // Verify required binaries
    if (!hasCommand('x11vnc')) {
      throw new Error('Remote login requires x11vnc. Install with: apt install x11vnc');
    }

    // Start virtual display + browser + VNC
    console.log('Starting remote login session...');
    await this.chromeService.startXvfb();
    const chrome = this.chromeService.launchForLogin();
    const vnc = this.chromeService.startVnc();

    console.log();
    console.log('  To log in from your computer:');
    console.log();
    console.log(`  1. Forward the connection:  ssh -L ${this.config.vncPort}:localhost:${this.config.vncPort} <your-server>`);
    console.log(`  2. Open a VNC viewer:       vnc://localhost:${this.config.vncPort}`);
    console.log(`  3. Password:                ${this.config.vncPassword}`);
    console.log();
    console.log('  Log into Google, GitHub, and LinkedIn, then disconnect.');
    console.log('  The session will close automatically after you disconnect.');

    // Wait for VNC to exit (x11vnc -once exits after first disconnect)
    await new Promise<void>((resolve) => {
      vnc.on('exit', () => resolve());
    });

    // Kill Chrome on virtual display and stop Xvfb
    chrome.kill();
    this.chromeService.stopXvfb();
    console.log('Login session closed.');
  }

  private tryInstallMcpConfig(
    tool: 'claude-desktop' | 'cursor',
    mcpEntry: unknown,
  ): 'installed' | 'already' | null {
    const home = process.env['HOME'] ?? '~';
    let configPath: string;
    if (tool === 'claude-desktop') {
      configPath = detectOS() === 'darwin'
        ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : join(home, '.config', 'Claude', 'claude_desktop_config.json');
    } else {
      configPath = join(home, '.cursor', 'mcp.json');
    }

    try {
      // Only auto-install if the config file already exists (tool is installed)
      if (!existsSync(configPath)) return null;

      let config: Record<string, unknown> = {};
      try {
        const raw = readFileSync(configPath, 'utf-8');
        config = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Corrupted or empty file, start fresh
      }

      const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
      if (servers.openbrowser) return 'already'; // Already configured, don't overwrite
      servers.openbrowser = mcpEntry;
      config.mcpServers = servers;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return 'installed';
    } catch {
      return null; // Permission error, etc. Non-fatal.
    }
  }

  async setup(): Promise<SetupData> {
    // Ensure directories exist
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    if (!existsSync(this.config.profileDir)) {
      mkdirSync(this.config.profileDir, { recursive: true });
    }

    // Generate a real VNC password if not yet set
    if (!this.config.vncPassword) {
      this.config.vncPassword = randomPassword();
    }

    // Save config
    const configPath = this.configPath ?? getConfigPath();
    saveConfig(this.config, configPath);

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
        throw new Error(
          'Permission denied writing service file. ' +
          'On Linux, run with sudo: sudo npx openbrowser setup',
        );
      }
      throw err;
    }

    const mcpConfig = this.chromeService.getMcpConfig();

    // Auto-start the service
    let autoStarted = false;
    try {
      await this.chromeService.start();
      autoStarted = true;
    } catch {
      // Non-fatal: service installed but could not auto-start
    }

    // Auto-install MCP config into Claude Desktop or Cursor
    let mcpAutoInstalled: 'claude-desktop' | 'cursor' | undefined;
    let mcpAlreadyConfigured: 'claude-desktop' | 'cursor' | undefined;
    const mcpEntry = (mcpConfig as { mcpServers: Record<string, unknown> }).mcpServers.openbrowser;

    for (const tool of ['claude-desktop', 'cursor'] as const) {
      const result = this.tryInstallMcpConfig(tool, mcpEntry);
      if (result === 'installed') { mcpAutoInstalled = tool; break; }
      if (result === 'already') { mcpAlreadyConfigured = tool; break; }
    }

    return {
      servicePath,
      mcpConfig,
      configPath,
      instructions,
      autoStarted,
      mcpAutoInstalled,
      mcpAlreadyConfigured,
    };
  }
}

export type { Config, StatusData, SessionInfo, DoctorData, DoctorCheck, SetupData, CommandOutput, AuthCookieSpec } from './types.js';
export type { Recipe, RecipeListItem, RecipeOptions, PrsResult, InboxResult, LinkedInResult, SearchResult, IssuesResult, NotificationsResult, CalendarResult, ProfileResult, MessagesResult } from '../recipes/index.js';
export { RecipeError, withRetry } from '../recipes/index.js';
