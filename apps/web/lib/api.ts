const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '');
export const API_URL = configuredApiUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000/api/v1' : '');

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('API endpoint is not configured. Set NEXT_PUBLIC_API_URL.', 0);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const requestId = createRequestId();
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${normalizedPath}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        'x-request-id': requestId,
        ...init.headers,
      },
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('The API request timed out. Please retry the operation.', 408, requestId);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The API request was cancelled.', 499, requestId);
    }
    throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API.', 0, requestId);
  }

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(extractApiError(payload) ?? `Request failed with status ${response.status}`, response.status, responseRequestId);
  }
  return payload as T;
}

function extractApiError(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.message === 'string') return value.message;
  if (Array.isArray(value.message) && value.message.every((item) => typeof item === 'string')) return value.message.join(', ');
  return null;
}
