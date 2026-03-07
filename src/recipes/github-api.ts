import { execFileSync } from 'node:child_process';

let cachedToken: string | null | undefined;

/** Detect a GitHub API token from env vars or gh CLI. Returns null if none found. */
export function getGitHubToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;

  // 1. GITHUB_TOKEN env var (CI, Codespaces, manual)
  const envToken = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
  if (envToken) {
    cachedToken = envToken;
    return envToken;
  }

  // 2. gh CLI auth token
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token) {
      cachedToken = token;
      return token;
    }
  } catch {
    // gh not installed or not authenticated
  }

  // Don't cache null: allows re-checking if env vars are set later (e.g., long-running MCP server)
  return null;
}

/** Clear cached token (for testing). */
export function clearTokenCache(): void {
  cachedToken = undefined;
}

/** Call GitHub API with token auth. Returns parsed JSON or throws. */
export async function githubApi<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'openbrowser-ai',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}
