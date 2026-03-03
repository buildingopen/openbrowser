import { OpenBrowser } from '../lib/core.js';

export async function setupCommand(): Promise<void> {
  const ob = new OpenBrowser();
  await ob.setup();
}
