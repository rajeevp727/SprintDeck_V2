/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPI_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
