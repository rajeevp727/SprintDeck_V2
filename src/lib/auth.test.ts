import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  displayNameFor,
  peekName,
  clearNameCheckCache,
  getToken,
  logout,
  loginWithOAuth,
  getGoogleAuthUrl,
  getMicrosoftAuthUrl,
  getEmailStatus,
  checkName,
  forgotPassword,
  refreshUser,
} from './auth';

function mockStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe('displayNameFor', () => {
  it('uses profile name when set', () => {
    expect(displayNameFor({ id: '1', email: 'x@y.com', name: 'rajeev' })).toBe('Rajeev');
  });

  it('falls back to email local-part', () => {
    expect(displayNameFor({ id: '1', email: 'mrrajeev18@gmail.com' })).toBe('Mrrajeev18');
  });

  it('returns empty for null user', () => {
    expect(displayNameFor(null)).toBe('');
  });
});

describe('name check cache', () => {
  it('clearNameCheckCache resets peek results', () => {
    clearNameCheckCache();
    expect(peekName('cached-name')).toBeNull();
  });
});

describe('token storage', () => {
  beforeEach(() => {
    mockStorage();
    logout();
  });

  it('getToken returns null when empty', () => {
    expect(getToken()).toBeNull();
  });

  it('logout clears stored token', () => {
    localStorage.setItem('sprintdeck.token', 'abc');
    logout();
    expect(getToken()).toBeNull();
  });
});

describe('loginWithOAuth', () => {
  beforeEach(() => {
    mockStorage();
    logout();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores token and user on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'jwt', user: { id: '1', email: 'a@b.com', name: 'A' } }),
    } as Response);
    const user = await loginWithOAuth('google', 'access-token', true);
    expect(user.email).toBe('a@b.com');
    expect(getToken()).toBe('jwt');
  });
});

describe('getEmailStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns configured false on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response));
    await expect(getEmailStatus()).resolves.toEqual({ configured: false });
  });

  it('returns configured true when API says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true }) } as Response),
    );
    await expect(getEmailStatus()).resolves.toEqual({ configured: true });
  });
});

describe('checkName', () => {
  beforeEach(() => {
    clearNameCheckCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches successful availability checks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false, suggestions: ['alpha-1'] }),
    } as Response);
    const first = await checkName('Alpha');
    const second = await checkName('Alpha');
    expect(first).toEqual({ available: false, suggestions: ['alpha-1'] });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(peekName('alpha')).toEqual(first);
  });

  it('falls back to available on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await expect(checkName('Beta')).resolves.toEqual({ available: true, suggestions: [] });
  });
});

describe('forgotPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when API returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Nope' }) } as Response),
    );
    await expect(forgotPassword('a@b.com')).rejects.toThrow('Nope');
  });
});

describe('refreshUser', () => {
  beforeEach(() => {
    mockStorage();
    logout();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no token is stored', async () => {
    await expect(refreshUser()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads user from /api/auth/me when token exists', async () => {
    localStorage.setItem('sprintdeck.token', 'jwt');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: '1', email: 'a@b.com', name: 'A' } }),
    } as Response);
    await expect(refreshUser()).resolves.toEqual({ id: '1', email: 'a@b.com', name: 'A' });
  });
});


describe('provider authorization URLs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not build a Google URL without a client ID', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(getGoogleAuthUrl('nonce', 'state')).toBe('');
  });

  it('builds a Google ID-token URL with the supplied nonce and state', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    vi.stubEnv('VITE_OAUTH_REDIRECT_ORIGIN', 'https://sprintdeck.test');
    const url = new URL(getGoogleAuthUrl('nonce-1', 'state-1'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('google-client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://sprintdeck.test/auth/google/callback');
    expect(url.searchParams.get('nonce')).toBe('nonce-1');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('builds a Microsoft URL using the Azure client and tenant fallback', () => {
    vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', '');
    vi.stubEnv('VITE_AZURE_CLIENT_ID', 'azure-client');
    vi.stubEnv('VITE_AZURE_TENANT_ID', 'tenant-id');
    vi.stubEnv('VITE_OAUTH_REDIRECT_ORIGIN', 'https://sprintdeck.test');
    const url = new URL(getMicrosoftAuthUrl('nonce-2', 'state-2'));
    expect(url.hostname).toBe('login.microsoftonline.com');
    expect(url.pathname).toContain('/tenant-id/');
    expect(url.searchParams.get('client_id')).toBe('azure-client');
    expect(url.searchParams.get('nonce')).toBe('nonce-2');
    expect(url.searchParams.get('state')).toBe('state-2');
  });
});
