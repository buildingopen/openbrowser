import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Browser, Page } from 'playwright-core';
import { OpenBrowser } from '../lib/core.js';
import { AUTH_COOKIE_SPECS } from '../lib/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';

export function isPrivateHost(hostname: string): boolean {
  // IPv4 private/reserved ranges
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(hostname)) return true;
  // IPv6 loopback and private
  if (/^(::1|fc00:|fd[0-9a-f]{2}:|fe80:)/i.test(hostname)) return true;
  if (hostname === 'localhost') return true;
  return false;
}

export function validateUrl(raw: string): void {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  const allowed = ['http:', 'https:'];
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(`Blocked protocol ${parsed.protocol} -- only http/https allowed`);
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Blocked navigation to private/internal address: ${parsed.hostname}`);
  }
}

/** Resolve hostname and check the resolved IP is not private (DNS rebinding protection). */
export async function validateUrlWithDns(raw: string): Promise<void> {
  validateUrl(raw);
  const parsed = new URL(raw);
  // Skip DNS check for raw IPs (already checked by isPrivateHost above)
  if (/^[\d.]+$/.test(parsed.hostname) || parsed.hostname.includes(':')) return;
  try {
    const { address } = await lookup(parsed.hostname);
    if (isPrivateHost(address)) {
      throw new Error(`Blocked: ${parsed.hostname} resolves to private address ${address}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked:')) throw err;
    // DNS resolution failed, let the browser handle it (will fail on its own)
  }
}

// Rate limiting for browser mutation tools
const CATEGORY_DELAYS: Record<string, number> = {
  navigate: 500,
  interact: 200,
  evaluate: 1000,
};

export function getToolCategory(name: string): string | null {
  if (['browser_navigate', 'browser_back', 'browser_forward', 'browser_new_tab'].includes(name)) return 'navigate';
  if (['browser_click', 'browser_type', 'browser_select', 'browser_hover'].includes(name)) return 'interact';
  if (name === 'browser_evaluate') return 'evaluate';
  return null;
}

function createRateLimiter() {
  const lastCallByCategory = new Map<string, number>();
  return async function rateLimitCheck(toolName: string): Promise<void> {
    const cat = getToolCategory(toolName);
    if (!cat) return;
    const delay = CATEGORY_DELAYS[cat];
    const last = lastCallByCategory.get(cat) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < delay) {
      await new Promise((r) => setTimeout(r, delay - elapsed));
    }
    lastCallByCategory.set(cat, Date.now());
  };
}

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const SETUP_GUIDE = `# OpenBrowser Setup Guide

## Quick Start (API-only, no Chrome needed)

6 of 9 recipes work without a browser session. Set env vars and go.

### GitHub (prs, issues, notifications)
Already working if you have gh CLI:
  gh auth login

Or set a token:
  export GITHUB_TOKEN="ghp_..."

### Gmail Inbox
  export GMAIL_USER="you@gmail.com"
  export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"

To get an App Password:
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Copy the 16-character password (spaces optional)

Requires 2FA enabled on your Google account.

### Google Calendar
Option A - OAuth access token (short-lived):
  export GOOGLE_ACCESS_TOKEN="ya29...."

Option B - API key (only for public calendars):
  export GOOGLE_CALENDAR_API_KEY="AIza..."

Option C - Refresh token (long-lived, auto-refreshes):
  export GOOGLE_REFRESH_TOKEN="1//..."
  export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
  export GOOGLE_CLIENT_SECRET="GOCSPX-..."

### Google Search
Requires Chrome running but no login. No env vars needed.

## Full Browser Setup (all 9 recipes)

For LinkedIn recipes, search, and browser-based fallbacks:
  npx openbrowser setup    # One-time setup (~2 min)
  npx openbrowser login    # Log into your accounts
  npx openbrowser doctor   # Verify everything works

## Recipe Status

| Recipe        | API-only | Env vars needed                |
|---------------|----------|--------------------------------|
| prs           | YES      | GITHUB_TOKEN or gh CLI         |
| issues        | YES      | GITHUB_TOKEN or gh CLI         |
| notifications | YES      | GITHUB_TOKEN or gh CLI         |
| search        | NO       | Requires Chrome (no login)     |
| inbox         | YES      | GMAIL_USER + GMAIL_APP_PASSWORD|
| calendar      | YES      | GOOGLE_ACCESS_TOKEN (or others)|
| linkedin      | NO       | Requires browser login         |
| profile       | NO       | Requires browser login         |
| messages      | NO       | Requires browser login         |
`;

interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
}

const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
const BROWSER_MUTATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };

const TOOLS: ToolDef[] = [
  // Session tools
  { name: 'session_list', description: 'List all tracked session statuses', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'session_check', description: 'Check session status for a specific domain', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] }, annotations: READ_ONLY },
  { name: 'session_cookies', description: 'Get non-auth cookies for a domain (httpOnly auth cookies like SID, li_at, user_session are filtered out)', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'service_status', description: 'Get browser and account connection status', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'service_diagnose', description: 'Run full diagnostics', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  // Browser tools
  { name: 'browser_navigate', description: 'Navigate to a URL. Returns title and URL only; call browser_snapshot separately if you need page content.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, annotations: BROWSER_MUTATE },
  { name: 'browser_snapshot', description: 'Get accessibility snapshot of current page', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'browser_screenshot', description: 'Take a screenshot of current page', inputSchema: { type: 'object', properties: { fullPage: { type: 'boolean' } } }, annotations: READ_ONLY },
  { name: 'browser_click', description: 'Click an element by CSS selector', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] }, annotations: BROWSER_MUTATE },
  { name: 'browser_type', description: 'Type text into an element', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['selector', 'text'] }, annotations: BROWSER_MUTATE },
  { name: 'browser_select', description: 'Select an option in a dropdown', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] }, annotations: BROWSER_MUTATE },
  { name: 'browser_hover', description: 'Hover over an element', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] }, annotations: BROWSER_MUTATE },
  { name: 'browser_evaluate', description: 'DANGEROUS: Evaluate arbitrary JavaScript in the authenticated browser context. This executes code with full access to page DOM, cookies, and session tokens of logged-in sites. Can perform actions as the authenticated user. Use with extreme caution.', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true } },
  { name: 'browser_wait', description: 'Wait for a selector or timeout', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, timeout: { type: 'number' } } }, annotations: BROWSER_MUTATE },
  { name: 'browser_back', description: 'Go back in browser history', inputSchema: { type: 'object', properties: {} }, annotations: BROWSER_MUTATE },
  { name: 'browser_forward', description: 'Go forward in browser history', inputSchema: { type: 'object', properties: {} }, annotations: BROWSER_MUTATE },
  { name: 'browser_tabs', description: 'List all open tabs', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'browser_new_tab', description: 'Open a new tab', inputSchema: { type: 'object', properties: { url: { type: 'string' } } }, annotations: BROWSER_MUTATE },
  { name: 'browser_switch_tab', description: 'Switch to a tab by index', inputSchema: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] }, annotations: BROWSER_MUTATE },
  // Recipe tools
  { name: 'recipe_list', description: 'List all available recipes', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run', description: 'Run a recipe by name', inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object' } }, required: ['name'] }, annotations: READ_ONLY },
  { name: 'recipe_run_prs', description: 'Check your open pull requests', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_inbox', description: 'Read your unread emails', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_issues', description: 'Check issues assigned to you', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_notifications', description: 'Read your GitHub notifications', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_calendar', description: "See today's meetings and events", inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_profile', description: 'Get your LinkedIn profile', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_messages', description: 'Read your LinkedIn messages', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_linkedin', description: 'See your LinkedIn notifications', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
  { name: 'recipe_run_search', description: 'Search Google as you', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, annotations: READ_ONLY },
  // Setup tool
  { name: 'setup_guide', description: 'Get setup instructions for OpenBrowser, including env vars for API-first recipes that work without Chrome', inputSchema: { type: 'object', properties: {} }, annotations: READ_ONLY },
];

export const TOOL_COUNT = TOOLS.length;
export const TOOL_DEFS = TOOLS;

export async function startMcpServer(options?: { profileDir?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options?.profileDir });
  const rateLimitCheck = createRateLimiter();

  let browser: Browser | null = null;
  let activePage: Page | null = null;

  async function ensureBrowser(): Promise<Browser> {
    if (browser?.isConnected()) return browser;
    activePage = null;
    try {
      browser = await ob.connect();
      return browser;
    } catch (err) {
      throw new Error(
        'Browser is not running.\n\n' +
        'Some recipes work without the browser:\n' +
        '  - prs, issues, notifications: set GITHUB_TOKEN or run "gh auth login"\n' +
        '  - inbox: set GMAIL_USER + GMAIL_APP_PASSWORD\n' +
        '  - calendar: set GOOGLE_ACCESS_TOKEN or GOOGLE_CALENDAR_API_KEY\n\n' +
        'To start the browser: openbrowser start\n' +
        'First time? Run: openbrowser setup\n' +
        'Run the setup_guide tool for detailed instructions.',
      );
    }
  }

  async function ensurePage(): Promise<Page> {
    if (activePage && !activePage.isClosed()) return activePage;
    const b = await ensureBrowser();
    const context = b.contexts()[0];
    if (!context) throw new Error('Browser is not ready. Try: openbrowser restart');
    const pages = context.pages();
    activePage = pages.length > 0 ? pages[0] : await context.newPage();
    return activePage;
  }

  function text(content: string) {
    return { content: [{ type: 'text' as const, text: content }] };
  }

  function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
  }

  // Auth cookie names to filter from session_cookies responses (exact match)
  const AUTH_COOKIE_NAMES = new Set(
    AUTH_COOKIE_SPECS.flatMap((s) => s.requiredCookies),
  );
  // Additional sensitive cookie prefixes (startsWith match)
  // Covers: LSID, SAPISID, APISID, SIDCC, __Host-GAPS, __Secure-1PSID, etc.
  const SENSITIVE_COOKIE_PREFIXES = [
    '__Host-', '__Secure-', 'LSID', 'SAPISID', 'APISID',
  ];

  const server = new Server(
    { name: 'openbrowser', version: getVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    await rateLimitCheck(name);

    switch (name) {
      // Session tools
      case 'session_list': {
        const sessions = await ob.listSessions();
        return json(sessions);
      }
      case 'session_check': {
        const session = await ob.getSession(args.domain as string);
        if (!session) return text(`No session tracked for domain: ${args.domain}`);
        return json(session);
      }
      case 'session_cookies': {
        const domain = (args.domain as string ?? '').trim();
        if (!domain) return text('Error: domain parameter is required and must be non-empty');
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) return json([]);
        const all = await context.cookies();
        const domainSuffix = domain.startsWith('.') ? domain : `.${domain}`;
        const filtered = all.filter((c) => {
          if (c.domain !== domain && !c.domain.endsWith(domainSuffix)) return false;
          // Filter out sensitive auth cookies
          if (AUTH_COOKIE_NAMES.has(c.name)) return false;
          if (SENSITIVE_COOKIE_PREFIXES.some((p) => c.name.startsWith(p))) return false;
          return true;
        });
        // Strip raw token values, return only metadata (name, domain, path, expires, etc.)
        const safe = filtered.map(({ value: _v, ...rest }) => rest);
        return json(safe);
      }
      case 'service_status': {
        const status = await ob.getStatus();
        return json(status);
      }
      case 'service_diagnose': {
        const doctor = await ob.diagnose();
        return json(doctor);
      }

      // Browser tools
      case 'browser_navigate': {
        await validateUrlWithDns(args.url as string);
        const page = await ensurePage();
        await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return json({ title, url: page.url() });
      }
      case 'browser_snapshot': {
        const page = await ensurePage();
        const snapshot = await page.accessibility.snapshot();
        return json(snapshot);
      }
      case 'browser_screenshot': {
        const page = await ensurePage();
        const buffer = await page.screenshot({ fullPage: (args.fullPage as boolean) ?? false, type: 'png' });
        return { content: [{ type: 'image' as const, data: buffer.toString('base64'), mimeType: 'image/png' }] };
      }
      case 'browser_click': {
        const page = await ensurePage();
        await page.click(args.selector as string, { timeout: 10000 });
        return text(`Clicked: ${args.selector}`);
      }
      case 'browser_type': {
        const page = await ensurePage();
        await page.fill(args.selector as string, args.text as string, { timeout: 10000 });
        if (args.submit) await page.press(args.selector as string, 'Enter');
        return text(`Typed into: ${args.selector}`);
      }
      case 'browser_select': {
        const page = await ensurePage();
        await page.selectOption(args.selector as string, args.value as string, { timeout: 10000 });
        return text(`Selected "${args.value}" in: ${args.selector}`);
      }
      case 'browser_hover': {
        const page = await ensurePage();
        await page.hover(args.selector as string, { timeout: 10000 });
        return text(`Hovered: ${args.selector}`);
      }
      case 'browser_evaluate': {
        const page = await ensurePage();
        const result = await page.evaluate(args.expression as string);
        return json(result);
      }
      case 'browser_wait': {
        const page = await ensurePage();
        if (args.selector) {
          await page.waitForSelector(args.selector as string, { timeout: (args.timeout as number) ?? 30000 });
          return text(`Found: ${args.selector}`);
        }
        await page.waitForTimeout((args.timeout as number) ?? 1000);
        return text(`Waited ${(args.timeout as number) ?? 1000}ms`);
      }
      case 'browser_back': {
        const page = await ensurePage();
        await page.goBack({ waitUntil: 'domcontentloaded' });
        return text(`Navigated back to: ${page.url()}`);
      }
      case 'browser_forward': {
        const page = await ensurePage();
        await page.goForward({ waitUntil: 'domcontentloaded' });
        return text(`Navigated forward to: ${page.url()}`);
      }
      case 'browser_tabs': {
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) return json([]);
        const pages = context.pages();
        const tabs = await Promise.all(pages.map(async (p, i) => ({
          index: i,
          url: p.url(),
          title: await p.title().catch(() => ''),
          active: p === activePage,
        })));
        return json(tabs);
      }
      case 'browser_new_tab': {
        if (args.url) await validateUrlWithDns(args.url as string);
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) throw new Error('Browser is not ready. Try: openbrowser restart');
        activePage = await context.newPage();
        if (args.url) {
          await activePage.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        const title = await activePage.title();
        return json({ url: activePage.url(), title });
      }

      case 'browser_switch_tab': {
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) throw new Error('Browser is not ready. Try: openbrowser restart');
        const allPages = context.pages();
        const idx = args.index as number;
        if (idx < 0 || idx >= allPages.length) {
          throw new Error(`Tab index ${idx} out of range (0-${allPages.length - 1})`);
        }
        activePage = allPages[idx];
        await activePage.bringToFront();
        return json({ index: idx, url: activePage.url(), title: await activePage.title() });
      }

      // Recipe tools
      case 'recipe_list': {
        const recipes = ob.listRecipes();
        return json(recipes);
      }
      case 'recipe_run': {
        let recipeArgs: Record<string, string> | undefined;
        if (args.args && typeof args.args === 'object') {
          recipeArgs = {};
          for (const [k, v] of Object.entries(args.args as Record<string, unknown>)) {
            recipeArgs[k] = String(v);
          }
        }
        const result = await ob.runRecipe(args.name as string, recipeArgs);
        return json(result);
      }
      case 'recipe_run_prs': {
        const result = await ob.runRecipe('prs');
        return json(result);
      }
      case 'recipe_run_inbox': {
        const result = await ob.runRecipe('inbox');
        return json(result);
      }
      case 'recipe_run_issues': {
        const result = await ob.runRecipe('issues');
        return json(result);
      }
      case 'recipe_run_notifications': {
        const result = await ob.runRecipe('notifications');
        return json(result);
      }
      case 'recipe_run_calendar': {
        const result = await ob.runRecipe('calendar');
        return json(result);
      }
      case 'recipe_run_profile': {
        const result = await ob.runRecipe('profile');
        return json(result);
      }
      case 'recipe_run_messages': {
        const result = await ob.runRecipe('messages');
        return json(result);
      }
      case 'recipe_run_linkedin': {
        const result = await ob.runRecipe('linkedin');
        return json(result);
      }
      case 'recipe_run_search': {
        const result = await ob.runRecipe('search', { query: args.query as string });
        return json(result);
      }
      case 'setup_guide': {
        return text(SETUP_GUIDE);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
