# OpenBrowser

**Give your AI agent a browser.** Managed authenticated Chrome sessions with CDP access, session health monitoring, built-in recipes, and cross-platform service management.

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
openbrowser recipe run linkedin     # LinkedIn notifications
openbrowser recipe run search --arg query="AI agent frameworks 2026"
```

## Commands

### `openbrowser setup`

Installs a Chrome service (systemd on Linux, launchd on macOS), creates the profile directory, saves config, and outputs MCP configuration for Claude Desktop.

### `openbrowser login`

Opens Chrome with the managed profile for manual login.

- **macOS:** Opens a Chrome window. Log into your accounts, then close the window. Works even with another Chrome instance open (separate profile directory).
- **Linux (headless):** Starts Xvfb + Chrome + VNC. Connect via SSH tunnel and VNC client to log in remotely.

### `openbrowser status`

Shows Chrome status and session health. Sessions are verified via CDP cookies (live, decrypted values from the running browser).

```
Chrome
  Status:    running (pid 12345)
  Version:   Chrome/145.0.6490.0
  Endpoint:  http://localhost:9222
  Profile:   ~/.openbrowser/chrome-profile

Sessions
  google.com       active    expires in 687 days
  github.com       active    expires in 12 days
  linkedin.com     active    expires in 364 days
```

### `openbrowser doctor`

Full diagnostics: Chrome binary, profile directory, CDP connection, session health, stale locks, config file. Each failure includes a fix suggestion.

### `openbrowser recipe list`

Shows available recipes with descriptions and required sessions.

### `openbrowser recipe run <name>`

Runs a recipe against the authenticated browser. Checks session health before running; if a required session is expired, tells you to run `openbrowser login` instead of failing with a cryptic error.

Available recipes:

| Recipe | Description | Requires |
|--------|-------------|----------|
| `prs` | List your open GitHub pull requests | github.com |
| `inbox` | Check Gmail for unread messages | google.com |
| `linkedin` | Check LinkedIn notifications | linkedin.com |
| `search` | Search Google and return results | google.com |

The `search` recipe takes a query argument:

```bash
openbrowser recipe run search --arg query="your search terms"
```

### Output Format

All commands support `--format json|text`. Default: text when interactive (TTY), JSON when piped.

JSON output uses a typed envelope:

```json
{
  "command": "recipe:prs",
  "version": "0.1.1",
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

## MCP Integration

After `openbrowser setup`, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint=http://localhost:9222"]
    }
  }
}
```

Your AI agent now has access to your authenticated browser sessions via Playwright MCP.

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

// Run a recipe
const prs = await ob.runRecipe('prs');
console.log(prs);

// Direct CDP connection (Playwright Browser handle)
const browser = await ob.connect();
const page = await browser.contexts()[0].newPage();
await page.goto('https://example.com');
// ... use authenticated browser
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
  Recipe,
  RecipeListItem,
  PrsResult,
  InboxResult,
  LinkedInResult,
  SearchResult,
} from 'openbrowser-ai';
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
  }
}
```

The `rateLimits` field sets minimum milliseconds between requests per domain. Recipes automatically respect these limits.

## How It Works

1. **Chrome runs as a service** (systemd/launchd) with a dedicated profile directory
2. **CDP (Chrome DevTools Protocol)** exposes the running browser on `localhost:9222`
3. **Sessions persist** in the Chrome profile; cookies survive restarts
4. **Session health** is monitored by reading cookies via CDP (not from encrypted SQLite)
5. **Recipes** connect via CDP, open pages in the existing browser context, and extract data
6. **MCP integration** lets AI agents use the same authenticated browser via Playwright MCP

## Requirements

- Node.js >= 18
- Google Chrome or Chromium
- macOS or Linux (Windows not supported)
- For Linux headless login: Xvfb, x11vnc

## License

MIT
