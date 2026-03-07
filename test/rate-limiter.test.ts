import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../dist/lib/rate-limiter.js';

describe('RateLimiter', () => {
  it('default delay is 2000ms', () => {
    const limiter = new RateLimiter();
    assert.equal(limiter.getDelay('google.com'), 2000);
  });

  it('custom delay overrides default', () => {
    const limiter = new RateLimiter({ 'google.com': 5000 });
    assert.equal(limiter.getDelay('google.com'), 5000);
    assert.equal(limiter.getDelay('linkedin.com'), 2000);
  });

  it('wait respects delay between calls', async () => {
    const limiter = new RateLimiter({ 'test.com': 100 });
    const start = Date.now();
    await limiter.wait('test.com');
    await limiter.wait('test.com');
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 90, `Expected >= 90ms, got ${elapsed}ms`);
  });

  it('different domains are tracked independently', async () => {
    const limiter = new RateLimiter({ 'a.com': 200, 'b.com': 200 });
    await limiter.wait('a.com');
    const start = Date.now();
    await limiter.wait('b.com'); // Should not wait since b.com hasn't been called
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `Expected < 50ms for new domain, got ${elapsed}ms`);
  });

  it('first call does not wait', async () => {
    const limiter = new RateLimiter({ 'fast.com': 5000 });
    const start = Date.now();
    await limiter.wait('fast.com');
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `First call should be instant, got ${elapsed}ms`);
  });
});
