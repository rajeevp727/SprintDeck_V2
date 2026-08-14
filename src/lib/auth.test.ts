import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  displayNameFor,
  peekName,
  clearNameCheckCache,
  getToken,
  logout,
  loginWithOAuth,
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
