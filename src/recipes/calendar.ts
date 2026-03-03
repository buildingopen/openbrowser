import type { Browser } from 'playwright-core';
import type { Recipe, CalendarResult, CalendarEvent } from './base.js';
import { newPage } from './base.js';

export const calendarRecipe: Recipe<CalendarResult> = {
  name: 'calendar',
  description: "Check today's Google Calendar events",
  requires: ['google.com'],

  async run(browser: Browser): Promise<CalendarResult> {
    const today = new Date().toISOString().split('T')[0];
    const page = await newPage(browser, 'https://calendar.google.com/calendar/r/day');

    // Calendar is heavy JS, give it time
    await page.waitForTimeout(5000);

    await page.waitForSelector('[data-eventid], [data-eventchip], [role="listitem"]', {
      timeout: 20000,
    }).catch(() => {});

    const events: CalendarEvent[] = await page.evaluate(() => {
      const results: Array<{
        title: string;
        startTime: string;
        endTime: string;
        location: string;
        allDay: boolean;
      }> = [];

      // Google Calendar event chips
      const chips = document.querySelectorAll('[data-eventchip], [data-eventid], [role="button"][data-eventid]');

      for (const chip of Array.from(chips).slice(0, 20)) {
        const titleEl = chip.querySelector('[data-eventchip] span, [aria-hidden="true"]') ?? chip;
        const rawText = titleEl?.textContent?.trim() ?? '';
        if (!rawText) continue;

        // Parse "10:00am - 11:00am Event Title" or just "Event Title" (all-day)
        const timeMatch = rawText.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\s+(.+)/);

        if (timeMatch) {
          results.push({
            title: timeMatch[3],
            startTime: timeMatch[1],
            endTime: timeMatch[2],
            location: '',
            allDay: false,
          });
        } else {
          results.push({
            title: rawText,
            startTime: '',
            endTime: '',
            location: '',
            allDay: true,
          });
        }
      }

      // Also try the schedule/agenda view items
      const listItems = document.querySelectorAll('[role="listitem"]');
      for (const item of listItems) {
        const text = item.textContent?.trim() ?? '';
        if (text && !results.some((r) => text.includes(r.title))) {
          results.push({
            title: text.replace(/\s+/g, ' ').slice(0, 200),
            startTime: '',
            endTime: '',
            location: '',
            allDay: false,
          });
        }
      }

      return results;
    });

    await page.close();
    return { events, total: events.length, date: today };
  },
};
