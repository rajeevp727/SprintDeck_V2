import { useCallback, useEffect, useState } from 'react';

// Client for Azure Static Web Apps built-in auth (EasyAuth). SWA exposes
// /.auth/me (current user), /.auth/login/<provider> and /.auth/logout — no
// tokens to store or verify client-side. The Functions API receives the
// validated principal via the x-ms-client-principal header (see api/src/auth.js).
//
// INERT until SWA auth is provisioned: nothing mounts useAuth() yet, so the
// running app is unaffected.

export type AuthProvider = 'aad' | 'google' | 'github';

export interface AuthUser {
  userId: string;
  name: string;
  provider: string;
  roles: string[];
}

interface ClientPrincipalResponse {
  clientPrincipal: {
    identityProvider: string;
    userId: string;
    userDetails: string;
    userRoles: string[];
  } | null;
}

// Fetch the signed-in user, or null if anonymous.
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/.auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as ClientPrincipalResponse;
    const p = data.clientPrincipal;
    if (!p || !p.userId) return null;
    return { userId: p.userId, name: p.userDetails || '', provider: p.identityProvider || '', roles: p.userRoles || [] };
  } catch {
    return null;
  }
}

// Redirect to the provider's hosted login, returning to the current page after.
export function login(provider: AuthProvider = 'aad') {
  const back = encodeURIComponent(location.pathname + location.search);
  location.href = `/.auth/login/${provider}?post_login_redirect_uri=${back}`;
}

export function logout() {
  location.href = '/.auth/logout?post_logout_redirect_uri=/';
}

// React hook: resolve the current user on mount.
export function useAuth(): { user: AuthUser | null; loading: boolean; login: typeof login; logout: typeof logout } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getCurrentUser()
      .then((u) => alive && setUser(u))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { user, loading, login: useCallback(login, []), logout: useCallback(logout, []) };
}
