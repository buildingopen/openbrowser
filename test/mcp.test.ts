import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_COUNT } from '../dist/mcp/server.js';

describe('MCP server', () => {
  it('exports expected tool count', () => {
    assert.equal(TOOL_COUNT, 28);
  });

  it('tool count matches specification (5 session + 14 browser + 9 recipe)', () => {
    assert.equal(TOOL_COUNT, 5 + 14 + 9);
  });
});
