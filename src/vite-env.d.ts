/// <reference types="vite/client" />

interface ImportMetaEnv {
  // UPI VPA for payments — injected at build from the GitHub secret UPI_ID
  // (workflow maps secrets.UPI_ID → VITE_UPI_ID). Kept out of the repo.
  readonly VITE_UPI_ID?: string;
  // Base URL of the upi-verifier service (e.g. http://localhost:7073/api in dev,
  // the deployed Function App /api in prod). Enables live payment verification.
  readonly VITE_VERIFIER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
