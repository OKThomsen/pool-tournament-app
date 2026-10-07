export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    /** The whole error response, for errors that carry details (like tied players). */
    readonly body: Record<string, unknown> = {},
  ) {
    super(`API request failed with ${status}${code ? ` (${code})` : ''}`);
  }
}

/** Calls the API with JSON in and out. The session cookie is sent automatically (same origin). */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(response.status, body.error as string | undefined, body);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
