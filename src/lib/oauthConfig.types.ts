export type OAuthProvider = 'google' | 'microsoft';

export interface OAuthPublicConfig {
  microsoft: { enabled: boolean; clientId: string; tenantId: string };
  google: { enabled: boolean; clientId: string };
}
