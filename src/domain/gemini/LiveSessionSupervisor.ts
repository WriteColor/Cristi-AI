/**
 * Cristi AI - LiveSessionSupervisor
 * Manages WebSocket reconnection policies with exponential backoff (1s, 2s, 4s, max 8s)
 * and full jitter to preserve session stability without thundering herd.
 */

export class LiveSessionSupervisor {
  private attempts: number[] = [];
  private readonly maxAttempts: number;
  private readonly random: () => number;

  constructor(
    maxAttempts = 5,
    random = Math.random
  ) {
    this.maxAttempts = maxAttempts;
    this.random = random;
  }

  nextDelay(code: number, reason: string, now = Date.now()): number | null {
    // Permanent non-retryable failures: invalid arguments (1007), unrecoverable auth/quota (4001, 4003, or 1008 with policy keywords)
    if (
      [1007, 4001, 4003].includes(code) ||
      (code === 1008 && /auth|credential|api.?key|permission|quota|invalid|policy/i.test(reason))
    ) {
      return null;
    }

    // Retain attempt window for 2 minutes (120000 ms)
    this.attempts = this.attempts.filter(time => now - time < 120000);
    if (this.attempts.length >= this.maxAttempts) return null;

    // Exponential backoff: 1s, 2s, 4s, capped at strict max 8s (8000ms) with +/- 25% jitter
    const base = Math.min(8000, 1000 * Math.pow(2, this.attempts.length));
    const jitterRange = base * 0.25;
    const jitter = (this.random() * 2 - 1) * jitterRange;
    const delay = Math.max(1000, Math.min(8000, Math.round(base + jitter)));
    this.attempts.push(now);
    return delay;
  }

  reset(): void {
    this.attempts = [];
  }

  get attemptsCount(): number {
    return this.attempts.length;
  }
}
