import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, saveConfig } from '../dist/lib/config.js';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
  it('loadConfig returns defaults when no file exists', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    assert.equal(config.cdpPort, 9222);
    assert.equal(config.timezone, 'Europe/Berlin');
    assert.equal(config.vncPassword.length, 12); // random password, 12 chars
    assert.equal(config.vncPort, 5900);
    assert.equal(config.xvfbDisplay, ':98');
    assert.ok(config.profileDir.includes('chrome-profile'));
  });

  it('loadConfig reads and merges with defaults', () => {
    const tmp = join(tmpdir(), `ob-test-config-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const path = join(tmp, 'config.json');

    // Write partial config
    // writeFileSync imported at top
    writeFileSync(path, JSON.stringify({ cdpPort: 9333 }));

    const config = loadConfig(path);
    assert.equal(config.cdpPort, 9333);
    assert.equal(config.timezone, 'Europe/Berlin'); // default preserved

    rmSync(tmp, { recursive: true });
  });

  it('loadConfig handles corrupted JSON gracefully', () => {
    const tmp = join(tmpdir(), `ob-test-badconfig-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const path = join(tmp, 'config.json');

    // writeFileSync imported at top
    writeFileSync(path, 'not valid json{{{');

    const config = loadConfig(path);
    assert.equal(config.cdpPort, 9222); // falls back to defaults

    rmSync(tmp, { recursive: true });
  });

  it('saveConfig writes and can be re-loaded', () => {
    const tmp = join(tmpdir(), `ob-test-save-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const path = join(tmp, 'config.json');

    const config = loadConfig(); // defaults
    config.cdpPort = 9444;
    saveConfig(config, path);

    assert.ok(existsSync(path));
    const loaded = loadConfig(path);
    assert.equal(loaded.cdpPort, 9444);

    rmSync(tmp, { recursive: true });
  });
});
