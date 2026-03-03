import { OpenBrowser } from '../lib/core.js';

export async function loginCommand(): Promise<void> {
  const ob = new OpenBrowser();
  await ob.login();
}
