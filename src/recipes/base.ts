import type { Browser, Page } from 'playwright-core';

export interface Recipe<T = unknown> {
  name: string;
  description: string;
  requires: string[];
  args?: RecipeArg[];
  run(browser: Browser, args?: Record<string, string>): Promise<T>;
}

export interface RecipeArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface RecipeListItem {
  name: string;
  description: string;
  requires: string[];
  args?: RecipeArg[];
}

export interface PrsResult {
  prs: PrInfo[];
  total: number;
}

export interface PrInfo {
  title: string;
  url: string;
  repo: string;
  state: string;
  updatedAt: string;
}

export interface InboxResult {
  unread: number;
  messages: EmailInfo[];
}

export interface EmailInfo {
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface LinkedInResult {
  notifications: LinkedInNotification[];
  total: number;
}

export interface LinkedInNotification {
  text: string;
  time: string;
}

export interface SearchResult {
  query: string;
  results: SearchResultItem[];
  total: number;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

// Phase 3 result types

export interface IssuesResult {
  issues: IssueInfo[];
  total: number;
}

export interface IssueInfo {
  title: string;
  url: string;
  repo: string;
  state: string;
  labels: string[];
  updatedAt: string;
}

export interface NotificationsResult {
  notifications: GhNotification[];
  total: number;
}

export interface GhNotification {
  repo: string;
  title: string;
  type: string;
  reason: string;
  url: string;
  updatedAt: string;
}

export interface CalendarResult {
  events: CalendarEvent[];
  total: number;
  date: string;
}

export interface CalendarEvent {
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  allDay: boolean;
}

export interface ProfileResult {
  name: string;
  headline: string;
  location: string;
  connections: string;
  profileUrl: string;
}

export interface MessagesResult {
  conversations: MessageThread[];
  total: number;
}

export interface MessageThread {
  name: string;
  lastMessage: string;
  time: string;
  unread: boolean;
}

// Recipe infrastructure

export class RecipeError extends Error {
  constructor(
    message: string,
    public readonly recipeName: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RecipeError';
  }
}

export interface RecipeOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RecipeOptions> = {
  maxRetries: 2,
  retryDelayMs: 1000,
  timeoutMs: 60000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  recipeName: string,
  opts?: RecipeOptions,
): Promise<T> {
  const { maxRetries, retryDelayMs, timeoutMs } = { ...DEFAULT_OPTIONS, ...opts };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RecipeError(`Timed out after ${timeoutMs}ms`, recipeName)), timeoutMs);
      });
      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw new RecipeError(
    `Failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    recipeName,
    lastError,
  );
}

export async function newPage(browser: Browser, url: string): Promise<Page> {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No browser context available. Is Chrome running with a profile?');
  }
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
  return page;
}
