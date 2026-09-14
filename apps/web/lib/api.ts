const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '');
export const API_URL = configuredApiUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000/api/v1' : '');

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('API endpoint is not configured. Set NEXT_PUBLIC_API_URL.', 0);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_URL}${normalizedPath}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(extractApiError(payload) ?? `Request failed with status ${response.status}`, response.status);
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
