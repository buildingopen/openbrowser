import type { Browser } from 'playwright-core';
import type { Recipe, IssuesResult, IssueInfo } from './base.js';
import { newPage, warnIfEmpty } from './base.js';
import { getGitHubToken, githubApi } from './github-api.js';

interface GitHubIssue {
  title: string;
  html_url: string;
  state: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  repository_url: string;
}

export const issuesRecipe: Recipe<IssuesResult> = {
  name: 'issues',
  description: 'Check issues assigned to you',
  requires: ['github.com'],

  async runWithoutBrowser(): Promise<IssuesResult | null> {
    const token = getGitHubToken();
    if (!token) return null;

    const data = await githubApi<GitHubIssue[]>(
      '/issues?filter=assigned&state=open&sort=updated&per_page=100',
      token,
    );

    // /issues endpoint also returns PRs; filter them out
    const issues: IssueInfo[] = data
      .filter((item) => !item.html_url.includes('/pull/'))
      .map((item) => {
        const repoMatch = item.repository_url.match(/repos\/(.+)$/);
        return {
          title: item.title,
          url: item.html_url,
          repo: repoMatch ? repoMatch[1] : '',
          state: item.state,
          labels: item.labels.map((l) => l.name),
          updatedAt: item.updated_at,
        };
      });

    const { warning } = warnIfEmpty(issues, 'issues');
    return { issues, total: issues.length, ...(warning ? { warning } : {}) };
  },

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

        const stateEl = row.querySelector('.State');
        const state = stateEl?.textContent?.trim().toLowerCase() ?? 'open';

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
    const { warning } = warnIfEmpty(issues, 'issues');
    return { issues, total: issues.length, ...(warning ? { warning } : {}) };
  },
};
