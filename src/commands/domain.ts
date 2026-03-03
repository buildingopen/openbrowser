import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';
import { AUTH_COOKIE_SPECS } from '../lib/types.js';

export async function domainAddCommand(
  domain: string,
  cookies: string[],
  options: { format?: string; profile?: string; label?: string },
): Promise<void> {
  if (cookies.length === 0) {
    const output = createOutput('domain:add', null, 'At least one cookie name is required', false, 'At least one cookie name is required');
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
    return;
  }
  const builtIn = AUTH_COOKIE_SPECS.some((s) => s.domain === domain);
  if (builtIn) {
    const output = createOutput('domain:add', null, `Cannot override built-in domain: ${domain}`, false, `Cannot override built-in domain: ${domain}`);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
    return;
  }
  const ob = new OpenBrowser({ profileDir: options.profile });
  ob.addDomain(domain, cookies, options.label);
  const summary = `Added ${domain} (cookies: ${cookies.join(', ')})`;
  const output = createOutput('domain:add', { domain, cookies, label: options.label ?? domain }, summary);
  printOutput(output, resolveFormat(options.format));
}

export async function domainRemoveCommand(
  domain: string,
  options: { format?: string; profile?: string },
): Promise<void> {
  const builtIn = AUTH_COOKIE_SPECS.some((s) => s.domain === domain);
  if (builtIn) {
    const output = createOutput('domain:remove', null, `Cannot remove built-in domain: ${domain}`, false, `Cannot remove built-in domain: ${domain}`);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
    return;
  }
  const ob = new OpenBrowser({ profileDir: options.profile });
  const removed = ob.removeDomain(domain);
  if (!removed) {
    const output = createOutput('domain:remove', null, `Custom domain not found: ${domain}`, false, `Custom domain not found: ${domain}`);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
    return;
  }
  const output = createOutput('domain:remove', { domain }, `Removed ${domain}`);
  printOutput(output, resolveFormat(options.format));
}

export async function domainListCommand(options: { format?: string; profile?: string }): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  const domains = ob.listDomains();
  const builtIn = AUTH_COOKIE_SPECS.map((s) => s.domain);
  const custom = domains.filter((d) => !builtIn.includes(d.domain));
  const summary = `${domains.length} domains tracked (${builtIn.length} built-in, ${custom.length} custom)`;
  const output = createOutput('domain:list', domains, summary);
  printOutput(output, resolveFormat(options.format));
}
