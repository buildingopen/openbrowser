import type { Browser } from 'playwright-core';
import type { Recipe, IssuesResult, IssueInfo } from './base.js';
import { newPage } from './base.js';

export const issuesRecipe: Recipe<IssuesResult> = {
  name: 'issues',
  description: 'List GitHub issues assigned to you',
  requires: ['github.com'],

  async run(browser: Browser): Promise<IssuesResult> {
    const page = await newPage(browser, 'https://github.com/issues/assigned');

    await page.waitForSelector('.Box-row, [data-turbo-frame]', {
      timeout: 15000,
    }).catch(() => {});

    const issues: IssueInfo[] = await page.evaluate(() => {
      const results: Array<{
        title: string;
        url: string;
        repo: string;
        state: string;
        labels: string[];
        updatedAt: string;
      }> = [];

      const rows = document.querySelectorAll('.Box-row, .js-issue-row, [id^="issue_"]');

      for (const row of rows) {
        const linkEl = row.querySelector('a[data-hovercard-type="issue"], a.Link--primary, a[id^="issue_"]');
        if (!linkEl) continue;

        const title = linkEl.textContent?.trim() ?? '';
        const url = (linkEl as HTMLAnchorElement).href ?? '';

        const match = url.match(/github\.com\/([^/]+\/[^/]+)\/issues/);
        const repo = match ? match[1] : '';

        const stateEl = row.querySelector('.State, [class*="state"]');
        const state = stateEl?.textContent?.trim() ?? 'open';

        const labelEls = row.querySelectorAll('.IssueLabel, [data-name]');
        const labels = Array.from(labelEls).map((el) => el.textContent?.trim() ?? '').filter(Boolean);

        const timeEl = row.querySelector('relative-time, time');
        const updatedAt = timeEl?.getAttribute('datetime') ?? '';

        if (title && url) {
          results.push({ title, url, repo, state, labels, updatedAt });
        }
      }
      return results;
    });

    await page.close();
    return { issues, total: issues.length };
  },
};
