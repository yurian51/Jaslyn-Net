const TOKEN_KEY = 'jaslyn.accessToken';
const LEGACY_TOKEN_KEY = 'nexora.accessToken';
const SESSION_TOKEN_KEY = 'jaslyn.sessionAccessToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY)
    ?? window.localStorage.getItem(LEGACY_TOKEN_KEY)
    ?? window.sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function storeAccessToken(token: string, rememberMe = true): void {
  if (typeof window === 'undefined') return;
  // Clear both storage modes first so a previous "remember me" choice cannot persist.
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  if (rememberMe) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(LEGACY_TOKEN_KEY, token);
  } else {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  }
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
}
