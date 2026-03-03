import { OpenBrowser } from '../lib/core.js';

export async function loginCommand(options?: { profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options?.profile });
  await ob.login();
}
