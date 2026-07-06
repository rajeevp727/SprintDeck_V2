// Linear's official logomark (monochrome), inlined so it needs no network/CDN
// and inherits the current text color (white on the Connect button).
export default function LinearLogo({ className = 'linear-logo' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.618 0 24 5.382 24 12.009c0 3.64-1.62 6.903-4.18 9.106L2.887 4.18ZM1.817 5.626 18.374 22.18a11.955 11.955 0 0 1-3.674 1.474L.346 9.3a11.955 11.955 0 0 1 1.47-3.674ZM.077 10.652l13.27 13.27c-.435.05-.877.077-1.324.078L0 11.977c0-.448.028-.89.077-1.325ZM.983 16.135l6.802 6.803a12.048 12.048 0 0 1-6.802-6.803Z" />
    </svg>
  );
}
