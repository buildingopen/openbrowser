import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function doctorCommand(options: { format?: string; profile?: string }): Promise<void> {
  const format = resolveFormat(options.format);
  const ob = new OpenBrowser({ profileDir: options.profile });
  if (format === 'text') process.stderr.write('Running diagnostics...\n');
  const data = await ob.diagnose();

  const fails = data.checks.filter((c) => c.status === 'fail').length;
  const warns = data.checks.filter((c) => c.status === 'warn').length;
  const summary = data.healthy
    ? `All ${data.checks.length} checks passed`
    : `${fails} failure${fails === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`;

  const output = createOutput('doctor', data, summary, data.healthy);
  printOutput(output, format);

  if (!data.healthy) process.exitCode = 1;
}
