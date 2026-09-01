import { lazy, Suspense, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import StickyAd from './components/StickyAd';
import { ToastHost } from './components/Toast';

// OAuth callback pages — no lazy-load needed (tiny).
function GoogleCallback() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token') || '';
    if (idToken) {
      window.opener?.postMessage({ type: 'sso-callback', idToken }, window.location.origin);
    }
    window.history.replaceState({}, '', '/');
    window.close();
  }, []);
  return null;
}

function MicrosoftCallback() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token') || '';
    if (idToken) {
      window.opener?.postMessage({ type: 'sso-callback', idToken }, window.location.origin);
    }
    window.history.replaceState({}, '', '/');
    window.close();
  }, []);
  return null;
}

// Rarely-visited legal pages — code-split out of the initial bundle.
const Privacy = lazy(() => import('./components/Privacy'));
const Terms = lazy(() => import('./components/Terms'));
const Security = lazy(() => import('./components/Security'));
const RetroBoard = lazy(() => import('./components/RetroBoard'));
const RetroHome = lazy(() => import('./components/RetroHome'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));
const Landing = lazy(() => import('./components/Landing'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const RetroStart = lazy(() => import('./components/RetroStart'));
const StandupTimesheet = lazy(() => import('./components/StandupTimesheet'));
const Whiteboard = lazy(() => import('./components/Whiteboard'));
const ResetPasswordScreen = lazy(() => import('./components/ResetPasswordScreen'));
const WhiteboardStart = lazy(() => import('./components/WhiteboardStart'));
import {
  getIdentity,
  saveIdentity,
  getCurrentRoom,
  setCurrentRoom,
  clearCurrentRoom,
} from './lib/storage';
import { api } from './lib/api';
import {
  getPendingOrder,
  clearPendingOrder,
  setSubscriptionRef,
  refreshSubscription,
  isSubscribed,
} from './lib/subscription';
import { getStatus } from './lib/verifier';
import { useAuth } from './lib/auth';

type Route =
  | { kind: 'room'; code: string }
  | { kind: 'retro'; code: string }
  | { kind: 'retroJoin'; code: string }
  | { kind: 'privacy' }
  | { kind: 'terms' }
  | { kind: 'security' }
  | { kind: 'auth' }
  | { kind: 'plan' }
  | { kind: 'retroStart' }
  | { kind: 'timesheet' }
  | { kind: 'home'; joinCode?: string }
  | { kind: 'whiteboard'; code: string }
  | { kind: 'whiteboardStart'; joinCode?: string; shareToken?: string }
  | { kind: 'oauthCallback'; provider: 'google' | 'microsoft' }
  | { kind: 'resetPassword'; token: string };

// The retrospective board has its own real URL path: /retro/CODE (unlike poker,
// whose code stays out of the URL) so the facilitator can share a plain link.
const RETRO_PATH_RE = /^\/retro\/([A-Za-z0-9-]+)\/?$/;
const GOOGLE_CB_RE = /^\/auth\/google\/callback\/?$/;
const MS_CB_RE = /^\/auth\/microsoft\/callback\/?$/;
const RESET_PW_RE = /^\/reset-password\/?$/;
const WHITEBOARD_PATH_RE = /^\/whiteboard\/([A-Za-z0-9-]+)\/?$/;
const STATIC_ROUTES: Record<string, Route> = {
  '/privacy': { kind: 'privacy' },
  '/privacy/': { kind: 'privacy' },
  '/terms': { kind: 'terms' },
  '/terms/': { kind: 'terms' },
  '/security': { kind: 'security' },
  '/security/': { kind: 'security' },
  '/login': { kind: 'auth' },
  '/login/': { kind: 'auth' },
  '/plan': { kind: 'plan' },
  '/plan/': { kind: 'plan' },
  '/retro-new': { kind: 'retroStart' },
  '/retro-new/': { kind: 'retroStart' },
  '/timesheet': { kind: 'timesheet' },
  '/timesheet/': { kind: 'timesheet' },
  '/whiteboard': { kind: 'whiteboardStart' },
  '/whiteboard/': { kind: 'whiteboardStart' },
};

// The room code is NOT kept in the URL — it lives in storage (see storage.ts).
// Invite links carry the code as a ?room=CODE query param, which is read on
// open and then stripped from the address bar. A legacy /room-CODE path is also
// honored. Otherwise the room resumes from storage; the visible URL stays "/".
function codeFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('room') || '').toUpperCase();
  if (fromQuery) return fromQuery;
  const legacy = window.location.pathname.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  return legacy ? legacy[1].toUpperCase() : '';
}

function computeRoute(): Route {
  const path = window.location.pathname;
  const staticRoute = STATIC_ROUTES[path];
  if (staticRoute) return staticRoute;
  if (GOOGLE_CB_RE.test(path)) return { kind: 'oauthCallback', provider: 'google' };
  if (MS_CB_RE.test(path)) return { kind: 'oauthCallback', provider: 'microsoft' };
  if (RESET_PW_RE.test(path)) {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    return { kind: 'resetPassword', token };
  }

  const retroMatch = path.match(RETRO_PATH_RE);
  if (retroMatch) {
    const rc = retroMatch[1].toUpperCase();
    return getIdentity(rc) ? { kind: 'retro', code: rc } : { kind: 'retroJoin', code: rc };
  }

  const whiteboardMatch = path.match(WHITEBOARD_PATH_RE);
  if (whiteboardMatch) {
    const code = whiteboardMatch[1].toUpperCase();
    const shareToken = new URLSearchParams(window.location.search).get('t') || undefined;
    return getIdentity(code)
      ? { kind: 'whiteboard', code }
      : { kind: 'whiteboardStart', joinCode: code, shareToken };
  }

  const code = codeFromUrl();
  if (code) {
    if (getIdentity(code)) {
      setCurrentRoom(code);
      return { kind: 'room', code };
    }
    return { kind: 'home', joinCode: code };
  }

  const current = getCurrentRoom();
  if (current && getIdentity(current)) return { kind: 'room', code: current };
  return { kind: 'home' };
}

type PageProps = {
  route: Route;
  authLoading: boolean;
  authenticated: boolean;
  guest: boolean;
  onRoom: (code: string) => void;
  onHome: () => void;
  onRetro: (code: string) => void;
  onExitRetro: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onSecurity: () => void;
  onAuth: () => void;
  onStartPlanning: () => void;
  onRetroStart: () => void;
  onTimesheet: () => void;
  onWhiteboardStart: () => void;
  onWhiteboardBoard: (code: string) => void;
  onContinueAsGuest: () => void;
  onExitGuest: () => void;
};

function renderExplicitRoute(props: PageProps): ReactNode | null {
  const { route } = props;
  if (route.kind === 'privacy') return <Privacy onBack={props.onHome} />;
  if (route.kind === 'terms') return <Terms onBack={props.onHome} />;
  if (route.kind === 'security') return <Security onBack={props.onHome} />;
  if (route.kind === 'room') {
    return <Room code={route.code} onLeave={props.onHome} onMissingIdentity={props.onHome} onGoRoom={() => props.onRoom(route.code)} onGoRetro={props.onRetro} onGoWhiteboard={props.onWhiteboardBoard} />;
  }
  if (route.kind === 'retro') return <RetroBoard code={route.code} onLeave={props.onExitRetro} onMissingIdentity={() => props.onRetro(route.code)} />;
  if (route.kind === 'retroJoin') return <RetroHome joinCode={route.code} onEnter={props.onRetro} onExit={props.onHome} />;
  if (route.kind === 'auth') return <AuthScreen onAuthed={props.onHome} onBack={props.onHome} />;
  if (route.kind === 'oauthCallback') return route.provider === 'google' ? <GoogleCallback /> : <MicrosoftCallback />;
  if (route.kind === 'plan') return <Home onEnter={props.onRoom} onPrivacy={props.onPrivacy} onTerms={props.onTerms} onSecurity={props.onSecurity} onBack={props.onHome} />;
  if (route.kind === 'retroStart') return <RetroStart onEnter={props.onRetro} onBack={props.onHome} />;
  if (route.kind === 'timesheet') return <StandupTimesheet onBack={props.onHome} />;
  if (route.kind === 'whiteboardStart') return <WhiteboardStart onEnter={props.onWhiteboardBoard} onBack={props.onHome} joinCode={route.joinCode} shareToken={route.shareToken} />;
  if (route.kind === 'whiteboard') return <Whiteboard code={route.code} onLeave={props.onHome} onMissingIdentity={props.onWhiteboardStart} />;
  return null;
}

function renderPage(props: PageProps): ReactNode {
  const explicitPage = renderExplicitRoute(props);
  if (explicitPage) return explicitPage;
  if (props.authLoading) return null;
  if (props.route.joinCode) {
    return <Home initialCode={props.route.joinCode} onEnter={props.onRoom} onPrivacy={props.onPrivacy} onTerms={props.onTerms} onSecurity={props.onSecurity} onSignIn={props.onAuth} />;
  }
  if (props.authenticated) {
    return <Dashboard onPlanning={props.onStartPlanning} onRetro={props.onRetroStart} onTimesheet={props.onTimesheet} onWhiteboard={props.onWhiteboardStart} onPrivacy={props.onPrivacy} onTerms={props.onTerms} onSecurity={props.onSecurity} />;
  }
  return props.guest
    ? <Home onEnter={props.onRoom} onPrivacy={props.onPrivacy} onTerms={props.onTerms} onSecurity={props.onSecurity} onSignIn={props.onAuth} onBack={props.onExitGuest} />
    : <Landing onSignIn={props.onAuth} onGuest={props.onContinueAsGuest} />;
}

function usePaymentWatcher(setRoute: Dispatch<SetStateAction<Route>>) {
  useEffect(() => {
    let active = true;
    async function check() {
      await refreshSubscription();
      if (isSubscribed()) {
        clearPendingOrder();
        return;
      }
      const pending = getPendingOrder();
      if (!pending) return;
      try {
        const { status } = await getStatus(pending.orderId);
        if (status === 'confirmed') {
          setSubscriptionRef(pending.orderId);
          await refreshSubscription();
          clearPendingOrder();
          if (active) setRoute(computeRoute());
        } else if (status === 'expired') {
          clearPendingOrder();
        }
      } catch {
        // Transient failures are retried on the next polling interval.
      }
    }
    check();
    const id = setInterval(() => {
      if (!document.hidden) check();
    }, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [setRoute]);
}

export default function App() {
  const [route, setRoute] = useState<Route>(computeRoute);
  const { user, loading: authLoading } = useAuth();
  const [guest, setGuest] = useState(false); // "continue as guest" from the landing

  usePaymentWatcher(setRoute);

  useEffect(() => {
    // Strip the code (query param or legacy path) out of the address bar.
    if (window.location.search || /^\/room-/.test(window.location.pathname)) {
      window.history.replaceState({}, '', '/');
    }
    const onPop = () => setRoute(computeRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(path: string, next: Route, replace = false) {
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    setRoute(next);
  }
  function goRoom(code: string) {
    setCurrentRoom(code);
    go('/', { kind: 'room', code: code.toUpperCase() }, true); // clean URL, no code
  }
  function goHome() {
    clearCurrentRoom();
    go('/', { kind: 'home' }, true);
  }
  function goRetro(code: string) {
    const c = code.toUpperCase();
    const next: Route = getIdentity(c) ? { kind: 'retro', code: c } : { kind: 'retroJoin', code: c };
    go(`/retro/${c}`, next); // keep the code in the URL
  }
  // Leave a retro back to the poker room you're in (if any), else home.
  function exitRetro() {
    const current = getCurrentRoom();
    const next: Route = current && getIdentity(current) ? { kind: 'room', code: current } : { kind: 'home' };
    go('/', next, true);
  }
  function goPrivacy() {
    go('/privacy', { kind: 'privacy' });
  }
  function goTerms() {
    go('/terms', { kind: 'terms' });
  }
  function goSecurity() {
    go('/security', { kind: 'security' });
  }
  function goAuth() {
    go('/login', { kind: 'auth' });
  }
  function goPlan() {
    go('/plan', { kind: 'plan' });
  }
  // Signed-in host: create a session with their account name and go straight in.
  async function startPlanning() {
    const hostName = user?.name || user?.email?.split('@')[0] || 'Host';
    try {
      const res = await api.createSession('', hostName, '');
      saveIdentity(res.session.code, res.participantId, hostName);
      goRoom(res.session.code);
    } catch {
      goPlan(); // fall back to the create form on failure
    }
  }
  function goRetroStart() {
    go('/retro-new', { kind: 'retroStart' });
  }
  function goTimesheet() {
    go('/timesheet', { kind: 'timesheet' });
  }
  function goWhiteboard() {
    go('/whiteboard', { kind: 'whiteboardStart' });
  }
  function goWhiteboardBoard(code: string) {
    go(`/whiteboard/${code}`, { kind: 'whiteboard', code });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'terms') {
    page = <Terms onBack={goHome} />;
  } else if (route.kind === 'security') {
    page = <Security onBack={goHome} />;
  } else if (route.kind === 'room') {
    page = (
      <Room
        code={route.code}
        onLeave={goHome}
        onMissingIdentity={goHome}
        onGoRoom={() => goRoom(route.code)}
        onGoRetro={goRetro}
      />
    );
  } else if (route.kind === 'retro') {
    page = (
      <RetroBoard code={route.code} onLeave={exitRetro} onMissingIdentity={() => goRetro(route.code)} />
    );
  } else if (route.kind === 'retroJoin') {
    page = <RetroHome joinCode={route.code} onEnter={goRetro} onExit={goHome} />;
  } else if (route.kind === 'auth') {
    page = <AuthScreen onAuthed={goHome} onBack={goHome} />;
  } else if (route.kind === 'oauthCallback') {
    page = route.provider === 'google' ? <GoogleCallback /> : <MicrosoftCallback />;
  } else if (route.kind === 'resetPassword') {
    page = <ResetPasswordScreen token={route.token} onDone={goHome} />;
  } else if (route.kind === 'plan') {
    // Planning create/join, reached from the dashboard.
    page = (
      <Home onEnter={goRoom} onPrivacy={goPrivacy} onTerms={goTerms} onSecurity={goSecurity} onBack={goHome} />
    );
  } else if (route.kind === 'retroStart') {
    page = <RetroStart onEnter={goRetro} onBack={goHome} />;
  } else if (route.kind === 'timesheet') {
    page = <StandupTimesheet onBack={goHome} />;
  } else if (route.kind === 'whiteboard') {
    page = <Whiteboard onBack={goHome} />;
  } else if (authLoading) {
    page = null; // resolving the session — avoid flashing the landing then the app
  } else if (route.joinCode) {
    // Arriving via an invite link — join the room (guests welcome).
    page = (
      <Home
        initialCode={route.joinCode}
        onEnter={goRoom}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onSecurity={goSecurity}
        onSignIn={goAuth}
      />
    );
  } else if (user) {
    // Signed in → dashboard of ceremonies.
    page = (
      <Dashboard
        onPlanning={startPlanning}
        onRetro={goRetroStart}
        onTimesheet={goTimesheet}
        onWhiteboard={goWhiteboard}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onSecurity={goSecurity}
      />
    );
  } else if (guest) {
    // Continuing as guest → New session, with a login/register nudge above it.
    page = (
      <Home
        onEnter={goRoom}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onSecurity={goSecurity}
        onSignIn={goAuth}
        onBack={() => setGuest(false)}
      />
    );
  } else {
    page = <Landing onSignIn={goAuth} onGuest={() => setGuest(true)} />;
  }
  const page = renderPage({
    route,
    authLoading,
    authenticated: Boolean(user),
    guest,
    onRoom: goRoom,
    onHome: goHome,
    onRetro: goRetro,
    onExitRetro: exitRetro,
    onPrivacy: goPrivacy,
    onTerms: goTerms,
    onSecurity: goSecurity,
    onAuth: goAuth,
    onStartPlanning: startPlanning,
    onRetroStart: goRetroStart,
    onTimesheet: goTimesheet,
    onWhiteboardStart: goWhiteboard,
    onWhiteboardBoard: goWhiteboardBoard,
    onContinueAsGuest: () => setGuest(true),
    onExitGuest: () => setGuest(false),
  });

  return (
    <>
      <Suspense fallback={null}>{page}</Suspense>
      <StickyAd />
      <ToastHost />
    </>
  );
}
