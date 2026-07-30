const DEFAULT_TIMEOUT_MS = 30000;

export async function fetchWithTimeout(input: string | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Upstream request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
