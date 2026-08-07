// Session storage abstraction — almost everything in this app uses
// localStorage directly (shared across every tab of the same origin,
// which is exactly what you want for a normal login). The one exception
// is "open this shop's full portal view in a new tab" (see
// medicine-shops/page.tsx's openFullView): that tab needs its OWN
// independent session so it doesn't clobber whatever admin/shop session
// is already active in the tab that opened it. sessionStorage is scoped
// per-tab even for same-origin windows, which is exactly the isolation
// that needs — so a session lives in sessionStorage if (and only if) this
// specific tab was bootstrapped with one (see the quick-view query params
// consumed in app/(shop)/layout.tsx); every other tab never touches
// sessionStorage and behaves exactly as before.

export function hasSessionStorageSession(): boolean {
  return typeof window !== 'undefined' && !!sessionStorage.getItem('token');
}

export function activeStorage(): Storage {
  return hasSessionStorageSession() ? sessionStorage : localStorage;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('refreshToken') || localStorage.getItem('refreshToken');
}

export function getStoredUserRaw(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('user') || localStorage.getItem('user');
}

export function setStoredSession(accessToken: string, refreshToken: string, userJson: string): void {
  const storage = activeStorage();
  storage.setItem('token', accessToken);
  storage.setItem('refreshToken', refreshToken);
  storage.setItem('user', userJson);
}

export function clearStoredSession(): void {
  activeStorage().clear();
}

// Where to send someone whose session just expired — a quick-view tab is
// always a shop session, so it should bounce to the shop login, not the
// general admin one.
export function loginRedirectPath(): string {
  return hasSessionStorageSession() ? '/shop-login' : '/login';
}
