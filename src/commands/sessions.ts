import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function sessionsCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  try {
    const sessions = await ob.listSessions();
    const active = sessions.filter((s) => s.active).length;
    const summary = `${active}/${sessions.length} sessions active`;
    const output = createOutput('sessions', sessions, summary);
    printOutput(output, resolveFormat(options.format));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = createOutput('sessions', [], message, false, message);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
  }
}
