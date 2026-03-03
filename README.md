# OpenBrowser

Managed authenticated browser for AI agents. Persistent Chrome sessions with CDP access, session health monitoring, and cross-platform service management.

Supports **macOS** and **Linux**. Windows is not supported.

## Quick Start

```bash
# Install and configure
npx openbrowser setup

# Log into websites (opens Chrome GUI on macOS, VNC on Linux)
npx openbrowser login

# Check status
npx openbrowser status

# Full diagnostics
npx openbrowser doctor
```

## Commands

### `openbrowser setup`

Installs a Chrome service (systemd on Linux, launchd on macOS), creates the profile directory, saves default config, and outputs MCP configuration.

### `openbrowser login`

Opens Chrome with the managed profile for manual login.

- **macOS:** Opens a Chrome window directly. Log into your accounts, then close the window.
- **Linux (headless):** Starts Xvfb + Chrome + VNC. Connect via SSH tunnel and VNC client.

### `openbrowser status`

Shows Chrome status and session health for Google, GitHub, and LinkedIn. Sessions are verified via CDP cookies (decrypted, live values).

### `openbrowser doctor`

Runs diagnostics: Chrome binary, profile directory, CDP connection, session health, stale locks, config file. Each failure includes a fix suggestion.

### Output Format

All commands support `--format json|text`. Default: text when interactive (TTY), JSON when piped.

JSON output uses a typed envelope:

```json
{
  "command": "status",
  "version": "0.1.0",
  "timestamp": "2026-03-03T00:00:00.000Z",
  "success": true,
  "data": { ... },
  "summary": "Chrome running, 3 active sessions"
}
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

## Programmatic Usage

```typescript
import { OpenBrowser } from 'openbrowser';

const ob = new OpenBrowser();
const status = await ob.getStatus();
console.log(status.sessions);

// Direct CDP connection
const browser = await ob.connect();
const page = await browser.contexts()[0].newPage();
// ... use authenticated browser
await browser.close(); // disconnects only, Chrome stays running
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
  "xvfbDisplay": ":98"
}
```

## License

MIT
