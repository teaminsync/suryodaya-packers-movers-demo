/**
 * Keyed queue for serializing tasks by key
 */

export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>();

  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const tail = tails.get(key) ?? Promise.resolve();

    const run = tail.then(
      () => task(),
      () => task()
    );

    const newTail = run.then(
      () => {},
      () => {}
    );

    tails.set(key, newTail);

    newTail.then(() => {
      if (tails.get(key) === newTail) {
        tails.delete(key);
      }
    });

    return run;
  };
}
