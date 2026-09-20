/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Payee VPA for the UPI QR — injected at build from the GitHub secret UPI_ID
  // (workflow maps secrets.UPI_ID → VITE_UPI_ID; .env.local for local dev).
  readonly VITE_UPI_ID?: string;
  // OAuth SSO — set in .env.local for dev, and as GitHub repo secrets for production.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_TENANT?: string;
  // Entra spellings the deploy workflow injects; the MICROSOFT_* names win when both are set.
  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_TENANT_ID?: string;
  readonly VITE_OAUTH_REDIRECT_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
