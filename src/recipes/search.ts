import type { Browser } from 'playwright-core';
import type { Recipe, SearchResult, SearchResultItem } from './base.js';
import { newPage, warnIfEmpty } from './base.js';

export const searchRecipe: Recipe<SearchResult> = {
  name: 'search',
  description: 'Search Google as you',
  requires: [],
  args: [
    { name: 'query', description: 'Search query', required: true },
  ],

  async run(browser: Browser, args?: Record<string, string>): Promise<SearchResult> {
    const query = args?.query;
    if (!query) {
      throw new Error('Search query is required. Usage: openbrowser search "your query"');
    }

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    const page = await newPage(browser, url);

    // Wait for search results
    await page.waitForSelector('#search, #rso, .g', {
      timeout: 15000,
    }).catch(() => {});

    const results: SearchResultItem[] = await page.evaluate(() => {
      const items: Array<{ title: string; url: string; snippet: string }> = [];

      // Find all h3 elements (result titles) and walk up to find parent blocks
      const headings = document.querySelectorAll('#rso h3, #search h3');

      for (const h3 of Array.from(headings).slice(0, 10)) {
        const title = h3.textContent?.trim() ?? '';
        if (!title) continue;

        // Walk up to find the link wrapping or near the h3
        let linkEl: HTMLAnchorElement | null = null;
        let el: HTMLElement | null = h3 as HTMLElement;

        // Check if h3 is inside a link
        while (el && el.id !== 'rso') {
          if (el.tagName === 'A' && (el as HTMLAnchorElement).href) {
            linkEl = el as HTMLAnchorElement;
            break;
          }
          el = el.parentElement;
        }

        // If h3 isn't inside a link, find sibling/nearby link
        if (!linkEl) {
          const parent = h3.closest('[data-hveid], [jscontroller], .g') ?? h3.parentElement?.parentElement;
          if (parent) {
            linkEl = parent.querySelector('a[href^="http"]');
          }
        }

        const href = linkEl?.href ?? '';
        if (!href || href.includes('google.com/search') || href.includes('accounts.google.com')) continue;

        // Find snippet text near the heading
        const container = h3.closest('[data-hveid], [jscontroller]') ?? h3.parentElement?.parentElement?.parentElement;
        let snippet = '';
        if (container) {
          // Look for spans with substantial text that aren't the title or URL breadcrumb
          const textNodes = container.querySelectorAll('span[style*="line-clamp"], div[data-sncf] span, em');
          for (const node of textNodes) {
            const text = node.textContent?.trim() ?? '';
            if (text.length > 40 && text !== title && !text.startsWith('http')) {
              snippet = text;
              break;
            }
          }
          // Fallback: grab longest text block in container
          if (!snippet) {
            const allSpans = container.querySelectorAll('span');
            let best = '';
            for (const span of allSpans) {
              const text = span.textContent?.trim() ?? '';
              if (text.length > best.length && text !== title && !text.startsWith('http') && !text.includes('://')) {
                best = text;
              }
            }
            if (best.length > 30) snippet = best;
          }
        }

        items.push({ title, url: href, snippet });
      }
      return items;
    });

    await page.close();

    const { warning } = warnIfEmpty(results, 'search');
    return { query, results, total: results.length, ...(warning ? { warning } : {}) };
  },
};
