import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';
import type { SetupData } from '../lib/types.js';

export async function setupCommand(options?: { profile?: string; format?: string }): Promise<void> {
  const format = resolveFormat(options?.format);
  const ob = new OpenBrowser({ profileDir: options?.profile });
  try {
    if (format === 'text') process.stderr.write('Setting up... ');
    const data: SetupData = await ob.setup();
    if (format === 'text') process.stderr.write('done\n');
    const summary = data.autoStarted
      ? 'Setup complete. Browser started.'
      : 'Setup complete. Run openbrowser start to begin.';
    const output = createOutput('setup', data, summary);
    printOutput(output, format);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (format === 'text') process.stderr.write('failed\n');
    const output = createOutput('setup', null, message, false, message);
    printOutput(output, format);
    process.exitCode = 1;
  }
}
