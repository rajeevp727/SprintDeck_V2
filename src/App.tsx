import { lazy, Suspense, useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import StickyAd from './components/StickyAd';
import { ToastHost } from './components/Toast';

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
const WhiteboardStart = lazy(() => import('./components/WhiteboardStart'));
const ResetPasswordScreen = lazy(() => import('./components/ResetPasswordScreen'));
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
  | { kind: 'resetPassword'; token: string }
  | { kind: 'plan' }
  | { kind: 'retroStart' }
  | { kind: 'timesheet' }
  | { kind: 'home'; joinCode?: string }
  | { kind: 'whiteboardStart'; joinCode?: string; shareToken?: string }
  | { kind: 'whiteboard'; code: string };

const RETRO_PATH_RE = /^\/retro\/([A-Za-z0-9-]+)\/?$/;
const WB_PATH_RE = /^\/whiteboard\/([A-Za-z0-9-]+)\/?$/;

function codeFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('room') || '').toUpperCase();
  if (fromQuery) return fromQuery;
  const legacy = window.location.pathname.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  return legacy ? legacy[1].toUpperCase() : '';
}

function computeRoute(): Route {
  const path = window.location.pathname;
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };
  if (path === '/terms' || path === '/terms/') return { kind: 'terms' };
  if (path === '/security' || path === '/security/') return { kind: 'security' };
  if (path === '/login' || path === '/login/') return { kind: 'auth' };
  if (path === '/reset-password' || path === '/reset-password/') {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    return { kind: 'resetPassword', token };
  }
  if (path === '/plan' || path === '/plan/') return { kind: 'plan' };
  if (path === '/retro-new' || path === '/retro-new/') return { kind: 'retroStart' };
  if (path === '/timesheet' || path === '/timesheet/') return { kind: 'timesheet' };
  if (path === '/whiteboard' || path === '/whiteboard/') {
    const t = new URLSearchParams(window.location.search).get('t') || undefined;
    return { kind: 'whiteboardStart', shareToken: t };
  }

  const wbMatch = path.match(WB_PATH_RE);
  if (wbMatch) {
    const wc = wbMatch[1].toUpperCase();
    const t = new URLSearchParams(window.location.search).get('t') || undefined;
    return getIdentity(wc)
      ? { kind: 'whiteboard', code: wc }
      : { kind: 'whiteboardStart', joinCode: wc, shareToken: t };
  }

  const retroMatch = path.match(RETRO_PATH_RE);
  if (retroMatch) {
    const rc = retroMatch[1].toUpperCase();
    return getIdentity(rc) ? { kind: 'retro', code: rc } : { kind: 'retroJoin', code: rc };
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

export default function App() {
  const [route, setRoute] = useState<Route>(computeRoute);
  const { user, loading: authLoading } = useAuth();
  const [guest, setGuest] = useState(false); 

  
  
  
  
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
      } catch { void 0; }
    }
    check();
    const id = setInterval(() => {
      if (!document.hidden) check(); 
    }, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    
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
    go('/', { kind: 'room', code: code.toUpperCase() }, true); 
  }
  function goHome() {
    clearCurrentRoom();
    go('/', { kind: 'home' }, true);
  }
  function goRetro(code: string) {
    const c = code.toUpperCase();
    const next: Route = getIdentity(c) ? { kind: 'retro', code: c } : { kind: 'retroJoin', code: c };
    go(`/retro/${c}`, next); 
  }
  
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
  
  async function startPlanning() {
    const hostName = user?.name || user?.email?.split('@')[0] || 'Host';
    try {
      const res = await api.createSession('', hostName, '');
      saveIdentity(res.session.code, res.participantId, hostName);
      goRoom(res.session.code);
    } catch {
      goPlan();
    }
  }
  function goRetroStart() {
    go('/retro-new', { kind: 'retroStart' });
  }
  function goTimesheet() {
    go('/timesheet', { kind: 'timesheet' });
  }
  function goWhiteboardStart() {
    go('/whiteboard', { kind: 'whiteboardStart' });
  }
  function goWhiteboard(code: string) {
    const c = code.toUpperCase();
    go(`/whiteboard/${c}`, { kind: 'whiteboard', code: c });
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
        onGoWhiteboard={goWhiteboard}
      />
    );
  } else if (route.kind === 'retro') {
    page = (
      <RetroBoard code={route.code} onLeave={exitRetro} onMissingIdentity={() => goRetro(route.code)} />
    );
  } else if (route.kind === 'retroJoin') {
    page = <RetroHome joinCode={route.code} onEnter={goRetro} onExit={goHome} />;
  } else if (route.kind === 'resetPassword') {
    page = <ResetPasswordScreen token={route.token} onDone={goAuth} />;
  } else if (route.kind === 'auth') {
    page = <AuthScreen onAuthed={goHome} onBack={goHome} />;
  } else if (route.kind === 'plan') {
    
    page = (
      <Home onEnter={goRoom} onPrivacy={goPrivacy} onTerms={goTerms} onSecurity={goSecurity} onBack={goHome} />
    );
  } else if (route.kind === 'retroStart') {
    page = <RetroStart onEnter={goRetro} onBack={goHome} />;
  } else if (route.kind === 'timesheet') {
    page = <StandupTimesheet onBack={goHome} />;
  } else if (route.kind === 'whiteboardStart') {
    page = (
      <WhiteboardStart
        onEnter={goWhiteboard}
        onBack={goHome}
        joinCode={route.joinCode}
        shareToken={route.shareToken}
      />
    );
  } else if (route.kind === 'whiteboard') {
    page = (
      <Whiteboard
        code={route.code}
        onLeave={goHome}
        onMissingIdentity={() => go('/whiteboard/' + route.code, { kind: 'whiteboardStart', joinCode: route.code })}
      />
    );
  } else if (authLoading) {
    page = null; 
  } else if (route.joinCode) {
    
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
    
    page = (
      <Dashboard
        onPlanning={startPlanning}
        onRetro={goRetroStart}
        onTimesheet={goTimesheet}
        onWhiteboard={goWhiteboardStart}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onSecurity={goSecurity}
      />
    );
  } else if (guest) {
    
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

  return (
    <>
      <Suspense fallback={null}>{page}</Suspense>
      <StickyAd />
      <ToastHost />
    </>
  );
}
