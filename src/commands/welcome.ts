import { OpenBrowser } from '../lib/core.js';
import { printWelcome } from '../lib/output.js';
import { existsSync } from 'node:fs';
import { getConfigDir } from '../lib/platform.js';

export async function welcomeCommand(version: string): Promise<void> {
  const configExists = existsSync(`${getConfigDir()}/config.json`);

  if (!configExists) {
    printWelcome(version);
    return;
  }

  const ob = new OpenBrowser();

  let chromeRunning = false;
  try {
    chromeRunning = await ob.isServiceRunning();
  } catch {
    // ignore
  }

  let sessions: Awaited<ReturnType<typeof ob.listSessions>> = [];
  if (chromeRunning) {
    try {
      sessions = await ob.listSessions();
    } catch {
      // ignore
    }
  }

  printWelcome(version, { chromeRunning, sessions });
}
