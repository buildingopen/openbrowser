import type { Browser } from 'playwright-core';
import type { Recipe, InboxResult, EmailInfo } from './base.js';
import { newPage, warnIfEmpty } from './base.js';
import { getGmailCredentials, fetchInboxViaImap } from './gmail-imap.js';

export const inboxRecipe: Recipe<InboxResult> = {
  name: 'inbox',
  description: 'Read your unread emails',
  requires: ['google.com'],

  async runWithoutBrowser(): Promise<InboxResult | null> {
    const creds = getGmailCredentials();
    if (!creds) return null;
    const result = await fetchInboxViaImap(creds.user, creds.password);
    const { warning } = warnIfEmpty(result.messages, 'inbox');
    return { ...result, ...(warning ? { warning } : {}) };
  },

  async run(browser: Browser): Promise<InboxResult> {
    const page = await newPage(browser, 'https://mail.google.com/mail/u/0/#inbox');

    // Gmail's JS-heavy UI needs time to load
    await page.waitForTimeout(5000);

    // Wait for the inbox to render
    await page.waitForSelector('tr.zA, div[role="main"]', {
      timeout: 20000,
    }).catch(() => {});

    const messages: EmailInfo[] = await page.evaluate(() => {
      const results: Array<{
        from: string;
        subject: string;
        snippet: string;
        receivedAt: string;
      }> = [];

      // Gmail renders email rows as <tr class="zA"> (zE = read, zA = any)
      const rows = document.querySelectorAll('tr.zA');

      for (const row of Array.from(rows).slice(0, 20)) {
        // Sender is in <span class="bA4"> or similar
        const fromEl = row.querySelector('.yW span[email], .yW .bA4, .yW span');
        const from = fromEl?.getAttribute('email') ?? fromEl?.textContent?.trim() ?? '';

        // Subject
        const subjectEl = row.querySelector('.bog span, .y6 span');
        const subject = subjectEl?.textContent?.trim() ?? '';

        // Snippet
        const snippetEl = row.querySelector('.y2');
        const snippet = snippetEl?.textContent?.trim().replace(/^\s*-\s*/, '') ?? '';

        // Time
        const timeEl = row.querySelector('.xW span[title], td.xW span');
        const receivedAt = timeEl?.getAttribute('title') ?? timeEl?.textContent?.trim() ?? '';

        if (from || subject) {
          results.push({ from, subject, snippet, receivedAt });
        }
      }
      return results;
    });

    // Count unread
    const unread = await page.evaluate(() => {
      // Gmail shows unread count in the inbox link
      const inboxLink = document.querySelector('a[href*="#inbox"] .bsU, .aim .bsU');
      if (inboxLink) {
        const count = parseInt(inboxLink.textContent?.trim() ?? '0', 10);
        return isNaN(count) ? 0 : count;
      }
      // Fallback: count unread rows
      return document.querySelectorAll('tr.zE').length;
    });

    await page.close();

    const { warning } = warnIfEmpty(messages, 'inbox');
    return { unread, messages, ...(warning ? { warning } : {}) };
  },
};
