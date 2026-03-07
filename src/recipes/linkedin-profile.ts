import type { Browser } from 'playwright-core';
import type { Recipe, ProfileResult } from './base.js';
import { newPage } from './base.js';

export const linkedinProfileRecipe: Recipe<ProfileResult> = {
  name: 'profile',
  description: 'Get your LinkedIn profile',
  requires: ['linkedin.com'],

  async run(browser: Browser): Promise<ProfileResult> {
    const page = await newPage(browser, 'https://www.linkedin.com/in/me/');

    await page.waitForSelector('.text-heading-xlarge, .pv-text-details__left-panel, h1', {
      timeout: 15000,
    }).catch(() => {});

    await page.waitForTimeout(2000);

    const profile = await page.evaluate(() => {
      const nameEl = document.querySelector('.text-heading-xlarge, h1[class*="text-heading"]');
      const name = nameEl?.textContent?.trim() ?? '';

      const headlineEl = document.querySelector('.text-body-medium[data-generated-suggestion-target], div.text-body-medium');
      const headline = headlineEl?.textContent?.trim() ?? '';

      const locationEl = document.querySelector('.text-body-small[class*="inline"] span:first-child, span.text-body-small');
      const location = locationEl?.textContent?.trim() ?? '';

      const connectionsEl = document.querySelector('span.t-bold[class*="connections"], li.text-body-small span.t-bold');
      const connections = connectionsEl?.textContent?.trim() ?? '';

      const profileUrl = window.location.href;

      return { name, headline, location, connections, profileUrl };
    });

    await page.close();
    return profile;
  },
};
