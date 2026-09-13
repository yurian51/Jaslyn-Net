export const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
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
