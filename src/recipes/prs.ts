import type { Browser } from 'playwright-core';
import type { Recipe, PrsResult, PrInfo } from './base.js';
import { newPage } from './base.js';

export const prsRecipe: Recipe<PrsResult> = {
  name: 'prs',
  description: 'List your open GitHub pull requests',
  requires: ['github.com'],

  async run(browser: Browser): Promise<PrsResult> {
    const page = await newPage(browser, 'https://github.com/pulls');

    await page.waitForSelector('[data-turbo-frame="repo-content-turbo-frame"], .js-issue-row, .Box-row', {
      timeout: 15000,
    }).catch(() => {});

    const prs: PrInfo[] = await page.evaluate(() => {
      const results: Array<{
        title: string;
        url: string;
        repo: string;
        state: string;
        updatedAt: string;
      }> = [];

      // Try multiple selectors for GitHub's evolving UI
      const rows = document.querySelectorAll('.Box-row, .js-issue-row, [id^="issue_"]');

      for (const row of rows) {
        const linkEl = row.querySelector('a[data-hovercard-type="pull_request"], a.Link--primary, a[id^="issue_"]');
        if (!linkEl) continue;

        const title = linkEl.textContent?.trim() ?? '';
        const url = (linkEl as HTMLAnchorElement).href ?? '';

        // Extract repo from URL: /owner/repo/pull/123
        const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull/);
        const repo = match ? match[1] : '';

        // Look for open/closed/merged state
        const stateEl = row.querySelector('.State, [class*="state"]');
        const state = stateEl?.textContent?.trim() ?? 'open';

        // Look for relative time
        const timeEl = row.querySelector('relative-time, time');
        const updatedAt = timeEl?.getAttribute('datetime') ?? '';

        if (title && url) {
          results.push({ title, url, repo, state, updatedAt });
        }
      }
      return results;
    });

    await page.close();

    return { prs, total: prs.length };
  },
};
