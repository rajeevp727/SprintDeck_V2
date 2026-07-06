/// <reference types="vite/client" />

interface ImportMetaEnv {
  // UPI VPA for payments — injected at build from the GitHub secret UPI_ID
  // (workflow maps secrets.UPI_ID → VITE_UPI_ID). Kept out of the repo.
  readonly VITE_UPI_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
