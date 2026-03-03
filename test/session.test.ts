import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthCookieSpec } from '../dist/lib/types.js';
import { AUTH_COOKIE_SPECS } from '../dist/lib/types.js';

// Test the session analysis logic without needing a real CDP connection.
// We extract the analysis logic into a testable function.

interface FakeCookie {
  name: string;
  domain: string;
  expires: number;
}

function analyzeSession(spec: AuthCookieSpec, cookies: FakeCookie[]) {
  const domainCookies = cookies.filter((c) =>
    c.domain.includes(spec.domain),
  );

  const foundCookies: string[] = [];
  let earliestExpiry: number | null = null;

  for (const required of spec.requiredCookies) {
    const cookie = domainCookies.find((c) => c.name === required);
    if (cookie) {
      foundCookies.push(required);
      if (cookie.expires > 0) {
        if (earliestExpiry === null || cookie.expires < earliestExpiry) {
          earliestExpiry = cookie.expires;
        }
      }
    }
  }

  const allPresent = spec.requiredCookies.every((name) =>
    foundCookies.includes(name),
  );

  const now = Date.now() / 1000;
  const expired = earliestExpiry !== null && earliestExpiry < now;
  const active = allPresent && !expired;

  const result: Record<string, unknown> = {
    domain: spec.domain,
    active,
    cookiesFound: foundCookies,
  };

  if (earliestExpiry !== null && earliestExpiry > now) {
    result.expiresAt = new Date(earliestExpiry * 1000).toISOString();
    result.expiresInDays = Math.floor((earliestExpiry - now) / 86400);
    if ((result.expiresInDays as number) <= 7) {
      result.warning = `Expiring in ${result.expiresInDays} day${(result.expiresInDays as number) === 1 ? '' : 's'}`;
    }
  }

  if (!active && !allPresent) {
    result.warning = `Missing cookies: ${spec.requiredCookies.filter((n) => !foundCookies.includes(n)).join(', ')}`;
  }

  if (expired) {
    result.warning = 'Session expired';
  }

  return result;
}

describe('session analysis', () => {
  const googleSpec = AUTH_COOKIE_SPECS.find((s) => s.domain === 'google.com')!;
  const githubSpec = AUTH_COOKIE_SPECS.find((s) => s.domain === 'github.com')!;
  const linkedinSpec = AUTH_COOKIE_SPECS.find((s) => s.domain === 'linkedin.com')!;

  it('detects active Google session with all cookies', () => {
    const future = Date.now() / 1000 + 86400 * 365;
    const cookies: FakeCookie[] = [
      { name: 'SID', domain: '.google.com', expires: future },
      { name: 'HSID', domain: '.google.com', expires: future },
      { name: 'SSID', domain: '.google.com', expires: future },
    ];
    const result = analyzeSession(googleSpec, cookies);
    assert.equal(result.active, true);
    assert.deepEqual(result.cookiesFound, ['SID', 'HSID', 'SSID']);
  });

  it('detects missing cookies for Google', () => {
    const future = Date.now() / 1000 + 86400 * 365;
    const cookies: FakeCookie[] = [
      { name: 'SID', domain: '.google.com', expires: future },
    ];
    const result = analyzeSession(googleSpec, cookies);
    assert.equal(result.active, false);
    assert.ok((result.warning as string).includes('Missing cookies'));
    assert.ok((result.warning as string).includes('HSID'));
    assert.ok((result.warning as string).includes('SSID'));
  });

  it('detects expired session', () => {
    const past = Date.now() / 1000 - 86400;
    const cookies: FakeCookie[] = [
      { name: 'SID', domain: '.google.com', expires: past },
      { name: 'HSID', domain: '.google.com', expires: past },
      { name: 'SSID', domain: '.google.com', expires: past },
    ];
    const result = analyzeSession(googleSpec, cookies);
    assert.equal(result.active, false);
    assert.equal(result.warning, 'Session expired');
  });

  it('warns when session expires within 7 days', () => {
    const soon = Date.now() / 1000 + 86400 * 3;
    const cookies: FakeCookie[] = [
      { name: 'SID', domain: '.google.com', expires: soon },
      { name: 'HSID', domain: '.google.com', expires: soon },
      { name: 'SSID', domain: '.google.com', expires: soon },
    ];
    const result = analyzeSession(googleSpec, cookies);
    assert.equal(result.active, true);
    assert.ok((result.warning as string).includes('Expiring in'));
  });

  it('detects active GitHub session', () => {
    const future = Date.now() / 1000 + 86400 * 14;
    const cookies: FakeCookie[] = [
      { name: 'user_session', domain: 'github.com', expires: future },
    ];
    const result = analyzeSession(githubSpec, cookies);
    assert.equal(result.active, true);
  });

  it('detects missing GitHub session', () => {
    const result = analyzeSession(githubSpec, []);
    assert.equal(result.active, false);
    assert.ok((result.warning as string).includes('user_session'));
  });

  it('detects active LinkedIn session', () => {
    const future = Date.now() / 1000 + 86400 * 365;
    const cookies: FakeCookie[] = [
      { name: 'li_at', domain: '.linkedin.com', expires: future },
    ];
    const result = analyzeSession(linkedinSpec, cookies);
    assert.equal(result.active, true);
  });

  it('handles no cookies at all', () => {
    const result = analyzeSession(googleSpec, []);
    assert.equal(result.active, false);
    assert.deepEqual(result.cookiesFound, []);
  });

  it('uses earliest expiry from multiple cookies', () => {
    const soon = Date.now() / 1000 + 86400 * 5;
    const later = Date.now() / 1000 + 86400 * 365;
    const cookies: FakeCookie[] = [
      { name: 'SID', domain: '.google.com', expires: soon },
      { name: 'HSID', domain: '.google.com', expires: later },
      { name: 'SSID', domain: '.google.com', expires: later },
    ];
    const result = analyzeSession(googleSpec, cookies);
    assert.equal(result.active, true);
    assert.ok((result.expiresInDays as number) < 10);
    assert.ok((result.warning as string).includes('Expiring in'));
  });

  it('AUTH_COOKIE_SPECS covers all three services', () => {
    assert.equal(AUTH_COOKIE_SPECS.length, 3);
    const domains = AUTH_COOKIE_SPECS.map((s) => s.domain);
    assert.ok(domains.includes('google.com'));
    assert.ok(domains.includes('github.com'));
    assert.ok(domains.includes('linkedin.com'));
  });
});
