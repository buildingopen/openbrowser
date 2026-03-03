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

assertSupportedPlatform();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
);

const program = new Command();

program
  .name('openbrowser')
  .description('Managed authenticated browser for AI agents')
  .version(pkg.version);

program
  .command('setup')
  .description('Install Chrome service and configure OpenBrowser')
  .action(async () => {
    await setupCommand();
  });

program
  .command('login')
  .description('Open Chrome GUI for manual login to websites')
  .action(async () => {
    await loginCommand();
  });

program
  .command('status')
  .description('Show Chrome status and session health')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await statusCommand(options);
  });

program
  .command('doctor')
  .description('Run diagnostics on the OpenBrowser setup')
  .option('--format <format>', 'Output format: json or text')
  .action(async (options: { format?: string }) => {
    await doctorCommand(options);
  });

await program.parseAsync();
