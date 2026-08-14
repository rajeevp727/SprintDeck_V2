import {
  BrowserAuthError,
  Configuration,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser';
import type { OAuthPublicConfig } from './oauthConfig.types';

export type { OAuthProvider, OAuthPublicConfig } from './oauthConfig.types';

const buildTime = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '',
  azureClientId: import.meta.env.VITE_AZURE_CLIENT_ID?.trim() || '',
  azureTenantId: import.meta.env.VITE_AZURE_TENANT_ID?.trim() || 'common',
};

let cachedConfig: OAuthPublicConfig | null = null;

let msalApp: PublicClientApplication | null = null;
let msalKey = '';
let msalInitPromise: Promise<PublicClientApplication> | null = null;
let msalLoginPromise: Promise<string> | null = null;

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

function msalConfigFor(config: OAuthPublicConfig): Configuration {
  return {
    auth: {
      clientId: config.microsoft.clientId,
      authority: `https://login.microsoftonline.com/${config.microsoft.tenantId || 'common'}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
    system: { loggerOptions: { logLevel: LogLevel.Warning } },
  };
}

function configKey(config: OAuthPublicConfig): string {
  return `${config.microsoft.clientId}:${config.microsoft.tenantId}`;
}

async function getMsalApp(config: OAuthPublicConfig): Promise<PublicClientApplication> {
  const key = configKey(config);
  if (msalApp && msalKey === key) return msalApp;
  if (msalInitPromise && msalKey === key) return msalInitPromise;

  msalKey = key;
  msalApp = null;
  msalInitPromise = (async () => {
    const app = new PublicClientApplication(msalConfigFor(config));
    await app.initialize();
    // Finish/clear any redirect or stale interaction left in session storage.
    await app.handleRedirectPromise();
    msalApp = app;
    return app;
  })();

  return msalInitPromise;
}

export async function preInitializeMicrosoft(config: OAuthPublicConfig): Promise<void> {
  if (!config.microsoft.enabled || !config.microsoft.clientId) return;
  await getMsalApp(config);
}

async function runMicrosoftLogin(config: OAuthPublicConfig): Promise<string> {
  const app = await getMsalApp(config);

  const result = await app.loginPopup({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    prompt: 'select_account',
  });
  if (!result.idToken) throw new Error('Microsoft sign-in did not return a token');
  return result.idToken;
}

function isInteractionInProgress(err: unknown): boolean {
  if (err instanceof BrowserAuthError) {
    return err.errorCode === 'interaction_in_progress';
  }
  return String((err as Error)?.message || err).includes('interaction_in_progress');
}

export async function loginWithMicrosoft(config: OAuthPublicConfig): Promise<string> {
  const clientId = config.microsoft.clientId;
  if (!clientId) throw new Error('Microsoft sign-in is not configured');

  if (msalLoginPromise) return msalLoginPromise;

  msalLoginPromise = (async () => {
    try {
      try {
        return await runMicrosoftLogin(config);
      } catch (err) {
        if (!isInteractionInProgress(err)) throw err;
        // Stale interaction flag — clear and retry once.
        const app = await getMsalApp(config);
        await app.handleRedirectPromise();
        try {
          sessionStorage.removeItem('msal.interaction.status');
        } catch {
          void 0;
        }
        return await runMicrosoftLogin(config);
      }
    } finally {
      msalLoginPromise = null;
    }
  })();

  return msalLoginPromise;
}
