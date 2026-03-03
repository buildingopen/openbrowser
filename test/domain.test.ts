import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { AUTH_COOKIE_SPECS } from '../dist/lib/types.js';
import { OpenBrowser } from '../dist/lib/core.js';

const CLI = join(import.meta.dirname, '..', 'dist', 'index.js');

describe('domain management', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      if (existsSync(d)) rmSync(d, { recursive: true });
    }
    tmpDirs.length = 0;
  });

  function makeTmp(): { dir: string; configPath: string } {
    const dir = join(tmpdir(), `ob-test-domain-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    tmpDirs.push(dir);
    return { dir, configPath: join(dir, 'config.json') };
  }

  it('domain list --format json shows built-in domains', () => {
    const out = execSync(`node ${CLI} domain list --format json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.command, 'domain:list');
    assert.equal(parsed.success, true);
    assert.ok(parsed.data.length >= 3);
    const domains = parsed.data.map((d: { domain: string }) => d.domain);
    assert.ok(domains.includes('google.com'));
    assert.ok(domains.includes('github.com'));
    assert.ok(domains.includes('linkedin.com'));
  });

  it('domain add persists to config file', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({ cdpPort: 9222, profileDir: dir }));

    const ob = new OpenBrowser({ configPath, profileDir: dir });
    ob.addDomain('slack.com', ['d', 'lc'], 'Slack');

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.ok(config.customDomains);
    assert.equal(config.customDomains.length, 1);
    assert.equal(config.customDomains[0].domain, 'slack.com');
    assert.deepEqual(config.customDomains[0].requiredCookies, ['d', 'lc']);
    assert.equal(config.customDomains[0].label, 'Slack');
  });

  it('domain remove deletes from config', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({
      cdpPort: 9222,
      profileDir: dir,
      customDomains: [{ domain: 'slack.com', requiredCookies: ['d'], label: 'Slack' }],
    }));

    const ob = new OpenBrowser({ configPath, profileDir: dir });
    const removed = ob.removeDomain('slack.com');
    assert.equal(removed, true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.equal(config.customDomains, undefined);
  });

  it('domain remove returns false for unknown domain', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({ cdpPort: 9222, profileDir: dir }));

    const ob = new OpenBrowser({ configPath, profileDir: dir });
    const removed = ob.removeDomain('nonexistent.com');
    assert.equal(removed, false);
  });

  it('custom domains merge with built-in specs', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({
      cdpPort: 9222,
      profileDir: dir,
      customDomains: [{ domain: 'slack.com', requiredCookies: ['d'], label: 'Slack' }],
    }));

    const ob = new OpenBrowser({ configPath, profileDir: dir });
    const domains = ob.listDomains();
    assert.equal(domains.length, 4); // 3 built-in + 1 custom
    const domainNames = domains.map((d) => d.domain);
    assert.ok(domainNames.includes('slack.com'));
    assert.ok(domainNames.includes('google.com'));
  });

  it('cannot remove built-in domain via CLI', () => {
    try {
      execSync(`node ${CLI} domain remove google.com --format json`, { encoding: 'utf-8' });
      assert.fail('Should have failed');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      const parsed = JSON.parse(out);
      assert.equal(parsed.success, false);
      assert.ok(parsed.error?.includes('built-in'));
    }
  });

  it('cannot add built-in domain via CLI', () => {
    try {
      execSync(`node ${CLI} domain add google.com SID HSID --format json`, { encoding: 'utf-8' });
      assert.fail('Should have failed');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      assert.ok(out, 'expected stdout output on error');
      const parsed = JSON.parse(out);
      assert.equal(parsed.success, false);
      assert.ok(parsed.error?.includes('built-in'));
    }
  });

  it('cannot add built-in domain via SDK', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({ cdpPort: 9222, profileDir: dir }));
    const ob = new OpenBrowser({ configPath, profileDir: dir });
    assert.throws(
      () => ob.addDomain('google.com', ['SID']),
      /built-in/,
    );
  });

  it('domain add updates existing custom domain', () => {
    const { dir, configPath } = makeTmp();
    writeFileSync(configPath, JSON.stringify({
      cdpPort: 9222,
      profileDir: dir,
      customDomains: [{ domain: 'slack.com', requiredCookies: ['d'], label: 'Slack' }],
    }));

    const ob = new OpenBrowser({ configPath, profileDir: dir });
    ob.addDomain('slack.com', ['d', 'lc', 'b'], 'Slack Updated');

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.equal(config.customDomains.length, 1);
    assert.deepEqual(config.customDomains[0].requiredCookies, ['d', 'lc', 'b']);
    assert.equal(config.customDomains[0].label, 'Slack Updated');
  });
});
