import type { Browser } from 'playwright-core';
import type { Recipe, PrsResult, PrInfo } from './base.js';
import { newPage, warnIfEmpty } from './base.js';
import { getGitHubToken, githubApi } from './github-api.js';

interface GitHubSearchResponse {
  items: Array<{
    title: string;
    html_url: string;
    state: string;
    updated_at: string;
    pull_request?: { html_url: string };
    repository_url: string;
  }>;
}

export const prsRecipe: Recipe<PrsResult> = {
  name: 'prs',
  description: 'Check your open pull requests',
  requires: ['github.com'],

  async runWithoutBrowser(): Promise<PrsResult | null> {
    const token = getGitHubToken();
    if (!token) return null;

    const data = await githubApi<GitHubSearchResponse>(
      '/search/issues?q=type:pr+state:open+author:@me&sort=updated&per_page=100',
      token,
    );

    const prs: PrInfo[] = data.items.map((item) => {
      // repository_url: "https://api.github.com/repos/owner/repo"
      const repoMatch = item.repository_url.match(/repos\/(.+)$/);
      return {
        title: item.title,
        url: item.html_url,
        repo: repoMatch ? repoMatch[1] : '',
        state: item.state,
        updatedAt: item.updated_at,
      };
    });

    const { warning } = warnIfEmpty(prs, 'prs');
    return { prs, total: prs.length, ...(warning ? { warning } : {}) };
  },

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

      const rows = document.querySelectorAll('.Box-row, .js-issue-row, [id^="issue_"]');

      for (const row of rows) {
        const linkEl = row.querySelector('a[data-hovercard-type="pull_request"], a.Link--primary, a[id^="issue_"]');
        if (!linkEl) continue;

        const title = linkEl.textContent?.trim() ?? '';
        const url = (linkEl as HTMLAnchorElement).href ?? '';

        const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull/);
        const repo = match ? match[1] : '';

        const stateEl = row.querySelector('.State');
        const state = stateEl?.textContent?.trim() ?? 'open';

        const timeEl = row.querySelector('relative-time, time');
        const updatedAt = timeEl?.getAttribute('datetime') ?? '';

        if (title && url) {
          results.push({ title, url, repo, state, updatedAt });
        }
      }
      return results;
    });

    await page.close();

    const { warning } = warnIfEmpty(prs, 'prs');
    return { prs, total: prs.length, ...(warning ? { warning } : {}) };
  },
};
