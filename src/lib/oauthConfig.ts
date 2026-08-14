import { Configuration, LogLevel, PublicClientApplication } from '@azure/msal-browser';

export type OAuthProvider = 'google' | 'microsoft';

export interface OAuthPublicConfig {
  microsoft: { enabled: boolean; clientId: string; tenantId: string };
  google: { enabled: boolean; clientId: string };
}

const buildTime = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '',
  azureClientId: import.meta.env.VITE_AZURE_CLIENT_ID?.trim() || '',
  azureTenantId: import.meta.env.VITE_AZURE_TENANT_ID?.trim() || 'common',
};

let cachedConfig: OAuthPublicConfig | null = null;

export async function fetchOAuthConfig(): Promise<OAuthPublicConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch('/api/auth/oauth-status', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      cachedConfig = {
        microsoft: {
          enabled: !!data.providers?.microsoft,
          clientId: String(data.microsoftClientId || buildTime.azureClientId || '').trim(),
          tenantId: String(data.azureTenantId || buildTime.azureTenantId || 'common').trim() || 'common',
        },
        google: {
          enabled: !!data.providers?.google,
          clientId: String(data.googleClientId || buildTime.googleClientId || '').trim(),
        },
      };
      return cachedConfig;
    }
  } catch {
    void 0;
  }

  cachedConfig = {
    microsoft: {
      enabled: !!buildTime.azureClientId,
      clientId: buildTime.azureClientId,
      tenantId: buildTime.azureTenantId,
    },
    google: {
      enabled: !!buildTime.googleClientId,
      clientId: buildTime.googleClientId,
    },
  };
  return cachedConfig;
}

export function hasOAuthProviders(config: OAuthPublicConfig): boolean {
  return (
    (config.microsoft.enabled && !!config.microsoft.clientId) ||
    (config.google.enabled && !!config.google.clientId)
  );
}

export async function loginWithMicrosoft(config: OAuthPublicConfig): Promise<string> {
  const clientId = config.microsoft.clientId;
  const tenantId = config.microsoft.tenantId || 'common';
  if (!clientId) throw new Error('Microsoft sign-in is not configured');

  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
    system: { loggerOptions: { logLevel: LogLevel.Warning } },
  };
  const app = new PublicClientApplication(msalConfig);
  await app.initialize();
  const result = await app.loginPopup({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    prompt: 'select_account',
  });
  if (!result.idToken) throw new Error('Microsoft sign-in did not return a token');
  return result.idToken;
}
