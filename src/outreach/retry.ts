export async function withRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[],
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < delaysMs.length) {
        await sleep(delaysMs[attempt]);
      }
    }
  }

  throw lastError;
}
