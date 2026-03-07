import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CommandOutput,
  StatusData,
  SessionInfo,
  DoctorData,
  AuthCookieSpec,
  SetupData,
} from './types.js';
import type { RecipeListItem } from '../recipes/base.js';
import { AUTH_COOKIE_SPECS } from './types.js';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function createOutput<T>(
  command: string,
  data: T,
  summary: string,
  success = true,
  error?: string,
): CommandOutput<T> {
  return {
    command,
    version: getVersion(),
    timestamp: new Date().toISOString(),
    success,
    ...(error ? { error } : {}),
    data,
    summary,
  };
}

export function resolveFormat(explicit?: string): 'json' | 'text' {
  if (explicit === 'json') return 'json';
  if (explicit === 'text') return 'text';
  if (explicit !== undefined) {
    throw new Error(`Unknown format: "${explicit}". Use "json" or "text".`);
  }
  return process.stdout.isTTY ? 'text' : 'json';
}

const ERROR_PATTERNS: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  [/ECONNREFUSED/, 'Browser is not running. Start it with: openbrowser start'],
  [/EACCES|permission denied/i, 'Permission denied. On Linux, try: sudo openbrowser setup'],
  [/Chrome not found/i, 'Google Chrome is not installed. Download it from https://google.com/chrome'],
  [/Port (\d+) is in use by a non-Chrome/i, (_m, p) => `Port ${p} is already used by another program. Close it or change port in config`],
  [/Service started but Chrome not responding/i, 'Browser started but not responding. Check: openbrowser doctor'],
  [/Chrome not running or CDP not accessible/i, 'Browser is not running. Start it with: openbrowser start'],
  [/No browser context available/i, 'Browser is not ready. Try: openbrowser restart'],
  [/Chrome did not release port/i, 'Browser is still shutting down. Wait a moment and try again, or run: openbrowser doctor'],
  [/Chrome not running\./i, 'Browser is not running. Start it with: openbrowser start'],
  [/lsof -i :(\d+)/i, (_m, p) => `Port ${p} is in use by another program. Run: openbrowser doctor`],
];

export function humanizeError(msg: string): string {
  for (const [pattern, replacement] of ERROR_PATTERNS) {
    const match = msg.match(pattern);
    if (match) {
      return typeof replacement === 'function' ? replacement(match[0], match[1]) : replacement;
    }
  }
  return msg;
}

export function domainLabel(domain: string): string {
  const spec = AUTH_COOKIE_SPECS.find((s) => s.domain === domain);
  return spec?.label ?? domain;
}

export function printOutput<T>(output: CommandOutput<T>, format: 'json' | 'text'): void {
  if (format === 'json') {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Text formatting depends on the command
  switch (output.command) {
    case 'status':
      printStatusText(output as unknown as CommandOutput<StatusData>);
      break;
    case 'doctor':
      printDoctorText(output as unknown as CommandOutput<DoctorData>);
      break;
    case 'recipe:list':
      printRecipeListText(output as unknown as CommandOutput<RecipeListItem[]>);
      break;
    case 'sessions':
      printSessionsText(output as unknown as CommandOutput<SessionInfo[]>);
      break;
    case 'domain:list':
      printDomainListText(output as unknown as CommandOutput<AuthCookieSpec[]>);
      break;
    case 'setup':
      printSetupText(output as unknown as CommandOutput<SetupData>);
      break;
    default:
      if (output.command.startsWith('recipe:')) {
        printRecipeResultText(output);
      } else if (output.command.startsWith('service:') || output.command.startsWith('domain:')) {
        printActionText(output);
      } else {
        console.log(output.summary);
      }
  }
}

function printStatusText(output: CommandOutput<StatusData>): void {
  const { data } = output;

  console.log();
  console.log(`  Browser           ${data.chrome.running ? chalk.green('running') : chalk.red('not running')}`);

  if (data.sessions.length === 0 && !data.chrome.running) {
    console.log();
    console.log(`  No accounts set up yet.`);
    console.log(`  Run: ${chalk.green('openbrowser setup')}`);
  } else if (data.sessions.length === 0) {
    console.log();
    console.log(`  No accounts logged in.`);
    console.log(`  Run: ${chalk.green('openbrowser login')}`);
  } else {
    for (const session of data.sessions) {
      printSessionLine(session);
    }
  }
  console.log();
}

function printSessionLine(session: SessionInfo): void {
  const label = domainLabel(session.domain).padEnd(16);

  if (!session.active) {
    const isExpired = session.warning?.toLowerCase().includes('expired');
    if (isExpired) {
      console.log(`  ${label} ${chalk.red('expired')}`);
      console.log(`  ${' '.repeat(16)} ${chalk.dim('Run: openbrowser login')}`);
    } else {
      console.log(`  ${label} ${chalk.red('not logged in')}`);
    }
    return;
  }

  let expiry = '';
  if (session.expiresInDays !== undefined) {
    const days = session.expiresInDays;
    const text = `expires in ${days} day${days === 1 ? '' : 's'}`;
    if (days <= 3) {
      expiry = chalk.red(text);
    } else if (days <= 7) {
      expiry = chalk.yellow(text);
    } else {
      expiry = chalk.dim(text);
    }
  }

  if (session.warning) {
    console.log(`  ${label} ${chalk.yellow('logged in')}     ${expiry}`);
    console.log(`  ${' '.repeat(16)} ${chalk.yellow(session.warning)}`);
  } else {
    console.log(`  ${label} ${chalk.green('logged in')}     ${expiry}`);
  }
}

function printSetupText(output: CommandOutput<SetupData>): void {
  if (!output.success || !output.data) {
    console.log();
    console.log(chalk.red(`Error: ${humanizeError(output.error ?? output.summary)}`));
    console.log();
    return;
  }
  const { data } = output;

  console.log();
  console.log(chalk.bold('Setup complete. Your AI can now browse as you.'));
  console.log();

  // Step 1: Browser ready
  if (data.autoStarted) {
    console.log(`  ${chalk.green('1.')} Browser installed and running`);
  } else {
    console.log(`  ${chalk.yellow('1.')} Browser installed but could not start automatically.`);
    console.log(`     Run: ${chalk.green('openbrowser start')}`);
  }
  console.log();

  // Step 2: Log in
  console.log(`  ${chalk.bold('2.')} Log into your accounts`);
  console.log(`     Run: ${chalk.green('openbrowser login')}`);
  console.log();

  // Step 3: Connect AI tool
  if (data.mcpAutoInstalled) {
    const toolName = data.mcpAutoInstalled === 'claude-desktop' ? 'Claude Desktop' : 'Cursor';
    console.log(`  ${chalk.green('3.')} Connected to ${toolName} automatically`);
  } else if (data.mcpAlreadyConfigured) {
    const toolName = data.mcpAlreadyConfigured === 'claude-desktop' ? 'Claude Desktop' : 'Cursor';
    console.log(`  ${chalk.green('3.')} Already connected to ${toolName}`);
  } else {
    console.log(`  ${chalk.bold('3.')} Connect to your AI tool ${chalk.dim('(optional)')}`);
    console.log(`     Add this to your Claude Desktop or Cursor settings:`);
    console.log();
    console.log(chalk.dim(JSON.stringify(data.mcpConfig, null, 2)));
    console.log();
    console.log(`     ${chalk.dim('Not sure where to paste this? See: https://modelcontextprotocol.io/quickstart')}`);
  }
  console.log();
  console.log(`  ${chalk.dim('Then your AI can check email, review PRs, and more.')}`);
  console.log();
}

const CHECK_LABELS: Record<string, string> = {
  'chrome-binary': 'Browser installed',
  'profile-dir': 'Data folder',
  'stale-locks': 'Clean state',
  'port-conflict': 'No conflicts',
  'cdp-connection': 'Browser responding',
  'config': 'Settings',
  'xvfb': 'Virtual display',
  'x11vnc': 'Remote login',
};

function humanizeCheckName(name: string): string {
  if (CHECK_LABELS[name]) return CHECK_LABELS[name];
  // session-google.com -> Google session
  if (name.startsWith('session-')) {
    const domain = name.replace('session-', '');
    return `${domainLabel(domain)} session`;
  }
  return name;
}

function printDoctorText(output: CommandOutput<DoctorData>): void {
  const { data } = output;

  const passes = data.checks.filter((c) => c.status === 'pass');
  const fails = data.checks.filter((c) => c.status === 'fail');
  const warns = data.checks.filter((c) => c.status === 'warn');

  console.log();
  console.log(chalk.bold('OpenBrowser Doctor'));
  console.log();

  // Summary line
  const parts: string[] = [];
  parts.push(chalk.green(`${passes.length} passed`));
  if (fails.length > 0) parts.push(chalk.red(`${fails.length} failed`));
  if (warns.length > 0) parts.push(chalk.yellow(`${warns.length} warning${warns.length === 1 ? '' : 's'}`));
  console.log(`  ${parts.join(', ')}`);
  console.log();

  // Failures expanded
  for (const check of fails) {
    console.log(`  ${chalk.red('FAIL')}  ${humanizeCheckName(check.name)}`);
    console.log(`        ${check.message}`);
    if (check.fix) {
      console.log(`        Fix: ${check.fix}`);
    }
    console.log();
  }

  // Warnings expanded
  for (const check of warns) {
    console.log(`  ${chalk.yellow('WARN')}  ${humanizeCheckName(check.name)}`);
    console.log(`        ${check.message}`);
    if (check.fix) {
      console.log(`        Fix: ${check.fix}`);
    }
    console.log();
  }

  // Passes collapsed
  if (passes.length > 0) {
    if (fails.length > 0 || warns.length > 0) {
      console.log(chalk.dim('  ---'));
    }
    const passNames = passes.map((c) => humanizeCheckName(c.name)).join(', ');
    console.log(`  ${chalk.green('PASS')}  ${passNames}`);
    console.log();
  }
}

const RECIPE_CATEGORIES: Record<string, string[]> = {
  'GitHub': ['prs', 'issues', 'notifications'],
  'Google': ['inbox', 'calendar', 'search'],
  'LinkedIn': ['linkedin', 'profile', 'messages'],
};

function printRecipeListText(output: CommandOutput<RecipeListItem[]>): void {
  console.log();
  console.log(chalk.bold('What Your AI Can Do'));

  const recipeMap = new Map(output.data.map((r) => [r.name, r]));

  for (const [category, names] of Object.entries(RECIPE_CATEGORIES)) {
    console.log();
    console.log(`  ${chalk.bold(category)}`);
    for (const name of names) {
      const recipe = recipeMap.get(name);
      if (!recipe) continue;
      console.log(`    ${chalk.green(name.padEnd(16))} ${recipe.description}`);
      recipeMap.delete(name);
    }
  }

  // Any uncategorized recipes
  if (recipeMap.size > 0) {
    console.log();
    console.log(`  ${chalk.bold('Other')}`);
    for (const recipe of recipeMap.values()) {
      console.log(`    ${chalk.green(recipe.name.padEnd(16))} ${recipe.description}`);
    }
  }

  console.log();
  console.log(`  ${chalk.dim('Run:')}    openbrowser prs`);
  console.log(`          openbrowser search "your search terms"`);
  console.log(`  ${chalk.dim('Via MCP: Your AI tool runs these automatically')}`);
  console.log();
}

function printSessionsText(output: CommandOutput<SessionInfo[]>): void {
  console.log();
  console.log(chalk.bold('Connected Accounts'));
  console.log();
  if (output.data.length === 0) {
    console.log('  No accounts connected.');
  } else {
    for (const session of output.data) {
      printSessionLine(session);
    }
  }
  console.log();
}

function printDomainListText(output: CommandOutput<AuthCookieSpec[]>): void {
  console.log();
  console.log(chalk.bold('Tracked Accounts'));
  console.log();
  const builtInDomains = AUTH_COOKIE_SPECS.map((s) => s.domain);
  for (const spec of output.data) {
    const isBuiltIn = builtInDomains.includes(spec.domain);
    const label = spec.label ?? spec.domain;
    if (isBuiltIn) {
      console.log(`  ${chalk.green(label.padEnd(20))} ${chalk.dim(spec.domain)}`);
    } else {
      console.log(`  ${chalk.green(label.padEnd(20))} ${chalk.dim(spec.domain)} ${chalk.cyan('(custom)')}`);
    }
  }
  console.log();
}

function printActionText(output: CommandOutput<unknown>): void {
  console.log();
  if (output.success) {
    console.log(chalk.green(output.summary));
  } else {
    console.log(chalk.red(`Error: ${humanizeError(output.error ?? output.summary)}`));
  }
  console.log();
}

export interface WelcomeStatus {
  chromeRunning: boolean;
  sessions: SessionInfo[];
}

export function printWelcome(version: string, status?: WelcomeStatus): void {
  console.log();
  console.log(chalk.bold(`OpenBrowser v${version}`));
  console.log();

  if (!status) {
    console.log(`  Not set up yet.`);
    console.log();
    console.log(`  Run ${chalk.green('openbrowser setup')} to get started (~2 min)`);
    console.log();
    console.log(`  Once set up, AI tools like Claude and Cursor`);
    console.log(`  can check email, review PRs, read LinkedIn,`);
    console.log(`  search Google, and more.`);
    console.log();
    return;
  }

  console.log(`  Browser           ${status.chromeRunning ? chalk.green('running') : chalk.red('not running')}`);

  let firstNotLoggedIn: string | undefined;
  for (const session of status.sessions) {
    const label = domainLabel(session.domain).padEnd(18);
    if (session.active) {
      let expiry = '';
      if (session.expiresInDays !== undefined) {
        expiry = ` (expires in ${session.expiresInDays} day${session.expiresInDays === 1 ? '' : 's'})`;
      }
      console.log(`  ${label} ${chalk.green('logged in')}${chalk.dim(expiry)}`);
    } else {
      console.log(`  ${label} ${chalk.red('not logged in')}`);
      if (!firstNotLoggedIn) firstNotLoggedIn = domainLabel(session.domain);
    }
  }

  console.log();

  if (!status.chromeRunning) {
    console.log(`  Next: ${chalk.green('openbrowser start')}   Start the browser`);
  } else if (firstNotLoggedIn) {
    console.log(`  Next: ${chalk.green('openbrowser login')}   Log into ${firstNotLoggedIn}`);
  } else if (status.sessions.length > 0) {
    console.log(`  ${chalk.green('Ready.')} Try any of these:`);
    console.log();
    console.log(`    ${chalk.green('openbrowser inbox')}          Read your unread emails`);
    console.log(`    ${chalk.green('openbrowser prs')}            Check your open pull requests`);
    console.log(`    ${chalk.green('openbrowser calendar')}       See today's meetings and events`);
    console.log(`    ${chalk.green('openbrowser search "..."')}   Search Google as you`);
    console.log();
    console.log(`  ${chalk.dim('openbrowser recipe list')}  See all 9 recipes`);
  }

  console.log();
}

function printRecipeResultText(output: CommandOutput<unknown>): void {
  console.log();

  if (!output.success) {
    console.log(chalk.red(`Error: ${humanizeError(output.error ?? output.summary)}`));
    console.log();
    return;
  }

  const recipeName = output.command.replace('recipe:', '');
  console.log(chalk.bold(recipeName));
  console.log(chalk.dim(output.summary));
  console.log();

  const data = output.data as Record<string, unknown>;
  if (!data) return;

  // Format based on recipe type
  if (recipeName === 'prs' && Array.isArray(data.prs)) {
    for (const pr of data.prs as Array<Record<string, string>>) {
      console.log(`  ${chalk.green(pr.repo ?? '')} ${pr.title}`);
      if (pr.updatedAt) console.log(`    ${chalk.dim(pr.updatedAt)}`);
    }
  } else if (recipeName === 'inbox' && Array.isArray(data.messages)) {
    for (const msg of data.messages as Array<Record<string, string>>) {
      console.log(`  ${chalk.green(msg.from ?? '')} ${msg.subject}`);
      if (msg.snippet) console.log(`    ${chalk.dim(msg.snippet)}`);
    }
  } else if (recipeName === 'linkedin' && Array.isArray(data.notifications)) {
    for (const n of data.notifications as Array<Record<string, string>>) {
      console.log(`  ${n.text}`);
      if (n.time) console.log(`    ${chalk.dim(n.time)}`);
    }
  } else if (recipeName === 'search' && Array.isArray(data.results)) {
    for (const r of data.results as Array<Record<string, string>>) {
      console.log(`  ${chalk.green(r.title)}`);
      console.log(`    ${chalk.blue(r.url)}`);
      if (r.snippet) console.log(`    ${chalk.dim(r.snippet)}`);
      console.log();
    }
  } else if (recipeName === 'issues' && Array.isArray(data.issues)) {
    for (const issue of data.issues as Array<Record<string, unknown>>) {
      const labels = Array.isArray(issue.labels) ? (issue.labels as string[]).join(', ') : '';
      console.log(`  ${chalk.green((issue.repo as string) ?? '')} ${(issue.title as string) ?? ''}`);
      if (labels) console.log(`    ${chalk.dim(labels)}`);
    }
  } else if (recipeName === 'notifications' && Array.isArray(data.notifications)) {
    for (const n of data.notifications as Array<Record<string, string>>) {
      console.log(`  ${chalk.green(n.repo ?? '')} ${n.title}`);
      if (n.reason) console.log(`    ${chalk.dim(n.reason)}`);
    }
  } else if (recipeName === 'calendar' && Array.isArray(data.events)) {
    for (const event of data.events as Array<Record<string, unknown>>) {
      const time = event.allDay ? chalk.dim('all day') : chalk.dim(`${event.startTime} - ${event.endTime}`);
      console.log(`  ${time}  ${(event.title as string) ?? ''}`);
      if (event.location) console.log(`    ${chalk.dim(event.location as string)}`);
    }
  } else if (recipeName === 'profile') {
    console.log(`  ${chalk.green(data.name as string ?? '')}`);
    if (data.headline) console.log(`  ${data.headline as string}`);
    if (data.location) console.log(`  ${chalk.dim(data.location as string)}`);
    if (data.connections) console.log(`  ${chalk.dim(`${data.connections} connections`)}`);
  } else if (recipeName === 'messages' && Array.isArray(data.conversations)) {
    for (const msg of data.conversations as Array<Record<string, unknown>>) {
      const unread = msg.unread ? chalk.yellow('[unread]') : '';
      console.log(`  ${chalk.green(msg.name as string ?? '')} ${unread}`);
      if (msg.lastMessage) console.log(`    ${chalk.dim(msg.lastMessage as string)}`);
      if (msg.time) console.log(`    ${chalk.dim(msg.time as string)}`);
    }
  } else {
    console.log(`  ${output.summary}`);
  }
  console.log();
}
