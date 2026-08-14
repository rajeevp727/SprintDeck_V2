import { Configuration, LogLevel, PublicClientApplication } from '@azure/msal-browser';

export type OAuthProvider = 'google' | 'microsoft';

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
export const azureClientId = import.meta.env.VITE_AZURE_CLIENT_ID?.trim() || '';
export const azureTenantId = import.meta.env.VITE_AZURE_TENANT_ID?.trim() || 'common';

export const oauthEnabled = {
  google: !!googleClientId,
  microsoft: !!azureClientId,
};

let msalApp: PublicClientApplication | null = null;

export function getMsalApp(): PublicClientApplication | null {
  if (!azureClientId) return null;
  if (!msalApp) {
    const config: Configuration = {
      auth: {
        clientId: azureClientId,
        authority: `https://login.microsoftonline.com/${azureTenantId}`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
        },
      },
    };
    msalApp = new PublicClientApplication(config);
  }
  return msalApp;
}

export async function loginWithMicrosoft(): Promise<string> {
  const app = getMsalApp();
  if (!app) throw new Error('Microsoft sign-in is not configured');
  await app.initialize();
  const result = await app.loginPopup({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    prompt: 'select_account',
  });
  if (!result.idToken) throw new Error('Microsoft sign-in did not return a token');
  return result.idToken;
}
