// Shared inline SVG icons for modal controls (dedup — used by the connect flow).
export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

// Crown — marks the paid/upgrade action.
export const CrownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M2 8l4.2 3.2L12 4l5.8 7.2L22 8l-1.7 10H3.7L2 8zm3 12h14v1.5H5V20z" />
  </svg>
);
