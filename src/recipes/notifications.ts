import type { Browser } from 'playwright-core';
import type { Recipe, NotificationsResult, GhNotification } from './base.js';
import { newPage } from './base.js';

export const notificationsRecipe: Recipe<NotificationsResult> = {
  name: 'notifications',
  description: 'Check your GitHub notifications',
  requires: ['github.com'],

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
    return { notifications, total: notifications.length };
  },
};
