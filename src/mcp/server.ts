import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { OpenBrowser } from '../lib/core.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
}

const TOOLS: ToolDef[] = [
  // Session tools
  { name: 'session_list', description: 'List all tracked session statuses', inputSchema: { type: 'object', properties: {} } },
  { name: 'session_check', description: 'Check session status for a specific domain', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },
  { name: 'session_cookies', description: 'Get all cookies for a domain', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },
  { name: 'service_status', description: 'Get Chrome service and session status', inputSchema: { type: 'object', properties: {} } },
  { name: 'service_diagnose', description: 'Run full diagnostics', inputSchema: { type: 'object', properties: {} } },
  // Browser tools
  { name: 'browser_navigate', description: 'Navigate to a URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_snapshot', description: 'Get accessibility snapshot of current page', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_screenshot', description: 'Take a screenshot of current page', inputSchema: { type: 'object', properties: { fullPage: { type: 'boolean' } } } },
  { name: 'browser_click', description: 'Click an element by CSS selector', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
  { name: 'browser_type', description: 'Type text into an element', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['selector', 'text'] } },
  { name: 'browser_select', description: 'Select an option in a dropdown', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } },
  { name: 'browser_hover', description: 'Hover over an element', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
  { name: 'browser_evaluate', description: 'Evaluate JavaScript on the page', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
  { name: 'browser_wait', description: 'Wait for a selector or timeout', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, timeout: { type: 'number' } } } },
  { name: 'browser_back', description: 'Go back in browser history', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_forward', description: 'Go forward in browser history', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_tabs', description: 'List all open tabs', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_new_tab', description: 'Open a new tab', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },
  { name: 'browser_switch_tab', description: 'Switch to a tab by index', inputSchema: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] } },
  // Recipe tools
  { name: 'recipe_list', description: 'List all available recipes', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run', description: 'Run a recipe by name', inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object' } }, required: ['name'] } },
  { name: 'recipe_run_prs', description: 'Check GitHub pull requests', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_inbox', description: 'Check Gmail inbox', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_issues', description: 'List GitHub issues assigned to you', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_notifications', description: 'Check GitHub notifications', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_calendar', description: "Check today's Google Calendar events", inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_profile', description: 'Get LinkedIn profile summary', inputSchema: { type: 'object', properties: {} } },
  { name: 'recipe_run_messages', description: 'Check LinkedIn unread messages', inputSchema: { type: 'object', properties: {} } },
];

export const TOOL_COUNT = TOOLS.length;

export async function startMcpServer(options?: { profileDir?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options?.profileDir });

  let browser: Browser | null = null;
  let activePage: Page | null = null;

  async function ensureBrowser(): Promise<Browser> {
    if (browser?.isConnected()) return browser;
    activePage = null;
    browser = await ob.connect();
    return browser;
  }

  async function ensurePage(): Promise<Page> {
    if (activePage && !activePage.isClosed()) return activePage;
    const b = await ensureBrowser();
    const context = b.contexts()[0];
    if (!context) throw new Error('No browser context available');
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

  const server = new Server(
    { name: 'openbrowser', version: getVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

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
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) return json([]);
        const all = await context.cookies();
        const filtered = all.filter((c) => c.domain.includes(args.domain as string));
        return json(filtered);
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
        const page = await ensurePage();
        await page.goto(args.url as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        const snapshot = await page.accessibility.snapshot();
        return json({ title, url: page.url(), snapshot });
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
        const b = await ensureBrowser();
        const context = b.contexts()[0];
        if (!context) throw new Error('No browser context available');
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
        if (!context) throw new Error('No browser context available');
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
        const result = await ob.runRecipe(args.name as string, args.args as Record<string, string> | undefined);
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
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
