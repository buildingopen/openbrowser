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

assertSupportedPlatform();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
);

const program = new Command();

program
  .name('openbrowser')
  .description('Managed authenticated browser for AI agents')
  .version(pkg.version)
  .option('--profile <path>', 'Chrome profile directory to use');

program
  .command('setup')
  .description('Install Chrome service and configure OpenBrowser')
  .option('--profile <path>', 'Use an existing Chrome profile directory')
  .action(async (options: { profile?: string }) => {
    const globalProfile = program.opts().profile;
    await setupCommand({ profile: options.profile ?? globalProfile });
  });

program
  .command('login')
  .description('Open Chrome GUI for manual login to websites')
  .action(async () => {
    await loginCommand({ profile: program.opts().profile });
  });

program
  .command('status')
  .description('Show Chrome status and session health')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await statusCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('doctor')
  .description('Run diagnostics on the OpenBrowser setup')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await doctorCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('start')
  .description('Start the Chrome service')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await startCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('stop')
  .description('Stop the Chrome service')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await stopCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('restart')
  .description('Restart the Chrome service')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await restartCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('sessions')
  .description('List all tracked sessions')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await sessionsCommand({ ...options, profile: program.opts().profile });
  });

const domainCmd = program
  .command('domain')
  .description('Manage custom auth domains');

domainCmd
  .command('add <domain> <cookies...>')
  .description('Add a custom auth domain with required cookies')
  .option('--label <label>', 'Human-readable label for the domain')
  .option('--format <format>', 'Output format: json or text')
  .action(async (domain: string, cookies: string[], options: { label?: string; format?: string }) => {
    await domainAddCommand(domain, cookies, { ...options, profile: program.opts().profile });
  });

domainCmd
  .command('remove <domain>')
  .description('Remove a custom auth domain')
  .option('--format <format>', 'Output format: json or text')
  .action(async (domain: string, options: { format?: string }) => {
    await domainRemoveCommand(domain, { ...options, profile: program.opts().profile });
  });

domainCmd
  .command('list')
  .description('List all tracked domains (built-in and custom)')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await domainListCommand({ ...options, profile: program.opts().profile });
  });

program
  .command('mcp')
  .description('Start the built-in MCP server (stdio transport)')
  .action(async () => {
    await mcpCommand({ profile: program.opts().profile });
  });

const recipeCmd = program
  .command('recipe')
  .description('Run a pre-built recipe or list available recipes');

recipeCmd
  .command('list')
  .description('List available recipes')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await recipeListCommand({ ...options, profile: program.opts().profile });
  });

recipeCmd
  .command('run <name>')
  .description('Run a recipe by name')
  .option('--format <format>', 'Output format: json or text')
  .option('--arg <args...>', 'Recipe arguments as key=value pairs')
  .action(async (name: string, options: { format?: string; arg?: string[] }) => {
    await recipeRunCommand(name, { ...options, profile: program.opts().profile });
  });

await program.parseAsync();
