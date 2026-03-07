import type { Browser } from 'playwright-core';
import type { Recipe, LinkedInResult, LinkedInNotification } from './base.js';
import { newPage, warnIfEmpty } from './base.js';

export const linkedinRecipe: Recipe<LinkedInResult> = {
  name: 'linkedin',
  description: 'See your LinkedIn notifications',
  requires: ['linkedin.com'],

  async run(browser: Browser): Promise<LinkedInResult> {
    const page = await newPage(browser, 'https://www.linkedin.com/notifications/');

    // Wait for notifications to load
    await page.waitForSelector('.nt-card, .notification-card, article', {
      timeout: 15000,
    }).catch(() => {});

    await page.waitForTimeout(2000);

    const notifications: LinkedInNotification[] = await page.evaluate(() => {
      const results: Array<{ text: string; time: string }> = [];

      // LinkedIn notification cards
      const cards = document.querySelectorAll(
        '.nt-card, .notification-card, article[class*="notification"]',
      );

      for (const card of Array.from(cards).slice(0, 20)) {
        const textEl = card.querySelector(
          '.nt-card__text, .notification-card__text, p, [class*="notification-body"]',
        );
        const text = textEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';

        const timeEl = card.querySelector(
          '.nt-card__time-ago, time, [class*="time-ago"]',
        );
        const time = timeEl?.textContent?.trim() ?? '';

        if (text) {
          results.push({ text, time });
        }
      }
      return results;
    });

    await page.close();

    const { warning } = warnIfEmpty(notifications, 'linkedin');
    return { notifications, total: notifications.length, ...(warning ? { warning } : {}) };
  },
};
