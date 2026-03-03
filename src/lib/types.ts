export interface CommandOutput<T = unknown> {
  command: string;
  version: string;
  timestamp: string;
  success: boolean;
  error?: string;
  data: T;
  summary: string;
}

export interface StatusData {
  chrome: {
    running: boolean;
    pid?: number;
    version?: string;
    endpoint?: string;
  };
  profile: string;
  sessions: SessionInfo[];
}

export interface SessionInfo {
  domain: string;
  active: boolean;
  expiresAt?: string;
  expiresInDays?: number;
  warning?: string;
  cookiesFound: string[];
}

export interface DoctorData {
  checks: DoctorCheck[];
  healthy: boolean;
}

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

export interface Config {
  cdpPort: number;
  profileDir: string;
  timezone: string;
  chromeBinary?: string;
  vncPassword: string;
  vncPort: number;
  xvfbDisplay: string;
  rateLimits?: Record<string, number>;
}

export interface AuthCookieSpec {
  domain: string;
  requiredCookies: string[];
  label: string;
}

export const AUTH_COOKIE_SPECS: AuthCookieSpec[] = [
  {
    domain: 'google.com',
    requiredCookies: ['SID', 'HSID', 'SSID'],
    label: 'Google',
  },
  {
    domain: 'github.com',
    requiredCookies: ['user_session'],
    label: 'GitHub',
  },
  {
    domain: 'linkedin.com',
    requiredCookies: ['li_at'],
    label: 'LinkedIn',
  },
];
