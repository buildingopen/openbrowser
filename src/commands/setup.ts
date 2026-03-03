import { OpenBrowser } from '../lib/core.js';

export async function setupCommand(options?: { profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options?.profile });
  await ob.setup();
}
