# OpenBrowser

Managed authenticated browser for AI agents. Persistent Chrome sessions with CDP access.

## Architecture

- `src/index.ts` - CLI entry (commander, `parseAsync`)
- `src/commands/` - Thin wrappers (<15 lines each), call core methods
- `src/lib/core.ts` - `OpenBrowser` class, single API surface for CLI and SDK
- `src/lib/chrome-service.ts` - Service management (systemd/launchd), Chrome lifecycle
- `src/lib/session.ts` - Session health via CDP cookies (Playwright `connectOverCDP`)
- `src/lib/platform.ts` - OS detection, Chrome binary location, lock cleanup
- `src/lib/config.ts` - `~/.openbrowser/config.json` management
- `src/lib/output.ts` - JSON/text output with `CommandOutput<T>` envelope
- `src/lib/rate-limiter.ts` - Per-domain rate limiting for recipes
- `src/lib/types.ts` - All interfaces and auth cookie specs
- `src/recipes/` - Recipe system (base interface, registry, built-in recipes)
  - `base.ts` - Recipe interface, result types, `newPage()` helper
  - `index.ts` - Recipe registry (getRecipe, listRecipes)
  - `prs.ts` - GitHub PRs recipe
  - `inbox.ts` - Gmail inbox recipe
  - `linkedin.ts` - LinkedIn notifications recipe
  - `search.ts` - Google search recipe

## Key Patterns

- ESM (`"type": "module"`) with `.js` extensions in imports
- `playwright-core` not `playwright` (no bundled browsers)
- CDP `browser.close()` only disconnects, does NOT kill Chrome
- Output format auto-detected: JSON when piped, text when TTY
- All JSON output uses `CommandOutput<T>` envelope
- Windows blocked at runtime with clear message
- Recipes check session health before running
- Rate limiter enforces per-domain delays (configurable in config.json)

## Build

```bash
npm run build  # tsc -> dist/
```

## Dependencies

- `commander` - CLI framework
- `playwright-core` - CDP connection for cookie/session reading and recipes
- `chalk` - Terminal colors for text output
