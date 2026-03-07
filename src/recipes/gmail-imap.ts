import * as tls from 'node:tls';

export interface ImapEmail {
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface ImapInboxResult {
  unread: number;
  messages: ImapEmail[];
}

/** Get Gmail IMAP credentials from env vars. Returns null if not set. */
export function getGmailCredentials(): { user: string; password: string } | null {
  const user = process.env['GMAIL_USER'];
  const password = process.env['GMAIL_APP_PASSWORD'];
  if (user && password) return { user, password };
  return null;
}

/** Escape a string for use in an IMAP quoted-string (RFC 3501). */
export function escapeImapQuoted(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const MAX_COMMAND_BUFFER = 1_048_576; // 1MB per command response
const MAX_SESSION_BUFFER = 5_242_880; // 5MB total session

/** Minimal IMAP client using raw TLS. No dependencies. */
class ImapClient {
  private socket: tls.TLSSocket | null = null;
  private buffer = '';
  private tagCounter = 0;
  private dataHandler: ((data: string) => void) | null = null;
  private sessionBytes = 0;

  async connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('IMAP connect timeout')), 10000);
      let greetingReceived = false;
      this.socket = tls.connect({ host, port, rejectUnauthorized: true });
      this.socket.setEncoding('utf-8');
      this.socket.on('data', (chunk: string) => {
        this.sessionBytes += chunk.length;
        if (this.sessionBytes > MAX_SESSION_BUFFER) {
          this.socket?.destroy();
          reject(new Error('IMAP session exceeded maximum buffer size'));
          return;
        }
        if (!greetingReceived) {
          greetingReceived = true;
          clearTimeout(timeout);
          resolve();
          return;
        }
        this.buffer += chunk;
        if (this.dataHandler) this.dataHandler(chunk);
      });
      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private nextTag(): string {
    this.tagCounter++;
    return `A${String(this.tagCounter).padStart(4, '0')}`;
  }

  async command(cmd: string): Promise<string> {
    const tag = this.nextTag();
    const fullCmd = `${tag} ${cmd}\r\n`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.dataHandler = null;
        reject(new Error(`IMAP command timeout: ${cmd.split(' ')[0]}`));
      }, 15000);

      let response = '';
      response += this.buffer;
      this.buffer = '';

      const checkComplete = () => {
        if (response.length > MAX_COMMAND_BUFFER) {
          clearTimeout(timeout);
          this.dataHandler = null;
          reject(new Error(`IMAP command response exceeded ${MAX_COMMAND_BUFFER} bytes`));
          return true;
        }
        // Look for tagged response line indicating completion
        const lines = response.split('\r\n');
        for (const line of lines) {
          if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
            clearTimeout(timeout);
            this.dataHandler = null;
            if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
              reject(new Error(`IMAP error: ${line}`));
            } else {
              resolve(response);
            }
            return true;
          }
        }
        return false;
      };

      this.dataHandler = (chunk: string) => {
        response += chunk;
        checkComplete();
      };

      this.socket!.write(fullCmd);

      // Check if response already complete from buffer
      if (!checkComplete()) {
        // Will be resolved by dataHandler
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        await this.command('LOGOUT');
      } catch {
        // Ignore logout errors
      }
      this.socket.destroy();
      this.socket = null;
    }
  }
}

export function decodeRFC2047(raw: string): string {
  // Decode =?charset?encoding?text?= sequences
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_match, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8');
      }
      if (encoding.toUpperCase() === 'Q') {
        const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
        return decoded;
      }
    } catch {
      // Fall through to return original encoded word
    }
    return _match;
  });
}

function parseHeaderValue(response: string, header: string): string {
  const regex = new RegExp(`^${header}:\\s*(.+?)(?:\\r?\\n(?!\\s)|$)`, 'im');
  const match = response.match(regex);
  if (!match) return '';
  // Handle folded headers (continuation lines starting with whitespace)
  let value = match[1];
  const rest = response.slice((match.index ?? 0) + match[0].length);
  const foldMatch = rest.match(/^((?:\s+.+\r?\n)*)/);
  if (foldMatch && foldMatch[1]) {
    value += ' ' + foldMatch[1].replace(/\r?\n\s+/g, ' ').trim();
  }
  return decodeRFC2047(value.trim());
}

function parseFromHeader(from: string): string {
  // "Name <email>" -> "Name" or just return email
  const nameMatch = from.match(/^"?([^"<]+)"?\s*<[^>]+>/);
  if (nameMatch) return nameMatch[1].trim();
  const emailMatch = from.match(/<([^>]+)>/);
  if (emailMatch) return emailMatch[1];
  return from;
}

function parseDateHeader(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}

/** Fetch inbox via IMAP. Uses BODY.PEEK to preserve read/unread status. */
export async function fetchInboxViaImap(
  user: string,
  password: string,
): Promise<ImapInboxResult> {
  const client = new ImapClient();
  const sessionTimeout = setTimeout(() => {
    client.disconnect().catch(() => {});
  }, 30000);

  try {
    await client.connect('imap.gmail.com', 993);
    await client.command(`LOGIN "${escapeImapQuoted(user)}" "${escapeImapQuoted(password)}"`);
    const selectResponse = await client.command('SELECT INBOX');

    // Count unread messages via SEARCH (SELECT's [UNSEEN n] is a sequence number, not a count)
    let unread = 0;
    const searchResponse = await client.command('SEARCH UNSEEN');
    const searchLine = searchResponse.split('\r\n').find((l) => l.startsWith('* SEARCH'));
    if (searchLine) {
      const ids = searchLine.replace('* SEARCH', '').trim();
      unread = ids ? ids.split(/\s+/).length : 0;
    }

    // Get total message count for fetching last 20
    const existsMatch = selectResponse.match(/\*\s+(\d+)\s+EXISTS/i);
    const totalMessages = existsMatch ? parseInt(existsMatch[1], 10) : 0;

    const messages: ImapEmail[] = [];

    if (totalMessages > 0) {
      const start = Math.max(1, totalMessages - 19);
      const range = `${start}:${totalMessages}`;

      const fetchResponse = await client.command(
        `FETCH ${range} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.200>)`,
      );

      // Parse FETCH responses - each message block starts with "* N FETCH"
      const fetchBlocks = fetchResponse.split(/(?=\* \d+ FETCH)/);

      for (const block of fetchBlocks) {
        if (!block.startsWith('* ')) continue;

        const from = parseFromHeader(parseHeaderValue(block, 'From'));
        const subject = parseHeaderValue(block, 'Subject');
        const dateStr = parseHeaderValue(block, 'Date');
        const receivedAt = parseDateHeader(dateStr);

        // Extract snippet from body text preview
        let snippet = '';
        // The body text comes after the header section, between literal markers
        const bodyMatch = block.match(/BODY\[TEXT\]<0>\s*\{(\d+)\}\r?\n([\s\S]*?)(?:\r?\n\)|\* \d+ FETCH)/);
        if (bodyMatch) {
          snippet = bodyMatch[2]
            .replace(/<[^>]+>/g, '') // strip HTML tags
            .replace(/&[a-z]+;/gi, ' ') // strip HTML entities
            .replace(/\s+/g, ' ') // collapse whitespace
            .trim()
            .slice(0, 150);
        }

        if (from || subject) {
          messages.push({ from, subject, snippet, receivedAt });
        }
      }

      // Reverse so newest is first
      messages.reverse();
    }

    await client.disconnect();
    clearTimeout(sessionTimeout);

    return { unread, messages };
  } catch (err) {
    clearTimeout(sessionTimeout);
    try { await client.disconnect(); } catch { /* ignore */ }
    throw err;
  }
}
