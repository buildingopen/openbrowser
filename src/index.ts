#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupportedPlatform } from './lib/platform.js';
import { setupCommand } from './commands/setup.js';
import { loginCommand } from './commands/login.js';
import { statusCommand } from './commands/status.js';
import { doctorCommand } from './commands/doctor.js';
import { recipeListCommand, recipeRunCommand } from './commands/recipe.js';
import { startCommand, stopCommand, restartCommand } from './commands/service.js';
import { sessionsCommand } from './commands/sessions.js';
import { domainAddCommand, domainRemoveCommand, domainListCommand } from './commands/domain.js';
import { mcpCommand } from './commands/mcp.js';
import { welcomeCommand } from './commands/welcome.js';

assertSupportedPlatform();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
);

const program = new Command();

program
  .name('openbrowser')
  .description('Give AI your browser')
  .version(pkg.version)
  .option('--profile <path>', 'Browser profile directory');

program
  .command('setup')
  .description('Set up OpenBrowser (~2 min, one time only)')
  .option('--profile <path>', 'Use an existing browser profile directory')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { profile?: string; format?: string }) => {
    const globalProfile = program.opts().profile;
    await setupCommand({ profile: options.profile ?? globalProfile, format: options.format });
  });

program
  .command('login')
  .description('Log into your accounts')
  .action(async () => {
    await loginCommand({ profile: program.opts().profile });
  });

program
  .command('status')
  .description('See which accounts are connected')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await statusCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('start')
  .description('Start the browser')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await startCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('stop')
  .description('Stop the browser')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await stopCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('restart')
  .description('Restart the browser')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await restartCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('doctor')
  .description('Diagnose connection issues')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await doctorCommand({ ...options, profile: program.opts().profile });
  });

// ── Top-level recipe shortcuts ───────────────────────────────────
// These are the primary UX: openbrowser inbox, openbrowser prs, etc.
// Hidden from --help (shown in custom help text below).
const shortcuts = [
  { cmd: 'inbox', desc: 'Read your unread emails' },
  { cmd: 'prs', desc: 'Check your open pull requests' },
  { cmd: 'calendar', desc: "See today's meetings and events" },
  { cmd: 'issues', desc: 'Check issues assigned to you' },
  { cmd: 'notifications', desc: 'Read your GitHub notifications' },
  { cmd: 'linkedin', desc: 'See your LinkedIn notifications' },
  { cmd: 'profile', desc: 'Get your LinkedIn profile' },
  { cmd: 'messages', desc: 'Read your LinkedIn messages' },
];

for (const { cmd, desc } of shortcuts) {
  program
    .command(cmd, { hidden: true })
    .description(desc)
    .option('--format <format>', 'Output format: json or text')
    .action(async (options: { format?: string }) => {
      await recipeRunCommand(cmd, { ...options, profile: program.opts().profile });
    });
}

// Search with natural positional query: openbrowser search "AI frameworks"
program
  .command('search', { hidden: true })
  .description('Search Google as you')
  .argument('[query...]', 'Search query')
  .option('--format <format>', 'Output format: json or text')
  .action(async (queryParts: string[], options: { format?: string }) => {
    const query = queryParts.join(' ');
    if (!query) {
      console.error('Usage: openbrowser search "your query"');
      process.exitCode = 1;
      return;
    }
    await recipeRunCommand('search', {
      ...options,
      profile: program.opts().profile,
      arg: [`query=${query}`],
    });
  });

// ── Power-user commands (hidden from --help) ─────────────────────
program
  .command('sessions', { hidden: true })
  .description('List active sessions')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await sessionsCommand({ ...options, profile: program.opts().profile });
  });

const domainCmd = program
  .command('domain', { hidden: true })
  .description('Add more accounts to track');

domainCmd
  .command('add <domain> <cookies...>')
  .description('Track a new account (advanced)')
  .option('--label <label>', 'Human-readable label for the domain')
  .option('--format <format>', 'Output format: json or text')
  .action(async (domain: string, cookies: string[], options: { label?: string; format?: string }) => {
    await domainAddCommand(domain, cookies, { ...options, profile: program.opts().profile });
  });

domainCmd
  .command('remove <domain>')
  .description('Stop tracking an account')
  .option('--format <format>', 'Output format: json or text')
  .action(async (domain: string, options: { format?: string }) => {
    await domainRemoveCommand(domain, { ...options, profile: program.opts().profile });
  });

domainCmd
  .command('list')
  .description('Show all tracked accounts')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await domainListCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('mcp', { hidden: true })
  .description('Connect to AI tools (Claude, Cursor, etc.)')
  .action(async () => {
    if (process.stdout.isTTY) {
      process.stderr.write(
        'MCP server starting on stdio. This is meant to be called by AI tools, not run directly.\n' +
        'To set up MCP, run: openbrowser setup\n\n',
      );
    }
    await mcpCommand({ profile: program.opts().profile });
  });

// ── Recipe subcommand (hidden, shortcuts replace it) ─────────────
const recipeCmd = program
  .command('recipe', { hidden: true })
  .description('Things your AI can do (email, PRs, calendar, ...)');

recipeCmd
  .command('list')
  .description('See what your AI can do')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await recipeListCommand({ ...options, profile: program.opts().profile });
  });

recipeCmd
  .command('run <name>')
  .description('Run a recipe')
  .option('--format <format>', 'Output format: json or text')
  .option('--arg <args...>', 'Recipe arguments as key=value pairs')
  .action(async (name: string, options: { format?: string; arg?: string[] }) => {
    await recipeRunCommand(name, { ...options, profile: program.opts().profile });
  });

// ── Custom help text ─────────────────────────────────────────────
program.addHelpText('after', `
Quick commands:
  openbrowser inbox          Read your unread emails
  openbrowser prs            Check your open pull requests
  openbrowser calendar       See today's meetings and events
  openbrowser search "..."   Search Google as you

  openbrowser recipe list    See all 9 recipes
  openbrowser mcp            Connect to Claude, Cursor, etc.
`);

// Show welcome screen when no subcommand given
program.action(async () => {
  await welcomeCommand(pkg.version);
});

await program.parseAsync();
