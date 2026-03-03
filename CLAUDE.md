# OpenBrowser

Managed authenticated browser for AI agents. Persistent Chrome sessions with CDP access.

## Architecture

- `src/index.ts` - CLI entry (commander, `parseAsync`)
- `src/commands/` - Thin wrappers (<15 lines each), call core methods
  - `setup.ts`, `login.ts`, `status.ts`, `doctor.ts` - Phase 1 commands
  - `service.ts` - start/stop/restart wrappers
  - `sessions.ts` - List tracked sessions
  - `domain.ts` - add/remove/list custom auth domains
  - `recipe.ts` - recipe list/run
  - `mcp.ts` - Start built-in MCP server
- `src/lib/core.ts` - `OpenBrowser` class, single API surface for CLI and SDK
- `src/lib/chrome-service.ts` - Service management (systemd/launchd), Chrome lifecycle
- `src/lib/session.ts` - Session health via CDP cookies (Playwright `connectOverCDP`)
- `src/lib/platform.ts` - OS detection, Chrome binary location, lock cleanup
- `src/lib/config.ts` - `~/.openbrowser/config.json` management
- `src/lib/output.ts` - JSON/text output with `CommandOutput<T>` envelope
- `src/lib/rate-limiter.ts` - Per-domain rate limiting for recipes
- `src/lib/types.ts` - All interfaces and auth cookie specs
- `src/mcp/server.ts` - Built-in MCP server (28 tools, stdio transport)
- `src/recipes/` - Recipe system (base interface, registry, built-in recipes)
  - `base.ts` - Recipe interface, result types, `newPage()` helper, `withRetry()`, `RecipeError`
  - `index.ts` - Recipe registry (getRecipe, listRecipes)
  - `prs.ts`, `inbox.ts`, `linkedin.ts`, `search.ts` - Phase 2 recipes
  - `issues.ts`, `notifications.ts`, `calendar.ts` - Phase 3 recipes
  - `linkedin-profile.ts`, `linkedin-messages.ts` - Phase 3 recipes

## Key Patterns

- ESM (`"type": "module"`) with `.js` extensions in imports
- `playwright-core` not `playwright` (no bundled browsers)
- CDP `browser.close()` only disconnects, does NOT kill Chrome
- Output format auto-detected: JSON when piped, text when TTY
- All JSON output uses `CommandOutput<T>` envelope
- Windows blocked at runtime with clear message
- Recipes check session health before running
- Rate limiter enforces per-domain delays (configurable in config.json)
- Custom domains merge with built-in specs in SessionManager
- MCP server uses low-level Server API (not McpServer wrapper, avoids TS deep type issues)

## Build

```bash
npm run build  # tsc -> dist/
```

## Dependencies

- `commander` - CLI framework
- `playwright-core` - CDP connection for cookie/session reading and recipes
- `chalk` - Terminal colors for text output
- `@modelcontextprotocol/sdk` - MCP server protocol
- `zod` - Schema validation (required by MCP SDK)
