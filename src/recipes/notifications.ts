import type { Browser } from 'playwright-core';
import type { Recipe, NotificationsResult, GhNotification } from './base.js';
import { newPage, warnIfEmpty } from './base.js';
import { getGitHubToken, githubApi } from './github-api.js';

interface GitHubNotification {
  repository: { full_name: string };
  subject: { title: string; type: string; url: string | null };
  reason: string;
  updated_at: string;
}

export const notificationsRecipe: Recipe<NotificationsResult> = {
  name: 'notifications',
  description: 'Read your GitHub notifications',
  requires: ['github.com'],

  async runWithoutBrowser(): Promise<NotificationsResult | null> {
    const token = getGitHubToken();
    if (!token) return null;

    const data = await githubApi<GitHubNotification[]>(
      '/notifications?per_page=50',
      token,
    );

    const notifications: GhNotification[] = data.map((item) => {
      // Convert API subject URL to web URL
      let url = '';
      if (item.subject.url) {
        // "https://api.github.com/repos/owner/repo/pulls/123" -> "https://github.com/owner/repo/pull/123"
        url = item.subject.url
          .replace('https://api.github.com/repos/', 'https://github.com/')
          .replace('/pulls/', '/pull/')
          .replace('/issues/', '/issues/');
      }

      return {
        repo: item.repository.full_name,
        title: item.subject.title,
        type: item.subject.type,
        reason: item.reason,
        url,
        updatedAt: item.updated_at,
      };
    });

    const { warning } = warnIfEmpty(notifications, 'notifications');
    return { notifications, total: notifications.length, ...(warning ? { warning } : {}) };
  },

  async run(browser: Browser): Promise<NotificationsResult> {
    const page = await newPage(browser, 'https://github.com/notifications');

    await page.waitForSelector('.notifications-list-item, .notification-list-item-link, [data-notification-id]', {
      timeout: 15000,
    }).catch(() => {});

    const notifications: GhNotification[] = await page.evaluate(() => {
      const results: Array<{
        repo: string;
        title: string;
        type: string;
        reason: string;
        url: string;
        updatedAt: string;
      }> = [];

      const items = document.querySelectorAll('.notifications-list-item, [data-notification-id]');

      for (const item of Array.from(items).slice(0, 30)) {
        const linkEl = item.querySelector('a.notification-list-item-link, a[data-hovercard-url]');
        const title = linkEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
        const url = (linkEl as HTMLAnchorElement)?.href ?? '';

        const repoEl = item.querySelector('.notifications-repo-link, [data-repository-nwo]');
        const repo = repoEl?.textContent?.trim() ?? '';

        const typeEl = item.querySelector('.type-icon');
        const type = typeEl?.getAttribute('aria-label') ?? typeEl?.textContent?.trim() ?? '';

        const reasonEl = item.querySelector('.reason');
        const reason = reasonEl?.textContent?.trim() ?? '';

        const timeEl = item.querySelector('relative-time, time');
        const updatedAt = timeEl?.getAttribute('datetime') ?? '';

        if (title) {
          results.push({ repo, title, type, reason, url, updatedAt });
        }
      }
      return results;
    });

    await page.close();
    const { warning } = warnIfEmpty(notifications, 'notifications');
    return { notifications, total: notifications.length, ...(warning ? { warning } : {}) };
  },
};
