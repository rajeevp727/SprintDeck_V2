import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import { loginWithOAuth } from '../lib/auth';
import {
  fetchOAuthConfig,
  hasOAuthProviders,
  loginWithMicrosoft,
  preInitializeMicrosoft,
  type OAuthPublicConfig,
} from '../lib/oauthConfig';

interface Props {
  remember?: boolean;
  onSuccess: () => void;
}

function SocialButtons({
  config,
  remember,
  onSuccess,
}: {
  config: OAuthPublicConfig;
  remember: boolean;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState<'google' | 'microsoft' | null>(null);
  const [error, setError] = useState('');

  const showMicrosoft = config.microsoft.enabled && !!config.microsoft.clientId;
  const showGoogle = config.google.enabled && !!config.google.clientId;

  async function onMicrosoft() {
    if (busy) return;
    setError('');
    setBusy('microsoft');
    try {
      const idToken = await loginWithMicrosoft(config);
      await loginWithOAuth('microsoft', idToken, remember);
      onSuccess();
    } catch (err) {
      const msg = (err as Error).message || 'Microsoft sign-in failed';
      if (msg.includes('interaction_in_progress')) {
        setError('Microsoft sign-in is already open. Close the popup, wait a moment, then try again.');
      } else if (msg.includes('user_cancelled') || msg.includes('popup_window_error')) {
        setError('Microsoft sign-in was cancelled.');
      } else {
        setError(msg);
      }
      setBusy(null);
    }
  }

  const googleButton = showGoogle ? (
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
  ) : null;

  return (
    <div className="auth-social">
      <div className="auth-social-label">Or continue with</div>
      <div className="auth-social-row">
        {showMicrosoft && (
          <button
            type="button"
            className="auth-social-btn auth-social-ms"
            disabled={!!busy}
            onClick={onMicrosoft}
          >
            {busy === 'microsoft' ? 'Signing in…' : 'Microsoft'}
          </button>
        )}
        {showGoogle && config.google.clientId ? (
          <GoogleOAuthProvider clientId={config.google.clientId}>{googleButton}</GoogleOAuthProvider>
        ) : null}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function SocialAuthButtons({ remember = true, onSuccess }: Props) {
  const [config, setConfig] = useState<OAuthPublicConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOAuthConfig().then((c) => {
      if (!cancelled) {
        setConfig(c);
        if (c.microsoft.enabled && c.microsoft.clientId) {
          preInitializeMicrosoft(c).catch(() => {});
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!config || !hasOAuthProviders(config)) return null;
  return <SocialButtons config={config} remember={remember} onSuccess={onSuccess} />;
}

export function useOAuthAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOAuthConfig().then((c) => {
      if (!cancelled) setAvailable(hasOAuthProviders(c));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}
