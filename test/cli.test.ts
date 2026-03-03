import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'dist', 'index.js');

describe('CLI', () => {
  it('--version outputs semver', () => {
    const out = execSync(`node ${CLI} --version`, { encoding: 'utf-8' }).trim();
    assert.match(out, /^\d+\.\d+\.\d+$/);
  });

  it('--help shows all commands', () => {
    const out = execSync(`node ${CLI} --help`, { encoding: 'utf-8' });
    assert.ok(out.includes('setup'));
    assert.ok(out.includes('login'));
    assert.ok(out.includes('status'));
    assert.ok(out.includes('doctor'));
    assert.ok(out.includes('start'));
    assert.ok(out.includes('stop'));
    assert.ok(out.includes('restart'));
    assert.ok(out.includes('sessions'));
    assert.ok(out.includes('domain'));
    assert.ok(out.includes('mcp'));
    assert.ok(out.includes('recipe'));
  });

  it('status --format json returns valid JSON with envelope', () => {
    const out = execSync(`node ${CLI} status --format json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.command, 'status');
    assert.ok(parsed.timestamp);
    assert.ok(parsed.version);
    assert.ok(typeof parsed.success === 'boolean');
    assert.ok(parsed.data);
    assert.ok(typeof parsed.data.chrome === 'object');
    assert.ok(Array.isArray(parsed.data.sessions));
  });

  it('doctor --format json returns valid JSON with checks', () => {
    // doctor may exit 1 if checks fail, use try/catch
    try {
      const out = execSync(`node ${CLI} doctor --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'doctor');
      assert.ok(Array.isArray(parsed.data.checks));
    } catch (err: unknown) {
      // Exit code 1 is expected if health checks fail
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      const parsed = JSON.parse(out);
      assert.equal(parsed.command, 'doctor');
      assert.ok(Array.isArray(parsed.data.checks));
    }
  });

  it('doctor checks have name, status, and message', () => {
    try {
      const out = execSync(`node ${CLI} doctor --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      for (const check of parsed.data.checks) {
        assert.ok(check.name);
        assert.ok(['pass', 'fail', 'warn'].includes(check.status));
        assert.ok(check.message);
      }
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      const parsed = JSON.parse(out);
      for (const check of parsed.data.checks) {
        assert.ok(check.name);
        assert.ok(['pass', 'fail', 'warn'].includes(check.status));
        assert.ok(check.message);
      }
    }
  });

  it('failed doctor checks include fix suggestions', () => {
    try {
      const out = execSync(`node ${CLI} doctor --format json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out);
      const fails = parsed.data.checks.filter((c: { status: string }) => c.status === 'fail');
      for (const fail of fails) {
        assert.ok(fail.fix, `Check "${fail.name}" failed but has no fix suggestion`);
      }
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer };
      const out = e.stdout?.toString() ?? '';
      const parsed = JSON.parse(out);
      const fails = parsed.data.checks.filter((c: { status: string }) => c.status === 'fail');
      for (const fail of fails) {
        assert.ok(fail.fix, `Check "${fail.name}" failed but has no fix suggestion`);
      }
    }
  });

  it('recipe list --format json shows 9 recipes', () => {
    const out = execSync(`node ${CLI} recipe list --format json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.command, 'recipe:list');
    assert.equal(parsed.data.length, 9);
    const names = parsed.data.map((r: { name: string }) => r.name);
    assert.ok(names.includes('prs'));
    assert.ok(names.includes('calendar'));
    assert.ok(names.includes('messages'));
  });

  it('Windows platform guard exits with message', () => {
    try {
      execSync(
        `node --input-type=module -e 'Object.defineProperty(process, "platform", { value: "win32" }); const { assertSupportedPlatform } = await import("${CLI.replace('/index.js', '/lib/platform.js')}"); assertSupportedPlatform();'`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
      assert.fail('Should have exited');
    } catch (err: unknown) {
      const e = err as { stderr?: string; status?: number };
      assert.ok(e.stderr?.includes('macOS and Linux only'));
      assert.equal(e.status, 1);
    }
  });
});
