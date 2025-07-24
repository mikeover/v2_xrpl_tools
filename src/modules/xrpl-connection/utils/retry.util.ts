export interface RetryOptions {
  retries: number;
  minTimeout: number;
  maxTimeout: number;
  factor: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, minTimeout, maxTimeout, factor, onRetry } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === retries) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      const timeout = Math.min(minTimeout * Math.pow(factor, attempt), maxTimeout);

      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  }

  throw lastError!;
}
