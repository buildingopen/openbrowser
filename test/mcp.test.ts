import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_COUNT, TOOL_DEFS, validateUrl, validateUrlWithDns, isPrivateHost, getToolCategory } from '../dist/mcp/server.js';

describe('MCP server', () => {
  it('exports expected tool count', () => {
    assert.equal(TOOL_COUNT, 31);
  });

  it('tool count matches specification (5 session + 14 browser + 11 recipe + 1 setup)', () => {
    assert.equal(TOOL_COUNT, 5 + 14 + 11 + 1);
  });

  it('every tool has annotations', () => {
    for (const tool of TOOL_DEFS) {
      assert.ok(tool.annotations, `${tool.name} missing annotations`);
      assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', `${tool.name} missing readOnlyHint`);
    }
  });

  it('read-only tools are marked as such', () => {
    const readOnlyTools = [
      'session_list', 'session_check', 'session_cookies', 'service_status', 'service_diagnose',
      'browser_snapshot', 'browser_screenshot', 'browser_tabs',
      'recipe_list', 'recipe_run', 'recipe_run_prs', 'recipe_run_inbox', 'recipe_run_issues',
      'recipe_run_notifications', 'recipe_run_calendar', 'recipe_run_profile',
      'recipe_run_messages', 'recipe_run_linkedin', 'recipe_run_search',
      'setup_guide',
    ];
    for (const name of readOnlyTools) {
      const tool = TOOL_DEFS.find((t) => t.name === name);
      assert.ok(tool, `tool ${name} not found`);
      assert.equal(tool.annotations?.readOnlyHint, true, `${name} should be readOnly`);
    }
  });

  it('browser_evaluate is marked destructive and open-world', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'browser_evaluate');
    assert.ok(tool);
    assert.equal(tool.annotations?.destructiveHint, true);
    assert.equal(tool.annotations?.openWorldHint, true);
    assert.equal(tool.annotations?.readOnlyHint, false);
  });

  it('session_cookies is marked open-world', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'session_cookies');
    assert.ok(tool);
    assert.equal(tool.annotations?.openWorldHint, true);
    assert.equal(tool.annotations?.readOnlyHint, true);
  });

  it('browser mutation tools are not read-only', () => {
    const mutationTools = [
      'browser_navigate', 'browser_click', 'browser_type', 'browser_select',
      'browser_hover', 'browser_wait', 'browser_back', 'browser_forward',
      'browser_new_tab', 'browser_switch_tab',
    ];
    for (const name of mutationTools) {
      const tool = TOOL_DEFS.find((t) => t.name === name);
      assert.ok(tool, `tool ${name} not found`);
      assert.equal(tool.annotations?.readOnlyHint, false, `${name} should not be readOnly`);
    }
  });

  it('browser_evaluate description contains DANGEROUS warning', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'browser_evaluate');
    assert.ok(tool);
    assert.ok(tool.description.startsWith('DANGEROUS'), 'should start with DANGEROUS');
    assert.ok(tool.description.includes('authenticated'), 'should mention authenticated context');
  });

  it('session_cookies description mentions filtering', () => {
    const tool = TOOL_DEFS.find((t) => t.name === 'session_cookies');
    assert.ok(tool);
    assert.ok(tool.description.includes('filtered'), 'should mention cookies are filtered');
  });
});

describe('validateUrl', () => {
  it('allows https URLs', () => {
    assert.doesNotThrow(() => validateUrl('https://example.com'));
    assert.doesNotThrow(() => validateUrl('https://github.com/pulls'));
  });

  it('allows http URLs', () => {
    assert.doesNotThrow(() => validateUrl('http://example.com'));
  });

  it('blocks file: protocol', () => {
    assert.throws(() => validateUrl('file:///etc/passwd'), /Blocked protocol/);
  });

  it('blocks javascript: protocol', () => {
    assert.throws(() => validateUrl('javascript:alert(1)'), /Blocked protocol/);
  });

  it('blocks data: protocol', () => {
    assert.throws(() => validateUrl('data:text/html,<h1>hi</h1>'), /Blocked protocol/);
  });

  it('blocks invalid URLs', () => {
    assert.throws(() => validateUrl('not-a-url'), /Invalid URL/);
  });

  it('blocks localhost', () => {
    assert.throws(() => validateUrl('http://localhost:3000'), /private\/internal/);
  });

  it('blocks 127.0.0.1', () => {
    assert.throws(() => validateUrl('http://127.0.0.1'), /private\/internal/);
  });

  it('blocks 10.x private range', () => {
    assert.throws(() => validateUrl('http://10.0.0.1'), /private\/internal/);
  });

  it('blocks 192.168.x private range', () => {
    assert.throws(() => validateUrl('http://192.168.1.1'), /private\/internal/);
  });

  it('blocks 169.254.x link-local', () => {
    assert.throws(() => validateUrl('http://169.254.169.254'), /private\/internal/);
  });

  it('allows public IPs', () => {
    assert.doesNotThrow(() => validateUrl('https://8.8.8.8'));
    assert.doesNotThrow(() => validateUrl('https://1.1.1.1'));
  });
});

describe('validateUrlWithDns', () => {
  it('allows public URLs after DNS resolution', async () => {
    await assert.doesNotReject(validateUrlWithDns('https://example.com'));
  });

  it('blocks file: protocol (inherits from validateUrl)', async () => {
    await assert.rejects(validateUrlWithDns('file:///etc/passwd'), /Blocked protocol/);
  });

  it('blocks localhost (inherits from validateUrl)', async () => {
    await assert.rejects(validateUrlWithDns('http://localhost'), /private\/internal/);
  });

  it('allows raw public IPs without DNS lookup', async () => {
    await assert.doesNotReject(validateUrlWithDns('https://8.8.8.8'));
  });

  it('gracefully handles unresolvable domains', async () => {
    // DNS failure is not fatal; the browser will show its own error
    await assert.doesNotReject(validateUrlWithDns('https://this-domain-definitely-does-not-exist-xyzzy.example'));
  });
});

describe('isPrivateHost', () => {
  it('returns true for localhost', () => {
    assert.equal(isPrivateHost('localhost'), true);
  });

  it('returns true for 127.0.0.1', () => {
    assert.equal(isPrivateHost('127.0.0.1'), true);
  });

  it('returns true for ::1', () => {
    assert.equal(isPrivateHost('::1'), true);
  });

  it('returns true for 10.x', () => {
    assert.equal(isPrivateHost('10.0.0.1'), true);
    assert.equal(isPrivateHost('10.255.255.255'), true);
  });

  it('returns true for 192.168.x', () => {
    assert.equal(isPrivateHost('192.168.1.1'), true);
    assert.equal(isPrivateHost('192.168.0.100'), true);
  });

  it('returns true for 169.254.x', () => {
    assert.equal(isPrivateHost('169.254.169.254'), true);
  });

  it('returns true for 172.16-31.x', () => {
    assert.equal(isPrivateHost('172.16.0.1'), true);
    assert.equal(isPrivateHost('172.31.255.255'), true);
  });

  it('returns false for 172.32.x (not private)', () => {
    assert.equal(isPrivateHost('172.32.0.1'), false);
  });

  it('returns true for fc00:/fd00: IPv6 ULA', () => {
    assert.equal(isPrivateHost('fc00::1'), true);
    assert.equal(isPrivateHost('fd00::1'), true);
    assert.equal(isPrivateHost('fdab::1'), true);
  });

  it('returns true for fe80: IPv6 link-local', () => {
    assert.equal(isPrivateHost('fe80::1'), true);
  });

  it('returns false for public IPs', () => {
    assert.equal(isPrivateHost('8.8.8.8'), false);
    assert.equal(isPrivateHost('1.1.1.1'), false);
  });

  it('returns false for public domains', () => {
    assert.equal(isPrivateHost('example.com'), false);
    assert.equal(isPrivateHost('github.com'), false);
  });

  it('does not false-positive on domains starting with fd', () => {
    assert.equal(isPrivateHost('fd.example.com'), false);
    assert.equal(isPrivateHost('fdrive.com'), false);
  });
});

describe('getToolCategory', () => {
  it('categorizes navigation tools', () => {
    assert.equal(getToolCategory('browser_navigate'), 'navigate');
    assert.equal(getToolCategory('browser_back'), 'navigate');
    assert.equal(getToolCategory('browser_forward'), 'navigate');
    assert.equal(getToolCategory('browser_new_tab'), 'navigate');
  });

  it('categorizes interaction tools', () => {
    assert.equal(getToolCategory('browser_click'), 'interact');
    assert.equal(getToolCategory('browser_type'), 'interact');
    assert.equal(getToolCategory('browser_select'), 'interact');
    assert.equal(getToolCategory('browser_hover'), 'interact');
  });

  it('categorizes evaluate tool', () => {
    assert.equal(getToolCategory('browser_evaluate'), 'evaluate');
  });

  it('returns null for read-only tools', () => {
    assert.equal(getToolCategory('browser_snapshot'), null);
    assert.equal(getToolCategory('browser_screenshot'), null);
    assert.equal(getToolCategory('browser_tabs'), null);
    assert.equal(getToolCategory('recipe_run'), null);
    assert.equal(getToolCategory('session_list'), null);
  });
});
