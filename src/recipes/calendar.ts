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

    await page.waitForSelector('[data-eventid], [data-eventchip]', {
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

      // Material Icon names that leak into textContent
      const iconNames = new Set([
        'date_range', 'more_vert', 'link', 'clear', 'event', 'schedule',
        'location_on', 'videocam', 'edit', 'delete', 'close', 'done',
      ]);

      function cleanText(raw: string): string {
        // Remove Material Icon ligature names and extra whitespace
        return raw
          .split(/\s+/)
          .filter((w) => !iconNames.has(w))
          .join(' ')
          .replace(/Copy link|Options for .+$|Unsubscribe from .+$/g, '')
          .trim();
      }

      // Get event chips from the main calendar grid
      const chips = document.querySelectorAll('[data-eventchip]');

      for (const chip of Array.from(chips).slice(0, 20)) {
        // Use aria-label first (cleanest source), fallback to textContent
        const ariaLabel = chip.getAttribute('aria-label') ?? '';
        const rawText = ariaLabel || (chip.textContent?.trim() ?? '');
        if (!rawText) continue;

        const cleaned = cleanText(rawText);
        if (!cleaned || cleaned.length < 3) continue;

        // Try to parse time from aria-label format: "Event Title, March 3, 3pm to 4pm"
        // or from text format: "3pm - 4pm Event Title"
        const ariaTimeMatch = cleaned.match(/,\s*\w+\s+\d+,?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/);
        const textTimeMatch = cleaned.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\s+(.+)/);
        // Also handle "Event Title, 3pm" or "Event Title3pm" patterns
        const suffixTimeMatch = cleaned.match(/^(.+?),?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))\s*(?:[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)))?/);

        if (ariaTimeMatch) {
          // Extract title: everything before the date portion
          const titleMatch = cleaned.match(/^(.+?),\s*\w+\s+\d+/);
          const title = titleMatch ? titleMatch[1].trim() : cleaned.split(',')[0].trim();
          results.push({
            title,
            startTime: ariaTimeMatch[1],
            endTime: ariaTimeMatch[2],
            location: '',
            allDay: false,
          });
        } else if (textTimeMatch) {
          results.push({
            title: textTimeMatch[3].trim(),
            startTime: textTimeMatch[1],
            endTime: textTimeMatch[2],
            location: '',
            allDay: false,
          });
        } else if (suffixTimeMatch && suffixTimeMatch[2]) {
          results.push({
            title: suffixTimeMatch[1].trim(),
            startTime: suffixTimeMatch[2],
            endTime: suffixTimeMatch[3] ?? '',
            location: '',
            allDay: false,
          });
        } else {
          results.push({
            title: cleaned,
            startTime: '',
            endTime: '',
            location: '',
            allDay: true,
          });
        }
      }

      // Deduplicate by title
      const seen = new Set<string>();
      return results.filter((e) => {
        const key = e.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    await page.close();
    return { events, total: events.length, date: today };
  },
};
