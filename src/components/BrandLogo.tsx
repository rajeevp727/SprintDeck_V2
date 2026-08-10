interface Props {
  
  variant?: 'full' | 'mark';
  className?: string;
}

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
