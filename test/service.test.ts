import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'dist', 'index.js');

describe('service commands', () => {
  it('start --format json returns valid envelope', () => {
    // start will likely fail (no service installed), but envelope is valid
    try {
      const out = execSync(`node ${CLI} start --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:start');
      assert.ok(parsed.timestamp);
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      assert.ok(out, 'expected stdout output on error');
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:start');
    }
  });

  it('stop --format json returns valid envelope', () => {
    try {
      const out = execSync(`node ${CLI} stop --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:stop');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      assert.ok(out, 'expected stdout output on error');
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:stop');
    }
  });

  it('restart --format json returns valid envelope', () => {
    try {
      const out = execSync(`node ${CLI} restart --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:restart');
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      assert.ok(out, 'expected stdout output on error');
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'service:restart');
    }
  });

  it('--help shows start, stop, restart, sessions commands', () => {
    const out = execSync(`node ${CLI} --help`, { encoding: 'utf-8' });
    assert.ok(out.includes('start'));
    assert.ok(out.includes('stop'));
    assert.ok(out.includes('restart'));
    assert.ok(out.includes('sessions'));
  });
});
