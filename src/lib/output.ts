import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CommandOutput,
  StatusData,
  SessionInfo,
  DoctorData,
} from './types.js';
import type { RecipeListItem } from '../recipes/base.js';

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
  return process.stdout.isTTY ? 'text' : 'json';
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
    default:
      if (output.command.startsWith('recipe:')) {
        printRecipeResultText(output);
      } else {
        console.log(output.summary);
      }
  }
}

function printStatusText(output: CommandOutput<StatusData>): void {
  const { data } = output;

  console.log();
  console.log(chalk.bold('Chrome'));
  if (data.chrome.running) {
    console.log(`  Status:    ${chalk.green('running')}${data.chrome.pid ? ` (pid ${data.chrome.pid})` : ''}`);
    console.log(`  Version:   ${data.chrome.version ?? 'unknown'}`);
    console.log(`  Endpoint:  ${data.chrome.endpoint ?? 'unknown'}`);
  } else {
    console.log(`  Status:    ${chalk.red('not running')}`);
  }
  console.log(`  Profile:   ${data.profile}`);

  console.log();
  console.log(chalk.bold('Sessions'));
  if (data.sessions.length === 0) {
    console.log('  No tracked sessions.');
  } else {
    for (const session of data.sessions) {
      printSessionLine(session);
    }
  }
  console.log();
}

function printSessionLine(session: SessionInfo): void {
  const domain = session.domain.padEnd(16);
  if (!session.active) {
    const reason = session.warning ?? 'inactive';
    console.log(`  ${domain} ${chalk.red('inactive')}  ${chalk.dim(reason)}`);
    return;
  }

  let expiry = '';
  if (session.expiresInDays !== undefined) {
    expiry = `expires in ${session.expiresInDays} day${session.expiresInDays === 1 ? '' : 's'}`;
  }

  if (session.warning) {
    console.log(`  ${domain} ${chalk.yellow('active')}    ${expiry}  ${chalk.yellow('[!]')}`);
  } else {
    console.log(`  ${domain} ${chalk.green('active')}    ${expiry}`);
  }
}

function printDoctorText(output: CommandOutput<DoctorData>): void {
  const { data } = output;

  console.log();
  console.log(chalk.bold('OpenBrowser Doctor'));
  console.log();

  for (const check of data.checks) {
    const icon =
      check.status === 'pass'
        ? chalk.green('PASS')
        : check.status === 'warn'
          ? chalk.yellow('WARN')
          : chalk.red('FAIL');

    console.log(`  ${icon}  ${check.name}: ${check.message}`);
    if (check.fix) {
      console.log(`         ${chalk.dim('Fix:')} ${check.fix}`);
    }
  }

  console.log();
  if (data.healthy) {
    console.log(chalk.green('All checks passed.'));
  } else {
    const fails = data.checks.filter((c) => c.status === 'fail').length;
    const warns = data.checks.filter((c) => c.status === 'warn').length;
    console.log(
      chalk.red(
        `${fails} failure${fails === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`,
      ),
    );
  }
  console.log();
}

function printRecipeListText(output: CommandOutput<RecipeListItem[]>): void {
  console.log();
  console.log(chalk.bold('Available Recipes'));
  console.log();

  for (const recipe of output.data) {
    console.log(`  ${chalk.green(recipe.name.padEnd(12))} ${recipe.description}`);
    console.log(`  ${' '.repeat(12)} ${chalk.dim(`requires: ${recipe.requires.join(', ')}`)}`);
    if (recipe.args && recipe.args.length > 0) {
      for (const arg of recipe.args) {
        const req = arg.required ? chalk.yellow('(required)') : chalk.dim('(optional)');
        console.log(`  ${' '.repeat(12)} ${chalk.dim(`--arg ${arg.name}=...`)} ${req} ${chalk.dim(arg.description)}`);
      }
    }
    console.log();
  }
}

function printRecipeResultText(output: CommandOutput<unknown>): void {
  console.log();

  if (!output.success) {
    console.log(chalk.red(`Error: ${output.error ?? output.summary}`));
    console.log();
    return;
  }

  const recipeName = output.command.replace('recipe:', '');
  console.log(chalk.bold(`Recipe: ${recipeName}`));
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
  } else {
    // Generic: just print the summary
    console.log(`  ${output.summary}`);
  }
  console.log();
}
