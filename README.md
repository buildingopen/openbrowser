# OpenBrowser

**Give AI your browser.** Check email, review PRs, read LinkedIn messages, search Google, see your calendar -- all from one setup. No API keys. No OAuth. No per-service config.

Log into Chrome once, and AI tools like Claude, Cursor, and others can browse the web as you.

```bash
npx openbrowser setup     # One-time setup (~2 min)
npx openbrowser login     # Log into Google, GitHub, LinkedIn
npx openbrowser inbox     # AI reads your unread emails
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
# 1. Set up OpenBrowser (~2 min, one time)
openbrowser setup

# 2. Log into your accounts
openbrowser login

# 3. See which accounts are connected
openbrowser status

# 4. Try it out
openbrowser inbox                   # Read your unread emails
openbrowser prs                     # Check your open pull requests
openbrowser calendar                # See today's meetings and events
openbrowser search "AI agent frameworks 2026"
```

## What Your AI Can Do

```bash
openbrowser inbox                    # Read your unread emails
openbrowser prs                      # Check your open pull requests
openbrowser calendar                 # See today's meetings and events
openbrowser search "your query"      # Search Google as you
openbrowser issues                   # Check issues assigned to you
openbrowser notifications            # Read your GitHub notifications
openbrowser linkedin                 # See your LinkedIn notifications
openbrowser profile                  # Get your LinkedIn profile
openbrowser messages                 # Read your LinkedIn messages
openbrowser recipe list              # See all 9 recipes
```

All recipes work through the browser by default. 6 of 9 also have faster API paths that work without the browser (GitHub via token, Gmail via IMAP, Calendar via API). See [API-first setup](#api-first-setup-optional) for details.

## Commands

```bash
openbrowser setup      # One-time setup (~2 min)
openbrowser login      # Log into your accounts
openbrowser status     # See which accounts are connected
openbrowser start      # Start the browser
openbrowser stop       # Stop the browser
openbrowser restart    # Restart the browser
openbrowser doctor     # Diagnose connection issues
```

## Connect to AI Tools

OpenBrowser includes a built-in MCP server so AI tools can use your browser directly.

Add this to your Claude Desktop settings:

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

The MCP server provides 31 tools: session management, full browser control, and all 9 recipes.

## How It Works

OpenBrowser keeps Chrome running in the background with your real login sessions. When your AI needs to check email or review a PR, it connects to that browser and browses as you.

1. **Setup** installs Chrome as a background process that starts automatically
2. **Login** opens Chrome so you can sign into your accounts normally
3. **Sessions persist** across restarts -- no need to log in again
4. **Recipes** connect to the running browser, open pages, and extract structured data
5. **MCP server** gives AI tools direct access to sessions, browser control, and recipes

## Requirements

- Node.js >= 22.6
- Google Chrome or Chromium
- macOS or Linux (Windows not supported)

---

## Advanced

### API-First Setup (Optional)

6 of 9 recipes can skip the browser entirely if you set env vars. This is faster and works on machines without a display.

**GitHub** (prs, issues, notifications):
```bash
gh auth login              # easiest
# or: export GITHUB_TOKEN="ghp_..."
```

**Gmail** (inbox):
```bash
export GMAIL_USER="you@gmail.com"
export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

**Google Calendar** (calendar):
```bash
export GOOGLE_ACCESS_TOKEN="ya29...."
# or: export GOOGLE_CALENDAR_API_KEY="AIza..."
```

### Custom Accounts

Track sessions beyond the built-in Google/GitHub/LinkedIn:

```bash
openbrowser domain add slack.com d lc --label Slack
openbrowser domain list
openbrowser domain remove slack.com
```

### Output Format

All commands support `--format json|text`. Default: text when interactive (TTY), JSON when piped.

```json
{
  "command": "recipe:prs",
  "version": "0.4.0",
  "timestamp": "2026-03-03T00:00:00.000Z",
  "success": true,
  "data": { "prs": [...], "total": 1 },
  "summary": "1 open PR"
}
```

### Programmatic API (SDK)

```typescript
import { OpenBrowser } from 'openbrowser-ai';

const ob = new OpenBrowser();
const status = await ob.getStatus();
const prs = await ob.runRecipe('prs');
const browser = await ob.connect(); // Direct Playwright CDP handle
```

### Configuration

Config file: `~/.openbrowser/config.json`

```json
{
  "cdpPort": 9222,
  "profileDir": "~/.openbrowser/chrome-profile",
  "timezone": "Europe/Berlin"
}
```

### Linux Headless

On headless Linux servers, `openbrowser login` uses a virtual display with VNC so you can log in remotely. Requires `xvfb` and `x11vnc`:

```bash
apt install xvfb x11vnc
```

## License

MIT
