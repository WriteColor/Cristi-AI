import { ChildProcess } from 'child_process';

/**
 * Supervisor to track and terminate child processes cleanly on app exit.
 * Eliminates orphan or zombie processes.
 */
class ProcessManager {
  private activeProcesses: Set<ChildProcess> = new Set();
  private cleanupHooks = new Map<string, () => void | Promise<void>>();
  private cleanupPromise: Promise<void> | null = null;

  /**
   * Tracks a spawned child process.
   */
  public track(cp: ChildProcess): ChildProcess {
    this.activeProcesses.add(cp);
    const remove = () => {
      this.activeProcesses.delete(cp);
    };
    cp.once('exit', remove);
    cp.once('error', remove);
    return cp;
  }

  /**
   * Removes tracking for a child process.
   */
  public untrack(cp: ChildProcess): void {
    this.activeProcesses.delete(cp);
  }

  /**
   * Registers a cleanup hook to run on application shutdown.
   */
  public registerCleanupHook(key: string, hook: () => void | Promise<void>): void {
    this.cleanupPromise = null;
    this.cleanupHooks.set(key, hook);
  }

  /**
   * Kills all currently tracked child processes.
   */
  public terminateAll(): void {
    for (const cp of this.activeProcesses) {
      try {
        if (cp && !cp.killed) {
          cp.kill('SIGTERM');
        }
      } catch (_) {
        try {
          cp.kill('SIGKILL');
        } catch (_) {}
      }
    }
    this.activeProcesses.clear();
  }

  /**
   * Runs all registered cleanup hooks and kills child processes.
   */
  public cleanupAll(): Promise<void> {
    this.cleanupPromise ??= this.runCleanup();
    return this.cleanupPromise;
  }

  private async runCleanup(): Promise<void> {
    for (const hook of this.cleanupHooks.values()) {
      try {
        await hook();
      } catch (err) {
        console.warn('[ProcessManager] Error executing cleanup hook:', (err as Error).message);
      }
    }
    this.terminateAll();
  }
}

export const processManager = new ProcessManager();
