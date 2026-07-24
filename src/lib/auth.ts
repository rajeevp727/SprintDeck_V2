import { useEffect, useState } from 'react';

// Email + password auth client. The JWT from register/login is stored in
// localStorage and attached as `Authorization: Bearer <token>` by lib/api.ts.
// useAuth() exposes the current user and re-renders on sign in/out.

const tokenKey = 'sprintdeck.token';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}
function setToken(token: string) {
  try {
    localStorage.setItem(tokenKey, token);
  } catch {
    /* ignore */
  }
}
function clearToken() {
  try {
    localStorage.removeItem(tokenKey);
  } catch {
    /* ignore */
  }
}

// In-memory cache of the signed-in user + change subscribers (so useAuth
// consumers update on login/logout without a reload).
let cachedUser: AuthUser | null = null;
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

async function post(path: string, body: unknown): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as { token: string; user: AuthUser };
}

export async function register(email: string, password: string, name?: string): Promise<AuthUser> {
  const { token, user } = await post('/api/auth/register', { email, password, name });
  setToken(token);
  cachedUser = user;
  notify();
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { token, user } = await post('/api/auth/login', { email, password });
  setToken(token);
  cachedUser = user;
  notify();
  return user;
}

export function logout() {
  clearToken();
  cachedUser = null;
  notify();
}

// Resolve the current user from the stored token (validated server-side).
export async function refreshUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) {
    cachedUser = null;
    notify();
    return null;
  }
  try {
    const res = await fetch('/api/auth/me', {
      cache: 'no-store',
      headers: { 'x-auth-token': token }, // SWA strips Authorization — use a custom header
    });
    const data = await res.json().catch(() => ({}));
    cachedUser = res.ok && data?.user ? (data.user as AuthUser) : null;
    if (!cachedUser) clearToken(); // token invalid/expired
  } catch {
    /* keep cache on transient error */
  }
  notify();
  return cachedUser;
}

export function useAuth(): {
  user: AuthUser | null;
  loading: boolean;
  register: typeof register;
  login: typeof login;
  logout: typeof logout;
} {
  const [, bump] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    listeners.add(rerender);
    refreshUser().finally(() => setLoading(false));
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return { user: cachedUser, loading, register, login, logout };
}
