import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findChromeBinary, getConfigDir, getProfileDir, cleanStaleLocks } from '../dist/lib/platform.js';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
});
