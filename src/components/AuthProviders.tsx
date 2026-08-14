import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

// Google OAuth provider is mounted inside SocialAuthButtons when a client ID is available.
export default function AuthProviders({ children }: Props) {
  return <>{children}</>;
}
