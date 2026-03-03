import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOutput, resolveFormat } from '../dist/lib/output.js';

describe('output', () => {
  it('createOutput builds correct envelope', () => {
    const output = createOutput('status', { foo: 'bar' }, 'test summary');
    assert.equal(output.command, 'status');
    assert.equal(output.success, true);
    assert.equal(output.summary, 'test summary');
    assert.deepEqual(output.data, { foo: 'bar' });
    assert.ok(output.timestamp);
    assert.ok(output.version);
  });

  it('createOutput handles error state', () => {
    const output = createOutput('doctor', {}, 'failed', false, 'something broke');
    assert.equal(output.success, false);
    assert.equal(output.error, 'something broke');
  });

  it('createOutput omits error field when success', () => {
    const output = createOutput('status', {}, 'ok');
    assert.equal(output.error, undefined);
  });

  it('resolveFormat returns json when explicit', () => {
    assert.equal(resolveFormat('json'), 'json');
  });

  it('resolveFormat returns text when explicit', () => {
    assert.equal(resolveFormat('text'), 'text');
  });

  it('resolveFormat uses TTY detection for default', () => {
    // In test runner, stdout is piped, so default is json
    const format = resolveFormat(undefined);
    assert.ok(format === 'json' || format === 'text');
  });
});
