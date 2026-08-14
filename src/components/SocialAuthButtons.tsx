import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { loginWithOAuth } from '../lib/auth';
import { loginWithMicrosoft, oauthEnabled } from '../lib/oauthConfig';

interface Props {
  remember?: boolean;
  onSuccess: () => void;
}

export default function SocialAuthButtons({ remember = true, onSuccess }: Props) {
  const [busy, setBusy] = useState<'google' | 'microsoft' | null>(null);
  const [error, setError] = useState('');

  const hasSocial = oauthEnabled.google || oauthEnabled.microsoft;
  if (!hasSocial) return null;

  async function onMicrosoft() {
    setError('');
    setBusy('microsoft');
    try {
      const idToken = await loginWithMicrosoft();
      await loginWithOAuth('microsoft', idToken, remember);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="auth-social">
      <div className="auth-social-label">Or continue with</div>
      <div className="auth-social-row">
        {oauthEnabled.microsoft && (
          <button
            type="button"
            className="auth-social-btn auth-social-ms"
            disabled={!!busy}
            onClick={onMicrosoft}
          >
            {busy === 'microsoft' ? 'Signing in…' : 'Microsoft'}
          </button>
        )}
        {oauthEnabled.google && (
          <div className={`auth-social-google-wrap${busy === 'google' ? ' busy' : ''}`}>
            <GoogleLogin
              onSuccess={async (res) => {
                if (!res.credential) {
                  setError('Google sign-in did not return a token');
                  setBusy(null);
                  return;
                }
                setError('');
                setBusy('google');
                try {
                  await loginWithOAuth('google', res.credential, remember);
                  onSuccess();
                } catch (err) {
                  setError((err as Error).message);
                  setBusy(null);
                }
              }}
              onError={() => {
                setError('Google sign-in was cancelled or failed');
                setBusy(null);
              }}
              theme="outline"
              size="large"
              text="continue_with"
              shape="rectangular"
              width="100%"
            />
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
