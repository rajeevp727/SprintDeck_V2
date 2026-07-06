/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Payee VPA for the UPI QR — injected at build from the GitHub secret UPI_ID
  // (workflow maps secrets.UPI_ID → VITE_UPI_ID; .env.local for local dev).
  readonly VITE_UPI_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
