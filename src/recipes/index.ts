import type { Recipe, RecipeListItem } from './base.js';
import { prsRecipe } from './prs.js';
import { inboxRecipe } from './inbox.js';
import { linkedinRecipe } from './linkedin.js';
import { searchRecipe } from './search.js';
import { issuesRecipe } from './issues.js';
import { notificationsRecipe } from './notifications.js';
import { calendarRecipe } from './calendar.js';
import { linkedinProfileRecipe } from './linkedin-profile.js';
import { linkedinMessagesRecipe } from './linkedin-messages.js';

const recipes = new Map<string, Recipe>([
  ['prs', prsRecipe],
  ['inbox', inboxRecipe],
  ['linkedin', linkedinRecipe],
  ['search', searchRecipe],
  ['issues', issuesRecipe],
  ['notifications', notificationsRecipe],
  ['calendar', calendarRecipe],
  ['profile', linkedinProfileRecipe],
  ['messages', linkedinMessagesRecipe],
]);

export function getRecipe(name: string): Recipe | undefined {
  return recipes.get(name);
}

export function listRecipes(): RecipeListItem[] {
  return Array.from(recipes.values()).map((r) => ({
    name: r.name,
    description: r.description,
    requires: r.requires,
    args: r.args,
  }));
}

export type { Recipe, RecipeListItem } from './base.js';
export type {
  PrsResult,
  InboxResult,
  LinkedInResult,
  SearchResult,
  IssuesResult,
  NotificationsResult,
  CalendarResult,
  ProfileResult,
  MessagesResult,
} from './base.js';
export { RecipeError, withRetry } from './base.js';
export type { RecipeOptions } from './base.js';
