import type { Browser } from 'playwright-core';
import type { Recipe, MessagesResult, MessageThread } from './base.js';
import { newPage } from './base.js';

export const linkedinMessagesRecipe: Recipe<MessagesResult> = {
  name: 'messages',
  description: 'Check your LinkedIn unread messages',
  requires: ['linkedin.com'],

  async run(browser: Browser): Promise<MessagesResult> {
    const page = await newPage(browser, 'https://www.linkedin.com/messaging/');

    await page.waitForSelector('.msg-conversation-listitem, .msg-conversations-container, [class*="msg-conversation"]', {
      timeout: 15000,
    }).catch(() => {});

    await page.waitForTimeout(2000);

    const conversations: MessageThread[] = await page.evaluate(() => {
      const results: Array<{
        name: string;
        lastMessage: string;
        time: string;
        unread: boolean;
      }> = [];

      const items = document.querySelectorAll('.msg-conversation-listitem, [class*="msg-conversation-listitem"]');

      for (const item of Array.from(items).slice(0, 20)) {
        const nameEl = item.querySelector('.msg-conversation-listitem__participant-names, [class*="participant-names"]');
        const name = nameEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';

        const msgEl = item.querySelector('.msg-conversation-listitem__message-snippet, [class*="message-snippet"]');
        const lastMessage = msgEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';

        const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp, time, [class*="time-stamp"]');
        const time = timeEl?.textContent?.trim() ?? '';

        const unread = item.classList.contains('msg-conversation-card--unread') ||
          item.querySelector('[class*="unread"]') !== null;

        if (name) {
          results.push({ name, lastMessage, time, unread });
        }
      }
      return results;
    });

    await page.close();
    return { conversations, total: conversations.length };
  },
};
