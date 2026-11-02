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

/**
 * Calls the API with JSON in and out; a FormData body is sent as it is (multipart, for uploads).
 * The session cookie is sent automatically (same origin).
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const json = init.body !== undefined && !(init.body instanceof FormData);
  const response = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(init.body) : (init.body as FormData | undefined),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(response.status, body.error as string | undefined, body);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
