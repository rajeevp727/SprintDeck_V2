interface Props {
  /** `full` = icon + wordmark; `mark` = icon only */
  variant?: 'full' | 'mark';
  className?: string;
}

/** SprintDeck brand mark — full logo or compact icon (SVG). */
export default function BrandLogo({ variant = 'full', className }: Props) {
  if (variant === 'mark') {
    return (
      <img
        src="/logo-mark.svg"
        alt=""
        className={className ?? 'brand-mark-img'}
        aria-hidden
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/logo.svg"
      alt="SprintDeck"
      className={className ?? 'brand-logo'}
      draggable={false}
    />
  );
}
