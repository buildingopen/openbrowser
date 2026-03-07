import type { Browser } from 'playwright-core';
import type { Recipe, CalendarResult, CalendarEvent } from './base.js';
import { newPage, warnIfEmpty } from './base.js';
import { getCalendarCredentials, fetchCalendarViaApi } from './google-calendar-api.js';
import { loadConfig } from '../lib/config.js';

export const calendarRecipe: Recipe<CalendarResult> = {
  name: 'calendar',
  description: "See today's meetings and events",
  requires: ['google.com'],

  async runWithoutBrowser(): Promise<CalendarResult | null> {
    const creds = getCalendarCredentials();
    if (!creds) return null;
    const config = loadConfig();
    const result = await fetchCalendarViaApi(creds, config.timezone);
    const { warning } = warnIfEmpty(result.events, 'calendar');
    return { ...result, ...(warning ? { warning } : {}) };
  },

  async run(browser: Browser): Promise<CalendarResult> {
    const today = new Date().toISOString().split('T')[0];
    const page = await newPage(browser, 'https://calendar.google.com/calendar/r/day');

    // Calendar is heavy JS, give it time
    await page.waitForTimeout(5000);

    await page.waitForSelector('[data-eventchip]', {
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

      const chips = document.querySelectorAll('[data-eventchip]');

      for (const chip of Array.from(chips).slice(0, 20)) {
        const raw = chip.textContent?.trim() ?? '';
        if (!raw) continue;

        // Google Calendar textContent format:
        // "<startTime> to <endTime>, <title>, <organizer>, <status>, Location: <loc>, <date>..."
        // or for multi-day: "March 3, 2026 at <startTime> to March 4, 2026 at <endTime>, ..."
        // or for appointment schedule: similar pattern with "appointment schedule:" prefix

        // Try: "Xpm to Ypm, Title, ..."
        const timeCommaMatch = raw.match(
          /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)),\s*(.+)/i,
        );

        // Try: "March X, 2026 at Xpm to March Y, 2026 at Ypm, ..."
        const multiDayMatch = raw.match(
          /^\w+\s+\d+,?\s+\d{4}\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+to\s+\w+\s+\d+,?\s+\d{4}\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)),\s*(.+)/i,
        );

        let startTime = '';
        let endTime = '';
        let title = '';
        let location = '';

        if (timeCommaMatch) {
          startTime = timeCommaMatch[1];
          endTime = timeCommaMatch[2];
          title = timeCommaMatch[3];
        } else if (multiDayMatch) {
          startTime = multiDayMatch[1];
          endTime = multiDayMatch[2];
          title = multiDayMatch[3];
        }

        if (title) {
          // Title is everything up to the first meaningful separator
          // Format: "title, organizer, Accepted/Tentative, Location: X, date"
          const parts = title.split(',').map((s) => s.trim());
          // First part is the title (may include "appointment schedule:" prefix)
          let eventTitle = parts[0].replace(/^appointment schedule:\s*/i, '');

          // Find location if present
          for (const part of parts) {
            if (part.startsWith('Location:')) {
              location = part.replace('Location:', '').trim();
              break;
            }
            if (part === 'No location') break;
          }

          results.push({
            title: eventTitle,
            startTime,
            endTime,
            location,
            allDay: false,
          });
        } else {
          // All-day event or unparseable
          const firstComma = raw.indexOf(',');
          const fallbackTitle = firstComma > 0 ? raw.slice(0, firstComma).trim() : raw.slice(0, 100);
          if (fallbackTitle.length > 3) {
            results.push({
              title: fallbackTitle,
              startTime: '',
              endTime: '',
              location: '',
              allDay: true,
            });
          }
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
    const { warning } = warnIfEmpty(events, 'calendar');
    return { events, total: events.length, date: today, ...(warning ? { warning } : {}) };
  },
};
