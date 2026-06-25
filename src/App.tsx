import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import Privacy from './components/Privacy';
import StickyAd from './components/StickyAd';
import {
  getIdentity,
  getCurrentRoom,
  setCurrentRoom,
  clearCurrentRoom,
} from './storage';

type Route =
  | { kind: 'room'; code: string }
  | { kind: 'privacy' }
  | { kind: 'home'; joinCode?: string };

// The room code is NOT kept in the URL — it lives in storage (see storage.ts).
// The URL stays clean ("/"); only /privacy is a real path. A legacy /room-CODE
// link is still honored (code pulled out, URL cleaned) for backward compat.
function computeRoute(): Route {
  const path = window.location.pathname;
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };

  const legacy = path.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  if (legacy) {
    const code = legacy[1].toUpperCase();
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

  useEffect(() => {
    // Strip any legacy /room-CODE out of the address bar so the code isn't shown.
    if (/^\/room-/.test(window.location.pathname)) {
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
  function goPrivacy() {
    go('/privacy', { kind: 'privacy' });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'room') {
    page = <Room code={route.code} onLeave={goHome} onMissingIdentity={goHome} />;
  } else {
    page = <Home initialCode={route.joinCode} onEnter={goRoom} onPrivacy={goPrivacy} />;
  }

  return (
    <>
      {page}
      <StickyAd />
    </>
  );
}
