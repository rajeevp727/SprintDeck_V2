import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useEffect, useState, type ReactNode } from 'react';
import { loginWithOAuth } from '../lib/auth';
import {
  fetchOAuthConfig,
  hasOAuthProviders,
  loginWithMicrosoft,
  preInitializeMicrosoft,
  type OAuthPublicConfig,
} from '../lib/oauthConfig';
import { GoogleIcon, MicrosoftIcon } from './OAuthBrandIcons';

interface Props {
  remember?: boolean;
  onSuccess: () => void;
}

function SocialButton({
  provider,
  busy,
  disabled,
  onClick,
  children,
}: {
  provider: 'google' | 'microsoft';
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`auth-social-btn auth-social-${provider}`}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function GoogleSignInButton({
  remember,
  busy,
  setBusy,
  setError,
  onSuccess,
}: {
  remember: boolean;
  busy: 'google' | 'microsoft' | null;
  setBusy: (v: 'google' | 'microsoft' | null) => void;
  setError: (msg: string) => void;
  onSuccess: () => void;
}) {
  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'openid email profile',
    onSuccess: async (tokenResponse) => {
      const accessToken = tokenResponse.access_token;
      if (!accessToken) {
        setError('Google sign-in did not return a token');
        setBusy(null);
        return;
      }
      setError('');
      setBusy('google');
      try {
        await loginWithOAuth('google', accessToken, remember);
        onSuccess();
      } catch (err) {
        setError((err as Error).message);
        setBusy(null);
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed');
      setBusy(null);
    },
  });

  function onGoogle() {
    if (busy) return;
    setError('');
    setBusy('google');
    login();
  }

  return (
    <SocialButton provider="google" busy={busy === 'google'} disabled={!!busy} onClick={onGoogle}>
      <GoogleIcon className="auth-social-icon" />
      <span>{busy === 'google' ? 'Signing in…' : 'Continue with Google'}</span>
    </SocialButton>
  );
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

  const buttons = (
    <>
      {showMicrosoft && (
        <SocialButton
          provider="microsoft"
          busy={busy === 'microsoft'}
          disabled={!!busy}
          onClick={onMicrosoft}
        >
          <MicrosoftIcon className="auth-social-icon" />
          <span>{busy === 'microsoft' ? 'Signing in…' : 'Continue with Microsoft'}</span>
        </SocialButton>
      )}
      {showGoogle && (
        <GoogleSignInButton
          remember={remember}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onSuccess={onSuccess}
        />
      )}
    </>
  );

  return (
    <div className="auth-social">
      <div className="auth-social-row">
        {showGoogle && config.google.clientId ? (
          <GoogleOAuthProvider clientId={config.google.clientId}>{buttons}</GoogleOAuthProvider>
        ) : (
          buttons
        )}
      </div>
      {error && <p className="error auth-social-error">{error}</p>}
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
