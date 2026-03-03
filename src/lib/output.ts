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
    default:
      console.log(output.summary);
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
