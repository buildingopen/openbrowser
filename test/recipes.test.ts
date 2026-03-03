import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listRecipes, getRecipe } from '../dist/recipes/index.js';
import { withRetry, RecipeError } from '../dist/recipes/base.js';

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
      assert.ok(recipe.requires.length > 0);
    }
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
