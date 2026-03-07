import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function statusCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  const data = await ob.getStatus();

  const loggedIn = data.sessions.filter((s) => s.active).length;
  const total = data.sessions.length;
  let summary: string;
  if (!data.chrome.running) {
    summary = 'Browser not running';
  } else if (loggedIn === total && total > 0) {
    summary = `All ${total} accounts connected`;
  } else {
    summary = `${loggedIn} of ${total} accounts connected`;
  }

  const output = createOutput('status', data, summary);
  printOutput(output, resolveFormat(options.format));
}
