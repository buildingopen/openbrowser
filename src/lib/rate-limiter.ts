const DEFAULT_DELAY_MS = 2000;

export class RateLimiter {
  private lastRequest = new Map<string, number>();
  private limits: Record<string, number>;

  constructor(limits?: Record<string, number>) {
    this.limits = limits ?? {};
  }

  async wait(domain: string): Promise<void> {
    const limit = this.limits[domain] ?? DEFAULT_DELAY_MS;
    const last = this.lastRequest.get(domain) ?? 0;
    const elapsed = Date.now() - last;

    if (elapsed < limit) {
      await new Promise((r) => setTimeout(r, limit - elapsed));
    }

    this.lastRequest.set(domain, Date.now());
  }

  getDelay(domain: string): number {
    return this.limits[domain] ?? DEFAULT_DELAY_MS;
  }
}
