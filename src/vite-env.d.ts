/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Payee VPA for the UPI QR — injected at build from the GitHub secret UPI_ID
  // (workflow maps secrets.UPI_ID → VITE_UPI_ID; .env.local for local dev).
  readonly VITE_UPI_ID?: string;
  // OAuth SSO — set in .env.local for dev, and as GitHub repo secrets for production.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_TENANT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
