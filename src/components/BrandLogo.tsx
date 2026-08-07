interface Props {
  /** `full` = icon + wordmark; `mark` = icon only */
  variant?: 'full' | 'mark';
  className?: string;
}

/** SprintDeck brand mark — full logo or compact icon. */
export default function BrandLogo({ variant = 'full', className }: Props) {
  if (variant === 'mark') {
    return (
      <img
        src="/logo-mark.png"
        alt=""
        className={className ?? 'brand-mark-img'}
        aria-hidden
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/logo.png"
      alt="SprintDeck"
      className={className ?? 'brand-logo'}
      draggable={false}
    />
  );
}
