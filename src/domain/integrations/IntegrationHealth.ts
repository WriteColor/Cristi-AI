/**
 * Shared, payload-free operational state for optional integrations.
 * A connector may fail or be slow without changing the Live call lifecycle.
 */
export type IntegrationHealthState = 'unconfigured' | 'ready' | 'connecting' | 'active' | 'degraded' | 'error';

export interface IntegrationHealth {
  id: string;
  state: IntegrationHealthState;
  configured: boolean;
  authenticated: boolean;
  connected: boolean;
  operation?: string;
  latencyMs?: number;
  lastSuccessAt?: number;
  lastError?: string;
  updatedAt: number;
}

export class IntegrationHealthRegistry {
  private entries = new Map<string, IntegrationHealth>();

  public update(id: string, patch: Partial<Omit<IntegrationHealth, 'id' | 'updatedAt'>>): IntegrationHealth {
    const current = this.entries.get(id);
    const next: IntegrationHealth = {
      id,
      state: patch.state ?? current?.state ?? 'unconfigured',
      configured: patch.configured ?? current?.configured ?? false,
      authenticated: patch.authenticated ?? current?.authenticated ?? false,
      connected: patch.connected ?? current?.connected ?? false,
      operation: patch.operation,
      latencyMs: patch.latencyMs ?? current?.latencyMs,
      lastSuccessAt: patch.lastSuccessAt ?? current?.lastSuccessAt,
      lastError: patch.lastError ?? current?.lastError,
      updatedAt: Date.now(),
    };
    this.entries.set(id, next);
    return { ...next };
  }

  public get(id: string): IntegrationHealth | null {
    const value = this.entries.get(id);
    return value ? { ...value } : null;
  }

  public all(): IntegrationHealth[] {
    return [...this.entries.values()].map((value) => ({ ...value }));
  }

  public async measure<T>(id: string, operation: string, task: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    this.update(id, { state: 'active', operation, lastError: undefined });
    try {
      const result = await task();
      this.update(id, { state: 'ready', operation: undefined, latencyMs: Math.round(performance.now() - startedAt), lastSuccessAt: Date.now() });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update(id, { state: 'error', operation: undefined, latencyMs: Math.round(performance.now() - startedAt), lastError: message });
      throw error;
    }
  }
}

export const integrationHealthRegistry = new IntegrationHealthRegistry();
