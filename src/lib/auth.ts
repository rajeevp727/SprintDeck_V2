import { useEffect, useState } from 'react';
import { rememberAccount } from './rememberedAccounts';

// Email + password auth client. The JWT from register/login is stored in
// localStorage and attached as `Authorization: Bearer <token>` by lib/api.ts.
// useAuth() exposes the current user and re-renders on sign in/out.
//
// OAuth SSO (Google + Microsoft): the provider redirects back with an id_token
// in the URL fragment (hash). The frontend reads it, POSTs to /api/auth/oauth,
// and stores the returned JWT the same way as email/password.

const tokenKey = 'sprintdeck.token';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  authProvider?: 'local' | 'google' | 'microsoft';
  hasPassword?: boolean;
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

// --- OAuth SSO helpers ---

function oauthRedirectOrigin(): string {
  return (import.meta.env.VITE_OAUTH_REDIRECT_ORIGIN as string | undefined) || window.location.origin;
}

// The popup hands its token back through localStorage as well as postMessage:
// returning from the provider can put the popup in a fresh browsing-context
// group, where window.opener is null and postMessage is a no-op.
const HandoffKey = 'sso-handoff';
const HandoffTtlMs = 5 * 60 * 1000;

export interface SsoHandoff {
  state?: string;
  idToken?: string;
  error?: string;
  at?: number;
}

export function writeHandoff(payload: SsoHandoff): void {
  try {
    localStorage.setItem(HandoffKey, JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    void 0;
  }
}

function readHandoff(state: string): SsoHandoff | null {
  try {
    const raw = localStorage.getItem(HandoffKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as SsoHandoff;
    if (data.state !== state) return null;
    if (Date.now() - (data.at || 0) > HandoffTtlMs) return null;
    if (!data.idToken && !data.error) return null;
    return data;
  } catch {
    return null;
  }
}

function clearHandoff(): void {
  try {
    localStorage.removeItem(HandoffKey);
  } catch {
    void 0;
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

export function microsoftClientId(): string {
  return (
    import.meta.env.VITE_MICROSOFT_CLIENT_ID ||
    import.meta.env.VITE_AZURE_CLIENT_ID ||
    ''
  ).trim();
}

function microsoftTenant(): string {
  return (
    import.meta.env.VITE_MICROSOFT_TENANT ||
    import.meta.env.VITE_AZURE_TENANT_ID ||
    'common'
  ).trim();
}

// `nonce` is mandatory for the id_token response type at both providers, and
// `state` comes back untouched so the opener can reject a token it never asked for.
export function getGoogleAuthUrl(nonce = '', state = ''): string {
  const clientId = googleClientId();
  if (!clientId) return '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${oauthRedirectOrigin()}/auth/google/callback`,
    response_type: 'id_token',
    scope: 'openid profile email',
    prompt: 'select_account',
    nonce: nonce || randomToken(),
    state: state || randomToken(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getMicrosoftAuthUrl(nonce = '', state = ''): string {
  const clientId = microsoftClientId();
  if (!clientId) return '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${oauthRedirectOrigin()}/auth/microsoft/callback`,
    response_type: 'id_token',
    scope: 'openid profile email',
    prompt: 'select_account',
    nonce: nonce || randomToken(),
    state: state || randomToken(),
  });
  return `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function signInWithOAuth(provider: 'google' | 'microsoft', remember = true): Promise<AuthUser> {
  const state = randomToken();
  const nonce = randomToken();
  const url =
    provider === 'google' ? getGoogleAuthUrl(nonce, state) : getMicrosoftAuthUrl(nonce, state);
  if (!url) throw new Error(`${provider} OAuth is not configured`);

  const width = 500;
  const height = 600;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  clearHandoff();

  return new Promise<AuthUser>((resolve, reject) => {
    const popup = window.open(
      url,
      `sso-${provider}`,
      `width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site'));
      return;
    }

    let settled = false;

    function cleanup() {
      settled = true;
      clearInterval(timer);
      clearTimeout(deadline);
      window.removeEventListener('message', handler);
      window.removeEventListener('storage', onStorage);
      clearHandoff();
      try {
        popup!.close();
      } catch {
        void 0;
      }
    }

    function fail(message: string) {
      if (settled) return;
      cleanup();
      reject(new Error(message));
    }

    async function exchange(idToken: string) {
      if (settled) return;
      cleanup();
      try {
        const { token, user } = await post('/api/auth/oauth', { provider, idToken, remember });
        setToken(token);
        cachedUser = user;
        rememberAccount({ email: user.email, name: user.name });
        notify();
        resolve(user);
      } catch (err) {
        reject(err);
      }
    }

    function accept(data: SsoHandoff) {
      if (settled) return;
      if (data.error) {
        fail(data.error);
        return;
      }
      if (data.idToken) void exchange(data.idToken);
    }

    // Three ways the popup can reach us, because none is reliable alone:
    // postMessage needs window.opener (a COOP context switch can null it),
    // the storage event needs a live listener, and the poll catches the rest.
    const timer = setInterval(() => {
      if (settled) return;
      const handoff = readHandoff(state);
      if (handoff) {
        accept(handoff);
        return;
      }
      if (popup.closed) fail('Sign-in cancelled');
    }, 300);

    const deadline = setTimeout(() => fail('Sign-in timed out — please try again'), 5 * 60 * 1000);

    function handler(event: MessageEvent) {
      if (settled) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'sso-callback') return;
      if (event.data?.state !== state) return;
      accept(event.data as SsoHandoff);
    }

    function onStorage(event: StorageEvent) {
      if (settled || event.key !== HandoffKey) return;
      const handoff = readHandoff(state);
      if (handoff) accept(handoff);
    }

    window.addEventListener('message', handler);
    window.addEventListener('storage', onStorage);
  });
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
  const token = getToken();
  // Tell the server first: the device slot should free up now, not when the
  // token expires. The local sign-out must not wait on it.
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'x-auth-token': token },
    }).catch(() => {});
  }
  clearToken();
  cachedUser = null;
  activeRooms = [];
  notify();
}

export interface ActiveRoom {
  kind: 'poker' | 'retro' | 'whiteboard';
  code: string;
  at: number;
}

let activeRooms: ActiveRoom[] = [];

export function getActiveRooms(): ActiveRoom[] {
  return activeRooms;
}

/** Rooms this account is in on its other devices, re-rendered as they change. */
export function useActiveRooms(): ActiveRoom[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return activeRooms;
}

/**
 * Publishes where this account is, so its other devices can pick the room up.
 * Called on entering a board and again with no code on leaving.
 */
export async function setActiveRoom(kind: ActiveRoom['kind'], code: string | null) {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('/api/auth/active', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ kind, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      activeRooms = (data.activeRooms as ActiveRoom[]) || [];
      notify();
    }
  } catch {
    // Following along on another device is a convenience, never a blocker.
  }
}

export async function loginWithOAuth(
  provider: 'google' | 'microsoft',
  idToken: string,
  remember = true,
): Promise<AuthUser> {
  const { token, user } = await post('/api/auth/oauth', { provider, idToken, remember });
  setToken(token);
  cachedUser = user;
  rememberAccount({ email: user.email, name: user.name });
  notify();
  return user;
}

export async function getEmailStatus(): Promise<{ configured: boolean }> {
  const res = await fetch('/api/auth/email-status', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { configured: false };
  return { configured: !!data.configured };
}

export function displayNameFor(user: AuthUser | null | undefined): string {
  if (!user) return '';
  const raw = (user.name || user.email.split('@')[0] || '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : user.email;
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

async function authenticatedRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'x-auth-token': token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export async function updateProfile(name: string): Promise<AuthUser> {
  const { user } = await authenticatedRequest<{ user: AuthUser }>('/api/auth/profile', { name });
  cachedUser = user;
  rememberAccount({ email: user.email, name: user.name });
  notify();
  return user;
}

export async function requestPasswordChangeEmail(): Promise<{ emailedTo: string }> {
  if (!cachedUser?.email) throw new Error('Please sign in again');
  await forgotPassword(cachedUser.email);
  return { emailedTo: cachedUser.email };
}

export async function exportAccountData(): Promise<unknown> {
  return authenticatedRequest('/api/auth/export', undefined, 'GET');
}

export async function deleteAccount(password: string): Promise<void> {
  await authenticatedRequest('/api/auth/delete', { password });
  logout();
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

// Check whether a name (username) is free; if taken, get a few suggestions.
export interface NameCheck {
  available: boolean;
  suggestions: string[];
}
// Per-session cache so re-checking a name (backspace/retype) is instant — the
// big win on slow networks, where the cost is the round-trip, not the debounce.
const nameCheckCache = new Map<string, NameCheck>();
// Synchronous cache peek — lets the UI resolve a already-seen name instantly
// (no debounce, no "checking" flash, no network).
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
    return { available: true, suggestions: [] }; // don't block/cache on a transient error
  }
}

// Resolve the current user from the stored token (validated server-side).
/**
 * Signs in a tab running inside Teams without asking: the SDK already knows who
 * the person is. Returns null anywhere else, or when Teams declines to issue a
 * token, and the ordinary sign-in screen takes over.
 */
export async function signInWithTeams(): Promise<AuthUser | null> {
  const { teamsAuthToken } = await import('./teams');
  const teamsToken = await teamsAuthToken();
  if (!teamsToken) return null;
  try {
    const { token, user } = await post('/api/auth/teams', { token: teamsToken });
    setToken(token);
    cachedUser = user;
    rememberAccount({ email: user.email, name: user.name });
    notify();
    return user;
  } catch {
    return null;
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
      headers: { 'x-auth-token': token }, // SWA strips Authorization — use a custom header
    });
    const data = await res.json().catch(() => ({}));
    cachedUser = res.ok && data?.user ? (data.user as AuthUser) : null;
    activeRooms = cachedUser ? ((data.activeRooms as ActiveRoom[]) || []) : [];
    if (!cachedUser) clearToken(); // token invalid, expired, or signed out elsewhere
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
  loginWithOAuth: typeof loginWithOAuth;
  logout: typeof logout;
} {
  const [, bump] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    listeners.add(rerender);
    refreshUser()
      .then((known) => (known ? null : signInWithTeams()))
      .finally(() => setLoading(false));
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return { user: cachedUser, loading, register, login, loginWithOAuth, logout };
}
