import { OpenBrowser } from '../lib/core.js';
import { createOutput, resolveFormat, printOutput } from '../lib/output.js';

export async function recipeListCommand(options: {
  format?: string;
  profile?: string;
}): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });
  const recipes = ob.listRecipes();

  const summary = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'} available`;
  const output = createOutput('recipe:list', recipes, summary);
  printOutput(output, resolveFormat(options.format));
}

export async function recipeRunCommand(
  name: string,
  options: { format?: string; profile?: string; arg?: string[] },
): Promise<void> {
  const ob = new OpenBrowser({ profileDir: options.profile });

  // Parse --arg key=value pairs
  const args: Record<string, string> = {};
  if (options.arg) {
    for (const pair of options.arg) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) {
        console.error(`Invalid arg format: ${pair}. Use: --arg key=value`);
        process.exitCode = 1;
        return;
      }
      args[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }
  }

  try {
    const data = await ob.runRecipe(name, args);
    const summary = formatRecipeSummary(name, data);
    const output = createOutput(`recipe:${name}`, data, summary);
    printOutput(output, resolveFormat(options.format));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = createOutput(`recipe:${name}`, null, message, false, message);
    printOutput(output, resolveFormat(options.format));
    process.exitCode = 1;
  }
}

function formatRecipeSummary(name: string, data: unknown): string {
  if (!data || typeof data !== 'object') return `${name} completed`;

  const d = data as Record<string, unknown>;
  switch (name) {
    case 'prs':
      return `${d.total ?? 0} open PR${(d.total as number) === 1 ? '' : 's'}`;
    case 'inbox':
      return `${d.unread ?? 0} unread message${(d.unread as number) === 1 ? '' : 's'}`;
    case 'linkedin':
      return `${d.total ?? 0} notification${(d.total as number) === 1 ? '' : 's'}`;
    case 'search':
      return `${d.total ?? 0} result${(d.total as number) === 1 ? '' : 's'} for "${d.query}"`;
    case 'issues':
      return `${d.total ?? 0} issue${(d.total as number) === 1 ? '' : 's'} assigned`;
    case 'notifications':
      return `${d.total ?? 0} notification${(d.total as number) === 1 ? '' : 's'}`;
    case 'calendar':
      return `${d.total ?? 0} event${(d.total as number) === 1 ? '' : 's'} today`;
    case 'profile':
      return `Profile: ${d.name ?? 'unknown'}`;
    case 'messages':
      return `${d.total ?? 0} conversation${(d.total as number) === 1 ? '' : 's'}`;
    default:
      return `${name} completed`;
  }
}
