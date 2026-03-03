import { chromium } from 'playwright-core';
import type { Browser, Cookie } from 'playwright-core';
import type { SessionInfo, AuthCookieSpec } from './types.js';
import { AUTH_COOKIE_SPECS } from './types.js';

export class SessionManager {
  private cdpEndpoint: string;
  private specs: AuthCookieSpec[];

  constructor(cdpPort: number, customDomains?: AuthCookieSpec[]) {
    this.cdpEndpoint = `http://localhost:${cdpPort}`;
    this.specs = [...AUTH_COOKIE_SPECS];
    if (customDomains) {
      for (const custom of customDomains) {
        if (!this.specs.some((s) => s.domain === custom.domain)) {
          this.specs.push(custom);
        }
      }
    }
  }

  getSpecs(): AuthCookieSpec[] {
    return this.specs;
  }

  async getSessions(): Promise<SessionInfo[]> {
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(this.cdpEndpoint);
    } catch {
      throw new Error('Chrome not running or CDP not accessible');
    }

    try {
      const context = browser.contexts()[0];
      if (!context) {
        return [];
      }

      const allCookies = await context.cookies();
      return this.specs.map((spec) =>
        this.analyzeSession(spec, allCookies),
      );
    } finally {
      await browser.close();
    }
  }

  async getSession(domain: string): Promise<SessionInfo | null> {
    const sessions = await this.getSessions();
    return sessions.find((s) => s.domain === domain) ?? null;
  }

  private analyzeSession(spec: AuthCookieSpec, cookies: Cookie[]): SessionInfo {
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

    const result: SessionInfo = {
      domain: spec.domain,
      active,
      cookiesFound: foundCookies,
    };

    if (earliestExpiry !== null && earliestExpiry > now) {
      result.expiresAt = new Date(earliestExpiry * 1000).toISOString();
      result.expiresInDays = Math.floor((earliestExpiry - now) / 86400);

      if (result.expiresInDays <= 7) {
        result.warning = `Expiring in ${result.expiresInDays} day${result.expiresInDays === 1 ? '' : 's'}`;
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
}
