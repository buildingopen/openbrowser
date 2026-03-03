import type { Browser } from 'playwright-core';
import type { Recipe, SearchResult, SearchResultItem } from './base.js';
import { newPage } from './base.js';

export const searchRecipe: Recipe<SearchResult> = {
  name: 'search',
  description: 'Search Google and return results',
  requires: ['google.com'],
  args: [
    { name: 'query', description: 'Search query', required: true },
  ],

  async run(browser: Browser, args?: Record<string, string>): Promise<SearchResult> {
    const query = args?.query;
    if (!query) {
      throw new Error('Search query is required. Usage: openbrowser recipe search --arg query="your search"');
    }

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    const page = await newPage(browser, url);

    // Wait for search results
    await page.waitForSelector('#search, #rso, .g', {
      timeout: 15000,
    }).catch(() => {});

    const results: SearchResultItem[] = await page.evaluate(() => {
      const items: Array<{ title: string; url: string; snippet: string }> = [];

      // Google search result blocks
      const blocks = document.querySelectorAll('.g, div[data-sokoban-container]');

      for (const block of Array.from(blocks).slice(0, 10)) {
        const linkEl = block.querySelector('a[href^="http"]');
        const titleEl = block.querySelector('h3');
        const snippetEl = block.querySelector(
          '.VwiC3b, [data-sncf], [style*="-webkit-line-clamp"]',
        );

        const title = titleEl?.textContent?.trim() ?? '';
        const href = (linkEl as HTMLAnchorElement)?.href ?? '';
        const snippet = snippetEl?.textContent?.trim() ?? '';

        if (title && href && !href.includes('google.com/search')) {
          items.push({ title, url: href, snippet });
        }
      }
      return items;
    });

    await page.close();

    return { query, results, total: results.length };
  },
};
