/**
 * Minimal Promise-chain mutex for serializing async operations on a session.
 *
 * Each `run(fn)` call appends `fn` to the chain so that even if multiple
 * callers race in (e.g. two browser tabs prompting the same conversation),
 * the work executes FIFO instead of interleaving.
 */
export interface Mutex {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** True while a queued or running task has not yet resolved. */
  isBusy(): boolean;
}

export function createMutex(): Mutex {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      pending++;
      const run = tail.then(fn, fn);
      tail = run.then(
        () => {},
        () => {},
      );
      // Decrement once the queued work settles (success or failure).
      void run.finally(() => {
        pending--;
      });
      return run;
    },
    isBusy() {
      return pending > 0;
    },
  };
}
