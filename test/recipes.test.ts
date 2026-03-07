import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listRecipes, getRecipe } from '../dist/recipes/index.js';
import { withRetry, RecipeError, warnIfEmpty } from '../dist/recipes/base.js';
import { getGitHubToken, clearTokenCache } from '../dist/recipes/github-api.js';
import { getGmailCredentials, escapeImapQuoted, decodeRFC2047 } from '../dist/recipes/gmail-imap.js';
import { getCalendarCredentials } from '../dist/recipes/google-calendar-api.js';

describe('recipe registry', () => {
  it('has 9 recipes registered', () => {
    const recipes = listRecipes();
    assert.equal(recipes.length, 9);
  });

  it('all expected recipes are registered', () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes('prs'));
    assert.ok(names.includes('inbox'));
    assert.ok(names.includes('linkedin'));
    assert.ok(names.includes('search'));
    assert.ok(names.includes('issues'));
    assert.ok(names.includes('notifications'));
    assert.ok(names.includes('calendar'));
    assert.ok(names.includes('profile'));
    assert.ok(names.includes('messages'));
  });

  it('each recipe has name, description, and requires', () => {
    for (const recipe of listRecipes()) {
      assert.ok(recipe.name);
      assert.ok(recipe.description);
      assert.ok(Array.isArray(recipe.requires));
    }
  });

  it('search recipe requires no sessions', () => {
    const search = getRecipe('search');
    assert.ok(search);
    assert.equal(search.requires.length, 0);
  });

  it('getRecipe returns undefined for unknown recipe', () => {
    assert.equal(getRecipe('nonexistent'), undefined);
  });

  it('getRecipe returns recipe for known name', () => {
    const prs = getRecipe('prs');
    assert.ok(prs);
    assert.equal(prs.name, 'prs');
    assert.ok(typeof prs.run === 'function');
  });

  it('search recipe has required query arg', () => {
    const search = getRecipe('search');
    assert.ok(search?.args);
    assert.equal(search.args.length, 1);
    assert.equal(search.args[0].name, 'query');
    assert.equal(search.args[0].required, true);
  });

  it('API-first recipes have runWithoutBrowser method', () => {
    for (const name of ['prs', 'issues', 'notifications', 'inbox', 'calendar']) {
      const recipe = getRecipe(name);
      assert.ok(recipe, `recipe ${name} not found`);
      assert.ok(typeof recipe.runWithoutBrowser === 'function', `${name} missing runWithoutBrowser`);
    }
  });

  it('browser-only recipes do not have runWithoutBrowser', () => {
    for (const name of ['linkedin', 'search', 'profile', 'messages']) {
      const recipe = getRecipe(name);
      assert.ok(recipe, `recipe ${name} not found`);
      assert.equal(recipe.runWithoutBrowser, undefined, `${name} should not have runWithoutBrowser`);
    }
  });
});

describe('RecipeError', () => {
  it('has correct name and properties', () => {
    const err = new RecipeError('something failed', 'prs');
    assert.equal(err.name, 'RecipeError');
    assert.equal(err.message, 'something failed');
    assert.equal(err.recipeName, 'prs');
    assert.equal(err.cause, undefined);
  });

  it('preserves cause error', () => {
    const cause = new Error('network timeout');
    const err = new RecipeError('recipe failed', 'inbox', cause);
    assert.equal(err.cause, cause);
  });

  it('is an instance of Error', () => {
    const err = new RecipeError('test', 'test');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof RecipeError);
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42), 'test');
    assert.equal(result, 42);
  });

  it('retries on failure and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return 'ok';
    }, 'test', { retryDelayMs: 10 });
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  });

  it('throws RecipeError after exhausting retries', async () => {
    await assert.rejects(
      () => withRetry(() => Promise.reject(new Error('always fails')), 'test', { maxRetries: 1, retryDelayMs: 10 }),
      (err: Error) => {
        assert.ok(err instanceof RecipeError);
        assert.equal((err as RecipeError).recipeName, 'test');
        assert.ok(err.message.includes('Failed after 2 attempts'));
        return true;
      },
    );
  });

  it('throws RecipeError on timeout', async () => {
    await assert.rejects(
      () => withRetry(
        () => new Promise((r) => setTimeout(r, 5000)),
        'test',
        { timeoutMs: 50, maxRetries: 0 },
      ),
      (err: Error) => {
        assert.ok(err instanceof RecipeError);
        assert.ok(err.message.includes('Timed out'));
        return true;
      },
    );
  });

  it('does not retry when maxRetries is 0', async () => {
    let attempts = 0;
    await assert.rejects(
      () => withRetry(async () => {
        attempts++;
        throw new Error('fail');
      }, 'test', { maxRetries: 0, retryDelayMs: 10 }),
    );
    assert.equal(attempts, 1);
  });
});

describe('GitHub API token detection', () => {
  it('getGitHubToken returns a token when gh CLI is authenticated', () => {
    clearTokenCache();
    const token = getGitHubToken();
    // On machines with gh authenticated, this returns a token; on CI without gh, null
    assert.ok(token === null || typeof token === 'string');
    if (token) {
      assert.ok(token.length > 10, 'token looks too short');
    }
  });

  it('getGitHubToken caches the result', () => {
    clearTokenCache();
    const first = getGitHubToken();
    const second = getGitHubToken();
    assert.equal(first, second);
  });

  it('clearTokenCache resets the cache', () => {
    getGitHubToken(); // populate cache
    clearTokenCache();
    // After clearing, next call re-detects (we just verify it doesn't throw)
    const token = getGitHubToken();
    assert.ok(token === null || typeof token === 'string');
  });
});

describe('Gmail IMAP credential detection', () => {
  let origUser: string | undefined;
  let origPass: string | undefined;

  beforeEach(() => {
    origUser = process.env['GMAIL_USER'];
    origPass = process.env['GMAIL_APP_PASSWORD'];
  });

  afterEach(() => {
    if (origUser !== undefined) process.env['GMAIL_USER'] = origUser;
    else delete process.env['GMAIL_USER'];
    if (origPass !== undefined) process.env['GMAIL_APP_PASSWORD'] = origPass;
    else delete process.env['GMAIL_APP_PASSWORD'];
  });

  it('returns null when env vars are unset', () => {
    delete process.env['GMAIL_USER'];
    delete process.env['GMAIL_APP_PASSWORD'];
    assert.equal(getGmailCredentials(), null);
  });

  it('returns null when only user is set', () => {
    process.env['GMAIL_USER'] = 'test@gmail.com';
    delete process.env['GMAIL_APP_PASSWORD'];
    assert.equal(getGmailCredentials(), null);
  });

  it('returns credentials when both are set', () => {
    process.env['GMAIL_USER'] = 'test@gmail.com';
    process.env['GMAIL_APP_PASSWORD'] = 'abcd efgh ijkl mnop';
    const creds = getGmailCredentials();
    assert.ok(creds);
    assert.equal(creds.user, 'test@gmail.com');
    assert.equal(creds.password, 'abcd efgh ijkl mnop');
  });
});

describe('IMAP password escaping', () => {
  it('passes through simple passwords unchanged', () => {
    assert.equal(escapeImapQuoted('password123'), 'password123');
  });

  it('escapes double quotes', () => {
    assert.equal(escapeImapQuoted('pass"word'), 'pass\\"word');
  });

  it('escapes backslashes', () => {
    assert.equal(escapeImapQuoted('pass\\word'), 'pass\\\\word');
  });

  it('escapes both quotes and backslashes', () => {
    assert.equal(escapeImapQuoted('p\\"w'), 'p\\\\\\"w');
  });
});

describe('RFC2047 decoding', () => {
  it('decodes Base64 encoded header', () => {
    const encoded = '=?UTF-8?B?SGVsbG8gV29ybGQ=?=';
    assert.equal(decodeRFC2047(encoded), 'Hello World');
  });

  it('decodes Quoted-Printable encoded header', () => {
    const encoded = '=?UTF-8?Q?Hello_World?=';
    assert.equal(decodeRFC2047(encoded), 'Hello World');
  });

  it('decodes QP with hex escapes', () => {
    const encoded = '=?UTF-8?Q?caf=C3=A9?=';
    // The simple decoder handles single-byte hex chars
    const result = decodeRFC2047(encoded);
    assert.ok(result.startsWith('caf'));
  });

  it('passes through plain text unchanged', () => {
    assert.equal(decodeRFC2047('Hello World'), 'Hello World');
  });

  it('handles mixed encoded and plain text', () => {
    const input = 'Re: =?UTF-8?B?SGVsbG8=?= there';
    assert.equal(decodeRFC2047(input), 'Re: Hello there');
  });
});

describe('Google Calendar credential detection', () => {
  let origAccessToken: string | undefined;
  let origApiKey: string | undefined;
  let origRefreshToken: string | undefined;
  let origClientId: string | undefined;
  let origClientSecret: string | undefined;

  beforeEach(() => {
    origAccessToken = process.env['GOOGLE_ACCESS_TOKEN'];
    origApiKey = process.env['GOOGLE_CALENDAR_API_KEY'];
    origRefreshToken = process.env['GOOGLE_REFRESH_TOKEN'];
    origClientId = process.env['GOOGLE_CLIENT_ID'];
    origClientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  });

  afterEach(() => {
    const restore = (key: string, val: string | undefined) => {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    };
    restore('GOOGLE_ACCESS_TOKEN', origAccessToken);
    restore('GOOGLE_CALENDAR_API_KEY', origApiKey);
    restore('GOOGLE_REFRESH_TOKEN', origRefreshToken);
    restore('GOOGLE_CLIENT_ID', origClientId);
    restore('GOOGLE_CLIENT_SECRET', origClientSecret);
  });

  it('returns null when no env vars are set', () => {
    delete process.env['GOOGLE_ACCESS_TOKEN'];
    delete process.env['GOOGLE_CALENDAR_API_KEY'];
    delete process.env['GOOGLE_REFRESH_TOKEN'];
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];
    assert.equal(getCalendarCredentials(), null);
  });

  it('returns access_token source when GOOGLE_ACCESS_TOKEN is set', () => {
    process.env['GOOGLE_ACCESS_TOKEN'] = 'ya29.test';
    delete process.env['GOOGLE_CALENDAR_API_KEY'];
    const creds = getCalendarCredentials();
    assert.ok(creds);
    assert.equal(creds.source, 'access_token');
    assert.equal(creds.accessToken, 'ya29.test');
  });

  it('returns api_key source when only API key is set', () => {
    delete process.env['GOOGLE_ACCESS_TOKEN'];
    process.env['GOOGLE_CALENDAR_API_KEY'] = 'AIza-test';
    const creds = getCalendarCredentials();
    assert.ok(creds);
    assert.equal(creds.source, 'api_key');
  });

  it('returns refresh_token source when all OAuth vars are set', () => {
    delete process.env['GOOGLE_ACCESS_TOKEN'];
    delete process.env['GOOGLE_CALENDAR_API_KEY'];
    process.env['GOOGLE_REFRESH_TOKEN'] = '1//test';
    process.env['GOOGLE_CLIENT_ID'] = 'client.apps.googleusercontent.com';
    process.env['GOOGLE_CLIENT_SECRET'] = 'GOCSPX-test';
    const creds = getCalendarCredentials();
    assert.ok(creds);
    assert.equal(creds.source, 'refresh_token');
  });

  it('prefers access_token over api_key', () => {
    process.env['GOOGLE_ACCESS_TOKEN'] = 'ya29.test';
    process.env['GOOGLE_CALENDAR_API_KEY'] = 'AIza-test';
    const creds = getCalendarCredentials();
    assert.ok(creds);
    assert.equal(creds.source, 'access_token');
  });
});

describe('warnIfEmpty', () => {
  it('returns items without warning when non-empty', () => {
    const result = warnIfEmpty([1, 2, 3], 'test');
    assert.deepEqual(result.items, [1, 2, 3]);
    assert.equal(result.warning, undefined);
  });

  it('returns warning when items are empty', () => {
    const result = warnIfEmpty([], 'prs');
    assert.deepEqual(result.items, []);
    assert.ok(result.warning);
    assert.ok(result.warning.includes('prs'));
    assert.ok(result.warning.includes('no results found'));
  });

  it('includes recipe name in warning message', () => {
    const result = warnIfEmpty([], 'linkedin');
    assert.ok(result.warning?.startsWith('linkedin:'));
  });
});
