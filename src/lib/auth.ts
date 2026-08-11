import { useEffect, useState } from 'react';
import { rememberAccount } from './rememberedAccounts';

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
  } catch { void 0; }
}
function clearToken() {
  try {
    localStorage.removeItem(tokenKey);
  } catch { void 0; }
}

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

export async function register(
  email: string,
  password: string,
  name?: string,
  remember = true,
): Promise<AuthUser> {
  const { token, user } = await post('/api/auth/register', { email, password, name, remember });
  setToken(token);
  cachedUser = user;
  rememberAccount({ email: user.email, name: user.name });
  notify();
  return user;
}

export async function login(email: string, password: string, remember = false): Promise<AuthUser> {
  const { token, user } = await post('/api/auth/login', { email, password, remember });
  setToken(token);
  cachedUser = user;
  rememberAccount({ email: user.email, name: user.name });
  notify();
  return user;
}

export function logout() {
  clearToken();
  cachedUser = null;
  notify();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = getToken();
  const res = await fetch('/api/auth/password', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
}

export async function updateProfile(name: string): Promise<AuthUser> {
  const token = getToken();
  const res = await fetch('/api/auth/profile', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  const user = data.user as AuthUser;
  cachedUser = user;
  clearNameCheckCache();
  rememberAccount({ email: user.email, name: user.name });
  notify();
  return user;
}

export function displayNameFor(user: AuthUser | null | undefined): string {
  if (!user) return '';
  const raw = (user.name || user.email.split('@')[0] || '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : user.email;
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
}

export async function deleteAccount(password: string): Promise<void> {
  const token = getToken();
  const res = await fetch('/api/auth/account', {
    method: 'DELETE',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  logout();
}

export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string; name: string; createdAt: string | null; updatedAt: string | null };
  subscriptions: { orderId: string; tier: string; status: string; createdAt: string | null; confirmedAt: string | null }[];
}

export async function exportAccountData(): Promise<AccountExport> {
  const token = getToken();
  const res = await fetch('/api/auth/export', {
    cache: 'no-store',
    headers: token ? { 'x-auth-token': token } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as AccountExport;
}

export interface NameCheck {
  available: boolean;
  suggestions: string[];
}

const nameCheckCache = new Map<string, NameCheck>();

export function peekName(name: string): NameCheck | null {
  return nameCheckCache.get(name.trim().toLowerCase()) ?? null;
}
export function clearNameCheckCache() {
  nameCheckCache.clear();
}
export async function checkName(name: string): Promise<NameCheck> {
  const key = name.trim().toLowerCase();
  const cached = nameCheckCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/auth/check-name?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { available: true, suggestions: [] };
    const result: NameCheck = {
      available: data?.available !== false,
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    };
    nameCheckCache.set(key, result);
    return result;
  } catch {
    return { available: true, suggestions: [] }; 
  }
}

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
      headers: { 'x-auth-token': token }, 
    });
    const data = await res.json().catch(() => ({}));
    cachedUser = res.ok && data?.user ? (data.user as AuthUser) : null;
    if (!cachedUser) clearToken(); 
  } catch { void 0; }
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
