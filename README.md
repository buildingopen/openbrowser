# OpenBrowser

**Give your AI agent a browser.** Managed authenticated Chrome sessions with CDP access, session health monitoring, built-in MCP server, recipes, and cross-platform service management.

OpenBrowser solves the "authenticated browser" problem for AI agents: your agent needs to check Gmail, review GitHub PRs, or search the web as you, not as an anonymous user. OpenBrowser manages a persistent Chrome instance with your sessions, exposes it via CDP, and provides recipes for common tasks.

```
npx openbrowser setup     # Install Chrome service, configure MCP
npx openbrowser login     # Log into your accounts
npx openbrowser recipe run prs   # Check your GitHub PRs
```

**macOS + Linux.** Works standalone or as an MCP server for Claude, Cursor, and other AI tools.

---

## Install

```bash
npm install -g openbrowser-ai
```

Or use directly:

```bash
npx openbrowser-ai <command>
```

Both `openbrowser` and `openbrowser-ai` work as CLI names.

## Quick Start

```bash
# 1. Install Chrome service and configure
openbrowser setup

# 2. Log into your accounts (opens Chrome GUI on macOS, VNC on Linux)
openbrowser login

# 3. Check session health
openbrowser status

# 4. Run a recipe
openbrowser recipe run prs          # GitHub PRs
openbrowser recipe run inbox        # Gmail inbox
openbrowser recipe run calendar     # Today's Google Calendar events
openbrowser recipe run search --arg query="AI agent frameworks 2026"
```

## Commands

### Service Control

```bash
openbrowser setup      # Install Chrome service, save config, output MCP config
openbrowser start      # Start the Chrome service
openbrowser stop       # Stop the Chrome service
openbrowser restart    # Restart the Chrome service
openbrowser login      # Open Chrome GUI for manual login
openbrowser status     # Show Chrome status and session health
openbrowser sessions   # List all tracked sessions
openbrowser doctor     # Run full diagnostics
```

### Custom Auth Domains

Track sessions beyond the built-in Google/GitHub/LinkedIn:

```bash
openbrowser domain add slack.com d lc --label Slack
openbrowser domain add jira.atlassian.net cloud.session.token --label Jira
openbrowser domain list
openbrowser domain remove slack.com
```

Custom domains persist to config and appear in `status`, `sessions`, and `doctor`.

### Recipes

```bash
openbrowser recipe list              # Show all available recipes
openbrowser recipe run <name>        # Run a recipe
```

| Recipe | Description | Requires |
|--------|-------------|----------|
| `prs` | List your open GitHub pull requests | github.com |
| `inbox` | Check Gmail for unread messages | google.com |
| `linkedin` | Check LinkedIn notifications | linkedin.com |
| `search` | Search Google and return results | google.com |
| `issues` | List GitHub issues assigned to you | github.com |
| `notifications` | Check GitHub notifications | github.com |
| `calendar` | Today's Google Calendar events | google.com |
| `profile` | Get your LinkedIn profile summary | linkedin.com |
| `messages` | Check LinkedIn unread messages | linkedin.com |

The `search` recipe takes a query argument:

```bash
openbrowser recipe run search --arg query="your search terms"
```

Recipes check session health before running. If a required session is expired, you get a clear error with `Run: openbrowser login` instead of a cryptic failure. Recipes also support retry/timeout infrastructure via `withRetry()`.

### Built-in MCP Server

OpenBrowser includes a built-in MCP server with 27 tools (session management, full browser control, recipes):

```bash
openbrowser mcp    # Start stdio MCP server
```

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openbrowser": {
      "command": "npx",
      "args": ["openbrowser-ai", "mcp"]
    }
  }
}
```

MCP tools include:

**Session tools:** `session_list`, `session_check`, `session_cookies`, `service_status`, `service_diagnose`

**Browser tools:** `browser_navigate`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_select`, `browser_hover`, `browser_evaluate`, `browser_wait`, `browser_back`, `browser_forward`, `browser_tabs`, `browser_new_tab`

**Recipe tools:** `recipe_list`, `recipe_run`, `recipe_run_prs`, `recipe_run_inbox`, `recipe_run_issues`, `recipe_run_notifications`, `recipe_run_calendar`, `recipe_run_profile`, `recipe_run_messages`

### Output Format

All commands support `--format json|text`. Default: text when interactive (TTY), JSON when piped.

JSON output uses a typed envelope:

```json
{
  "command": "recipe:prs",
  "version": "0.4.0",
  "timestamp": "2026-03-03T00:00:00.000Z",
  "success": true,
  "data": {
    "prs": [
      { "title": "Fix auth flow", "repo": "org/repo", "url": "..." }
    ],
    "total": 1
  },
  "summary": "1 open PR"
}
```

### Profile Override

Use `--profile` to point at an existing Chrome profile directory:

```bash
openbrowser status --profile /root/.config/authenticated-chrome
```

## Programmatic API (SDK)

Use OpenBrowser as a library in your own tools:

```typescript
import { OpenBrowser } from 'openbrowser-ai';

const ob = new OpenBrowser();

// Check session health
const status = await ob.getStatus();
for (const session of status.sessions) {
  console.log(`${session.domain}: ${session.active ? 'active' : 'inactive'}`);
}

// Service control
ob.startService();
ob.stopService();

// Custom domains
ob.addDomain('slack.com', ['d', 'lc'], 'Slack');
const domains = ob.listDomains();

// Run a recipe
const prs = await ob.runRecipe('prs');
console.log(prs);

// Direct CDP connection (Playwright Browser handle)
const browser = await ob.connect();
const page = await browser.contexts()[0].newPage();
await page.goto('https://example.com');
await browser.close(); // disconnects only, Chrome stays running
```

### Exported Types

```typescript
import type {
  OpenBrowser,
  Config,
  StatusData,
  SessionInfo,
  DoctorData,
  DoctorCheck,
  CommandOutput,
  AuthCookieSpec,
  Recipe,
  RecipeListItem,
  RecipeOptions,
  PrsResult,
  InboxResult,
  LinkedInResult,
  SearchResult,
  IssuesResult,
  NotificationsResult,
  CalendarResult,
  ProfileResult,
  MessagesResult,
} from 'openbrowser-ai';

import { RecipeError, withRetry } from 'openbrowser-ai';
```

## Configuration

Config file: `~/.openbrowser/config.json`

```json
{
  "cdpPort": 9222,
  "profileDir": "~/.openbrowser/chrome-profile",
  "timezone": "Europe/Berlin",
  "vncPassword": "temp1234",
  "vncPort": 5900,
  "xvfbDisplay": ":98",
  "rateLimits": {
    "linkedin.com": 5000,
    "google.com": 2000
  },
  "customDomains": [
    { "domain": "slack.com", "requiredCookies": ["d", "lc"], "label": "Slack" }
  ]
}
```

## How It Works

1. **Chrome runs as a service** (systemd/launchd) with a dedicated profile directory
2. **CDP (Chrome DevTools Protocol)** exposes the running browser on `localhost:9222`
3. **Sessions persist** in the Chrome profile; cookies survive restarts
4. **Session health** is monitored by reading cookies via CDP (not from encrypted SQLite)
5. **Recipes** connect via CDP, open pages in the existing browser context, and extract data
6. **Built-in MCP server** gives AI agents session management, browser control, and recipes via a single `openbrowser mcp` command

## Requirements

- Node.js >= 18
- Google Chrome or Chromium
- macOS or Linux (Windows not supported)
- For Linux headless login: Xvfb, x11vnc

## License

MIT
