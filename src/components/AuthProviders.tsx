import type { ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { googleClientId } from '../lib/oauthConfig';

interface Props {
  children: ReactNode;
}

export default function AuthProviders({ children }: Props) {
  if (!googleClientId) return <>{children}</>;
  return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>;
}
