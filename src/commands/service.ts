import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function startCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  try {
    ob.startService();
    const output = createOutput('service:start', { action: 'start' }, 'Chrome service started');
    printOutput(output, resolveFormat(options.format));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = createOutput('service:start', null, message, false, message);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
  }
}

export async function stopCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  try {
    ob.stopService();
    const output = createOutput('service:stop', { action: 'stop' }, 'Chrome service stopped');
    printOutput(output, resolveFormat(options.format));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = createOutput('service:stop', null, message, false, message);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
  }
}

export async function restartCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  try {
    ob.restartService();
    const output = createOutput('service:restart', { action: 'restart' }, 'Chrome service restarted');
    printOutput(output, resolveFormat(options.format));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = createOutput('service:restart', null, message, false, message);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
  }
}
