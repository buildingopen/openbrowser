# OpenBrowser

Give AI your browser. Persistent Chrome sessions so AI can check email, review PRs, search the web as you.

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
- `src/lib/platform.ts` - OS detection, Chrome binary location, lock cleanup, port checking, command detection
- `src/lib/config.ts` - `~/.openbrowser/config.json` management (chmod 600, permission warnings)
- `src/lib/output.ts` - JSON/text output with `CommandOutput<T>` envelope
- `src/lib/rate-limiter.ts` - Per-domain rate limiting for recipes
- `src/lib/types.ts` - All interfaces and auth cookie specs
- `src/mcp/server.ts` - Built-in MCP server (31 tools, stdio transport, tool annotations, URL validation, rate limiting)
- `src/recipes/` - Recipe system (base interface, registry, built-in recipes)
  - `base.ts` - Recipe interface, result types, `newPage()` helper, `withRetry()`, `RecipeError`, `warnIfEmpty()`
  - `index.ts` - Recipe registry (getRecipe, listRecipes)
  - `github-api.ts` - GitHub API token detection + fetch helper (used by prs, issues, notifications)
  - `gmail-imap.ts` - Raw IMAP client over TLS for Gmail inbox (no dependencies, buffer limits, session timeout)
  - `google-calendar-api.ts` - Google Calendar API client with OAuth/API key/refresh token support
  - `prs.ts`, `inbox.ts`, `linkedin.ts`, `search.ts` - Phase 2 recipes
  - `issues.ts`, `notifications.ts`, `calendar.ts` - Phase 3 recipes
  - `linkedin-profile.ts`, `linkedin-messages.ts` - Phase 3 recipes

## Key Patterns

- ESM (`"type": "module"`) with `.js` extensions in imports
- `playwright-core` not `playwright` (no bundled browsers)
- CDP `browser.close()` only disconnects, does NOT kill Chrome
- Output format auto-detected: JSON when piped, text when TTY
- All JSON output uses `CommandOutput<T>` envelope (including setup command)
- `setup()` returns `SetupData` and auto-starts service; `start()`/`restart()` are async with port check + CDP verification
- Modern launchctl API (bootstrap/bootout) with legacy fallback
- Windows blocked at runtime with clear message
- Recipes check session health before running (unless `runWithoutBrowser` succeeds first)
- 6 of 9 recipes have API-first paths via `runWithoutBrowser`: GitHub (token), Gmail (IMAP), Calendar (API); fall back to browser scraping
- Rate limiter enforces per-domain delays (configurable in config.json)
- Custom domains merge with built-in specs in SessionManager
- MCP server uses low-level Server API (not McpServer wrapper, avoids TS deep type issues)
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) for client permission prompts
- `session_cookies` filters out sensitive auth cookies (SID, HSID, li_at, user_session, etc.)
- `browser_evaluate` marked as destructive + open-world with security warning in description
- `setup_guide` tool provides interactive setup instructions for API-first recipes
- URL validation: `validateUrl()` blocks non-http(s) protocols, `validateUrlWithDns()` also resolves hostname to check for private IPs (DNS rebinding protection). Called in `browser_navigate` and `browser_new_tab`
- MCP rate limiting: per-category delays (navigate 500ms, interact 200ms, evaluate 1000ms) prevent runaway agents. Read-only tools are unlimited
- Recipe `warnIfEmpty()`: all list-returning recipes append a warning string when results are empty (page structure may have changed)
- Config permissions: `saveConfig()` sets chmod 600, `loadConfig()` warns to stderr if file is world-readable
- IMAP hardening: 1MB per-command buffer, 5MB session buffer, 10s connect timeout, 30s session timeout
- Exported test helpers: `validateUrl`, `validateUrlWithDns`, `isPrivateHost`, `getToolCategory` from server.ts; `warnIfEmpty` from base.ts

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
