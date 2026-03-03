import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_COOKIE_SPECS } from '../dist/lib/types.js';

describe('types', () => {
  it('Google spec requires SID, HSID, SSID', () => {
    const google = AUTH_COOKIE_SPECS.find((s) => s.domain === 'google.com');
    assert.ok(google);
    assert.deepEqual(google.requiredCookies, ['SID', 'HSID', 'SSID']);
    assert.equal(google.label, 'Google');
  });

  it('GitHub spec requires user_session', () => {
    const github = AUTH_COOKIE_SPECS.find((s) => s.domain === 'github.com');
    assert.ok(github);
    assert.deepEqual(github.requiredCookies, ['user_session']);
  });

  it('LinkedIn spec requires li_at', () => {
    const linkedin = AUTH_COOKIE_SPECS.find((s) => s.domain === 'linkedin.com');
    assert.ok(linkedin);
    assert.deepEqual(linkedin.requiredCookies, ['li_at']);
  });
});
