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

export async function newPage(browser: Browser, url: string): Promise<Page> {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No browser context available. Is Chrome running with a profile?');
  }
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return page;
}
