interface Chunk { data: string; durationMs: number; receivedAt: number }
export class AudioInputQueue {
  private queue: Chunk[] = [];
  private queuedDurationMs = 0;
  droppedMs = 0;
  private readonly maxQueueMs = 3000;

  get queuedMs(): number { return this.queuedDurationMs; }
  get size(): number { return this.queue.length; }

  push(data: string, now = performance.now()): boolean {
    const bytes = data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    const durationMs = bytes / 32;
    this.queue.push({ data, durationMs, receivedAt: now });
    this.queuedDurationMs += durationMs;
    // A bounded multi-second queue protects continuous speech and network jitter
    // while dropping stale audio only when overflowing 3000ms.
    if (this.queuedMs > this.maxQueueMs || now - this.queue[0].receivedAt > this.maxQueueMs) {
      this.clear(true);
      return false;
    }
    return true;
  }

  drain(send: (data: string) => boolean, now = performance.now()): boolean {
    if (this.queue[0] && now - this.queue[0].receivedAt > this.maxQueueMs) {
      this.clear(true);
      return false;
    }
    while (this.queue[0] && send(this.queue[0].data)) {
      this.queuedDurationMs = Math.max(0, this.queuedDurationMs - this.queue.shift()!.durationMs);
    }
    return true;
  }

  clear(dropped = false): void {
    if (dropped) this.droppedMs += this.queuedDurationMs;
    this.queue = [];
    this.queuedDurationMs = 0;
  }
}

