import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function statusCommand(options: { format?: string }): Promise<void> {
  const ob = new OpenBrowser();
  const data = await ob.getStatus();

  const activeSessions = data.sessions.filter((s) => s.active).length;
  const warnings = data.sessions.filter((s) => s.warning).length;
  let summary = data.chrome.running
    ? `Chrome running, ${activeSessions} active session${activeSessions === 1 ? '' : 's'}`
    : 'Chrome not running';
  if (warnings > 0) summary += `, ${warnings} warning${warnings === 1 ? '' : 's'}`;

  const output = createOutput('status', data, summary);
  printOutput(output, resolveFormat(options.format));
}
