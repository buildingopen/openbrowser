export interface CalendarApiEvent {
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  allDay: boolean;
}

export interface CalendarApiResult {
  events: CalendarApiEvent[];
  total: number;
  date: string;
}

interface TokenInfo {
  accessToken: string;
  source: 'access_token' | 'api_key' | 'refresh_token';
}

/** Detect Google Calendar API credentials from env vars. Returns null if none found. */
export function getCalendarCredentials(): TokenInfo | null {
  // 1. Direct access token (OAuth2, short-lived)
  const accessToken = process.env['GOOGLE_ACCESS_TOKEN'];
  if (accessToken) return { accessToken, source: 'access_token' };

  // 2. API key (simplest, read-only, only works for public calendars)
  const apiKey = process.env['GOOGLE_CALENDAR_API_KEY'];
  if (apiKey) return { accessToken: apiKey, source: 'api_key' };

  // 3. Refresh token flow (long-lived)
  const refreshToken = process.env['GOOGLE_REFRESH_TOKEN'];
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  if (refreshToken && clientId && clientSecret) {
    return { accessToken: refreshToken, source: 'refresh_token' };
  }

  return null;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

interface GCalEvent {
  summary?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface GCalResponse {
  items?: GCalEvent[];
}

/** Get today's date boundaries in the given timezone. */
function getDayBoundaries(timezone?: string): { startOfDay: Date; endOfDay: Date; today: string } {
  const now = new Date();
  if (!timezone) {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    return { startOfDay, endOfDay, today: now.toISOString().split('T')[0] };
  }

  // Use Intl to get correct date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = formatter.format(now); // YYYY-MM-DD
  const [year, month, day] = today.split('-').map(Number);

  // Create date boundaries using timezone-aware calculation
  // We construct ISO strings with the timezone offset to get the correct UTC instant
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZoneName: 'longOffset',
  });

  // Parse the offset from formatted string
  const parts = tzFormatter.formatToParts(new Date(year, month - 1, day));
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? '+00:00';
  const offset = offsetPart.replace('GMT', '') || '+00:00';

  const startOfDay = new Date(`${today}T00:00:00${offset}`);
  const endOfDay = new Date(`${today}T23:59:59${offset}`);

  return { startOfDay, endOfDay, today };
}

/** Fetch today's calendar events via Google Calendar API. Raw fetch, no dependencies. */
export async function fetchCalendarViaApi(creds: TokenInfo, timezone?: string): Promise<CalendarApiResult> {
  let token: string;
  let useApiKey = false;

  if (creds.source === 'refresh_token') {
    const clientId = process.env['GOOGLE_CLIENT_ID']!;
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET']!;
    token = await refreshAccessToken(creds.accessToken, clientId, clientSecret);
  } else if (creds.source === 'api_key') {
    token = creds.accessToken;
    useApiKey = true;
  } else {
    token = creds.accessToken;
  }

  const { startOfDay, endOfDay, today } = getDayBoundaries(timezone);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });

  if (timezone) {
    params.set('timeZone', timezone);
  }

  if (useApiKey) {
    params.set('key', token);
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;

  const headers: Record<string, string> = {
    'User-Agent': 'openbrowser-ai',
  };
  if (!useApiKey) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as GCalResponse;

  const timeFormatOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (timezone) timeFormatOpts.timeZone = timezone;

  const events: CalendarApiEvent[] = (data.items ?? []).map((item) => {
    const allDay = !item.start.dateTime;
    const startTime = item.start.dateTime
      ? new Date(item.start.dateTime).toLocaleTimeString('en-US', timeFormatOpts)
      : '';
    const endTime = item.end.dateTime
      ? new Date(item.end.dateTime).toLocaleTimeString('en-US', timeFormatOpts)
      : '';

    return {
      title: item.summary ?? '(No title)',
      startTime,
      endTime,
      location: item.location ?? '',
      allDay,
    };
  });

  return { events, total: events.length, date: today };
}
