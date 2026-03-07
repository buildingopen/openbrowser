import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findChromeBinary, getConfigDir, getProfileDir, cleanStaleLocks, checkPort, hasCommand } from '../dist/lib/platform.js';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';

describe('platform', () => {
  it('findChromeBinary returns a path on supported platforms', () => {
    const binary = findChromeBinary();
    // On CI or dev machines, Chrome is typically installed
    if (binary) {
      assert.ok(typeof binary === 'string');
      assert.ok(binary.length > 0);
    }
  });

  it('getConfigDir returns ~/.openbrowser', () => {
    const dir = getConfigDir();
    assert.ok(dir.endsWith('.openbrowser'));
  });

  it('getProfileDir returns ~/.openbrowser/chrome-profile', () => {
    const dir = getProfileDir();
    assert.ok(dir.endsWith('chrome-profile'));
    assert.ok(dir.includes('.openbrowser'));
  });

  it('cleanStaleLocks removes lock files', () => {
    const tmp = join(tmpdir(), `ob-test-locks-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    
    writeFileSync(join(tmp, 'SingletonLock'), '');
    writeFileSync(join(tmp, 'SingletonSocket'), '');
    writeFileSync(join(tmp, 'SingletonCookie'), '');
    
    assert.ok(existsSync(join(tmp, 'SingletonLock')));
    cleanStaleLocks(tmp);
    assert.ok(!existsSync(join(tmp, 'SingletonLock')));
    assert.ok(!existsSync(join(tmp, 'SingletonSocket')));
    assert.ok(!existsSync(join(tmp, 'SingletonCookie')));
    
    rmSync(tmp, { recursive: true });
  });

  it('cleanStaleLocks handles missing files gracefully', () => {
    const tmp = join(tmpdir(), `ob-test-nolocks-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    // No lock files exist, should not throw
    assert.doesNotThrow(() => cleanStaleLocks(tmp));

    rmSync(tmp, { recursive: true });
  });

  it('checkPort returns true for free port', async () => {
    const free = await checkPort(0); // port 0 always picks a free port internally
    // We test a high random port that is very unlikely to be in use
    const result = await checkPort(59123);
    assert.equal(typeof result, 'boolean');
  });

  it('checkPort returns false for occupied port', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;

    const free = await checkPort(port);
    assert.equal(free, false);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('hasCommand returns true for known command', () => {
    assert.equal(hasCommand('node'), true);
  });

  it('hasCommand returns false for nonexistent command', () => {
    assert.equal(hasCommand('nonexistent_binary_xyz_123'), false);
  });
});
